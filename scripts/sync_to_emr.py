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
import uuid
from datetime import datetime

import psycopg2
import requests

DATABASE_URL = os.environ["DATABASE_URL"]
PCC_BASE = os.environ.get("PCC_BASE_URL", "https://connect.pointclickcare.com/api/public/preview1")
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
    resp = requests.post(
        f"{PCC_BASE}/token",
        data={"grant_type": "client_credentials"},
        auth=(PCC_CLIENT_ID, PCC_CLIENT_SECRET),
        timeout=60,
    )
    resp.raise_for_status()
    _token["value"] = resp.json()["access_token"]
    return _token["value"]


def pcc_get(path, **params):
    """GET a PCC endpoint and return its 'data' list (empty on none)."""
    resp = requests.get(
        f"{PCC_BASE}{path}",
        params=params,
        headers={"Authorization": f"Bearer {_access_token()}"},
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    return body.get("data", body if isinstance(body, list) else [])


def iter_patients(cur):
    """Yield (emr_id, pcc_patient_id) for active EMR patients linked to PCC."""
    cur.execute(
        'SELECT id, "pccPatientId" FROM patients '
        'WHERE "pccPatientId" IS NOT NULL AND active = true'
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


PAYER_TYPES = {"MEDICARE", "MEDICAID", "COMMERCIAL", "OTHER"}

def payer_type(v):
    v = (v or "").upper()
    return v if v in PAYER_TYPES else "OTHER"


# ── pre-existing resources (patients, coverages, diagnoses) ───────────────────

def sync_patients(cur):
    """Refresh demographics of EMR patients already linked to PCC."""
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        data = pcc_get(f"/patients/{pcc_id}")
        p = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)
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
                p.get("medicareNumber"), p.get("medicaidNumber"), p.get("primaryLanguage"),
                dt(p.get("admissionDate")), dt(p.get("dischargeDate")), emr_id,
            ],
        )
        n += 1
    return n


