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
return `201`; deletions return `204`.

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
