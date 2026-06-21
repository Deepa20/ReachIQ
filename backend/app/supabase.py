from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx


SUPABASE_URL_ENV = "SUPABASE_URL"
SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY"
SUPABASE_ANON_KEY_ENV = "SUPABASE_ANON_KEY"


class SupabaseApiError(RuntimeError):
    """Raised when Supabase returns an error response."""


@lru_cache(maxsize=1)
def dotenv_values() -> dict[str, str]:
    values: dict[str, str] = {}
    candidates = [Path.cwd() / ".env", Path(__file__).resolve().parents[2] / ".env"]
    for path in dict.fromkeys(candidates):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            values[key.strip()] = value.strip().strip("'\"")
    return values


def config_value(name: str) -> str | None:
    return os.getenv(name) or dotenv_values().get(name)


@dataclass(frozen=True)
class SupabaseConfig:
    url: str | None
    api_key: str | None
    key_source: str | None

    @classmethod
    def from_env(cls) -> "SupabaseConfig":
        service_key = config_value(SUPABASE_SERVICE_ROLE_KEY_ENV)
        anon_key = config_value(SUPABASE_ANON_KEY_ENV)
        if service_key:
            key_source = SUPABASE_SERVICE_ROLE_KEY_ENV
            api_key = service_key
        else:
            key_source = SUPABASE_ANON_KEY_ENV if anon_key else None
            api_key = anon_key
        return cls(url=config_value(SUPABASE_URL_ENV), api_key=api_key, key_source=key_source)

    @property
    def configured(self) -> bool:
        return bool(self.url and self.api_key)

    @property
    def missing(self) -> list[str]:
        missing = []
        if not self.url:
            missing.append(SUPABASE_URL_ENV)
        if not self.api_key:
            missing.append(f"{SUPABASE_SERVICE_ROLE_KEY_ENV} or {SUPABASE_ANON_KEY_ENV}")
        return missing

    @property
    def rest_url(self) -> str:
        if not self.url:
            raise SupabaseApiError("SUPABASE_URL is not configured")
        return self.url.rstrip("/") + "/rest/v1"


class SupabaseClient:
    def __init__(self, config: SupabaseConfig | None = None, http_client: httpx.Client | None = None) -> None:
        self.config = config or SupabaseConfig.from_env()
        self._http_client = http_client

    def status(self) -> dict[str, Any]:
        if not self.config.configured:
            return {
                "configured": False,
                "mode": "local-demo",
                "missing": self.config.missing,
                "message": "Supabase is not configured; API is running with deterministic local data.",
            }

        return {
            "configured": True,
            "mode": "supabase",
            "url": self.config.url,
            "key_source": self.config.key_source,
            "message": "Supabase credentials are configured. Table endpoints will use PostgREST.",
        }

    def select(self, table: str, limit: int = 50, filters: dict[str, str] | None = None, order: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"select": "*", "limit": limit}
        if order:
            params["order"] = order
        for key, value in (filters or {}).items():
            params[key] = f"eq.{value}"
        response = self._request("GET", table, params=params)
        data = response.json()
        if not isinstance(data, list):
            raise SupabaseApiError("Expected Supabase select response to be a list")
        return data

    def insert(self, table: str, records: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        payload = records if isinstance(records, list) else [records]
        response = self._request("POST", table, json=payload, headers={"Prefer": "return=representation"})
        data = response.json()
        if not isinstance(data, list):
            raise SupabaseApiError("Expected Supabase insert response to be a list")
        return data

    def upsert(
        self,
        table: str,
        records: dict[str, Any] | list[dict[str, Any]],
        conflict_target: str | None = None,
    ) -> list[dict[str, Any]]:
        payload = records if isinstance(records, list) else [records]
        headers = {"Prefer": "resolution=merge-duplicates,return=representation"}
        params = {"on_conflict": conflict_target} if conflict_target else None
        response = self._request("POST", table, params=params, json=payload, headers=headers)
        data = response.json()
        if not isinstance(data, list):
            raise SupabaseApiError("Expected Supabase upsert response to be a list")
        return data

    def persist_validation_run(
        self,
        validation_result: dict[str, Any],
        source_name: str = "manual-upload",
        owner_id: str | None = None,
    ) -> dict[str, Any]:
        run_record = {
            "source_name": source_name,
            "owner_id": owner_id,
            "summary": validation_result["summary"],
            "list_health_score": validation_result["summary"]["list_health_score"],
            "uploaded_contacts": validation_result["summary"]["uploaded_contacts"],
            "deliverable_contacts": validation_result["summary"]["deliverable_contacts"],
        }
        inserted_run = self.insert("validation_runs", run_record)[0]
        run_id = inserted_run.get("id")

        contact_records = [
            {
                "validation_run_id": run_id,
                "owner_id": owner_id,
                "name": contact.get("name"),
                "email": contact.get("email"),
                "company": contact.get("company"),
                "title": contact.get("title"),
                "validation_status": contact.get("validation_status"),
                "temperature": contact.get("temperature"),
                "score": contact.get("score"),
                "icp_fit_score": contact.get("icp_fit_score"),
                "payload": contact,
            }
            for contact in validation_result["contacts"]
        ]
        inserted_contacts = self.insert("contacts", contact_records) if contact_records else []
        return {"validation_run": inserted_run, "contacts": inserted_contacts}

    def _request(
        self,
        method: str,
        table: str,
        params: dict[str, Any] | None = None,
        json: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        if not self.config.configured:
            raise SupabaseApiError("Supabase is not configured")
        url = f"{self.config.rest_url}/{table}"
        request_headers = {
            "apikey": self.config.api_key or "",
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        request_headers.update(headers or {})

        client = self._http_client or httpx.Client(timeout=10)
        try:
            response = client.request(method, url, params=params, json=json, headers=request_headers)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            raise SupabaseApiError(f"Supabase returned {exc.response.status_code}: {exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise SupabaseApiError(f"Supabase request failed: {exc}") from exc
        finally:
            if self._http_client is None:
                client.close()
