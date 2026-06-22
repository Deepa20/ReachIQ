from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_validate_contacts_scores_hot_and_removes_invalid_contact():
    response = client.post(
        "/api/validate/contacts",
        json={
            "contacts": [
                {
                    "name": "Avery Chen",
                    "email": "avery.chen@pacificsaas.ca",
                    "company": "Pacific SaaS Co",
                    "title": "VP Growth",
                    "industry": "SaaS",
                    "province": "BC",
                    "employees": 180,
                    "funding_event": True,
                    "relevant_job_posting": True,
                    "tech_stack": ["HubSpot"],
                },
                {
                    "name": "Bad Inbox",
                    "email": "info@test.invalid",
                    "company": "Example",
                    "title": "Operations",
                },
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["uploaded_contacts"] == 2
    assert payload["summary"]["hot"] == 1
    assert payload["summary"]["invalid_removed"] == 1
    assert payload["contacts"][0]["temperature"] == "HOT"
    assert payload["contacts"][0]["outreach"]["subject_lines"]
    assert payload["contacts"][1]["temperature"] == "REMOVED"


def test_signal_scan_returns_realtime_alerts_for_priority_accounts():
    response = client.post(
        "/api/signal/scan",
        json={"accounts": [{"company": "Pacific SaaS Co", "industry": "SaaS", "priority": True}]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["accounts"][0]["engagement_score"] > 0
    assert payload["weekly_report"]["real_time_alerts"]


def test_compliance_flags_quebec_and_role_based_mailboxes():
    response = client.post(
        "/api/compliance/evaluate",
        json={"contact": {"email": "info@example.ca", "province": "QC", "country": "Canada"}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "Quebec Law 25 privacy rights notice required" in payload["flags"]
    assert "Role mailbox should be suppressed or manually reviewed" in payload["flags"]
    assert payload["can_email"] is False
