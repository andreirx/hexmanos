# Features Map

Feature-based modules containing pages and components.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `auth/` | Authentication pages |
| `editor/` | Character sprite editor |
| `tiles/` | Tile editor |
| `maps/` | Map editor |

## Feature Structure

Each feature follows this pattern:

```
feature/
├── pages/           # Route components
├── components/      # Feature-specific components
└── index.ts         # Public exports
```

## auth/

Authentication and user management.

| Path | Component | Purpose |
|------|-----------|---------|
| `/login` | LoginPage | User login form |
| `/register` | RegisterPage | New user registration |
| `/confirm` | ConfirmPage | Email verification code |
| `/auth/callback` | AuthCallbackPage | OAuth redirect handler |

See [auth/MAP.md](auth/MAP.md)

## editor/

Character sprite editor with animation support.

| Path | Component | Purpose |
|------|-----------|---------|
| `/editor/character` | EditorPage | Full character editor |

Features:
- 128x128 pixel canvas
- Drawing tools (Pencil, Eraser, Select)
- Animation states (idle, walk, action)
- Frame timeline with preview
- Undo/redo history

See [editor/MAP.md](editor/MAP.md)

## tiles/

Tile creation and editing.

| Path | Component | Purpose |
|------|-----------|---------|
| `/editor/tile` | TileEditorPage | Tile editor |

Features:
- Tile canvas editor
- Variation management
- Passability settings
- Type selection (TILE/PATH)

See [tiles/MAP.md](tiles/MAP.md)

## maps/

Map editor for composing game levels.

| Path | Component | Purpose |
|------|-----------|---------|
| `/editor/map` | MapEditorPage | Full map editor |

Features:
- Grid-based painting
- Three layers: Terrain, Paths, Characters
- Tools: Paint, Erase, Rectangle, Disc, Pan
- Zoom/pan with mouse wheel
- Auto-transitions between tiles

See [maps/MAP.md](maps/MAP.md)
