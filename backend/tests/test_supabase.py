import json

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.supabase import SupabaseClient, SupabaseConfig


client = TestClient(app)


def test_supabase_status_reports_local_demo_when_env_missing(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    response = client.get("/api/supabase/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is False
    assert payload["mode"] == "local-demo"
    assert "SUPABASE_URL" in payload["missing"]


def test_supabase_persistence_endpoint_requires_configuration(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    response = client.post(
        "/api/supabase/validation-runs",
        json={"contacts": [{"name": "Avery Chen", "email": "avery.chen@pacificsaas.ca", "company": "Pacific SaaS Co"}]},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["mode"] == "local-demo"


def test_supabase_client_select_and_insert_use_postgrest_contract():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, json=[{"id": "contact-1", "email": "a@example.ca"}])
        return httpx.Response(201, json=json.loads(request.content))

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    supabase = SupabaseClient(
        SupabaseConfig(url="https://example.supabase.co", api_key="test-key", key_source="SUPABASE_SERVICE_ROLE_KEY"),
        http_client=http_client,
    )

    selected = supabase.select("contacts", limit=5, order="created_at.desc")
    inserted = supabase.insert("contacts", {"email": "a@example.ca"})

    assert selected == [{"id": "contact-1", "email": "a@example.ca"}]
    assert inserted == [{"email": "a@example.ca"}]
    assert str(requests[0].url) == "https://example.supabase.co/rest/v1/contacts?select=%2A&limit=5&order=created_at.desc"
    assert requests[1].headers["apikey"] == "test-key"
    assert requests[1].headers["prefer"] == "return=representation"
