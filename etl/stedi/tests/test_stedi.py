"""Run: python -m unittest etl.stedi.tests.test_stedi -v   (from the repo root; no network, no DB)."""
import datetime
import pathlib
import re
import unittest
from unittest import mock

import requests

from etl.stedi import client as sc
from etl.stedi.eligibility import build_request, summarize
from etl.stedi.payers import normalize, resolve
from etl.stedi.worker import member_id_for, pick_coverage, write_patient_data_enabled

# Shapes condensed from real Stedi test-mode responses (2026-10-06).
MEDICARE = {
    "meta": {"applicationMode": "test"}, "payer": {"name": "CMS", "payorIdentification": "CMS"},
    "planStatus": [{"statusCode": "1", "status": "Active Coverage", "serviceTypeCodes": ["30"]}],
    "planDateInformation": {"benefit": "20230101", "eligibility": "20241025"},
    "benefitsInformation": [
        {"code": "1", "serviceTypeCodes": ["30"], "planCoverage": "Medicare Part B"},
        {"code": "C", "serviceTypeCodes": ["30"], "planCoverage": "Medicare Part A", "benefitAmount": "1600",
         "timeQualifierCode": "26", "inPlanNetworkIndicatorCode": "W"},
        {"code": "C", "serviceTypeCodes": ["30"], "planCoverage": "Medicare Part B", "benefitAmount": "240",
         "timeQualifierCode": "23", "inPlanNetworkIndicatorCode": "W"},
        {"code": "A", "serviceTypeCodes": ["30"], "planCoverage": "Medicare Part B", "benefitPercent": "0.2",
         "inPlanNetworkIndicatorCode": "W"},
    ],
}
AETNA = {
    "meta": {"applicationMode": "test"}, "payer": {"name": "AETNA INC", "payorIdentification": "953402799"},
    "planStatus": [{"statusCode": "1", "planDetails": "Aetna Choice POS II", "serviceTypeCodes": ["30"]}],
    "planInformation": {"groupNumber": "916700514772464"},
    "planDateInformation": {"planBegin": "20240101", "eligibilityBegin": "20191101"},
    "benefitsInformation": [
        {"code": "C", "serviceTypeCodes": ["30"], "benefitAmount": "100", "coverageLevelCode": "IND",
         "timeQualifierCode": "23", "inPlanNetworkIndicatorCode": "N"},
        {"code": "C", "serviceTypeCodes": ["30"], "benefitAmount": "0", "coverageLevelCode": "IND",
         "timeQualifierCode": "23", "inPlanNetworkIndicatorCode": "Y"},
        {"code": "B", "serviceTypeCodes": ["33"], "benefitAmount": "15", "inPlanNetworkIndicatorCode": "Y"},
        {"code": "B", "serviceTypeCodes": ["98"], "benefitAmount": "25", "inPlanNetworkIndicatorCode": "Y"},
        {"code": "B", "serviceTypeCodes": ["98"], "benefitAmount": "0", "inPlanNetworkIndicatorCode": "N"},
    ],
}
DOB_MISMATCH = {"meta": {"applicationMode": "test"}, "payer": {"name": "UNITEDHEALTHCARE"},
                "errors": [{"code": "71", "description": "Patient Birth Date Does Not Match", "followupAction": "Please Correct and Resubmit"}],
                "subscriber": {"aaaErrors": [{"code": "71", "description": "Patient Birth Date Does Not Match"}]}}


class SummarizeTests(unittest.TestCase):
    def test_medicare_prefers_part_b(self):
        s = summarize(MEDICARE)
        self.assertEqual(s["outcome"], "active")
        self.assertEqual(s["deductible"], 240.0)       # Part B, not Part A's 1600
        self.assertEqual(s["coinsurance_pct"], 20.0)
        self.assertEqual(s["plan_begin"], "2023-01-01")

    def test_commercial_in_network_copay_and_deductible(self):
        s = summarize(AETNA)
        self.assertEqual(s["copay"], 25.0)             # service 98 beats 33; out-of-network 98 ignored
        self.assertEqual(s["deductible"], 0.0)         # in-network row, not the $100 out-of-network one
        self.assertEqual(s["group_number"], "916700514772464")
        self.assertEqual(s["plan_name"], "Aetna Choice POS II")
        self.assertEqual(s["plan_begin"], "2024-01-01")

    def test_inactive(self):
        s = summarize({"planStatus": [{"statusCode": "6", "status": "Inactive"}]})
        self.assertEqual(s["outcome"], "inactive")

    def test_aaa_error_deduped_and_flagged(self):
        s = summarize(DOB_MISMATCH)
        self.assertEqual(s["outcome"], "error")
        self.assertEqual(len(s["errors"]), 1)

    def test_empty_response_is_unknown_not_active(self):
        self.assertEqual(summarize({})["outcome"], "unknown")


