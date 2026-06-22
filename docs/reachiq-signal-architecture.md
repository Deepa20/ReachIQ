# ReachIQ Signal Architecture

## Goal

Provide tenant-scoped target account monitoring with actionable event detection and score progression.

## Data model

### `accounts`
- One row per monitored target account inside an organization.
- Holds current monitoring state and aggregate signal score.
- Key fields:
  - `organization_id`
  - `name`, `domain`, `industry`
  - `monitoring_enabled`
  - `signal_score` (0-100)
  - `last_signal_at`

### `signals`
- One row per detected event for an account.
- Key fields:
  - `organization_id`
  - `account_id`
  - `signal_type` (`funding`, `job_posting`, `company_news`, `executive_change`, `technology_change`)
  - `strength` (1-5)
  - `signal_score` (event-level score)
  - `summary`, `source_url`, `detected_at`

### `signal_history`
- Append-only timeline of score transitions and monitoring lifecycle events.
- Key fields:
  - `organization_id`
  - `account_id`
  - `signal_id` (nullable for non-signal events)
  - `event_type` (`account_started`, `signal_detected`, `score_updated`, `monitoring_paused`, `monitoring_resumed`)
  - `previous_score`, `new_score`
  - `notes`, `payload`, `event_at`

## Request flow

1. User adds target account (`POST /api/v1/signal/accounts`)
2. System writes `accounts` row and `signal_history` bootstrap event.
3. User logs detected event (`POST /api/v1/signal`)
4. System computes event score and blended account score.
5. System writes `signals` row.
6. System updates `accounts.signal_score` + `accounts.last_signal_at`.
7. System writes `signal_history` event with previous/new score.

## API surface

- `GET/POST /api/v1/signal/accounts` — monitor target accounts
- `GET/POST /api/v1/signal` — signal feed and signal capture
- `GET /api/v1/signal/timeline` — account score timeline and event history

## Dashboard structure

- **Signal feed**: recent events and event-level score
- **Signal score**: account-level prioritization
- **Signal timeline**: score transitions and event history
