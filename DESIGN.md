# Weight Tracker - Design Document

## Overview

A local web application for tracking body weight across multiple users. No authentication required since it's hosted locally.

## Architecture

### Configuration
- **Port**: Configurable via `PORT` environment variable (default: 3000)
- **Database**: SQLite file at `data/weight-tracker.db` (configurable via `DATABASE_PATH`)

### Development Setup
- Vite dev server proxies `/api` requests to Node.js backend
- Single URL for development (e.g., `localhost:5173`)
- No CORS issues during development

### Production Deployment
- **Frontend**: Static files built by Vite, served by Caddy
- **Backend**: Docker container running Node.js API
- **Reverse Proxy**: Caddy serves static files and proxies `/api` to backend container
- **Database**: SQLite file mounted as volume for persistence

```
┌─────────────────────────────────────────────────┐
│                    Caddy                         │
│  ┌─────────────┐       ┌──────────────────────┐ │
│  │ Static files│       │  /api/* → backend    │ │
│  │  (frontend) │       │  :3000               │ │
│  └─────────────┘       └──────────────────────┘ │
└─────────────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Docker Container     │
                    │    (Node.js Backend)    │
                    │    Port 3000            │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   SQLite Volume         │
                    │   data/weight-tracker.db│
                    └─────────────────────────┘
```

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Vue.js Frontend                       ││
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  ││
│  │  │   Tabs      │  │   Weight     │  │    Chart.js    │  ││
│  │  │  (Users)    │  │    Table     │  │     Plot       │  ││
│  │  └─────────────┘  └──────────────┘  └────────────────┘  ││
│  └──────────────────────────┬──────────────────────────────┘│
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP/REST
┌─────────────────────────────┼───────────────────────────────┐
│                     Node.js Backend                          │
│  ┌──────────────────────────▼──────────────────────────────┐│
│  │                    REST API Routes                       ││
│  │  /api/users    /api/users/:id/entries                    ││
│  └──────────────────────────┬──────────────────────────────┘│
│  ┌──────────────────────────▼──────────────────────────────┐│
│  │                  SQLite Database                         ││
│  │  users table    entries table                            ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## Data Model

### Users Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | Internal unique identifier |
| name | TEXT NOT NULL | Display name (can be non-unique) |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | Record creation time |

### Entries Table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | Unique entry identifier |
| user_id | INTEGER NOT NULL | Foreign key to users.id |
| timestamp | DATETIME NOT NULL | Date and time of measurement (stored as UTC) |
| weight_kg | REAL NOT NULL | Weight in kilograms (1 decimal place) |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | Record creation time |

**Indexes**: 
- `idx_entries_user_id` on entries(user_id)
- `idx_entries_timestamp` on entries(timestamp)

### Constraints & Validation
- **Timestamps**: Stored in UTC, converted to local time in UI
- **Duplicate entries**: Allowed (same user can have multiple entries at same timestamp)
- **Weight values**: No validation limits (any positive number accepted)
- **User names**: Must be non-empty (no max length limit)

## API Endpoints

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List all users |
| POST | /api/users | Create a new user |
| GET | /api/users/:id | Get user by ID |

### Entries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/:userId/entries | Get all entries for a user |
| POST | /api/users/:userId/entries | Create a new entry |
| PUT | /api/entries/:id | Update an entry |
| DELETE | /api/entries/:id | Delete an entry |

### Request/Response Formats

#### Create User
```json
POST /api/users
Request: { "name": "John" }
Response: { "id": 1, "name": "John", "created_at": "2024-01-15T10:00:00Z" }
```

#### Create Entry
```json
POST /api/users/1/entries
Request: { "timestamp": "2024-01-15T08:30:00", "weight_kg": 75.5 }
Response: { "id": 1, "user_id": 1, "timestamp": "2024-01-15T08:30:00", "weight_kg": 75.5 }
```

#### Update Entry
```json
PUT /api/entries/1
Request: { "timestamp": "2024-01-15T09:00:00", "weight_kg": 75.3 }
Response: { "id": 1, "user_id": 1, "timestamp": "2024-01-15T09:00:00", "weight_kg": 75.3 }
```

## Frontend Components

### Component Hierarchy

```
App.vue
├── UserTabs.vue
│   └── AddUserDialog.vue
└── UserView.vue
    ├── WeightTable.vue
    │   └── EntryRow.vue
    └── WeightChart.vue
```

### Component Descriptions

#### App.vue
Root component. Manages:
- Current active user ID
- List of users
- Fetching initial user list on mount

#### UserTabs.vue
Displays tabs for each user at the top of the page.
- Props: `users` (array), `activeUserId` (number)
- Emits: `select-user`, `add-user`
- Features: Horizontal scrollable tabs, "+" button at the end

#### AddUserDialog.vue
Modal dialog for adding a new user.
- Emits: `create` with user name
- Fields: Name text input, Cancel/Create buttons

#### UserView.vue
Main content area for a selected user.
- Props: `userId`
- Contains: WeightTable and WeightChart side by side
- Layout: Two-column layout (table left, chart right)

#### WeightTable.vue
Scrollable table of weight entries.
- Props: `userId`
- Features:
  - Sorted by timestamp descending (newest first)
  - Header row with "Add Entry" form
  - Editable rows
  - Delete button per row
  - Columns: Date, Time (HH:MM), Weight (kg, 1 decimal), Actions

