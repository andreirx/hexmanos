# Frontend Source Map

React application source code organized by feature.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `api/` | Directory | Backend API clients and TypeScript types |
| `assets/` | Directory | Static images and fonts |
| `components/` | Directory | Shared UI components |
| `context/` | Directory | Global React context providers |
| `features/` | Directory | Feature-based modules |
| `lib/` | Directory | Utilities and configuration |
| `App.tsx` | File | Main app component with routing |
| `main.tsx` | File | React entry point |

## Root Files

| File | Purpose |
|------|---------|
| `main.tsx` | React DOM render, Amplify initialization, AuthProvider |
| `App.tsx` | React Router configuration with all routes |

## api/

Backend communication layer.

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript interfaces matching backend DTOs |
| `assets.ts` | Asset API calls: list, create, upload, register |
| `users.ts` | User API calls: sync |

See [api/MAP.md](api/MAP.md)

## components/

Shared UI components used across features.

| Directory | Purpose |
|-----------|---------|
| `layout/` | App-wide layout (Header, navigation) |
| `ui/` | Low-level UI primitives (Button, Card) |

See [components/MAP.md](components/MAP.md)

## context/

Global state management via React Context.

| File | Purpose |
|------|---------|
| `AuthContext.tsx` | Authentication state, Cognito integration |

See [context/MAP.md](context/MAP.md)

## features/

Feature-based modules. Each feature contains:
- `pages/` - Route components
- `components/` - Feature-specific components
- `index.ts` - Public exports

| Directory | Purpose |
|-----------|---------|
| `auth/` | Login, Register, Confirm, Callback pages |
| `editor/` | Character sprite editor |
| `tiles/` | Tile editor |
| `maps/` | Map editor |

See [features/MAP.md](features/MAP.md)

## lib/

Utilities and configuration.

| File | Purpose |
|------|---------|
| `amplify.ts` | AWS Amplify configuration |
| `api.ts` | Axios instance with auth interceptor |
| `utils.ts` | Helper functions (cn for classnames) |

See [lib/MAP.md](lib/MAP.md)

## Routing

Routes defined in `App.tsx`:

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Home | Landing page |
| `/login` | LoginPage | User login |
| `/register` | RegisterPage | User registration |
| `/confirm` | ConfirmPage | Email confirmation |
| `/auth/callback` | AuthCallbackPage | OAuth callback |
| `/editor/character` | EditorPage | Character editor |
| `/editor/tile` | TileEditorPage | Tile editor |
| `/editor/map` | MapEditorPage | Map editor |

## State Management

- **Authentication**: `AuthContext` provides user state globally
- **Editor State**: Local state within each editor page
- **API Data**: Fetched on component mount, stored locally

## Styling Conventions

- Tailwind 4 utility classes
- Dark theme: `bg-zinc-900`, `text-zinc-100`
- Pixel art: `image-rendering: pixelated` on all game assets
- Component variants via `class-variance-authority`
