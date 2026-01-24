# Project Map: Hexmanos Engine

Hexmanos is a pixel art game asset workshop enabling creation of characters, tiles, and maps for 2D games. The system follows Clean Architecture principles with a strict separation between domain logic and infrastructure.

## Root Directory

| Item | Type | Purpose |
|------|------|---------|
| `backend/` | Directory | Spring Boot REST API with Clean Architecture |
| `frontend/` | Directory | React 19 SPA for asset editors |
| `admin/` | Directory | React 19 SPA for asset moderation (admin interface) |
| `infra/` | Directory | AWS CDK infrastructure as code |
| `READONLY/` | Directory | Reference documents and master plans |
| `.beads/` | Directory | Issue tracking database (beads workflow) |
| `.claude/` | Directory | Claude Code project settings |
| `CLAUDE.md` | File | AI coding instructions and architecture rules |
| `AGENTS.md` | File | Multi-agent workflow documentation |
| `README.md` | File | Project overview and quick start |
| `MAP.md` | File | This file - project structure documentation |
| `.gitignore` | File | Git ignore patterns |
| `.gitattributes` | File | Git LFS and line ending settings |
| `hexmanos.iml` | File | IntelliJ IDEA module file |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│              React 19 + TypeScript + Tailwind 4              │
│   Character Editor │ Tile Editor │ Map Editor │ Galleries    │
│                          │                                   │
│                    Game Client                               │
│              (Phaser 3 + WebSocket/STOMP)                    │
│         Lobby │ GamePage │ Real-time Movement                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─────────────────────────────────┐
                              │                                 │
┌─────────────────────────────────────────────────────────────┐│
│                         ADMIN                                ││
│              React 19 + TypeScript + Tailwind 4              ││
│        Asset Moderation │ Pending Queue │ Library View       ││
└─────────────────────────────────────────────────────────────┘│
                              │                                 │
                              ▼ HTTP/REST + JWT + WebSocket/STOMP
┌─────────────────────────────────────────────────────────────┐
│                         BACKEND                              │
│                   Spring Boot 3.4.1 + Java 17                │
│  ┌─────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │   APP   │  │    CORE     │  │        EXTERNAL          │ │
│  │ Driver  │─▶│   Domain    │◀─│       Adapters           │ │
│  │ Layer   │  │   Logic     │  │  (Postgres, S3, Local)   │ │
│  └─────────┘  └─────────────┘  └──────────────────────────┘ │
│       │                                                      │
│  WebSocket (STOMP over SockJS) - Real-time game state       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │PostgreSQL│    │  AWS S3  │    │  Cognito │
       │   17     │    │ Storage  │    │   Auth   │
       └──────────┘    └──────────┘    └──────────┘