class RequestTests(unittest.TestCase):
    def test_build_request(self):
        r = build_request("Jane", "Doe", datetime.date(1955, 5, 5), "ABC", "CMS",
                          {"npi": "1999999984", "name": "Provider Name"}, gender="F")
        self.assertEqual(r["subscriber"], {"firstName": "Jane", "lastName": "Doe", "dateOfBirth": "19550505",
                                           "memberId": "ABC", "gender": "F"})
        self.assertEqual(r["tradingPartnerServiceId"], "CMS")
        self.assertEqual(r["encounter"], {"serviceTypeCodes": ["30"]})

    def test_unknown_gender_omitted(self):
        r = build_request("A", "B", datetime.date(2000, 1, 1), "X", "CMS", {"npi": "1", "name": "n"}, gender=None)
        self.assertNotIn("gender", r["subscriber"])


class PayerAndCoverageTests(unittest.TestCase):
    def cur(self, row):
        c = mock.Mock()
        c.fetchone.return_value = row
        return c

    def test_map_row_wins_over_type_fallback(self):
        self.assertEqual(resolve(self.cur(("77027",)), "Medicaid-FL", "MEDICAID"), "77027")

    def test_medicare_fallback_and_unmapped(self):
        self.assertEqual(resolve(self.cur(None), "X-over Medicare B to Medicaid", "MEDICARE"), "CMS")
        self.assertIsNone(resolve(self.cur(None), "Resident Liability", "COMMERCIAL"))

    def test_normalize(self):
        self.assertEqual(normalize("  Medicaid-FL "), "medicaid-fl")

    def test_pick_coverage(self):
        a = {"id": "a", "active": True, "isPrimary": False}
        b = {"id": "b", "active": True, "isPrimary": True}
        c = {"id": "c", "active": False, "isPrimary": True}
        self.assertEqual(pick_coverage([a, b, c])["id"], "b")
        self.assertEqual(pick_coverage([a, c])["id"], "a")
        self.assertIsNone(pick_coverage([c]))

    def test_member_id_sources(self):
        p = {"medicareNumber": "MBI1", "medicaidNumber": "MCD1"}
        self.assertEqual(member_id_for({"payerType": "MEDICARE", "memberId": None}, p), "MBI1")
        self.assertEqual(member_id_for({"payerType": "MEDICAID", "memberId": None}, p), "MCD1")
        self.assertEqual(member_id_for({"payerType": "MEDICAID", "memberId": "COV"}, p), "COV")
        self.assertIsNone(member_id_for({"payerType": "COMMERCIAL", "memberId": None}, p))


class DataAuthorityTests(unittest.TestCase):
    """PCC is authoritative: Stedi code may read PCC tables but only write stedi_* tables."""

    def test_flag_defaults_off(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertFalse(write_patient_data_enabled())
        for v, want in (("false", False), ("", False), ("TRUE", True), (" true ", True)):
            with mock.patch.dict("os.environ", {"STEDI_WRITE_PATIENT_DATA": v}, clear=True):
                self.assertEqual(write_patient_data_enabled(), want, v)

    def test_stedi_code_only_writes_stedi_tables(self):
        pkg = pathlib.Path(__file__).resolve().parents[1]
        writes = []
        for f in pkg.glob("*.py"):
            src = f.read_text(encoding="utf-8")
            # "FOR UPDATE" is a row lock, not a write.
            writes += re.findall(r"(?<!FOR )\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+\"?(\w+)", src, re.I)
        self.assertTrue(writes, "scan found no writes - regex is broken")
        self.assertEqual([t for t in writes if not t.startswith("stedi_")], [])


class ClientTests(unittest.TestCase):
    def mk(self, status=200, body=None, exc=None):
        cl = sc.StediClient(api_key="k")
        resp = mock.Mock(status_code=status, text="boom")
        resp.json.return_value = body or {}
        cl.session = mock.Mock()
        if exc:
            cl.session.request.side_effect = exc
        else:
            cl.session.request.return_value = resp
        return cl

    def test_missing_key(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(sc.StediAuthError):
                sc.StediClient()

    def test_ok(self):
        self.assertEqual(self.mk(200, {"a": 1}).eligibility({}), {"a": 1})

    def test_error_mapping(self):
        with self.assertRaises(sc.StediAuthError):
            self.mk(401).eligibility({})
        with self.assertRaises(sc.StediValidationError):
            self.mk(400).eligibility({})
        with self.assertRaises(sc.StediError):
            self.mk(500).eligibility({})
        with self.assertRaises(sc.StediTimeoutError):
            self.mk(exc=requests.Timeout("slow")).eligibility({})


if __name__ == "__main__":
    unittest.main()
