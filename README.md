# 🌌 HEXMANOS: The Living Pixel Engine

## High Level Vision

### 1. The High-Level Vision
Hexmanos is a **Community-Driven Persistent Strategy Platform**. It bridges the gap between creative sandboxes (like Minecraft/Roblox) and deep simulation strategy games (like HoMM3/XCOM).

The core philosophy is **"Create to Play"**:
*   **The Creative Loop:** Players define the world. They draw characters, paint terrain, and design maps in the browser-based **Workshop**.
*   **The Gameplay Loop:** These assets are injected into a persistent, server-authoritative world where players cooperate to build a "Living Base," manage an economy, and deploy squads into tactical turn-based combat.

### 2. The Gameplay Trinity
The game design revolves around three distinct phases of play:
1.  **The Living Base (HoMM3 Style):** A persistent, real-time map where characters physically travel to perform jobs (mining, building, crafting). The economy runs 24/7.
2.  **The Expedition (KOTOR Style):** Real-time exploration of dangerous maps. When an enemy is detected, the game seamless transitions into...
3.  **The Encounter (XCOM Style):** High-stakes, turn-based tactical combat. Time freezes, grids appear, and strategy takes over.

### 3. Engineering Philosophy
Hexmanos is built with a **"Safety-Critical"** mindset applied to Game Development.
*   **Server Authority:** The Backend (Java/Spring Boot) is the absolute dictator of time, physics, and state. The Frontend (React/Phaser) is merely a visual terminal.
*   **Hybrid Infrastructure:** We leverage local power (M1 Max) for heavy compute and game loops, while offloading stateless reliability (Auth, Storage) to AWS.
*   **The Pointer Pattern:** We treat assets as immutable references, ensuring that content updates never break active game sessions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Tailwind 4 + Vite |
| Backend | Spring Boot 3.4.1 + Java 17 |
| Auth | AWS Cognito (Players + Admins pools) |
| Database | PostgreSQL 17 (local native) |
| Storage | AWS S3 (prod) / Local disk (dev) |
| Infrastructure | AWS CDK 2.215.0 |
| Deployment | M1 Max + Cloudflare Tunnel |

## Features

### Character Editor
- 128x128 pixel canvas with HTML5 Canvas API
- Tools: Pencil, Eraser, Select with brush sizes 1-16
- 7 animation states: idle, walk directions, action states
- 1-8 frames per state with undo/redo support
- Export to S3 with definition.json + PNG frames

### Tile Editor
- Create terrain and path tiles with variations
- Auto-transition generation between tile types
- Passability settings for game logic

### Map Editor
- Grid-based map creation with terrain, paths, and character layers
- Tools: Paint, Erase, Rectangle fill, Disc fill, Pan
- Bresenham line algorithm for smooth path drawing
- Zoom/pan with mouse wheel and right-click
- Auto-transitions between adjacent terrain types

### Asset Management
- Presigned URL uploads directly to S3
- File validation before database commit
- Gallery browser with filtering by type/status
- Approval workflow for moderation

## Project Structure

```
hexmanos/
├── backend/          # Spring Boot API (Clean Architecture)
├── frontend/         # React 19 SPA
├── infra/            # AWS CDK infrastructure
├── CLAUDE.md         # AI coding instructions
├── AGENTS.md         # Multi-agent workflow docs
└── READONLY/         # Reference documents
```

See [MAP.md](MAP.md) for detailed structure documentation.

## Quick Start

### Prerequisites
- Java 17+
- Node.js 20+
- PostgreSQL 17
- AWS CLI configured (for S3/Cognito)

### Backend
```bash
cd backend

# Create database
createdb hexmanos

# Run with local profile
./gradlew bootRun --args='--spring.profiles.active=local'
# Server: http://localhost:8080
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Dev server: http://localhost:5173
```

### Infrastructure (optional)
```bash
cd infra
npm install
npm run build
npx cdk deploy
```

## Architecture

### Clean Architecture (Backend)

```
┌─────────────────────────────────────────┐
│         APP (Driver/Framework)          │
│  Controllers, DTOs, Config, Security    │
├─────────────────────────────────────────┤
│       CORE (Domain/Business Logic)      │
│  POJOs, Services, Repository Ports      │
├─────────────────────────────────────────┤
│    EXTERNAL (Adapters/Infrastructure)   │
│  Database, File Storage, Cloud APIs     │
└─────────────────────────────────────────┘
```

### Pointer Pattern (Storage)

- **S3**: Stores actual files (PNGs, JSONs)
- **PostgreSQL**: Stores metadata pointers only
- **No blobs in DB**: File content never stored in database columns

### Authentication

Two separate Cognito user pools:
- **hexmanos-players**: Self-signup, 8+ char passwords
- **hexmanos-admins**: Manual creation, 12+ char passwords with complexity

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/assets` | List all assets |
| GET | `/api/assets/{id}` | Get asset by ID |
| GET | `/api/assets/type/{type}` | Filter by type |
| POST | `/api/assets/register` | Register asset |
| POST | `/api/assets/presigned-url` | Get upload URL |
| GET | `/api/assets/files/**` | Serve asset files |

## Development

### Running Tests

```bash
# Backend
cd backend && ./gradlew test

# Frontend unit tests
cd frontend && npm test

# Frontend E2E tests
cd frontend && npx playwright test
```

### Database Migrations

Flyway migrations in `backend/src/main/resources/db/migration/`

Format: `V{YYYYMMDDHHMMSS}__{Description}.sql`

### Profiles

- **local**: Dev mode with local file storage
- **m1max**: Production mode with S3 storage

## License

Proprietary - All rights reserved.
