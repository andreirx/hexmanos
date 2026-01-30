# Frontend Architecture (React 19 + Tailwind 4)

## Stack
React 19, TypeScript, Vite, Tailwind 4 (CSS-native), Axios, React Context API.

## Directory Structure
```
src/
├── api/              # Axios instances & DTO types
├── assets/           # Static images/fonts
├── components/       # Shared UI
│   ├── ui/           # Low-level primitives (Button, Input - Shadcn style)
│   ├── dialogs/      # Business logic dialogs (isOpen/onClose props)
│   └── layout/       # Sidebars, Headers
├── context/          # Providers (TenantContext, AuthContext)
├── features/         # Feature-specific logic (editor, admin, game, maps, lobby)
├── hooks/            # Custom hooks (useGameWebSocket, etc.)
├── lib/              # Utilities (cn, string formatters, api client)
└── pages/            # Route Views
```

## API & DTO Matching
- TypeScript interfaces in `src/api/types.ts` must strictly match Backend DTOs.
- Centralized Axios instance in `src/lib/api.ts` handles base URL, auth header (Cognito), 401 redirects.

## Component Rules
- **Pixel Art:** Any `<canvas>` or `<img>` rendering game assets MUST use `image-rendering: pixelated`.
- **Dialogs:** In `src/components/dialogs/`, accept `isOpen` and `onClose` props.
- **Forms:** Controlled Components only.

## Editors
- **Asset Editor** (`features/editor`): Raw HTML5 Canvas API for 128x128 pixel grid. No Phaser.
- **Map Editor** (`features/maps`): Canvas-based tile map editor with layers.

## Game Engine
- **Play Mode** (`features/game`): Phaser 3 for rendering. See `docs/game-engine.md`.
- React StrictMode causes double-mounts in dev - all handlers must be idempotent.
