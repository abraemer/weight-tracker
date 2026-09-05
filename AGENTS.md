# Project Information for AI Agents

## Tech Stack

### Frontend
- **Framework**: Vue.js 3
- **UI Library**: Vuetify 4
- **Build Tool**: Vite
- **Language**: TypeScript
- **Charting**: Chart.js with vue-chartjs
- **Linter**: ESLint
- **Testing**: Vitest

### Backend
- **Runtime**: Node.js
- **Language**: TypeScript
- **Database**: SQLite (better-sqlite3)
- **API**: REST

### Package Manager
- **pnpm** (not npm)

## Common Commands

```bash
# Install dependencies
pnpm install

# Start dev servers (frontend + backend together)
pnpm dev

# Build for production
pnpm build

# Run linter
pnpm lint

# Run tests
pnpm test

# Type checking
pnpm typecheck
```

## Project Structure

```
weight-tracker/
├── src/
│   ├── frontend/     # Vue.js application
│   │   ├── components/
│   │   ├── composables/
│   │   └── types/
│   └── backend/      # Node.js API
│       ├── routes/
│       ├── db/
│       └── types/
├── scripts/          # Data maintenance helpers (uv-run Python, PEP 723)
├── tests/
└── public/
```

## Code Style

- TypeScript strict mode enabled
- Vue 3 Composition API with `<script setup>` syntax
- ESLint for linting (Vue and TypeScript rules)
- No comments unless explicitly requested
