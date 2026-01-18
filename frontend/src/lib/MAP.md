# Lib Map

Utilities and configuration.

## Files

| File | Purpose |
|------|---------|
| `amplify.ts` | AWS Amplify configuration |
| `api.ts` | Axios HTTP client instance |
| `utils.ts` | Helper functions |

## amplify.ts

AWS Amplify configuration for Cognito authentication.

**Configuration:**
```typescript
{
  Auth: {
    Cognito: {
      userPoolId: "eu-central-1_PKYxYlFq6",
      userPoolClientId: "...",
      loginWith: {
        oauth: {
          domain: "hexmanos-players-....amazoncognito.com",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: ["http://localhost:5173/auth/callback"],
          redirectSignOut: ["http://localhost:5173"],
          responseType: "code"
        }
      }
    }
  }
}
```

**Usage:**
- Imported in `main.tsx` before app render
- Configures Amplify for Cognito user pool
- Sets up OAuth redirect URLs

## api.ts

Axios HTTP client with auth interceptor.

**Configuration:**
- Base URL: `http://localhost:8080` (dev)
- Timeout: 30 seconds
- JSON content type

**Interceptors:**
- Request: Adds `Authorization: Bearer {token}` header
- Response: Handles 401 unauthorized (future)

**Usage:**
```typescript
import api from "@/lib/api"
const response = await api.get("/api/assets")
```

## utils.ts

Helper functions used across the app.

### cn()
Class name merger combining clsx and tailwind-merge.

```typescript
import { cn } from "@/lib/utils"

// Merges classes, resolves Tailwind conflicts
cn("px-4 py-2", "px-6") // "px-6 py-2"
cn("bg-red-500", condition && "bg-blue-500")
```

### Other utilities (as needed)
- String formatters
- Date utilities
- Validation helpers
