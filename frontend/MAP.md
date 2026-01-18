# Frontend Map: React SPA

React 19 single-page application with TypeScript, Tailwind 4, and Vite.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `src/` | Directory | Application source code |
| `public/` | Directory | Static assets served as-is |
| `e2e/` | Directory | Playwright end-to-end tests |
| `dist/` | Directory | Production build output (gitignored) |
| `node_modules/` | Directory | NPM dependencies (gitignored) |
| `index.html` | File | HTML entry point |
| `package.json` | File | NPM dependencies and scripts |
| `package-lock.json` | File | Dependency lock file |
| `vite.config.ts` | File | Vite build configuration |
| `tsconfig.json` | File | TypeScript configuration |
| `tsconfig.app.json` | File | App-specific TypeScript config |
| `tsconfig.node.json` | File | Node-specific TypeScript config |
| `eslint.config.js` | File | ESLint configuration |
| `playwright.config.ts` | File | Playwright test configuration |

## Source Structure

```
src/
├── api/                    # API clients and types
├── assets/                 # Static images and fonts
├── components/             # Shared UI components
│   ├── layout/            # App-wide layout components
│   └── ui/                # Low-level UI primitives
├── context/               # Global React context providers
├── features/              # Feature modules
│   ├── auth/             # Authentication pages
│   ├── editor/           # Character editor
│   ├── tiles/            # Tile editor
│   └── maps/             # Map editor
├── lib/                   # Utilities and configuration
├── App.tsx               # Main app with routing
└── main.tsx              # React entry point
```

See [src/MAP.md](src/MAP.md) for detailed source documentation.

## Key Files

### Entry Points
- `main.tsx` - React DOM render, Amplify config, AuthProvider wrapper
- `App.tsx` - React Router routes definition
- `index.html` - HTML template with root div

### Configuration
- `vite.config.ts` - Dev server, build options, path aliases
- `tsconfig.app.json` - TypeScript compiler options
- `playwright.config.ts` - E2E test settings

## Features

### Character Editor (`features/editor/`)
- 128x128 pixel canvas editor
- Tools: Pencil, Eraser, Select
- 7 animation states with frame timeline
- Undo/redo per frame

### Tile Editor (`features/tiles/`)
- Tile creation with variations
- Passability settings
- Auto-transition generation

### Map Editor (`features/maps/`)
- Grid-based map painting
- Terrain, Path, and Character layers
- Tools: Paint, Erase, Rectangle, Disc, Pan
- Zoom/pan with mouse wheel

### Authentication (`features/auth/`)
- AWS Cognito integration via Amplify
- Login, Register, Email confirmation
- OAuth callback handling

## NPM Scripts

```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm test             # Run Playwright tests
```

## Dependencies

### Core
- `react` 19 - UI framework
- `react-dom` 19 - DOM rendering
- `react-router-dom` 7 - Client-side routing
- `typescript` 5.9 - Type safety

### Styling
- `tailwindcss` 4 - Utility CSS
- `tailwind-merge` 3 - Class merging
- `@tailwindcss/vite` 4 - Vite plugin

### UI Components
- `@radix-ui/*` - Headless UI primitives
- `lucide-react` - Icons
- `class-variance-authority` - Component variants

### Backend Integration
- `axios` 1.13 - HTTP client
- `aws-amplify` 6 - AWS SDK
- `@aws-amplify/auth` 6 - Cognito auth

### Build Tools
- `vite` 7 - Build tool
- `@vitejs/plugin-react` - React plugin

### Testing
- `@playwright/test` 1.57 - E2E testing

## Running

```bash
# Development
npm install
npm run dev
# Opens http://localhost:5173

# Production build
npm run build
npm run preview

# E2E tests
npx playwright test
```
