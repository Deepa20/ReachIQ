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

Generated Supabase migration (`supabase/migration.sql`) includes:

- `organizations`
- `users`
- `contacts`
- `companies`
- `campaigns`
- `signals`
- `uploads`
- `ai_emails`

Every table has:

- UUID primary key
- `created_at`
- `updated_at`
- `deleted_at` (soft delete support)

Also included:

- Supabase Auth profile sync trigger (`auth.users` -> `public.users`)
- Organization ownership bootstrap trigger
- Organization-scoped RLS helper functions
- RLS policies so authenticated users can only access records from their own organization

## Folder structure

```text
.
├── supabase
│   ├── config.toml
│   ├── migration.sql
│   ├── seed.sql
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
HUNTER_API_KEY=your-hunter-api-key
APOLLO_API_KEY=your-apollo-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Setup instructions

### 1) Apply Supabase SQL files

Run in Supabase SQL Editor (in this order):

1. `supabase/migration.sql`
2. `supabase/seed.sql`

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
| GET/POST | `/api/v1/validate/uploads` | List uploads or run full CSV validation pipeline upload |
| GET | `/api/v1/validate/contacts` | Fetch processed contact-level validation/enrichment/score detail |
| GET/POST | `/api/v1/validate/results` | List/create validation results |
| POST | `/api/validate` | Hunter.io batch email validation (`valid` / `risky` / `invalid`) |
| POST | `/api/enrich` | Apollo batch contact enrichment and persistence into `enrichment_results` |
| GET/POST | `/api/v1/signal` | List/create account signals |
| GET/POST | `/api/v1/agency/campaigns` | List/create agency campaigns |
| POST | `/api/generate-email` | Generate Claude Haiku personalized outreach email and store in `ai_emails` |
| GET | `/api/v1/usage/metrics` | Tenant usage counters |

## Notes

- No mock business data is included.
- Empty states are expected until real records are created.
- All data access is tenant-scoped by organization and enforced through RLS.
- Hunter integration uses in-process request throttling (default 50 req/min, configurable via `HUNTER_RATE_LIMIT_PER_MINUTE`).
- Apollo integration retries failed provider calls (default 3 attempts, configurable via `APOLLO_MAX_RETRIES`).

## Supabase deployment

### Option A: Supabase Dashboard (quickest)

1. Open Supabase project -> SQL Editor.
2. Run `supabase/migration.sql`.
3. Run `supabase/seed.sql`.
4. In Authentication settings, set:
   - Site URL: `http://localhost:3000` (dev) and your production URL.
   - Redirect URL: `https://<your-domain>/auth/callback`.
5. Deploy app with environment variables from `.env.example`.

### Option B: Supabase CLI

1. Install and login:
   - `supabase login`
2. Link your project:
   - `supabase link --project-ref <your-project-ref>`
3. Create a migration file from `supabase/migration.sql` contents under `supabase/migrations/`.
4. Push schema:
   - `supabase db push`
5. Run seed SQL:
   - `supabase db execute --linked --file supabase/seed.sql`
