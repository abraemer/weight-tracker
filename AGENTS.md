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
- **Yarn** (not npm)

## Common Commands

```bash
# Install dependencies
yarn install

# Start dev servers (frontend + backend together)
yarn dev

# Build for production
yarn build

# Run linter
yarn lint

# Run tests
yarn test

# Type checking
yarn typecheck
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
