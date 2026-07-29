#!/usr/bin/env python3
"""
PointClickCare → EMR sync.

Deploy target: /home/dbcreator/pcc/sync_to_emr.py
Run all resources:        python sync_to_emr.py
Run one resource:         python sync_to_emr.py --resource medications

The scheduler (scripts/sync-scheduler.js) invokes this per-resource. The final
token printed on stdout is the row count, which the scheduler records as
lastCount for the resource.

Column maps below mirror prisma/schema.prisma exactly. PCC field names are the
public API (preview1) response keys; adjust if your PCC contract differs.
"""

import argparse
import os
import sys
import time
import uuid
from datetime import datetime

import psycopg2
import requests
try:
    from dotenv import load_dotenv
    load_dotenv("/home/dbcreator/pcc/.env")
except ImportError:
    pass

DATABASE_URL = os.environ["DATABASE_URL"]
PCC_BASE = os.environ.get("PCC_BASE_URL", "https://connect.pointclickcare.com/api/public/preview1")
PCC_AUTH_URL = os.environ.get("PCC_API_URL", "https://connect.pointclickcare.com/auth/token")
PCC_ORG_UUID = os.environ.get("PCC_ORG_UUID", "")
PCC_API_BASE = f"https://connect2.pointclickcare.com/api/public/preview1/orgs/{PCC_ORG_UUID}"
PCC_CLIENT_ID = os.environ.get("PCC_CLIENT_ID", "")
PCC_CLIENT_SECRET = os.environ.get("PCC_CLIENT_SECRET", "")

# ── infra ────────────────────────────────────────────────────────────────────

def new_id():
    return str(uuid.uuid4())


def dt(s):
    """Parse a PCC ISO-8601 timestamp/date to a datetime, or None."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


_token = {"value": None}

def _access_token():
    if _token["value"]:
        return _token["value"]
    cert_path = os.environ.get("PCC_CERT_PATH", "/home/dbcreator/pcc/certs/qodex_qwcwoundcare_com.crt")
    key_path = os.environ.get("PCC_KEY_PATH", "/home/dbcreator/pcc/certs/privkey.pem")
    cert = (cert_path, key_path) if cert_path and key_path else None
    resp = requests.post(
        PCC_AUTH_URL,
        data={"grant_type": "client_credentials"},
        auth=(PCC_CLIENT_ID, PCC_CLIENT_SECRET),
        cert=cert,
        timeout=60,
    )
    resp.raise_for_status()
    _token["value"] = resp.json()["access_token"]
    return _token["value"]


def _cert():
    cert_path = os.environ.get("PCC_CERT_PATH", "/home/dbcreator/pcc/certs/qodex_qwcwoundcare_com.crt")
    key_path = os.environ.get("PCC_KEY_PATH", "/home/dbcreator/pcc/certs/privkey.pem")
    return (cert_path, key_path) if cert_path and key_path else None

def _pcc_request(path, params, max_retries=5):
    """GET a PCC endpoint with retry/backoff on 429 (rate limit) and 503 (too
    many concurrent requests). Honors the Retry-After header if PCC sends one,
    otherwise falls back to exponential backoff."""
    for attempt in range(max_retries + 1):
        resp = requests.get(
            f"{PCC_API_BASE}{path}",
            params=params,
            headers={"Authorization": f"Bearer {_access_token()}"},
            cert=_cert(),
            timeout=60,
        )
        if resp.status_code in (429, 503) and attempt < max_retries:
            retry_after = resp.headers.get("Retry-After")
            wait = float(retry_after) if retry_after else min(2 ** attempt, 30)
            print(f"  [{resp.status_code}] rate limited on {path}, retrying in {wait:.0f}s "
                  f"(attempt {attempt + 1}/{max_retries})", file=sys.stderr)
            time.sleep(wait)
            continue
        return resp
    return resp


def pcc_get(path, page_size=100, **params):
    """GET a PCC org-scoped endpoint and return its 'data' list (handles pagination).
    page_size defaults to 100, but some endpoints (e.g. /care-plans) cap lower -
    pass page_size explicitly for those."""
    results = []
    page = 1
    while True:
        resp = _pcc_request(path, {**params, "page": page, "pageSize": page_size})
        resp.raise_for_status()
        body = resp.json()
        data = body.get("data", body if isinstance(body, list) else [])
        if not data:
            break
        results.extend(data)
        paging = body.get("paging", {})
        if not paging.get("hasMore", False):
            break
        page += 1
    return results


def pcc_get_one(path, **params):
    """GET a PCC endpoint that returns a single flat JSON object (not a
    paginated 'data' list) - e.g. /patients/{id}, /coverages, /therapy-tracks.
    Returns the parsed dict, or {} on a 404 (no record for this patient)."""
    resp = _pcc_request(path, params)
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()
    body = resp.json()
    return body if isinstance(body, dict) else {}


def iter_patients(cur):
    """Yield (emr_id, pcc_patient_id, pcc_facility_id) for active EMR patients linked to PCC."""
    cur.execute(
        'SELECT p.id, p."pccPatientId", f."pccFacilityId" '
        'FROM patients p JOIN facilities f ON f.id = p."facilityId" '
        'WHERE p."pccPatientId" IS NOT NULL AND p.active = true '
        'AND f."pccFacilityId" IS NOT NULL'
    )
    return cur.fetchall()


def upsert(cur, table, conflict_cols, row):
    """INSERT ... ON CONFLICT (conflict_cols) DO UPDATE for a single row dict."""
    cols = list(row.keys())
    collist = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    conflict = ", ".join(f'"{c}"' for c in conflict_cols)
    updates = ", ".join(f'"{c}"=EXCLUDED."{c}"' for c in cols if c not in conflict_cols)
    cur.execute(
        f'INSERT INTO "{table}" ({collist}) VALUES ({placeholders}) '
        f'ON CONFLICT ({conflict}) DO UPDATE SET {updates}',
        [row[c] for c in cols],
    )


def replace_for_patient(cur, table, patient_id, rows):
    """For tables without a natural unique key: delete the patient's rows, re-insert."""
    cur.execute(f'DELETE FROM "{table}" WHERE "patientId" = %s', [patient_id])
    for row in rows:
        upsert_insert(cur, table, row)


