"""Resolve an EMR coverage row to a Stedi tradingPartnerServiceId.

EMR payer names are PCC billing-category labels ("Resident Liability",
"X-over Medicare B to Medicaid"), not insurers, so a name guess is unsafe:
an explicit stedi_payer_map row wins, then payerType MEDICARE -> CMS, and
anything else returns None (the worker marks it needs_review, never guesses).
"""
import re

MEDICARE_PAYER_ID = "CMS"


def normalize(name):
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def resolve(cur, payer_name, payer_type):
    cur.execute('SELECT "stediPayerId" FROM stedi_payer_map WHERE "labelKey" = %s', (normalize(payer_name),))
    row = cur.fetchone()
    if row:
        return row[0]
    return MEDICARE_PAYER_ID if payer_type == "MEDICARE" else None
