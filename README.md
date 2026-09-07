# Weight Tracker

A local web application for tracking body weight across multiple users.

## Features

- Multi-user support with tabbed interface
- Weight entry logging with date/time
- Interactive chart with zoom/pan
- Trendline visualization (30+ days of data)
- Responsive design for desktop and mobile
- Installable as a Progressive Web App (PWA)

## Tech Stack

- **Frontend**: Vue.js 3, Vuetify 4, Chart.js
- **Backend**: Node.js, Express, SQLite (better-sqlite3)
- **Build**: Vite, TypeScript

## Development

### Prerequisites

- Node.js 24.15+
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Start development servers (frontend + backend, run together)
pnpm dev
```

The app will be available at `http://localhost:5173`.

### Other Commands

```bash
# Run tests
pnpm test

# Run tests once
pnpm test:run

# Lint code
pnpm lint

# Type check
pnpm typecheck

# Build for production
pnpm build
```

## Production Deployment

The Docker image is self-contained: a single Express process serves both the
built frontend (static files) and the REST API on one port. No separate
static file server is needed.

### Docker

Build the image:

```bash
docker build -t weight-tracker .
```

Run the container:

```bash
docker run -d \
  -p 3000:3000 \
  -v weight-tracker-data:/app/data \
  --name weight-tracker \
  weight-tracker
```

The app will be available at `http://localhost:3000`.

> **Upgrade note:** back up the `weight-tracker-data` volume before
> upgrading. The container runs a schema migration on start, directly against
> the live database in the volume. The migration is additive-only and
> idempotent (safe to run twice), but a volume backup is the safe belt
> before any upgrade.

### Environment Variables

| Variable        | Default                | Description               |
| --------------- | ---------------------- | ------------------------- |
| `PORT`          | 3000                   | Server port               |
| `DATABASE_PATH` | data/weight-tracker.db | SQLite database file path |

### Behind a Reverse Proxy (optional)

Because the container serves everything on one port, any reverse proxy just
forwards all traffic to it. Example Caddy vhost (see [Caddyfile](Caddyfile)):

```
your-domain.com {
	reverse_proxy localhost:3000
}
```

Use `reverse_proxy backend:3000` instead if Caddy runs in the same Docker
network as the app container.

> **Note:** the app has **no authentication of its own**. If you expose it
> beyond a trusted LAN, put an auth layer in front of it (e.g. Caddy
> `forward_auth`, a VPN, or similar).

## API Endpoints

Errors are returned as JSON `{ "error": "message" }` with status `400`
(validation), `404` (not found), or `500` (server error). Successful creates
return `201`; deletions return `204`. Stale writes are rejected with `409`
(see [Versioning and conflicts](#versioning-and-conflicts)).

### Users

| Method | Endpoint       | Description    |
| ------ | -------------- | -------------- |
| GET    | /api/users     | List all users |
| POST   | /api/users     | Create a user  |
| GET    | /api/users/:id | Get user by ID |
| DELETE | /api/users/:id | Delete a user  |

### Entries

| Method | Endpoint                   | Description          |
| ------ | -------------------------- | -------------------- |
| GET    | /api/users/:userId/entries | Get entries for user |
| POST   | /api/users/:userId/entries | Create entry         |
| PUT    | /api/entries/:id           | Update entry         |
| DELETE | /api/entries/:id           | Delete entry         |

### State

| Method | Endpoint   | Description    |
| ------ | ---------- | -------------- |
| GET    | /api/state | Full-state sync payload: `{ users, entries }` — all rows including tombstoned ones, no pagination, served with `Cache-Control: no-store` |

### Versioning and conflicts

Every row carries a server-generated `updated_at` timestamp (UTC, ISO-8601
with millisecond precision). Mutations send back the version they observed:
PUT carries `updated_at` in the JSON body, and DELETE takes it as the
`?updated_at=` query parameter. If the row changed more recently than the
observed version, the write is stale and the server responds with
`409 { "error": "conflict", "row": <newest row> }` — the client adopts the
returned row, so the newest version always wins. If DELETE omits
`?updated_at=`, the delete is unconditional; that legacy path is what the
utility scripts use.

### Tombstones

Deletes are soft. A deleted row gets a `deleted` flag and a bumped
`updated_at` instead of being removed. The normal endpoints (user lists,
entry lists) exclude tombstoned rows; `GET /api/state` includes them so
deletions propagate to every device. Tombstones are never garbage-collected.
Deleting a user tombstones the user and all their entries in one atomic
transaction.

## Local-First Behavior

The frontend keeps a full mirror of the server state in IndexedDB on the
device. The app opens and switches users instantly from this local cache,
then a background sync pulls the complete state from `GET /api/state` on app
open, whenever the tab becomes visible, every 60 seconds while visible, and
after each change. Conflicts resolve newest-version-wins (see
[Versioning and conflicts](#versioning-and-conflicts)). Writes still
require the server — there is no offline editing.

## Utility Scripts

Two Python helper scripts for data maintenance against a running API. Both
declare their dependencies inline (PEP 723) — run them with
[uv](https://docs.astral.sh/uv/):

```bash
# Import weight entries from a CSV file (columns: date,time,weight; the
# user must already exist — create it via the web UI first)
uv run scripts/import_csv.py --user "Alice" --file weights.csv

# Preview what would be imported, without inserting anything
uv run scripts/import_csv.py --user "Alice" --file weights.csv --dry-run

# Delete a user (prompts for confirmation; disambiguates duplicate names)
uv run scripts/delete_user.py --user "Alice"
```

Both accept `--api-url` (default `http://localhost:3000/api`). CSV timestamps
are interpreted in the importer's local timezone and stored as UTC.

## Documentation

| File                   | Status    | Contents |
| ---------------------- | --------- | -------- |
| [README.md](README.md) | current   | Usage, deployment, API — authoritative for current behavior |
| [AGENTS.md](AGENTS.md) | current   | Tech stack and conventions for AI coding assistants |
| [DESIGN.md](docs/history/DESIGN.md) | historical | Original design document (architecture, data model, UI plan); predates later changes — superseded wherever it disagrees with this README |
| [PLAN.md](docs/history/PLAN.md)     | historical | Implementation plan from initial development; fully completed |
| [REPORT.md](docs/history/REPORT.md) | historical | Implementation retrospective from initial development |

## License

MIT — see [LICENSE](LICENSE).
