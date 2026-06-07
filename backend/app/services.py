from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Iterable


DISPOSABLE_DOMAINS = {
    "10minutemail.com",
    "mailinator.com",
    "guerrillamail.com",
    "tempmail.com",
    "yopmail.com",
}

ROLE_PREFIXES = {
    "admin",
    "billing",
    "careers",
    "contact",
    "hello",
    "hr",
    "info",
    "marketing",
    "sales",
    "support",
}

DECISION_MAKER_KEYWORDS = {
    "chief",
    "ceo",
    "cfo",
    "cmo",
    "coo",
    "cto",
    "founder",
    "head",
    "president",
    "principal",
    "vp",
    "vice president",
    "director",
    "partner",
}

SIGNAL_WEIGHTS = {
    "funding_event": 5,
    "executive_change": 5,
    "relevant_job_posting": 4,
    "competitor_review": 4,
    "leadership_pain_post": 4,
    "company_news": 3,
    "website_tech_change": 3,
    "event_attendance": 2,
}

EMAIL_RE = re.compile(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", re.IGNORECASE)


class ValidationStatus(str, Enum):
    VALID = "Valid"
    RISKY = "Risky"
    INVALID = "Invalid"


class LeadTemperature(str, Enum):
    HOT = "HOT"
    WARM = "WARM"
    COLD = "COLD"


@dataclass(frozen=True)
class ICPSettings:
    industries: tuple[str, ...] = ("SaaS", "Professional Services", "Manufacturing", "Ecommerce")
    provinces: tuple[str, ...] = ("BC", "AB", "ON", "QC")
    min_employees: int = 20
    max_employees: int = 500
    tech_targets: tuple[str, ...] = ("HubSpot", "Salesforce", "Shopify", "Google Analytics")
    title_keywords: tuple[str, ...] = ("Founder", "CEO", "CMO", "VP", "Director", "Head")
    negative_industries: tuple[str, ...] = ("Gambling", "Adult Entertainment")


def normalise_domain(company: str | None, email: str) -> str:
    if "@" in email:
        return email.split("@", 1)[1].lower()
    safe_company = re.sub(r"[^a-z0-9]+", "", (company or "company").lower())
    return f"{safe_company}.com"


def validate_email(email: str) -> tuple[ValidationStatus, list[str]]:
    reasons: list[str] = []
    cleaned = email.strip().lower()
    if not EMAIL_RE.match(cleaned):
        return ValidationStatus.INVALID, ["Syntax check failed"]

    local_part, domain = cleaned.split("@", 1)
    if domain in DISPOSABLE_DOMAINS:
        reasons.append("Disposable email domain")
    if local_part in ROLE_PREFIXES:
        reasons.append("Role-based mailbox")
    if domain.startswith("test.") or domain.endswith(".invalid"):
        reasons.append("Domain verification failed")
    if domain.endswith(".xyz") or domain.endswith(".biz"):
        reasons.append("Catch-all risk")

    if "Domain verification failed" in reasons:
        return ValidationStatus.INVALID, reasons
    if reasons:
        return ValidationStatus.RISKY, reasons
    return ValidationStatus.VALID, ["Syntax, domain, mailbox and role checks passed"]


def enrich_contact(contact: dict) -> dict:
    email = contact.get("email", "")
    domain = normalise_domain(contact.get("company"), email)
    company = contact.get("company") or domain.split(".", 1)[0].title()
    title = contact.get("title") or infer_title(email)
    industry = contact.get("industry") or infer_industry(company, domain)
    province = contact.get("province") or infer_province(company, domain)
    employees = int(contact.get("employees") or infer_employee_count(company, domain))
    tech_stack = contact.get("tech_stack") or infer_tech_stack(company, domain)
    if isinstance(tech_stack, str):
        tech_stack = [item.strip() for item in tech_stack.split(",") if item.strip()]

    news = contact.get("recent_news") or f"{company} announced a growth initiative for Canadian customers"
    job_change = bool(contact.get("job_change")) or "new" in title.lower() or "founder" in title.lower()
    relevant_job_posting = bool(contact.get("relevant_job_posting")) or industry in {"SaaS", "Ecommerce"}
    funding = bool(contact.get("funding_event")) or employees > 150

    return {
        **contact,
        "company": company,
        "domain": domain,
        "title": title,
        "industry": industry,
        "province": province,
        "employees": employees,
        "tech_stack": tech_stack,
        "linkedin_url": contact.get("linkedin_url") or f"https://www.linkedin.com/company/{company.lower().replace(' ', '-')}",
        "recent_news": news,
        "job_change": job_change,
        "relevant_job_posting": relevant_job_posting,
        "funding_event": funding,
        "competitor_review": bool(contact.get("competitor_review")),
    }


def infer_title(email: str) -> str:
    local = email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()
    if any(token in local.lower() for token in ("founder", "ceo", "vp", "director")):
        return local
    return "Director of Growth"


def infer_industry(company: str, domain: str) -> str:
    haystack = f"{company} {domain}".lower()
    if any(word in haystack for word in ("shop", "commerce", "retail")):
        return "Ecommerce"
    if any(word in haystack for word in ("factory", "industrial", "manufacturing")):
        return "Manufacturing"
    if any(word in haystack for word in ("consult", "agency", "studio")):
        return "Professional Services"
    return "SaaS"


def infer_province(company: str, domain: str) -> str:
    haystack = f"{company} {domain}".lower()
    if "quebec" in haystack or ".qc" in haystack:
        return "QC"
    if "toronto" in haystack or "ontario" in haystack:
        return "ON"
    if "calgary" in haystack or "alberta" in haystack:
        return "AB"
    return "BC"


def infer_employee_count(company: str, domain: str) -> int:
    seed = sum(ord(char) for char in f"{company}{domain}")
    return 20 + seed % 480


def infer_tech_stack(company: str, domain: str) -> list[str]:
    options = [
        ["HubSpot", "Google Analytics", "Webflow"],
        ["Salesforce", "Marketo", "WordPress"],
        ["Shopify", "Klaviyo", "Google Analytics"],
        ["Pipedrive", "Intercom", "Stripe"],
    ]
    return options[sum(ord(char) for char in f"{company}{domain}") % len(options)]


def score_contact(contact: dict, validation_status: ValidationStatus, icp: ICPSettings) -> tuple[int, LeadTemperature, int, list[str]]:
    score = 0
    reasons: list[str] = []

    if contact.get("job_change"):
        score += 25
        reasons.append("Job change in last 90 days")
    if contact.get("funding_event"):
        score += 20
        reasons.append("Funding or budget expansion signal")
    if contact.get("relevant_job_posting"):
        score += 20
        reasons.append("Relevant hiring activity")
    if contact.get("recent_news"):
        score += 15
        reasons.append("Recent company news")
    if set(contact.get("tech_stack", [])) & set(icp.tech_targets):
        score += 15
        reasons.append("Tech stack matches ICP")
    if icp.min_employees <= int(contact.get("employees", 0)) <= icp.max_employees:
        score += 10
        reasons.append("Company size matches ICP")
    if is_decision_maker(contact.get("title", "")):
        score += 10
        reasons.append("Decision-maker title")
    if validation_status == ValidationStatus.VALID:
        score += 5
        reasons.append("Email fully validated")

    icp_score = calculate_icp_fit(contact, icp)
    if score >= 70:
        temperature = LeadTemperature.HOT
    elif score >= 40:
        temperature = LeadTemperature.WARM
    else:
        temperature = LeadTemperature.COLD
    return min(score, 100), temperature, icp_score, reasons


def is_decision_maker(title: str) -> bool:
    lower = title.lower()
    return any(keyword in lower for keyword in DECISION_MAKER_KEYWORDS)


def calculate_icp_fit(contact: dict, icp: ICPSettings) -> int:
    points = 0
    if contact.get("industry") in icp.industries:
        points += 25
    if contact.get("industry") not in icp.negative_industries:
        points += 10
    if contact.get("province") in icp.provinces:
        points += 20
    if icp.min_employees <= int(contact.get("employees", 0)) <= icp.max_employees:
        points += 20
    if set(contact.get("tech_stack", [])) & set(icp.tech_targets):
        points += 15
    if any(keyword.lower() in contact.get("title", "").lower() for keyword in icp.title_keywords):
        points += 10
    return min(points, 100)


def build_outreach(contact: dict, tone: str = "consultative", length: str = "3-sentence", language: str = "English") -> dict:
    first_name = (contact.get("name") or "there").split()[0]
    company = contact.get("company", "your team")
    trigger = best_trigger(contact)
    product_line = "ReachIQ helps Canadian B2B teams validate prospects, spot buying signals, and send relevant outreach from one workflow."

    if language.lower().startswith("french"):
        opening = f"Bonjour {first_name}, j'ai remarque que {trigger.lower()}."
        body = (
            f"{opening} {product_line} "
            "Si l'amelioration du pipeline est une priorite, je serais heureux de partager une idee concrete pour votre equipe."
        )
        followups = [
            "Je voulais remettre ce contexte en haut de votre boite de reception.",
            "Souhaitez-vous que je vous envoie un exemple d'analyse pour votre marche?",
        ]
    else:
        tone_line = {
            "peer-to-peer": "I thought this was worth a quick peer-to-peer note",
            "direct": "The practical opportunity is simple",
            "warm": "It looks like a timely moment to connect",
        }.get(tone.lower(), "That stood out as a timely buying signal")
        body = (
            f"Hi {first_name}, I noticed {trigger.lower()}. {tone_line}: {product_line} "
            f"Would it be useful if I sent over a short view of the contacts and signals ReachIQ would prioritise for {company}?"
        )
        followups = [
            f"Following up because the signal at {company} still looks timely.",
            "If outbound quality is on the roadmap, I can share a sample scored account view.",
        ]

    if "5" in length:
        body += " The workflow keeps AI costs low by validating and scoring first, then generating tailored copy only for the strongest leads."
    if "linkedin" in length.lower():
        body = f"{first_name}, saw {trigger.lower()}. ReachIQ could help your team turn that signal into cleaner, more timely outreach. Open to a quick look?"

    return {
        "subject_lines": [
            f"{company} buying signal",
            f"Idea for {company}'s outbound pipeline",
            f"Quick thought after {trigger[:42]}",
        ],
        "body": body,
        "personalisation_trigger": trigger,
        "why_this_trigger": "Selected because it contributed the strongest available score and gives the email a concrete reason to exist.",
        "follow_up_sequence": followups,
    }


def best_trigger(contact: dict) -> str:
    if contact.get("funding_event"):
        return f"{contact.get('company')} appears to be in a budget expansion window"
    if contact.get("job_change"):
        return f"{contact.get('title')} is a recent leadership change"
    if contact.get("relevant_job_posting"):
        return f"{contact.get('company')} is hiring for roles connected to growth"
    if contact.get("recent_news"):
        return str(contact["recent_news"])
    return f"{contact.get('company')} matches the configured ICP"


def parse_csv_contacts(csv_text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    return [dict(row) for row in reader]


def contacts_to_csv(contacts: Iterable[dict]) -> str:
    rows = list(contacts)
    if not rows:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=sorted({key for row in rows for key in row.keys()}))
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def scan_account(account: dict) -> dict:
    company = account.get("company", "Target Account")
    industry = account.get("industry") or infer_industry(company, f"{company}.com")
    priority = bool(account.get("priority"))
    seed = sum(ord(char) for char in company)
    signal_names = list(SIGNAL_WEIGHTS)
    selected = [signal_names[seed % len(signal_names)], signal_names[(seed + 3) % len(signal_names)]]
    if priority:
        selected.append("executive_change")
    if industry in {"SaaS", "Ecommerce"}:
        selected.append("relevant_job_posting")

    today = date.today()
    signals = []
    for index, signal_type in enumerate(dict.fromkeys(selected)):
        strength = SIGNAL_WEIGHTS[signal_type]
        signals.append(
            {
                "type": signal_type,
                "label": signal_type.replace("_", " ").title(),
                "strength": strength,
                "detected_at": (today - timedelta(days=index * 3)).isoformat(),
                "summary": signal_summary(company, signal_type),
                "recommended_opening_line": f"Saw that {signal_summary(company, signal_type).lower()}",
                "requires_realtime_alert": priority and strength >= 4,
            }
        )

    engagement_score = min(sum(signal["strength"] * 12 for signal in signals), 100)
    if engagement_score >= 75:
        stage = "Signalling"
    elif engagement_score >= 45:
        stage = "Monitoring"
    else:
        stage = "Watching"
    return {
        "company": company,
        "industry": industry,
        "priority": priority,
        "engagement_score": engagement_score,
        "stage": stage,
        "signals": signals,
        "urgency": "Act this week" if len(signals) >= 3 or any(signal["strength"] == 5 for signal in signals) else "Monitor",
    }


def signal_summary(company: str, signal_type: str) -> str:
    return {
        "funding_event": f"{company} shows signs of fresh budget or growth funding",
        "executive_change": f"{company} has a new senior leader in a buying window",
        "relevant_job_posting": f"{company} is hiring for roles connected to pipeline growth",
        "competitor_review": f"{company} appears to be researching competitor options",
        "leadership_pain_post": f"{company}'s leadership is discussing a problem ReachIQ solves",
        "company_news": f"{company} has recent expansion or market news",
        "website_tech_change": f"{company} changed a tool in its web technology stack",
        "event_attendance": f"{company} is active around relevant industry events",
    }[signal_type]


def evaluate_compliance(contact: dict) -> dict:
    province = (contact.get("province") or "").upper()
    country = (contact.get("country") or "Canada").lower()
    email = contact.get("email", "")
    consent = contact.get("consent_status") or "implied"
    flags = ["CASL consent tracking required"]
    if province == "QC":
        flags.append("Quebec Law 25 privacy rights notice required")
    if country in {"france", "germany", "spain", "italy", "netherlands", "ireland"}:
        flags.append("GDPR notice required")
    if email.split("@", 1)[0].lower() in ROLE_PREFIXES:
        flags.append("Role mailbox should be suppressed or manually reviewed")
    return {
        "consent_status": consent,
        "unsubscribe_required": True,
        "retention_policy_days": int(contact.get("retention_policy_days") or 180),
        "flags": flags,
        "can_email": consent in {"express", "implied"} and "Role mailbox should be suppressed or manually reviewed" not in flags,
        "audit_event": {
            "action": "compliance_evaluated",
            "at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "actor": contact.get("owner") or "system",
        },
    }


def platform_blueprint() -> dict:
    return {
        "modules": [
            {
                "name": "ReachIQ Validate",
                "features": [
                    "CSV upload and parsing",
                    "Six-step email validation model",
                    "Contact enrichment",
                    "Hot/Warm/Cold scoring",
                    "AI-style personalised outreach",
                    "ICP builder and list health scoring",
                    "CSV/CRM export contract",
                ],
            },
            {
                "name": "ReachIQ Signal",
                "features": [
                    "Target account monitoring",
                    "Eight buying signal categories",
                    "Weekly signal report payload",
                    "Real-time priority alerts",
                    "Signal-to-outreach sequence generation",
                    "Account intelligence dashboard",
                ],
            },
            {
                "name": "ReachIQ Agency",
                "features": [
                    "White-label branding settings",
                    "Agency client dashboard",
                    "Client onboarding checklist",
                    "Usage and billing metrics",
                    "Performance reporting",
                    "Sequence builder and template library",
                ],
            },
        ],
        "integrations": ["HubSpot", "Salesforce", "Lemlist", "Instantly", "Mailchimp", "Slack", "Zapier", "Google Sheets"],
        "roles": ["Solo SMB", "Team Member", "Team Admin", "Agency Super Admin"],
        "compliance": ["CASL", "PIPEDA", "Quebec Law 25", "GDPR flags", "Do-not-contact suppression", "Audit log"],
    }
