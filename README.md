# Weight Tracker

A local web application for tracking body weight across multiple users.

## Features

- Multi-user support with tabbed interface
- Weight entry logging with date/time
- Interactive chart with zoom/pan
- Trendline visualization (30+ days of data)
- Responsive design for desktop and mobile

## Tech Stack

- **Frontend**: Vue.js 3, Vuetify 3, Chart.js
- **Backend**: Node.js, Express, SQLite
- **Build**: Vite, TypeScript

## Development

### Prerequisites

- Node.js 20+
- Yarn

### Setup

```bash
# Install dependencies
yarn install

# Start development servers (frontend + backend)
yarn dev

# In another terminal, start the backend
yarn dev:server
```

The app will be available at `http://localhost:5173`.

### Other Commands

```bash
# Run tests
yarn test

# Run tests once
yarn test:run

# Lint code
yarn lint

# Type check
yarn typecheck

# Build for production
yarn build
```

## Production Deployment

### Docker

Build the Docker image:

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

### With Caddy Reverse Proxy

For production with HTTPS and proper static file serving:

1. Create a `docker-compose.yml`:

```yaml
services:
  backend:
    image: weight-tracker
    restart: unless-stopped
    volumes:
      - weight-tracker-data:/app/data
    environment:
      - PORT=3000
      - DATABASE_PATH=/app/data/weight-tracker.db

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

volumes:
  weight-tracker-data:
  caddy_data:
  caddy_config:
```

2. Update `Caddyfile` with your domain:

```
your-domain.com {
	encode gzip

	root * /app/frontend

	@api {
		path /api/*
	}

	reverse_proxy @api backend:3000

	file_server
}
```

3. Run with Docker Compose:

```bash
docker compose up -d
```

## API Endpoints

### Users

| Method | Endpoint       | Description    |
| ------ | -------------- | -------------- |
| GET    | /api/users     | List all users |
| POST   | /api/users     | Create a user  |
| GET    | /api/users/:id | Get user by ID |

### Entries

| Method | Endpoint                   | Description          |
| ------ | -------------------------- | -------------------- |
| GET    | /api/users/:userId/entries | Get entries for user |
| POST   | /api/users/:userId/entries | Create entry         |
| PUT    | /api/entries/:id           | Update entry         |
| DELETE | /api/entries/:id           | Delete entry         |

## License

MIT
