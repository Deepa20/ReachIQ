from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Path as ApiPath
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .services import (
    ICPSettings,
    build_outreach,
    contacts_to_csv,
    enrich_contact,
    evaluate_compliance,
    parse_csv_contacts,
    platform_blueprint,
    scan_account,
    score_contact,
    validate_email,
)
from .supabase import SupabaseApiError, SupabaseClient


app = FastAPI(
    title="ReachIQ API",
    version="0.1.0",
    description="Backend API for ReachIQ Validate, Signal, Agency, analytics, integrations, and compliance workflows.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ContactInput(BaseModel):
    name: str = Field(default="Deepa Sayal")
    email: str
    company: str | None = None
    title: str | None = None
    industry: str | None = None
    province: str | None = None
    employees: int | None = None
    tech_stack: list[str] | str | None = None
    recent_news: str | None = None
    job_change: bool = False
    funding_event: bool = False
    relevant_job_posting: bool = False
    competitor_review: bool = False
    consent_status: str = "implied"
    owner: str | None = None


class ValidateRequest(BaseModel):
    contacts: list[ContactInput]
    icp: dict[str, Any] = Field(default_factory=dict)
    tone: str = "consultative"
    length: str = "3-sentence"
    language: str = "English"


class CsvValidateRequest(BaseModel):
    csv_text: str
    icp: dict[str, Any] = Field(default_factory=dict)


class OutreachRequest(BaseModel):
    contact: dict[str, Any]
    tone: str = "consultative"
    length: str = "3-sentence"
    language: str = "English"


class AccountInput(BaseModel):
    company: str
    industry: str | None = None
    priority: bool = False


class SignalScanRequest(BaseModel):
    accounts: list[AccountInput]


class ComplianceRequest(BaseModel):
    contact: dict[str, Any]


class WhiteLabelSettings(BaseModel):
    agency_name: str = "Northstar B2B"
    product_name: str = "PipelineAI"
    primary_colour: str = "#2454ff"
    logo_url: str | None = None
    custom_domain: str | None = "tool.agency.example"


class SupabaseWriteRequest(BaseModel):
    records: dict[str, Any] | list[dict[str, Any]]
    conflict_target: str | None = None


class SupabasePersistValidationRequest(ValidateRequest):
    source_name: str = "manual-upload"
    owner_id: str | None = None


def make_icp(settings: dict[str, Any]) -> ICPSettings:
    values = {}
    for key in ("industries", "provinces", "tech_targets", "title_keywords", "negative_industries"):
        if key in settings and settings[key]:
            values[key] = tuple(settings[key])
    for key in ("min_employees", "max_employees"):
        if key in settings and settings[key] is not None:
            values[key] = int(settings[key])
    return ICPSettings(**values)


def process_contacts(payload: ValidateRequest) -> dict[str, Any]:
    icp = make_icp(payload.icp)
    processed = []
    valid_count = risky_count = invalid_count = 0
    hot_count = warm_count = cold_count = 0

    for contact_model in payload.contacts:
        raw = contact_model.model_dump()
        status, validation_reasons = validate_email(raw["email"])
        if status.value == "Invalid":
            invalid_count += 1
            processed.append(
                {
                    **raw,
                    "validation_status": status.value,
                    "validation_reasons": validation_reasons,
                    "score": 0,
                    "temperature": "REMOVED",
                    "icp_fit_score": 0,
                    "score_reasons": [],
                    "outreach": None,
                    "compliance": evaluate_compliance(raw),
                }
            )
            continue

        if status.value == "Valid":
            valid_count += 1
        else:
            risky_count += 1

        enriched = enrich_contact(raw)
        score, temperature, icp_fit, score_reasons = score_contact(enriched, status, icp)
        outreach = None
        if temperature.value == "HOT":
            hot_count += 1
            outreach = build_outreach(enriched, payload.tone, payload.length, payload.language)
        elif temperature.value == "WARM":
            warm_count += 1
            outreach = {
                "subject_lines": [f"Useful idea for {enriched['company']}"],
                "body": f"Hi {(enriched.get('name') or 'there').split()[0]}, sharing a quick ReachIQ note because {enriched['company']} fits your nurture segment.",
                "personalisation_trigger": "Warm nurture fit",
                "why_this_trigger": "Contact scored below HOT but still matches several ICP criteria.",
                "follow_up_sequence": ["Checking whether this should be on your radar later this quarter."],
            }
        else:
            cold_count += 1

        processed.append(
            {
                **enriched,
                "validation_status": status.value,
                "validation_reasons": validation_reasons,
                "score": score,
                "temperature": temperature.value,
                "icp_fit_score": icp_fit,
                "score_reasons": score_reasons,
                "outreach": outreach,
                "compliance": evaluate_compliance(enriched),
            }
        )

    total = len(payload.contacts)
    deliverable = valid_count + risky_count
    list_health = round((valid_count * 1 + risky_count * 0.55) / total * 100) if total else 0
    return {
        "summary": {
            "uploaded_contacts": total,
            "deliverable_contacts": deliverable,
            "valid": valid_count,
            "risky": risky_count,
            "invalid_removed": invalid_count,
            "hot": hot_count,
            "warm": warm_count,
            "cold": cold_count,
            "list_health_score": list_health,
            "estimated_ai_cost_usd": round(hot_count * 0.00009, 5),
        },
        "contacts": processed,
        "exports": {
            "clean_csv": contacts_to_csv([contact for contact in processed if contact["validation_status"] != "Invalid"]),
            "crm_targets": ["HubSpot", "Salesforce", "Mailchimp", "Lemlist", "Instantly.ai"],
        },
    }


def supabase_or_503() -> SupabaseClient:
    client = SupabaseClient()
    if not client.config.configured:
        raise HTTPException(status_code=503, detail=client.status())
    return client


def supabase_table_path() -> Any:
    return ApiPath(..., pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "reachiq-api"}


@app.get("/api/platform/blueprint")
def blueprint() -> dict[str, Any]:
    return platform_blueprint()


@app.get("/api/supabase/status")
def supabase_status() -> dict[str, Any]:
    return SupabaseClient().status()


@app.get("/api/supabase/{table}")
def supabase_select(
    table: str = supabase_table_path(),
    limit: int = 50,
    order: str | None = None,
) -> dict[str, Any]:
    try:
        rows = supabase_or_503().select(table, limit=limit, order=order)
        return {"table": table, "count": len(rows), "rows": rows}
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/supabase/{table}/insert")
def supabase_insert(payload: SupabaseWriteRequest, table: str = supabase_table_path()) -> dict[str, Any]:
    try:
        rows = supabase_or_503().insert(table, payload.records)
        return {"table": table, "count": len(rows), "rows": rows}
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/supabase/{table}/upsert")
def supabase_upsert(payload: SupabaseWriteRequest, table: str = supabase_table_path()) -> dict[str, Any]:
    try:
        rows = supabase_or_503().upsert(table, payload.records, payload.conflict_target)
        return {"table": table, "count": len(rows), "rows": rows}
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/supabase/validation-runs")
def persist_validation_run(payload: SupabasePersistValidationRequest) -> dict[str, Any]:
    validation_result = process_contacts(payload)
    try:
        persisted = supabase_or_503().persist_validation_run(validation_result, payload.source_name, payload.owner_id)
        return {"result": validation_result, "persisted": persisted}
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/validate/contacts")
def validate_contacts(payload: ValidateRequest) -> dict[str, Any]:
    return process_contacts(payload)


@app.post("/api/validate/csv")
def validate_csv(payload: CsvValidateRequest) -> dict[str, Any]:
    contacts = [ContactInput(**row) for row in parse_csv_contacts(payload.csv_text)]
    return process_contacts(ValidateRequest(contacts=contacts, icp=payload.icp))


@app.post("/api/outreach/generate")
def generate_outreach(payload: OutreachRequest) -> dict[str, Any]:
    enriched = enrich_contact(payload.contact)
    return build_outreach(enriched, payload.tone, payload.length, payload.language)


@app.post("/api/signal/scan")
def scan_signals(payload: SignalScanRequest) -> dict[str, Any]:
    accounts = [scan_account(account.model_dump()) for account in payload.accounts]
    top_accounts = sorted(accounts, key=lambda account: account["engagement_score"], reverse=True)[:10]
    return {
        "accounts": accounts,
        "weekly_report": {
            "title": "ReachIQ Weekly Signal Intelligence Report",
            "generated_for": "Agency consolidated view",
            "top_accounts": top_accounts,
            "real_time_alerts": [
                {"company": account["company"], "signals": [signal for signal in account["signals"] if signal["requires_realtime_alert"]]}
                for account in accounts
                if any(signal["requires_realtime_alert"] for signal in account["signals"])
            ],
        },
    }


@app.post("/api/compliance/evaluate")
def compliance(payload: ComplianceRequest) -> dict[str, Any]:
    return evaluate_compliance(payload.contact)


@app.post("/api/agency/white-label")
def white_label(settings: WhiteLabelSettings) -> dict[str, Any]:
    return {
        "settings": settings.model_dump(),
        "css_variables": {
            "--reachiq-primary": settings.primary_colour,
            "--reachiq-product-name": settings.product_name,
        },
        "client_visible_branding": {
            "platform_name": settings.product_name,
            "domain": settings.custom_domain,
            "reachiq_attribution_visible": False,
        },
        "setup_checklist": [
            "Verify custom domain DNS",
            "Upload logo and login artwork",
            "Configure sender domain for reports",
            "Invite agency team members",
            "Create first client workspace",
        ],
    }


@app.get("/api/agency/dashboard")
def agency_dashboard() -> dict[str, Any]:
    clients = [
        {
            "name": "Pacific SaaS Co",
            "status": "Active",
            "last_activity": "Validated 842 contacts",
            "signal_count": 17,
            "emails_sent": 326,
            "reply_rate": 8.4,
            "meetings_booked": 11,
            "pipeline_sourced": 94000,
        },
        {
            "name": "Fraser Valley Manufacturing",
            "status": "Needs attention",
            "last_activity": "No upload in 12 days",
            "signal_count": 6,
            "emails_sent": 88,
            "reply_rate": 4.1,
            "meetings_booked": 2,
            "pipeline_sourced": 21000,
        },
        {
            "name": "Quebec Commerce Group",
            "status": "Onboarding",
            "last_activity": "ICP settings completed",
            "signal_count": 3,
            "emails_sent": 0,
            "reply_rate": 0,
            "meetings_booked": 0,
            "pipeline_sourced": 0,
        },
    ]
    return {
        "clients": clients,
        "usage": {
            "contacts_validated": sum(842 if index == 0 else 312 for index, _ in enumerate(clients)),
            "signals_detected": sum(client["signal_count"] for client in clients),
            "emails_sent": sum(client["emails_sent"] for client in clients),
            "meetings_booked": sum(client["meetings_booked"] for client in clients),
            "monthly_billable_usage_cad": 4280,
        },
        "sequence_templates": [
            "Funding event 3-touch",
            "Executive change warm intro",
            "Competitor evaluation direct sequence",
            "French Canadian nurture sequence",
        ],
        "monthly_report": {
            "metrics": ["validated lists", "emails sent", "open rate", "reply rate", "meetings booked", "pipeline sourced"],
            "export_formats": ["PDF", "CSV"],
            "commentary": "Clients with priority-account signal alerts are generating the strongest reply rates.",
        },
    }


@app.get("/api/analytics/summary")
def analytics_summary() -> dict[str, Any]:
    return {
        "campaign_performance": {
            "open_rate": 47.2,
            "reply_rate": 7.8,
            "bounce_rate": 1.9,
            "meeting_booking_rate": 2.6,
        },
        "signal_roi": {
            "signals_fired": 126,
            "emails_sent_from_signals": 384,
            "replies_received": 42,
            "meetings_booked": 17,
        },
        "list_health_trend": [62, 71, 78, 84, 88],
        "ai_email_performance": [
            {"tone": "Consultative", "reply_rate": 8.1},
            {"tone": "Direct", "reply_rate": 6.4},
            {"tone": "Warm", "reply_rate": 7.3},
            {"tone": "Peer-to-peer", "reply_rate": 9.0},
        ],
        "monthly_trend": {
            "contacts_validated": "+22%",
            "reply_rate": "+1.8 pts",
            "meetings_booked": "+31%",
            "pipeline_influence": "+$118k",
        },
    }
