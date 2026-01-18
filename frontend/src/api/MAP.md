# API Layer Map

Backend communication via Axios HTTP client.

## Files

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript interfaces matching backend DTOs |
| `assets.ts` | Asset management API calls |
| `users.ts` | User management API calls |

## types.ts

TypeScript interfaces for API data:

```typescript
interface AssetDTO {
  id: string
  type: "CHARACTER" | "TILE" | "MAP"
  name: string
  authorId: string
  status: "PENDING" | "APPROVED" | "ARCHIVED"
  storageKeyPrefix: string
  createdAt: string
}
```

## assets.ts

Asset API functions:

| Function | Method | Path | Purpose |
|----------|--------|------|---------|
| `getAssets()` | GET | `/api/assets` | List all assets |
| `getAssetsByType(type)` | GET | `/api/assets/type/{type}` | Filter by type |
| `createAsset(data)` | POST | `/api/assets` | Create new asset |
| `getPresignedUrl(request)` | POST | `/api/assets/presigned-url` | Get upload URL |
| `uploadToPresignedUrl(url, file)` | PUT | `{presignedUrl}` | Upload file directly |
| `registerAsset(request)` | POST | `/api/assets/register` | Register after upload |
| `getAssetFileUrl(prefix, file)` | - | - | Build file URL |
| `getAssetFile<T>(prefix, file)` | GET | `/api/assets/files/{path}` | Fetch JSON file |
| `uploadFile(prefix, file)` | POST | `/api/assets/upload` | Direct upload (local) |

## users.ts

User API functions:

| Function | Method | Path | Purpose |
|----------|--------|------|---------|
| `syncUser(userData)` | POST | `/api/users/sync` | Sync Cognito user to backend |

## Usage Pattern

```typescript
// 1. Get presigned URLs for files
const urls = await getPresignedUrl({
  assetId: "uuid",
  assetType: "CHARACTER",
  files: ["definition.json", "idle_0.png"]
})

// 2. Upload files directly to storage
for (const url of urls.urls) {
  await uploadToPresignedUrl(url.url, fileData)
}

// 3. Register asset (validates files exist)
await registerAsset({
  name: "Hero",
  type: "CHARACTER",
  files: ["definition.json", "idle_0.png"],
  storageKeyPrefix: "characters/uuid"
})
```