#### EntryRow.vue
Single editable row in the weight table.
- Props: `entry` (object)
- Emits: `update`, `delete`
- Editable fields: Date, Time, Weight
- Inline editing with save/cancel

#### WeightChart.vue
Chart.js graph showing weight over time.
- Props: `entries` (array)
- Features:
  - Line chart with weight (y-axis) vs time (x-axis)
  - Data points connected by lines
  - Default view: last 1 year of data
  - Zoom/pan enabled via chartjs-plugin-zoom (if easily supported)
  - Trendline overlay (if >= 1 month of data)
  - Trendline extends 1 month into future
  - Responsive sizing
  - Empty state: Display "No data to display" message when no entries exist

### State Management

Use Vue 3 reactivity with composables (no Vuex/Pinia needed for this scale).

```typescript
// composables/useUsers.ts
const users = ref<User[]>([])
const activeUserId = ref<number | null>(null)

// composables/useEntries.ts
const entries = ref<Entry[]>([])
```

## Timestamp Handling

### Storage
- All timestamps stored in UTC in SQLite DATETIME columns
- Format: ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`)

### Frontend
- Display times in user's local timezone
- On entry creation: capture local time, convert to UTC before sending to API
- On entry display: convert UTC from API to local time
- Date/time pickers show local time

### API
- Accepts and returns timestamps in UTC (ISO 8601 format)
- Client responsible for timezone conversion

### Calculation

1. Filter entries from the past 30 days
2. If less than 30 days of data, hide trendline
3. Calculate linear regression:
   - X = timestamp converted to numeric (days since first entry)
   - Y = weight_kg
   - Slope (m) = Σ((xi - x̄)(yi - ȳ)) / Σ((xi - x̄)²)
   - Intercept (b) = ȳ - m * x̄
4. Draw line from first data point to 30 days in the future

### Visual Style

- Dashed line
- Different color from main data line
- Legend entry indicating it's a trend

## User Flow

### Initial Load
1. App fetches all users
2. If no users exist, prompt to create first user
3. First user becomes active user
4. Load entries for active user

### Adding a User
1. Click "+" tab
2. Enter name in dialog
3. POST to /api/users
4. New user appears as active tab

### Adding an Entry
1. Focus is on the "new entry" row at top of table
2. Date/time defaults to current time (editable)
3. Enter weight value
4. Press Enter or click Save
5. POST to /api/users/:id/entries
6. Table and chart update

### Editing an Entry
1. Click on a cell in the table
2. Value becomes editable
3. Modify value
4. Press Enter to save (or Escape to cancel)
5. PUT to /api/entries/:id
6. Table and chart update

### Deleting an Entry
1. Click delete button on a row
2. Confirmation dialog appears
3. Confirm deletion
4. DELETE to /api/entries/:id
5. Entry removed from table and chart

### Confirmation Dialogs
- Delete entry: Requires confirmation before deletion
- Other actions (add, edit, cancel): No confirmation required

## File Structure

```
weight-tracker/
├── src/
│   ├── frontend/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── UserTabs.vue
│   │   │   ├── AddUserDialog.vue
│   │   │   ├── UserView.vue
│   │   │   ├── WeightTable.vue
│   │   │   ├── EntryRow.vue
│   │   │   └── WeightChart.vue
│   │   ├── composables/
│   │   │   ├── useUsers.ts
│   │   │   └── useEntries.ts
│   │   └── types/
│   │       └── index.ts
│   └── backend/
│       ├── server.ts
│       ├── routes/
│       │   ├── users.ts
│       │   └── entries.ts
│       ├── db/
│       │   ├── database.ts
│       │   ├── schema.sql
│       │   └── migrations/
│       └── types/
│           └── index.ts
├── tests/
│   ├── frontend/
│   │   └── components/
│   └── backend/
│       └── routes/
├── public/
│   └── index.html
├── Dockerfile
├── .dockerignore
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .eslintrc.cjs
```

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY dist/backend ./backend
COPY dist/frontend ./frontend
EXPOSE 3000
CMD ["node", "backend/server.js"]
```

### Build Process
1. `yarn build` compiles TypeScript backend to `dist/backend/`
2. `yarn build` builds Vite frontend to `dist/frontend/`
3. Docker image contains only production dependencies and compiled code

## Styling

- Use Vuetify components and theming
- Responsive design:
  - Desktop: Table and chart side by side
  - Mobile (< 768px): Table above, chart below
- Colors: Use Vuetify's default theme with possible customization

## Testing Strategy

### Frontend Tests (Vitest)
- Unit tests for composables
- Component tests for UI interactions
- Test coverage for: adding/editing/deleting entries, adding users

### Backend Tests (Vitest)
- Unit tests for route handlers
- Integration tests with in-memory SQLite
- Test coverage for: CRUD operations, edge cases

## Error Handling

### Frontend
- Display snackbar notifications for errors
- Form validation before submit
- Optimistic updates with rollback on error

### Backend
- Input validation with appropriate HTTP status codes
- 400 for bad input
- 404 for not found
- 500 for server errors
- Return error messages in JSON format: `{ "error": "message" }`

## Future Considerations

Not in current scope but documented for potential future features:
- Export data to CSV
- Import data from CSV
- Multiple measurement types (body fat %, etc.)
- Goal setting and progress indicators
- Data backup/restore