def upsert_insert(cur, table, row):
    cols = list(row.keys())
    collist = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    cur.execute(
        f'INSERT INTO "{table}" ({collist}) VALUES ({placeholders})',
        [row[c] for c in cols],
    )


# PCC's payerType values (medicareA/B/D, medicaid, managedCare, private,
# outpatient, other) don't line up 1:1 with our 4-value PayerType enum, so map
# them explicitly rather than uppercase-matching (which silently sent almost
# everything to OTHER). medicareD is pharmacy-only and never primary/secondary,
# so it's bucketed with OTHER rather than MEDICARE.
PCC_PAYER_TYPE_MAP = {
    "medicarea": "MEDICARE",
    "medicareb": "MEDICARE",
    "medicaid": "MEDICAID",
    "managedcare": "COMMERCIAL",
    "private": "COMMERCIAL",
    "medicared": "OTHER",
    "outpatient": "OTHER",
    "other": "OTHER",
}

def payer_type(v):
    return PCC_PAYER_TYPE_MAP.get((v or "").lower(), "OTHER")


# ── pre-existing resources (patients, coverages, diagnoses) ───────────────────

def sync_patients(cur):
    """Refresh demographics of EMR patients already linked to PCC."""
    # /patients/{id} returns a flat object, not a paginated 'data' list, so this
    # needs pcc_get_one, not pcc_get (which silently returned [] for every
    # patient here before, since the empty-dict default fell through to []).
    # Also: PCC's language field is 'languageDesc', not 'primaryLanguage'.
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        p = pcc_get_one(f"/patients/{pcc_id}")
        if not p:
            continue
        cur.execute(
            'UPDATE patients SET "firstName"=%s, "lastName"=%s, "roomNumber"=%s, '
            'gender=%s, "maritalStatus"=%s, "medicalRecordNumber"=%s, '
            '"medicareNumber"=%s, "medicaidNumber"=%s, "primaryLanguage"=%s, '
            '"admissionDate"=%s, "dischargeDate"=%s, "updatedAt"=now() WHERE id=%s',
            [
                p.get("firstName"), p.get("lastName"), p.get("roomDesc"),
                p.get("gender"), p.get("maritalStatus"), p.get("medicalRecordNumber"),
                p.get("medicareNumber"), p.get("medicaidNumber"), p.get("languageDesc"),
                dt(p.get("admissionDate")), dt(p.get("dischargeDate")), emr_id,
            ],
        )
        n += 1
    return n


