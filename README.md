# ReachIQ MVP (Next.js 15 + Supabase)

Production-ready multi-tenant SaaS foundation for ReachIQ with:

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn-style UI components
- **Backend:** Supabase PostgreSQL, Supabase Auth, Supabase Storage
- **Architecture:** multi-tenant + agency-ready + row-level security + API-first

## What is implemented

### 1) Authentication

- Sign up (`/sign-up`)
- Login (`/login`)
- Password reset request (`/reset-password`)
- Update password (`/update-password`)
- Auth callback exchange (`/auth/callback`)
- Session-protected dashboard routes via middleware

### 2) Dashboard layout

- Sidebar navigation
- Header with profile menu + logout
- Usage metric cards
- Tenant-aware workspace shell

### 3) Core modules

- **ReachIQ Validate:** upload registration and validation-result APIs/pages
- **ReachIQ Signal:** signal capture and timeline APIs/pages
- **ReachIQ Agency:** campaign creation and subscription overview APIs/pages

### 4) Database schema + RLS

Supabase migration includes all required tables:

- `users`
- `organizations`
- `contacts`
- `companies`
- `uploads`
- `validation_results`
- `enrichment_results`
- `signals`
- `campaigns`
- `ai_emails`
- `subscriptions`
- `audit_logs`

Plus:

- `organization_members` (multi-tenant memberships/roles)
- RLS helper functions
- Storage bucket + policies for uploads
- Triggers for `updated_at`, user profile sync, organization owner membership

## Folder structure

```text
.
├── supabase
│   └── migrations
│       └── 20260622000000_reachiq_mvp.sql
├── web
│   ├── src
│   │   ├── app
│   │   │   ├── (auth)
│   │   │   │   ├── login
│   │   │   │   ├── sign-up
│   │   │   │   ├── reset-password
│   │   │   │   └── update-password
│   │   │   ├── (dashboard)/dashboard
│   │   │   │   ├── validate
│   │   │   │   ├── signal
│   │   │   │   └── agency
│   │   │   └── api/v1
│   │   │       ├── auth/session
│   │   │       ├── validate/{upload-url,uploads,results}
│   │   │       ├── signal
│   │   │       ├── agency/campaigns
│   │   │       └── usage/metrics
│   │   ├── components
│   │   │   ├── dashboard
│   │   │   └── ui
│   │   └── lib
│   │       ├── auth
│   │       ├── api
│   │       ├── data
│   │       └── supabase
│   ├── middleware.ts
│   └── .env.example
├── .env.example
└── package.json
```

## Environment variables

Create `.env.local` in `web/` (or root `.env`) with:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Setup instructions

### 1) Apply Supabase migration

Run in Supabase SQL Editor:

`supabase/migrations/20260622000000_reachiq_mvp.sql`

### 2) Install dependencies

```bash
npm install
```

### 3) Run application

```bash
npm run dev
```

Open: `http://localhost:3000`

### 4) Verify

```bash
npm run lint
npm run build
```

## API routes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service health |
| GET | `/api/v1/auth/session` | Current authenticated user session |
| POST | `/api/v1/validate/upload-url` | Create signed Supabase Storage upload URL |
| GET/POST | `/api/v1/validate/uploads` | List/create upload records |
| GET/POST | `/api/v1/validate/results` | List/create validation results |
| GET/POST | `/api/v1/signal` | List/create account signals |
| GET/POST | `/api/v1/agency/campaigns` | List/create agency campaigns |
| GET | `/api/v1/usage/metrics` | Tenant usage counters |

## Notes

- No mock seed data is included.
- Empty states are expected until real records are created.
- All data access is tenant-scoped by organization and enforced through RLS.
