# Admin Frontend Map

Separate admin interface for asset moderation and platform management.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI Framework |
| TypeScript | 5.9 | Type Safety |
| Vite | 7.2 | Build Tool |
| Tailwind CSS | 4 | Styling |
| React Router | 7 | Routing |
| AWS Amplify | 6.15 | Authentication |
| Axios | 1.13 | HTTP Client |
| Lucide React | 0.562 | Icons |

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `src/` | Directory | Application source code |
| `public/` | Directory | Static assets |
| `index.html` | File | HTML entry point |
| `package.json` | File | Dependencies and scripts |
| `vite.config.ts` | File | Vite configuration |
| `tsconfig.json` | File | TypeScript configuration |
| `eslint.config.js` | File | ESLint configuration |

## Development

```bash
# Start dev server (port 5174)
npm run dev

# Build for production
npm run build

# Run linting
npm run lint
```

## Authentication

Uses separate AWS Cognito user pool for admins:
- Pool: `hexmanos-admins`
- Region: `eu-central-1`
- User Pool ID: `eu-central-1_6vEHad3r7`

## Routes

| Path | Component | Access |
|------|-----------|--------|
| `/login` | LoginPage | Public |
| `/` | Redirect to `/assets/pending` | Protected |
| `/assets` | AssetListPage | Protected |
| `/assets/pending` | PendingAssetsPage | Protected |

## API Integration

Connects to Spring Boot backend at `http://localhost:8080` with endpoints:
- `GET /api/assets` - List all assets
- `GET /api/assets/status/{status}` - Filter by status
- `POST /api/assets/{id}/approve` - Approve asset
- `POST /api/assets/{id}/reject` - Reject asset
- `POST /api/assets/{id}/archive` - Archive asset