def sync_coverages(cur):
    # Real endpoint is flat /coverages (not /patients/{id}/coverages), and it
    # returns one flat object with a nested 'payers' array - not a paginated
    # 'data' list - so this needs pcc_get_one, not pcc_get.
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        rows = []
        body = pcc_get_one("/coverages", patientId=pcc_id)
        for c in body.get("payers", []):
            issuer = c.get("issuer") or {}
            rows.append({
                "id": new_id(), "patientId": emr_id,
                "payerName": c.get("payerName") or "Unknown",
                "payerType": payer_type(c.get("payerType")),
                "memberId": issuer.get("subscriberId"), "groupId": issuer.get("group"),
                "effectiveDate": dt(issuer.get("planEffectiveDate")),
                "terminationDate": dt(issuer.get("planExpirationDate")),
                "isPrimary": (c.get("payerRank") or "") == "Primary", "active": True,
            })
        replace_for_patient(cur, "patient_coverages", emr_id, rows)
        n += len(rows)
    return n


def sync_diagnoses(cur):
    # Real endpoint is flat /conditions, not /patients/{id}/conditions.
    # clinicalStatus values from PCC are uppercase ('ACTIVE'/'RESOLVED'), and the
    # description field is 'icd10Description', not 'description'.
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        rows = []
        for d in pcc_get("/conditions", patientId=pcc_id):
            rows.append({
                "id": new_id(), "patientId": emr_id,
                "icd10": d.get("icd10") or "",
                "description": d.get("icd10Description") or "",
                "active": (d.get("clinicalStatus") or "ACTIVE").upper() == "ACTIVE",
            })
        replace_for_patient(cur, "patient_diagnoses", emr_id, rows)
        n += len(rows)
    return n


# ── 12 ETL-expansion resources ───────────────────────────────────────────────

def sync_medications(cur):
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for m in pcc_get("/medications", patientId=pcc_id, facId=fac_id):
            upsert(cur, "patient_medications", ["patientId", "pccOrderId"], {
                "id": new_id(), "patientId": emr_id, "pccOrderId": m.get("orderId"),
                "name": m.get("description") or m.get("brandName") or "Unknown",
                "description": m.get("description") or "", "status": m.get("status"),
                "startDate": dt(m.get("startDateTime")), "endDate": dt(m.get("endDateTime")),
                "directions": m.get("directions"), "strength": m.get("strength"),
                "strengthUOM": m.get("strengthUOM"), "rxNormId": m.get("rxNormId"),
                "generic": bool(m.get("generic")), "narcotic": bool(m.get("narcotic")),
                "orderDate": dt(m.get("orderDate")),
                "syncedAt": datetime.utcnow(),
            })
            n += 1
    return n


