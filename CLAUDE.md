# Hexmanos Engine

2D hex-tile multiplayer game engine. Spring Boot backend (authoritative game state) + React/Phaser frontend (renderer).

## Quick Commands

```bash
# Backend
cd backend && ./gradlew bootRun          # Run API server
cd backend && ./gradlew build            # Build + test

# Frontend
cd frontend && npm run dev               # Dev server
cd frontend && npm run build             # Production build (includes tsc)
```

## Work Tracking (Beads)

`bd` is the ONLY source of truth for work. No markdown plan files.

```bash
bd ready                                 # Find unblocked work
bd create "Title" -t task                # Create task
bd update <id> --status in_progress      # Start work
bd close <id>                            # Complete work
bd sync                                  # Sync with git
```

## Architecture (Quick Reference)

**Backend:** Clean Architecture - `app` (controllers/config) / `core` (domain/services) / `external` (postgres/s3).
Core has NO Spring annotations. Services wired via `@Bean` in `app.config.core`.

**Frontend:** React 19 + TypeScript + Vite + Tailwind 4. Feature-based structure under `src/features/`.

**Game State:** Backend is single source of truth. Frontend renders WebSocket events. No client-side game logic.

**Storage:** S3 stores assets. Postgres stores metadata + pointers. Never blobs in DB.

**Infra:** M1 Max + Cloudflare Tunnel. Postgres local. AWS Cognito auth. Paddle payments (NO Stripe).

## Reference Documentation

Detailed architecture, patterns, and lessons learned live in `docs/`:

| Document                        | When to read                                                |
|---------------------------------|-------------------------------------------------------------|
| `docs/backend-architecture.md`  | Adding backend features, DB models, persistence, migrations |
| `docs/frontend-architecture.md` | Adding UI features, components, API calls                   |
| `docs/game-engine.md`           | Game logic, WebSocket events, Phaser rendering, projectiles |
| `docs/infrastructure.md`        | Deployment, AWS services, storage config                    |
| `docs/patterns-and-lessons.md`  | Before debugging - common pitfalls and hard-won solutions   |
| `docs/lessons-learned.md`       | Check this when planning a feature or refactor              |

Each feature folder also has a `MAP.md` describing its files and purpose. Read these before modifying a feature.

## Behavioral Rules

1. **Read before writing.** Read MAP.md files and relevant docs before modifying any feature.
2. **Never remove functionality** unless explicitly asked. If it exists, it was intended.
3. **Never contradict evidence.** When there's a problem, think harder instead of dismissing data.
4. **No TODOs in code.** Use `bd create` for future work.
5. **Refactoring scope check.** When changing structures/formats/schemas, check all consumers: editors, game engine, admin interface, renderer.
6. **Pixel art rendering.** All canvas/img for game assets must use `image-rendering: pixelated`.
7. **Treat user feedback as HARD DATA.** never assume your code is correct even if it looks correct. Maybe there's something else affecting it.

## Session Completion

```bash
bd close <ids>                           # Close completed work
git add -A && git commit -m "..."        # Commit changes
bd sync                                  # Sync beads
git push                                 # Push to remote
```
