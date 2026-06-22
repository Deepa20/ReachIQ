# ReachIQ Production Deployment Checklist

## 1) Infrastructure + Secrets

- [ ] Provision production Supabase project.
- [ ] Provision Vercel project for `web/`.
- [ ] Configure repository secrets (GitHub Actions):
  - [ ] `VERCEL_TOKEN`
  - [ ] `VERCEL_ORG_ID`
  - [ ] `VERCEL_PROJECT_ID`
  - [ ] `SUPABASE_ACCESS_TOKEN`
  - [ ] `SUPABASE_PROJECT_REF`
  - [ ] `SUPABASE_DB_PASSWORD`
- [ ] Configure runtime env vars in Vercel:
  - [ ] `NEXT_PUBLIC_APP_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `HUNTER_API_KEY`
  - [ ] `APOLLO_API_KEY`
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `RETRY_QUEUE_PROCESS_TOKEN` (recommended)
  - [ ] `MONITORING_WEBHOOK_URL` (optional)

## 2) Database + Supabase

- [ ] Validate `supabase/config.production.toml` values (project ref + URLs).
- [ ] Run migrations on production:
  - [ ] `supabase db push --linked --include-all`
- [ ] Confirm tables exist:
  - [ ] `accounts`
  - [ ] `signals`
  - [ ] `signal_history`
  - [ ] `retry_jobs`
- [ ] Confirm RLS policies active for new tables.
- [ ] Confirm storage bucket `uploads` exists and policies are active.

## 3) Application Build + Runtime

- [ ] CI passes on main (`.github/workflows/ci.yml`):
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] Docker image build
- [ ] Deploy workflow passes (`.github/workflows/deploy.yml`) for Vercel + Supabase.
- [ ] Verify Vercel production deployment is healthy.
- [ ] Verify `/api/health` returns `status: ok`.

## 4) Observability + Error Handling

- [ ] Confirm JSON logs are emitted in runtime logs.
- [ ] Confirm API error responses include `errorId`.
- [ ] Confirm monitoring webhook receives events (if configured).
- [ ] Confirm failed provider calls are captured in logs/monitoring.

## 5) Retry Queue Operations

- [ ] Confirm failed provider operations enqueue into `retry_jobs`.
- [ ] Confirm queue processor endpoint works:
  - [ ] `GET /api/v1/ops/retry-queue/process?limit=10`
- [ ] Confirm Vercel cron invokes queue processor (`web/vercel.json`).
- [ ] Confirm retries transition statuses (`pending` -> `processing` -> `completed/failed`).

## 6) Product Validation

- [ ] ReachIQ Validate:
  - [ ] CSV upload pipeline works end-to-end.
  - [ ] Hunter validation persists results.
  - [ ] Apollo enrichment persists results.
- [ ] ReachIQ Signal:
  - [ ] Target account creation works.
  - [ ] Signal feed events are captured.
  - [ ] Signal score updates on account records.
  - [ ] Signal timeline entries are created.
- [ ] ReachIQ Agency:
  - [ ] Claude Haiku email generation works.
  - [ ] Regenerate path works.
  - [ ] `ai_emails` persistence confirmed.

## 7) Security + Reliability

- [ ] Confirm service-role key is only server-side.
- [ ] Confirm auth redirect URLs are production-correct.
- [ ] Confirm dashboard routes remain protected.
- [ ] Confirm rate-limit/retry settings are configured for provider quotas.
- [ ] Confirm incident runbook owner is defined for queue failures.