def sync_allergies(cur):
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for a in pcc_get("/allergyintolerances", patientId=pcc_id, facId=fac_id):
            def _str(v):
                if v is None: return None
                if isinstance(v, dict): return v.get("description") or v.get("name") or str(v)
                if isinstance(v, list): return ", ".join(str(i.get("description", i)) if isinstance(i, dict) else str(i) for i in v)
                return str(v)
            upsert(cur, "patient_allergies", ["patientId", "allergen"], {
                "id": new_id(), "patientId": emr_id, "pccAllergyId": str(a.get("allergyId")) if a.get("allergyId") else None,
                "allergen": _str(a.get("allergen") or a.get("substance")) or "Unknown",
                "allergenCode": _str(a.get("allergenCode")), "category": _str(a.get("category")),
                "type": _str(a.get("type")), "severity": _str(a.get("severity")),
                "reaction": _str(a.get("reaction")), "reactionNote": _str(a.get("reactionNote")),
                "clinicalStatus": _str(a.get("clinicalStatus")),
                "onsetDate": dt(a.get("onsetDate")), "resolvedDate": dt(a.get("resolvedDate")),
            })
            n += 1
    return n


def sync_observations(cur):
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        rows = []
        for o in pcc_get("/observations", patientId=pcc_id, facId=fac_id):
            rows.append({
                "id": new_id(), "patientId": emr_id, "pccObservationId": o.get("observationId"),
                "type": o.get("type") or "unknown", "value": o.get("value"),
                "diastolicValue": o.get("diastolicValue"), "systolicValue": o.get("systolicValue"),
                "unit": o.get("unit"), "method": o.get("method"),
                "recordedDate": dt(o.get("recordedDate")) or datetime.utcnow(),
                "recordedBy": o.get("recordedBy"),
            })
        replace_for_patient(cur, "patient_observations", emr_id, rows)
        n += len(rows)
    return n


def sync_contacts(cur):
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for c in pcc_get("/contacts", patientId=pcc_id, facId=fac_id):
            upsert(cur, "patient_contacts", ["patientId", "pccContactId"], {
                "id": new_id(), "patientId": emr_id, "pccContactId": c.get("contactId"),
                "firstName": c.get("firstName"), "lastName": c.get("lastName"),
                "relationship": c.get("relationship"), "contactType": c.get("contactType"),
                "homePhone": c.get("homePhone"), "cellPhone": c.get("cellPhone"),
                "officePhone": c.get("officePhone"), "email": c.get("email"),
                "addressLine1": c.get("addressLine1"), "city": c.get("city"),
                "state": c.get("state"), "postalCode": c.get("postalCode"),
                "isGuarantor": bool(c.get("isGuarantor")),
            })
            n += 1
    return n


def sync_adt(cur):
    # facId is only valid when paired with adtRecordIds (direct record lookup) per
    # PCC spec: "'adtRecordIds' cannot be null/missing when 'facId' is passed."
    # For a full per-patient sync, patientId alone is correct.
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for r in pcc_get("/adt-records", patientId=pcc_id):
            upsert(cur, "patient_adt_records", ["patientId", "pccAdtRecordId"], {
                "id": new_id(), "patientId": emr_id, "pccAdtRecordId": r.get("adtRecordId"),
                "actionCode": r.get("actionCode"), "actionType": r.get("actionType"),
                "effectiveDateTime": dt(r.get("effectiveDateTime")),
                "roomDesc": r.get("roomDesc"), "bedDesc": r.get("bedDesc"),
                "unitDesc": r.get("unitDesc"), "floorDesc": r.get("floorDesc"),
                "payerName": r.get("payerName"), "payerType": r.get("payerType"),
                "transferReason": r.get("transferReason"), "dischargeStatus": r.get("dischargeStatus"),
                "syncedAt": datetime.utcnow(),
            })
            n += 1
    return n


def sync_practitioners(cur):
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for p in pcc_get("/practitioners", patientId=pcc_id, facId=fac_id):
            upsert(cur, "patient_practitioners", ["patientId", "pccPractitionerId"], {
                "id": new_id(), "patientId": emr_id, "pccPractitionerId": p.get("practitionerId"),
                "firstName": p.get("firstName"), "lastName": p.get("lastName"),
                "npi": p.get("npi"), "providerType": p.get("providerType"),
                "relation": p.get("relation"), "title": p.get("title"),
                "taxonomyCode": p.get("taxonomyCode"),
            })
            n += 1
    return n


