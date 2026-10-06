"""Thin Stedi healthcare API client. Spec: github.com/Stedi/openApi healthcare.json."""
import os

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://healthcare.us.stedi.com/2024-04-01"


class StediError(Exception):
    pass


class StediAuthError(StediError):
    pass


class StediValidationError(StediError):
    pass


class StediTimeoutError(StediError):
    pass


class StediClient:
    # One instance per process: it owns a pooled requests.Session.
    def __init__(self, api_key=None, timeout=10, base_url=BASE_URL):
        self.api_key = api_key or os.environ.get("STEDI_API_KEY", "")
        if not self.api_key:
            raise StediAuthError("STEDI_API_KEY is not set")
        self.timeout = timeout
        self.base_url = base_url
        self.session = requests.Session()
        # Retries only for transient server-side failures; eligibility and
        # discovery start are read-only lookups, so POST retries are safe.
        retry = Retry(total=2, backoff_factor=0.5, status_forcelist=(429, 502, 503, 504),
                      allowed_methods=None, raise_on_status=False)
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"Authorization": self.api_key, "Content-Type": "application/json"})

    def _request(self, method, path, **kw):
        try:
            r = self.session.request(method, self.base_url + path, timeout=self.timeout, **kw)
        except requests.Timeout as e:
            raise StediTimeoutError(str(e)) from e
        except requests.RequestException as e:
            raise StediError(f"network error: {e}") from e
        if r.status_code in (401, 403):
            raise StediAuthError(f"HTTP {r.status_code}")
        if r.status_code in (400, 422):
            raise StediValidationError(r.text[:500])
        if r.status_code >= 400:
            raise StediError(f"HTTP {r.status_code}: {r.text[:300]}")
        return r

    def eligibility(self, body):
        return self._request("POST", "/change/medicalnetwork/eligibility/v3", json=body).json()

    def discovery_start(self, body):
        r = self._request("POST", "/insurance-discovery/check/v1", json=body)
        return r.status_code, r.json()

    def discovery_get(self, discovery_id):
        return self._request("GET", f"/insurance-discovery/check/v1/{discovery_id}").json()

    def search_payers(self, query, page_size=10):
        params = {"query": query, "eligibilityCheck": "SUPPORTED", "pageSize": page_size}
        return self._request("GET", "/payers/search", params=params).json()