```

## Data Flow

### Asset Creation
1. Frontend generates presigned upload URLs via backend
2. Files uploaded directly to S3/local storage
3. Backend validates files exist, creates database record
4. Only metadata stored in PostgreSQL (Pointer Pattern)

### Authentication
1. User authenticates via AWS Cognito
2. JWT token stored in frontend AuthContext
3. Axios interceptor adds token to all API requests
4. Backend validates JWT from either user pool

## Directory Deep Dives

### `backend/` - Spring Boot API
Clean Architecture with three layers:
- **app/**: Controllers, DTOs, configuration, security
- **core/**: Domain POJOs, services, repository interfaces
- **external/**: Database entities, adapters, file storage

See [backend/MAP.md](backend/MAP.md)

### `frontend/` - React SPA
Feature-based organization:
- **api/**: Axios clients and TypeScript types
- **components/**: Shared UI components
- **context/**: Global state (Auth)
- **features/**: Editor modules (characters, tiles, maps)
- **lib/**: Utilities and configuration

See [frontend/MAP.md](frontend/MAP.md)

### `admin/` - Admin Interface
Separate React SPA for platform moderation:
- **api/**: Asset API with moderation endpoints
- **components/**: Admin UI components
- **context/**: Admin AuthContext (separate Cognito pool)
- **features/**: Asset moderation queue and library

See [admin/MAP.md](admin/MAP.md)

### `infra/` - AWS CDK
Infrastructure as code:
- S3 bucket for asset storage
- Cognito user pools (players + admins)
- OAuth app clients and domains

See [infra/MAP.md](infra/MAP.md)

## Key Design Decisions

### Pointer Pattern
Files stored in S3, only paths stored in PostgreSQL. Benefits:
- No blob columns in database
- Direct client-to-S3 uploads
- Easy horizontal scaling

### Clean Architecture
Strict layer separation in backend:
- Core has no Spring dependencies
- Adapters implement repository interfaces
- DTOs never leak into domain layer

### Dual Auth Pools
Separate Cognito pools for players and admins:
- Different password policies
- Different token lifetimes
- Players can self-register, admins cannot

### Pixel Art Canvas
Raw HTML5 Canvas API for editors:
- Maximum control over 128x128 grid
- `image-rendering: pixelated` everywhere
- Phaser 3 used for game client (not editors)

## Game Engine

### Real-Time Architecture

```
Player A (Frontend)          Backend                    Player B (Frontend)
      │                         │                              │
      │  STOMP CONNECT          │                              │
      │ (JWT in headers)        │                              │
      │────────────────────────▶│                              │
      │                         │◀─────────────────────────────│
      │                         │  STOMP CONNECT               │
      │                         │                              │
      │  SUBSCRIBE              │                              │
      │ /topic/game/{id}        │                              │
      │────────────────────────▶│◀─────────────────────────────│
      │                         │  SUBSCRIBE                   │
      │                         │                              │
      │  SEND /app/move         │                              │
      │ { direction: "n" }      │                              │
      │────────────────────────▶│                              │
      │                         │  GameService.moveCharacter() │
      │                         │  validates, updates state    │
      │                         │                              │
      │  CharacterMoveEvent     │  CharacterMoveEvent          │
      │◀────────────────────────│─────────────────────────────▶│
      │  Tween animation        │                   Tween animation
```

### WebSocket Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Transport | SockJS | WebSocket with fallback (long-polling) |
| Protocol | STOMP | Simple text messaging protocol |
| Auth | JWT | Token validated on CONNECT via JwtChannelInterceptor |
| Broker | Spring SimpleBroker | In-memory message routing |

### Game Client (Phaser 3)

The GamePage uses Phaser 3 for rendering:

**Rendering Pipeline:**
1. Terrain tiles (with seed-based variation)
2. Edge transitions (Stacking Algorithm)
3. Path tiles (water first, then land for bridges)
4. Characters/Objects (with idle animations)

**Key Features:**
- Smooth tween-based movement (150ms linear)
- Animated zoom transitions (300ms cubic easeout)
- Selection indicator (glowing disc, not color tint)
- Camera follows controlled character
- Keyboard: WASD/arrows for movement (controlled) or pan (uncontrolled)

**React + Phaser Integration:**
- Single Phaser instance (guarded by `hasEverInitializedRef`)
- Scene methods update Phaser state without React re-renders
- React state updates UI sidebars only
- WebSocket events go directly to scene methods

### Game Data Model

```
Game
├── id, name, status (WAITING/RUNNING/PAUSED/FINISHED)
├── mapAssetId (reference to Map asset)
├── joinCode (6-char invite code)
├── hostPlayerId
│
├── GamePlayer[]
│   ├── playerId (Cognito user ID)
│   ├── role (HOST/PLAYER/OBSERVER)
│   └── controlledCharacterId (nullable)
│
└── GameCharacter[] (in-memory, loaded from map)
    ├── id, name, assetId
    ├── x, y (grid position)
    ├── health, maxHealth
    └── controlled (boolean)
```

### Movement Validation

Server-side validation in GameService.moveCharacter():
1. Verify player is in the game
2. Verify player controls a character
3. Check destination is within map bounds
4. Check destination tile is passable
5. Check no other character at destination
6. Update character position
7. Broadcast CharacterMoveEvent to all players

See [frontend/src/features/game/MAP.md](frontend/src/features/game/MAP.md) for detailed client documentation.