def sync_immunizations(cur):
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for i in pcc_get("/immunizations", patientId=pcc_id, facId=fac_id):
            upsert(cur, "patient_immunizations", ["patientId", "pccImmunizationId"], {
                "id": new_id(), "patientId": emr_id, "pccImmunizationId": i.get("immunizationId"),
                "immunization": i.get("immunization"), "cvxCode": i.get("cvxCode"),
                "administrationDateTime": dt(i.get("administrationDateTime")),
                "administeredBy": i.get("administeredBy"), "lotNumber": i.get("lotNumber"),
                "manufacturerName": i.get("manufacturerName"), "consentStatus": i.get("consentStatus"),
                "given": bool(i.get("given")),
            })
            n += 1
    return n


# PCC requires 'reportType' and only accepts one value per call (no "all" option).
DIAGNOSTIC_REPORT_TYPES = ["laboratory", "radiology"]


def sync_diagnostic_reports(cur):
    # facId is not a valid param for this endpoint per spec; reportType is required.
    # orderingPractitioner is a nested object (firstName/lastName/npi/etc), but
    # the column is a plain string - flatten to a display name.
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for report_type in DIAGNOSTIC_REPORT_TYPES:
            for r in pcc_get("/diagnostic-reports", patientId=pcc_id, reportType=report_type):
                practitioner = r.get("orderingPractitioner") or {}
                practitioner_name = " ".join(
                    filter(None, [practitioner.get("firstName"), practitioner.get("lastName")])
                ) or None
                upsert(cur, "patient_diagnostic_reports", ["patientId", "pccReportId"], {
                    "id": new_id(), "patientId": emr_id, "pccReportId": r.get("reportId"),
                    "reportName": r.get("reportName"), "reportType": r.get("reportType"),
                    "reportStatus": r.get("reportStatus"), "category": r.get("category"),
                    "effectiveDateTime": dt(r.get("effectiveDateTime")),
                    "orderingPractitioner": practitioner_name,
                    "syncedAt": datetime.utcnow(),
                })
                n += 1
    return n


def sync_care_plans(cur):
    # facId is not a valid param for this endpoint per spec; patientId alone is
    # required. /care-plans caps pageSize at 50 (unlike most endpoints' 200) -
    # the default 100 gets a 400 Bad Request.
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for c in pcc_get("/care-plans", page_size=50, patientId=pcc_id):
            upsert(cur, "patient_care_plans", ["patientId", "pccCarePlanId"], {
                "id": new_id(), "patientId": emr_id, "pccCarePlanId": c.get("carePlanId"),
                "status": c.get("status"), "createdDate": dt(c.get("createdDate")),
                "nextReviewDate": dt(c.get("nextReviewDate")), "closedDate": dt(c.get("closedDate")),
                "closureReason": c.get("closureReason"),
                "syncedAt": datetime.utcnow(),
            })
            n += 1
    return n


def sync_assessments(cur):
    # PCC defaults to only the last 30 days if startDate/endDate aren't passed.
    # Use each patient's admission date as startDate so the full stay is covered
    # instead of silently truncating history. facId is not a valid param here.
    # NOTE: despite the OpenAPI schema saying format:"date", PCC's actual error
    # message confirms startDate requires the full UTC timestamp format
    # (YYYY-MM-DDTHH:MM:SS.sssZ), not a bare YYYY-MM-DD date.
    n = 0
    cur.execute(
        'SELECT p.id, p."pccPatientId", f."pccFacilityId", p."admissionDate" '
        'FROM patients p JOIN facilities f ON f.id = p."facilityId" '
        'WHERE p."pccPatientId" IS NOT NULL AND p.active = true '
        'AND f."pccFacilityId" IS NOT NULL'
    )
    for emr_id, pcc_id, fac_id, admission_date in cur.fetchall():
        params = {"patientId": pcc_id}
        if admission_date:
            params["startDate"] = admission_date.strftime("%Y-%m-%dT00:00:00.000Z")
        for a in pcc_get("/assessments", **params):
            upsert(cur, "patient_assessments", ["patientId", "pccAssessmentId"], {
                "id": new_id(), "patientId": emr_id, "pccAssessmentId": a.get("assessmentId"),
                "assessmentRefDate": dt(a.get("assessmentRefDate")),
                "assessmentScore": a.get("assessmentScore"),
                "assessmentStatus": a.get("assessmentStatus"), "templateId": a.get("templateId"),
                "syncedAt": datetime.utcnow(),
            })
            n += 1
    return n


