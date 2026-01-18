# Features Map

Feature-based modules for admin functionality.

## Directory Structure

| Feature | Purpose |
|---------|---------|
| `auth/` | Admin authentication |
| `assets/` | Asset moderation and management |

## Feature Organization

Each feature follows this pattern:

```
feature/
├── pages/          # Route-level components
├── components/     # Feature-specific components
└── hooks/          # Feature-specific hooks (if needed)
```

## Current Features

### auth/

Admin login functionality using AWS Cognito admin pool.

| Directory | Contents |
|-----------|----------|
| `pages/` | `LoginPage.tsx` |

### assets/

Asset moderation queue and library management.

| Directory | Contents |
|-----------|----------|
| `pages/` | `AssetListPage.tsx`, `PendingAssetsPage.tsx` |
| `components/` | `AssetCard.tsx`, `AssetFilters.tsx` |
