# ReachIQ

**Smarter Outreach. Faster Pipeline.**

ReachIQ is a full-stack product prototype for a B2B outreach automation platform serving Canadian SMBs and agencies. It implements the core workflows from the feature specification:

- **ReachIQ Validate:** CSV contact upload, six-step email validation, enrichment, Hot/Warm/Cold scoring, ICP fit scoring, outreach copy generation, clean CSV export, and CRM export targets.
- **ReachIQ Signal:** target account monitoring, buying-signal scoring, weekly report payloads, real-time priority alerts, urgency labels, and signal-to-outreach context.
- **ReachIQ Agency:** agency dashboard, white-label settings, client usage metrics, sequence templates, billing usage, and branded client report framing.
- **Platform-wide features:** integrations hub, analytics summary, compliance checks for CASL/PIPEDA/Quebec Law 25/GDPR, role coverage, retention policy metadata, and audit event creation.

The external paid data/AI providers in the product spec are represented by deterministic local services so the app runs immediately without API keys. The backend is structured so Hunter, Apollo, Clearbit, BuiltWith, Claude, SendGrid, HubSpot, Salesforce, Stripe, and Slack adapters can replace the local implementations later without changing the UI contract.

## Tech stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Python, FastAPI, Pydantic, Supabase PostgREST
- **Tests:** pytest + FastAPI TestClient

## Repository layout

```text
.
├── backend
│   ├── app
│   │   ├── main.py        # FastAPI routes and request/response orchestration
│   │   └── services.py    # Validation, enrichment, scoring, outreach, signals, compliance
│   ├── requirements.txt
│   ├── supabase
│   │   └── schema.sql    # Starter Supabase tables for persistence
│   └── tests
│       └── test_api.py
├── frontend
│   ├── src
│   │   ├── App.tsx        # Product dashboard
│   │   ├── main.tsx
│   │   └── styles.css
│   └── vite.config.ts
└── package.json
```

## Run locally

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
uvicorn app.main:app --app-dir backend --reload --port 8000
```

Set the Supabase values in `.env` or your deployment environment:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-side-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is preferred for server-side writes. `SUPABASE_ANON_KEY` is supported as a fallback for read-only/table-policy constrained environments.

### Frontend

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

The frontend defaults to `http://localhost:8000` for API calls. Override with:

```bash
VITE_API_URL=https://your-api.example npm run dev
```

## Verify

```bash
npm run build
npm test
```

## API overview

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health check |
| `GET /api/platform/blueprint` | Module, integration, role, and compliance coverage |
| `GET /api/supabase/status` | Show whether Supabase credentials are configured |
| `GET /api/supabase/{table}` | Select rows from a Supabase table via PostgREST |
| `POST /api/supabase/{table}/insert` | Insert one or more rows into a Supabase table |
| `POST /api/supabase/{table}/upsert` | Upsert rows into a Supabase table with optional conflict target |
| `POST /api/supabase/validation-runs` | Run contact validation and persist the validation run plus contacts |
| `POST /api/validate/contacts` | Validate, enrich, score, segment, and generate outreach for contacts |
| `POST /api/validate/csv` | Parse CSV text and run the same validation pipeline |
| `POST /api/outreach/generate` | Generate subject lines, email body, personalisation preview, and follow-ups |
| `POST /api/signal/scan` | Scan target accounts and return account intelligence plus weekly report data |
| `POST /api/compliance/evaluate` | Evaluate CASL, Quebec Law 25, GDPR, unsubscribe, retention, and audit metadata |
| `POST /api/agency/white-label` | Generate agency branding and setup checklist |
| `GET /api/agency/dashboard` | Client usage, reporting, sequence templates, and billing metrics |
| `GET /api/analytics/summary` | Campaign, signal ROI, list health, and AI performance metrics |

## Product notes

- Invalid contacts are removed from AI generation and marked `REMOVED`.
- HOT contacts receive generated outreach; WARM contacts receive a nurture draft; COLD contacts are marked for monitoring.
- All generated outreach uses already-structured contact/signal data, matching the spec's low-cost AI architecture.
- Compliance metadata is returned per contact so export/send workflows can suppress risky records before activation.
- Without Supabase environment variables, the app remains in local-demo mode and the Supabase write endpoints return `503` with the missing configuration values.

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `backend/supabase/schema.sql`.
4. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your backend environment.
5. Start the backend and check `GET /api/supabase/status`.

The starter schema includes:

- `validation_runs`
- `contacts`
- `target_accounts`
- `signal_events`
- `white_label_settings`
- `audit_logs`

Row-level security is enabled in the schema. The backend should use the service-role key for trusted server-side writes; add user-specific RLS policies before exposing direct browser access to tables.