# PCC requires 'payerType' and only accepts one value per call (no "all" option).
EPISODE_PAYER_TYPES = [
    "managedCare", "medicaid", "medicareA", "medicareB", "medicareD",
    "other", "outpatient", "private",
]


def sync_episodes_of_care(cur):
    # facId is not a valid param for this endpoint per spec; payerType is required,
    # so we loop the full payer-type enum per patient to get complete data.
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        for payer_type in EPISODE_PAYER_TYPES:
            for e in pcc_get("/episodes-of-care", patientId=pcc_id, payerType=payer_type):
                upsert(cur, "patient_episodes_of_care", ["patientId", "pccEpisodeId"], {
                    "id": new_id(), "patientId": emr_id, "pccEpisodeId": e.get("episodeId"),
                    "name": e.get("name"), "type": e.get("type"), "status": e.get("status"),
                    "startDate": dt(e.get("startDate")), "endDate": dt(e.get("endDate")),
                    "payerName": e.get("payerName"), "payerType": e.get("payerType"),
                    "model": e.get("model"),
                    "syncedAt": datetime.utcnow(),
                })
                n += 1
    return n


def sync_therapy(cur):
    n = 0
    for emr_id, pcc_id, fac_id in iter_patients(cur):
        rows = []
        for t in pcc_get(f"/patients/{pcc_id}/therapy"):
            rows.append({
                "id": new_id(), "patientId": emr_id, "discipline": t.get("discipline"),
                "onsetDate": dt(t.get("onsetDate")), "startOfCareDate": dt(t.get("startOfCareDate")),
                "certificationStartDate": dt(t.get("certificationStartDate")),
                "certificationEndDate": dt(t.get("certificationEndDate")),
                "medicalDiagnosis": t.get("medicalDiagnosis"),
                "treatmentDiagnosis": t.get("treatmentDiagnosis"),
                "treatmentFreqPerWeek": t.get("treatmentFreqPerWeek"),
                "therapyProvider": t.get("therapyProvider"),
            })
        replace_for_patient(cur, "patient_therapy_tracks", emr_id, rows)
        n += len(rows)
    return n


# ── dispatch ─────────────────────────────────────────────────────────────────

# resource slug → sync function. Slugs match integration_sync_configs.resourceName.
SYNCS = {
    "patients": sync_patients,
    "adt": sync_adt,
    "observations": sync_observations,
    "medications": sync_medications,
    "allergies": sync_allergies,
    "diagnoses": sync_diagnoses,
    "coverages": sync_coverages,
    "diagnostic_reports": sync_diagnostic_reports,
    "contacts": sync_contacts,
    "immunizations": sync_immunizations,
    "care_plans": sync_care_plans,
    "therapy": sync_therapy,
    "assessments": sync_assessments,
    "practitioners": sync_practitioners,
    "episodes_of_care": sync_episodes_of_care,
}


def run(resource):
    conn = psycopg2.connect(DATABASE_URL)
    total = 0
    try:
        targets = [resource] if resource else list(SYNCS)
        for name in targets:
            fn = SYNCS.get(name)
            if not fn:
                print(f"Unknown resource: {name}", file=sys.stderr)
                sys.exit(2)
            with conn.cursor() as cur:
                count = fn(cur)
            conn.commit()
            total += count
            print(f"{name}: {count}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    # Final token = total count (the scheduler parses this).
    print(total)
    return total


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Sync PointClickCare resources into the EMR DB.")
    ap.add_argument("--resource", choices=list(SYNCS), help="Sync only this resource (default: all).")
    args = ap.parse_args()
    run(args.resource)
