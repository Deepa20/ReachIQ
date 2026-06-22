# ReachIQ

See `README.md` for the product overview, architecture, API reference, and the standard run/verify commands.

## Cursor Cloud specific instructions

Services (run both for the full UI experience; no database, external services, or API keys are required):

| Service | Dir | Dev command | Port |
| --- | --- | --- | --- |
| Backend API (FastAPI) | repo root | `python3 -m uvicorn app.main:app --app-dir backend --reload --port 8000` | 8000 |
| Frontend (Vite/React) | repo root | `npm run dev` | 5173 |

Non-obvious notes:

- Python deps are installed into the **system** interpreter (via `pip install --break-system-packages`), not a virtualenv. This is intentional: the root `npm test` script runs `python3 -m pytest backend/tests` with the system `python3`, so the deps must be importable there. Run the backend with `python3 -m uvicorn ...` (the README's `uvicorn` shorthand also works only if `~/.local/bin` is on `PATH`).
- The frontend silently **falls back to bundled demo data** if the backend is unreachable. To confirm the live API is actually being hit, watch the on-page status text change to `Live API result loaded` after clicking **Run validation engine** (it reads `API unavailable, showing ... demo data` when the backend is down).
- The frontend calls the backend at `http://localhost:8000` by default; override with the `VITE_API_URL` env var.
- No linter/formatter is configured. The only static check is the TypeScript build (`tsc -b`, run via `npm run build`).
- The application code lives on the `cursor/reachiq-platform-9ddc` branch; the `main` branch currently only contains a README stub.
