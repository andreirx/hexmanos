# Admin Source Map

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `api/` | Directory | API client functions and types |
| `components/` | Directory | Reusable UI components |
| `context/` | Directory | React Context providers |
| `features/` | Directory | Feature-based modules |
| `lib/` | Directory | Utilities and configuration |
| `assets/` | Directory | Static assets (SVGs) |
| `App.tsx` | File | Root component with routing |
| `main.tsx` | File | Application entry point |
| `index.css` | File | Global styles and Tailwind imports |

## Key Files

### Entry Points

| File | Purpose |
|------|---------|
| `main.tsx` | Renders App within AuthProvider |
| `App.tsx` | Router setup with protected routes |

### App.tsx Components

| Component | Purpose |
|-----------|---------|
| `ProtectedRoute` | Auth guard HOC for protected routes |
| `AppLayout` | Common layout with Header |

## Architecture

```
main.tsx
    └── AuthProvider (context)
            └── App.tsx
                    ├── LoginPage (public)
                    └── ProtectedRoute
                            └── AppLayout
                                    ├── AssetListPage
                                    └── PendingAssetsPage
```
