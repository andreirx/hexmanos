# API Layer Map

API client functions and TypeScript interfaces.

## Files

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript interfaces matching backend DTOs |
| `assets.ts` | Asset API functions including moderation |

## types.ts

| Type | Fields |
|------|--------|
| `AssetType` | `"CHARACTER"`, `"TILE"`, `"MAP"` |
| `AssetStatus` | `"PENDING"`, `"APPROVED"`, `"REJECTED"`, `"ARCHIVED"` |
| `AssetDTO` | `id`, `type`, `name`, `authorId`, `status`, `storageKeyPrefix`, `createdAt`, `moderationNotes` |
| `ModerationRequest` | `notes?: string` |

## assets.ts Functions

### Query Functions

| Function | Return | Description |
|----------|--------|-------------|
| `getAssets()` | `AssetDTO[]` | Get all assets |
| `getAssetsByStatus(status)` | `AssetDTO[]` | Filter by status |
| `getAssetsByType(type)` | `AssetDTO[]` | Filter by type |
| `getAssetById(id)` | `AssetDTO` | Get single asset |

### Moderation Functions

| Function | Return | Description |
|----------|--------|-------------|
| `approveAsset(id, request?)` | `AssetDTO` | Approve asset with optional notes |
| `rejectAsset(id, request?)` | `AssetDTO` | Reject asset with notes |
| `archiveAsset(id, request?)` | `AssetDTO` | Archive asset with optional notes |

### File Functions

| Function | Return | Description |
|----------|--------|-------------|
| `getAssetFileUrl(prefix, name, cacheBust?)` | `string` | Build file URL |
| `getAssetFile<T>(prefix, name)` | `T` | Fetch file contents |
