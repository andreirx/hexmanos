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
| `repo-text-blob.py` | File | Utility script for code context extraction |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│              React 19 + TypeScript + Tailwind 4              │
│   Character Editor │ Tile Editor │ Map Editor │ Galleries    │
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
                              ▼ HTTP/REST + JWT
┌─────────────────────────────────────────────────────────────┐
│                         BACKEND                              │
│                   Spring Boot 3.4.1 + Java 17                │
│  ┌─────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │   APP   │  │    CORE     │  │        EXTERNAL          │ │
│  │ Driver  │─▶│   Domain    │◀─│       Adapters           │ │
│  │ Layer   │  │   Logic     │  │  (Postgres, S3, Local)   │ │
│  └─────────┘  └─────────────┘  └──────────────────────────┘ │
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
Raw HTML5 Canvas API (not Phaser) for editors:
- Maximum control over 128x128 grid
- `image-rendering: pixelated` everywhere
- Phaser reserved for future play mode only
