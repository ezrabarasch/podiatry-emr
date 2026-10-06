"""Build Stedi eligibility v3 requests and reduce responses to a flat summary."""
import re

ACTIVE_CODES = {"1", "2", "3", "4"}     # X12 EB01: active coverage variants
INACTIVE_CODES = {"6", "7", "8"}        # inactive / pending-eligibility / pending-investigation
COPAY_SERVICE_PREFERENCE = ("98", "30")  # 98 = professional physician office visit


def _ymd(d):
    return d.strftime("%Y%m%d") if d else None


def _iso(s):
    m = re.match(r"(\d{4})(\d{2})(\d{2})", s or "")
    return f"{m[1]}-{m[2]}-{m[3]}" if m else None


def build_request(first_name, last_name, dob, member_id, payer_id, provider, gender=None, dos=None):
    sub = {"firstName": first_name, "lastName": last_name, "dateOfBirth": _ymd(dob), "memberId": member_id}
    if gender in ("M", "F"):
        sub["gender"] = gender
    prov = {"npi": provider["npi"], "organizationName": provider["name"]}
    enc = {"serviceTypeCodes": ["30"]}
    if dos:
        enc["dateOfService"] = _ymd(dos)
    return {"tradingPartnerServiceId": payer_id, "provider": prov, "subscriber": sub, "encounter": enc}


def _errors(resp):
    seen, out = set(), []
    for e in (resp.get("errors") or []) + ((resp.get("subscriber") or {}).get("aaaErrors") or []) \
            + ((resp.get("payer") or {}).get("aaaErrors") or []):
        key = (e.get("code"), e.get("description"))
        if key not in seen:
            seen.add(key)
            out.append({"code": e.get("code"), "description": e.get("description"),
                        "followup": e.get("followupAction")})
    return out


def _amount(b, key):
    try:
        return float(b.get(key))
    except (TypeError, ValueError):
        return None


def _pick(benefits, code, amount_key, services, prefer_part_b):
    """Best in-network row for a benefit code; individual-level, calendar-year first."""
    best, best_score = None, None
    for b in benefits:
        if b.get("code") != code or b.get("inPlanNetworkIndicatorCode") == "N":
            continue
        if _amount(b, amount_key) is None:
            continue
        stc = b.get("serviceTypeCodes") or []
        svc = next((i for i, s in enumerate(services) if s in stc), None)
        if svc is None:
            continue
        score = (svc, b.get("coverageLevelCode") != "IND", b.get("timeQualifierCode") != "23",
                 not (prefer_part_b and "Part B" in (b.get("planCoverage") or "")))
        if best_score is None or score < best_score:
            best, best_score = b, score
    return _amount(best, amount_key) if best else None


def _pct(fraction):
    # Stedi sends coinsurance as a decimal fraction ("0.80" = 80%).
    return None if fraction is None else round(fraction * 100, 2)


def summarize(resp):
    """Flat dict for storage/UI. outcome: active | inactive | error | unknown."""
    benefits = resp.get("benefitsInformation") or []
    statuses = {s.get("statusCode") for s in (resp.get("planStatus") or [])} | {b.get("code") for b in benefits}
    errors = _errors(resp)
    if statuses & ACTIVE_CODES:
        outcome = "active"
    elif statuses & INACTIVE_CODES:
        outcome = "inactive"
    elif errors:
        outcome = "error"
    else:
        outcome = "unknown"
    dates = resp.get("planDateInformation") or {}
    plan = (resp.get("planInformation") or {})
    plan_name = next((s.get("planDetails") for s in (resp.get("planStatus") or []) if s.get("planDetails")), None) \
        or next((b.get("planCoverage") for b in benefits if b.get("planCoverage")), None)
    payer_is_cms = (resp.get("payer") or {}).get("payorIdentification") == "CMS"
    return {
        "outcome": outcome,
        "payer_name": (resp.get("payer") or {}).get("name"),
        "plan_name": plan_name,
        "group_number": plan.get("groupNumber"),
        "plan_begin": _iso(dates.get("planBegin") or dates.get("eligibilityBegin") or dates.get("policyEffective")
                           or dates.get("benefit")),
        "plan_end": _iso(dates.get("planEnd") or dates.get("eligibilityEnd") or dates.get("policyExpiration")),
        "copay": _pick(benefits, "B", "benefitAmount", COPAY_SERVICE_PREFERENCE, payer_is_cms),
        "coinsurance_pct": _pct(_pick(benefits, "A", "benefitPercent", COPAY_SERVICE_PREFERENCE, payer_is_cms)),
        "deductible": _pick(benefits, "C", "benefitAmount", ("30",), payer_is_cms),
        "errors": errors,
        "application_mode": (resp.get("meta") or {}).get("applicationMode"),
    }