def sync_coverages(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        rows = []
        for c in pcc_get(f"/patients/{pcc_id}/coverages"):
            rows.append({
                "id": new_id(), "patientId": emr_id,
                "payerName": c.get("payerName") or "Unknown",
                "payerType": payer_type(c.get("payerType")),
                "memberId": c.get("memberId"), "groupId": c.get("groupId"),
                "effectiveDate": dt(c.get("effectiveDate")),
                "terminationDate": dt(c.get("terminationDate")),
                "isPrimary": bool(c.get("isPrimary")), "active": True,
            })
        replace_for_patient(cur, "patient_coverages", emr_id, rows)
        n += len(rows)
    return n


def sync_diagnoses(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        rows = []
        for d in pcc_get(f"/patients/{pcc_id}/conditions"):
            rows.append({
                "id": new_id(), "patientId": emr_id,
                "icd10": d.get("icd10") or d.get("code") or "",
                "description": d.get("description") or "",
                "active": (d.get("clinicalStatus") or "active") == "active",
            })
        replace_for_patient(cur, "patient_diagnoses", emr_id, rows)
        n += len(rows)
    return n


# ── 12 ETL-expansion resources ───────────────────────────────────────────────

def sync_medications(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for m in pcc_get(f"/patients/{pcc_id}/medications"):
            upsert(cur, "patient_medications", ["patientId", "pccOrderId"], {
                "id": new_id(), "patientId": emr_id, "pccOrderId": m.get("orderId"),
                "description": m.get("description") or "", "status": m.get("status"),
                "startDate": dt(m.get("startDateTime")), "endDate": dt(m.get("endDateTime")),
                "directions": m.get("directions"), "strength": m.get("strength"),
                "strengthUOM": m.get("strengthUOM"), "rxNormId": m.get("rxNormId"),
                "generic": bool(m.get("generic")), "narcotic": bool(m.get("narcotic")),
                "orderDate": dt(m.get("orderDate")),
            })
            n += 1
    return n


def sync_allergies(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for a in pcc_get(f"/patients/{pcc_id}/allergies"):
            upsert(cur, "patient_allergies", ["patientId", "allergen"], {
                "id": new_id(), "patientId": emr_id, "pccAllergyId": a.get("allergyId"),
                "allergen": a.get("allergen") or a.get("substance") or "Unknown",
                "allergenCode": a.get("allergenCode"), "category": a.get("category"),
                "type": a.get("type"), "severity": a.get("severity"),
                "reaction": a.get("reaction"), "reactionNote": a.get("reactionNote"),
                "clinicalStatus": a.get("clinicalStatus"),
                "onsetDate": dt(a.get("onsetDate")), "resolvedDate": dt(a.get("resolvedDate")),
            })
            n += 1
    return n


def sync_observations(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        rows = []
        for o in pcc_get(f"/patients/{pcc_id}/observations"):
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
    for emr_id, pcc_id in iter_patients(cur):
        for c in pcc_get(f"/patients/{pcc_id}/contacts"):
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
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for r in pcc_get(f"/patients/{pcc_id}/adtRecords"):
            upsert(cur, "patient_adt_records", ["patientId", "pccAdtRecordId"], {
                "id": new_id(), "patientId": emr_id, "pccAdtRecordId": r.get("adtRecordId"),
                "actionCode": r.get("actionCode"), "actionType": r.get("actionType"),
                "effectiveDateTime": dt(r.get("effectiveDateTime")),
                "roomDesc": r.get("roomDesc"), "bedDesc": r.get("bedDesc"),
                "unitDesc": r.get("unitDesc"), "floorDesc": r.get("floorDesc"),
                "payerName": r.get("payerName"), "payerType": r.get("payerType"),
                "transferReason": r.get("transferReason"), "dischargeStatus": r.get("dischargeStatus"),
            })
            n += 1
    return n


def sync_practitioners(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for p in pcc_get(f"/patients/{pcc_id}/practitioners"):
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
    for emr_id, pcc_id in iter_patients(cur):
        for i in pcc_get(f"/patients/{pcc_id}/immunizations"):
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


def sync_diagnostic_reports(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for r in pcc_get(f"/patients/{pcc_id}/diagnosticReports"):
            upsert(cur, "patient_diagnostic_reports", ["patientId", "pccReportId"], {
                "id": new_id(), "patientId": emr_id, "pccReportId": r.get("reportId"),
                "reportName": r.get("reportName"), "reportType": r.get("reportType"),
                "reportStatus": r.get("reportStatus"), "category": r.get("category"),
                "effectiveDateTime": dt(r.get("effectiveDateTime")),
                "orderingPractitioner": r.get("orderingPractitioner"),
            })
            n += 1
    return n


def sync_care_plans(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for c in pcc_get(f"/patients/{pcc_id}/carePlans"):
            upsert(cur, "patient_care_plans", ["patientId", "pccCarePlanId"], {
                "id": new_id(), "patientId": emr_id, "pccCarePlanId": c.get("carePlanId"),
                "status": c.get("status"), "createdDate": dt(c.get("createdDate")),
                "nextReviewDate": dt(c.get("nextReviewDate")), "closedDate": dt(c.get("closedDate")),
                "closureReason": c.get("closureReason"),
            })
            n += 1
    return n


def sync_assessments(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for a in pcc_get(f"/patients/{pcc_id}/assessments"):
            upsert(cur, "patient_assessments", ["patientId", "pccAssessmentId"], {
                "id": new_id(), "patientId": emr_id, "pccAssessmentId": a.get("assessmentId"),
                "assessmentRefDate": dt(a.get("assessmentRefDate")),
                "assessmentScore": a.get("assessmentScore"),
                "assessmentStatus": a.get("assessmentStatus"), "templateId": a.get("templateId"),
            })
            n += 1
    return n


def sync_episodes_of_care(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
        for e in pcc_get(f"/patients/{pcc_id}/episodesOfCare"):
            upsert(cur, "patient_episodes_of_care", ["patientId", "pccEpisodeId"], {
                "id": new_id(), "patientId": emr_id, "pccEpisodeId": e.get("episodeId"),
                "name": e.get("name"), "type": e.get("type"), "status": e.get("status"),
                "startDate": dt(e.get("startDate")), "endDate": dt(e.get("endDate")),
                "payerName": e.get("payerName"), "payerType": e.get("payerType"),
                "model": e.get("model"),
            })
            n += 1
    return n


def sync_therapy(cur):
    n = 0
    for emr_id, pcc_id in iter_patients(cur):
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
