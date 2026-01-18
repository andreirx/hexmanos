# Lib Map

Utilities and configuration.

## Files

| File | Purpose |
|------|---------|
| `utils.ts` | Utility functions |
| `amplify.ts` | AWS Amplify/Cognito configuration |
| `api.ts` | Axios client with auth interceptor |

## utils.ts

| Export | Purpose |
|--------|---------|
| `cn(...classes)` | Merge Tailwind classes with clsx + tailwind-merge |

## amplify.ts

Configures AWS Amplify for admin Cognito pool.

### Configuration

| Setting | Value |
|---------|-------|
| User Pool ID | `eu-central-1_6vEHad3r7` |
| Client ID | `56cjg5pg3ao3ssdbfff33sm541` |
| Region | `eu-central-1` |
| Domain | `hexmanos-admins-324037297014` |

## api.ts

Axios instance with authentication.

### Features

- Base URL: `http://localhost:8080`
- Request interceptor: Adds `Authorization: Bearer {token}` header
- Fetches token from Cognito session on each request
- Falls through silently if no token available
