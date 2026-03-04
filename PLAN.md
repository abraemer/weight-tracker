# Implementation Plan

## Phase 1: Project Setup

### 1.1 Initialize Node.js project

- [x] Create `package.json` with yarn
- [x] Configure TypeScript (`tsconfig.json`)
- [x] Set up ESLint configuration
- [x] Set up Prettier configuration
- [x] Create basic folder structure

### 1.2 Configure Vite for frontend

- [x] Add Vite configuration
- [x] Configure Vue 3 + Vuetify 3 plugin
- [x] Set up proxy for `/api` to backend

### 1.3 Set up Vitest

- [x] Configure Vitest for both frontend and backend tests
- [x] Add test scripts to `package.json`

### 1.4 Create environment configuration

- [x] Add `.env` file support
- [x] Document environment variables in `.env.example`
- [x] PORT (default: 3000)
- [x] DATABASE_PATH (default: data/weight-tracker.db)

## Phase 2: Backend Foundation

### 2.1 Database setup

- [x] Create SQLite connection module (`src/backend/db/database.ts`)
- [x] Write schema SQL (`src/backend/db/schema.sql`) with tables and indexes
- [x] Create index `idx_entries_user_id` on entries(user_id)
- [x] Create index `idx_entries_timestamp` on entries(timestamp)
- [x] Implement table creation on startup
- [x] Add database types (`src/backend/types/index.ts`)
- [x] Store timestamps as UTC (ISO 8601 format)

### 2.2 Basic server setup

- [x] Create Express server (`src/backend/server.ts`)
- [x] Add JSON body parser
- [x] Configure CORS for development
- [x] Add error handling middleware
- [x] Return 400 for validation errors
- [x] Return 404 for not found
- [x] Return 500 for server errors
- [x] Use JSON error format: `{ "error": "message" }`

### 2.3 User routes

- [x] GET `/api/users` - list all users
- [x] POST `/api/users` - create user (validate: non-empty name)
- [x] GET `/api/users/:id` - get user by ID

### 2.4 Entry routes

- [x] GET `/api/users/:userId/entries` - list entries for user
- [x] POST `/api/users/:userId/entries` - create entry (allow duplicates, accept any positive weight)
- [x] PUT `/api/entries/:id` - update entry
- [x] DELETE `/api/entries/:id` - delete entry

### 2.5 Backend tests

- [x] Set up in-memory SQLite for integration tests
- [x] Test user routes
- [x] Test entry routes
- [x] Test edge cases (not found, validation errors)

## Phase 3: Frontend Foundation

### 3.1 Vue app setup

- [x] Create `main.ts` entry point
- [x] Set up Vuetify with default theme
- [x] Create `App.vue` root component

### 3.2 Type definitions

- [x] Create frontend types (`src/frontend/types/index.ts`)

### 3.3 API client

- [x] Create API utility functions (`src/frontend/api.ts`)
- [x] Implement error handling with snackbar
- [x] Add timezone conversion utilities (UTC ↔ local time)

### 3.4 Composables

- [x] Create `useUsers.ts` composable
- [x] Create `useEntries.ts` composable

## Phase 4: User Management UI

### 4.1 UserTabs component

- [x] Display tabs for each user
- [x] Implement tab selection
- [x] Add horizontal scrolling for many users

### 4.2 AddUserDialog component

- [x] Create dialog with name input
- [x] Add validation (non-empty)
- [x] Emit create event

### 4.3 Integrate user management

- [x] Show "Add User" dialog on first load if no users
- [x] Switch active user on tab click
- [x] Add "+" tab button

## Phase 5: Entry Management UI

### 5.1 WeightTable component

- [x] Create scrollable table layout
- [x] Display entries sorted by timestamp descending
- [x] Show date, time, and weight columns
- [x] Add empty state message

### 5.2 New entry row

- [x] Add input row at top of table
- [x] Default timestamp to current local time
- [x] Implement save functionality

### 5.3 EntryRow component

- [x] Display single entry
- [x] Implement inline editing
- [x] Add delete button
- [x] Show confirmation dialog on delete

### 5.4 UserView component

- [x] Create two-column layout (table left, chart right)
- [x] Implement responsive layout for mobile (< 768px: table above, chart below)

## Phase 6: Chart Visualization

### 6.1 WeightChart component

- [x] Set up Chart.js with vue-chartjs
- [x] Create line chart with weight vs time
- [x] Handle empty data state
- [x] Make chart responsive

### 6.2 Chart interactivity

- [x] Add zoom/pan support (chartjs-plugin-zoom)
- [x] Set default view to last 1 year

### 6.3 Trendline feature

- [x] Filter entries from past 30 days for trendline calculation
- [x] Hide trendline if less than 30 days of data
- [x] Calculate linear regression: slope (m) and intercept (b)
- [x] Draw trendline on chart (dashed, different color)
- [x] Extend trendline 1 month into future
- [x] Add legend entry indicating it's a trend

## Phase 7: Integration & Polish

### 7.1 Error handling

- [ ] Add snackbar notifications for errors
- [ ] Implement optimistic updates with rollback
- [ ] Form validation before submit (all forms)

## Validation Rules Summary

### User validation

- Name: non-empty (no max length)

### Entry validation

- Timestamp: required (stored as UTC)
- Weight: any positive number (no limits)
- Duplicates: allowed (same user can have multiple entries at same timestamp)

### Confirmation dialogs

- Delete entry: requires confirmation
- Add/edit/cancel: no confirmation required

### 7.2 Loading states

- [ ] Add loading indicators
- [ ] Disable actions during API calls

### 7.3 Frontend tests

- [ ] Test composables
- [ ] Test component interactions

## Phase 8: Docker & Deployment

### 8.1 Build configuration

- [ ] Create build scripts for backend compilation (output to `dist/backend/`)
- [ ] Configure Vite build output (to `dist/frontend/`)
- [ ] Ensure production dependencies only in Docker

### 8.2 Docker setup

- [ ] Create `Dockerfile` (node:20-alpine, production dependencies only)
- [ ] Create `.dockerignore`
- [ ] Test container build
- [ ] Create sample Caddyfile for reverse proxy + static file serving

### 8.3 Documentation

- [ ] Update README with setup instructions
- [ ] Document deployment process

## Execution Order

Recommended order to tackle tasks:

1. **Phase 1.1 - 1.4**: Full project setup
2. **Phase 2.1 - 2.2**: Database and basic server
3. **Phase 2.3**: User routes (needed for frontend)
4. **Phase 3.1 - 3.4**: Frontend foundation
5. **Phase 4.1 - 4.3**: User management UI
6. **Phase 2.4**: Entry routes
7. **Phase 5.1 - 5.4**: Entry management UI
8. **Phase 6.1 - 6.3**: Chart visualization
9. **Phase 7.1 - 7.3**: Polish and tests
10. **Phase 8.1 - 8.3**: Docker and deployment
