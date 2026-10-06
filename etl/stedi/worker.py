"""Stedi eligibility worker: claims 'pending' stedi_eligibility_checks rows, runs the check.

    python -m etl.stedi.worker --app-env /opt/podiatry-emr-staging/.env \
        --stedi-env /home/dbcreator/pcc/.stedi.env [--once]

Mirrors the PCC webhook poller: the app only inserts pending rows; this
process does the external call and writes the result back. Never raises out
of the loop for a single bad row - the row is marked error/needs_review.
"""
import argparse
import os
import sys
import time
import traceback

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from .client import StediAuthError, StediClient, StediError
from .eligibility import build_request, summarize
from .payers import resolve

POLL_SECONDS = 5

CLAIM_SQL = """
UPDATE stedi_eligibility_checks SET status = 'processing', "startedAt" = now()
WHERE id = (SELECT id FROM stedi_eligibility_checks WHERE status = 'pending'
            ORDER BY "requestedAt" FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING id, "patientId"
"""


def _gender(g):
    g = (g or "").strip().upper()[:1]
    return g if g in ("M", "F") else None


def pick_coverage(coverages):
    """Primary active first, then any active; None if nothing is active."""
    active = [c for c in coverages if c["active"]]
    return next((c for c in active if c["isPrimary"]), active[0] if active else None)


def member_id_for(coverage, patient):
    if coverage["payerType"] == "MEDICARE":
        return patient["medicareNumber"] or coverage["memberId"]
    if coverage["payerType"] == "MEDICAID":
        return coverage["memberId"] or patient["medicaidNumber"]
    return coverage["memberId"]


def finish(cur, check_id, status, message=None, **cols):
    sets = ['status = %s', '"completedAt" = now()', 'message = %s']
    vals = [status, message]
    for k, v in cols.items():
        sets.append(f'"{k}" = %s')
        vals.append(psycopg2.extras.Json(v) if isinstance(v, (dict, list)) else v)
    cur.execute(f"UPDATE stedi_eligibility_checks SET {', '.join(sets)} WHERE id = %s", vals + [check_id])


def process(cur, client, provider, check_id, patient_id):
    cur.execute('SELECT * FROM patients WHERE id = %s', (patient_id,))
    patient = cur.fetchone()
    cur.execute('SELECT * FROM patient_coverages WHERE "patientId" = %s ORDER BY "syncedAt"', (patient_id,))
    coverage = pick_coverage(cur.fetchall())
    if not patient or not coverage:
        return finish(cur, check_id, "needs_review", "No active coverage on file for this patient")
    cols = {"coverageId": coverage["id"]}
    payer_id = resolve(cur, coverage["payerName"], coverage["payerType"])
    if not payer_id:
        return finish(cur, check_id, "needs_review",
                      f'No Stedi payer mapping for "{coverage["payerName"]}" ({coverage["payerType"]})', **cols)
    member_id = member_id_for(coverage, patient)
    if not member_id:
        return finish(cur, check_id, "needs_review", "No member ID on file", payerId=payer_id, **cols)
    req = build_request(patient["firstName"], patient["lastName"], patient["dob"], member_id, payer_id,
                        provider, gender=_gender(patient["gender"]))
    t0 = time.monotonic()
    resp = client.eligibility(req)
    ms = int((time.monotonic() - t0) * 1000)
    s = summarize(resp)
    status = "done" if s["outcome"] in ("active", "inactive") else "needs_review"
    msg = None if status == "done" else (
        "; ".join(e["description"] or e["code"] or "" for e in s["errors"]) or "Payer returned no coverage data")
    finish(cur, check_id, status, msg, outcome=s["outcome"], payerId=payer_id, summary=s, rawResponse=resp,
           latencyMs=ms, applicationMode=s["application_mode"], **cols)


def run_one(conn, client, provider):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(CLAIM_SQL)
        row = cur.fetchone()
        if not row:
            conn.commit()
            return False
        conn.commit()  # release the claim before the slow external call
        try:
            process(cur, client, provider, row["id"], row["patientId"])
        except StediAuthError as e:
            conn.rollback()
            finish(cur, row["id"], "error", f"Stedi auth failed: {e}")
        except StediError as e:
            conn.rollback()
            finish(cur, row["id"], "error", str(e)[:500])
        except Exception as e:  # noqa: BLE001 - one bad row must not stop the worker
            conn.rollback()
            traceback.print_exc()
            finish(cur, row["id"], "error", f"internal error: {e}"[:500])
        conn.commit()
        print(f"checked {row['id']}", flush=True)
        return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app-env", required=True)
    ap.add_argument("--stedi-env", required=True)
    ap.add_argument("--once", action="store_true", help="drain pending rows then exit")
    a = ap.parse_args()
    load_dotenv(a.stedi_env)
    load_dotenv(a.app_env, override=True)
    npi, name = os.environ.get("STEDI_PROVIDER_NPI", ""), os.environ.get("STEDI_PROVIDER_NAME", "")
    provider = {"npi": npi, "name": name}
    client = StediClient()
    conn = psycopg2.connect(os.environ["DATABASE_URL"].split("?")[0])
    with conn.cursor() as cur:  # rows left 'processing' by a crashed run
        cur.execute("UPDATE stedi_eligibility_checks SET status = 'pending' WHERE status = 'processing'")
    conn.commit()
    if not npi:
        print("WARNING: STEDI_PROVIDER_NPI is empty; checks will fail validation", file=sys.stderr)
    print(f"stedi worker started (poll {POLL_SECONDS}s)", flush=True)
    while True:
        while run_one(conn, client, provider):
            pass
        if a.once:
            return
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
