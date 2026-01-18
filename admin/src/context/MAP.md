# Context Map

React Context providers for global state.

## Files

| File | Purpose |
|------|---------|
| `AuthContext.tsx` | Admin authentication state |

## AuthContext

Manages admin authentication via AWS Cognito (separate admin pool).

### Exported

| Export | Type | Description |
|--------|------|-------------|
| `AuthProvider` | Component | Wraps app with auth state |
| `useAuth` | Hook | Access auth context |

### AuthContextType

| Field | Type | Description |
|-------|------|-------------|
| `isAuthenticated` | `boolean` | Login status |
| `isLoading` | `boolean` | Auth check in progress |
| `user` | `CognitoUser \| null` | Current user object |
| `userEmail` | `string \| null` | User's email address |
| `signIn(email, password)` | `Promise<void>` | Login function |
| `signOut()` | `Promise<void>` | Logout function |

### Features

- Auto-checks session on mount
- Persists login state via Cognito
- Extracts email from user attributes
- Uses admin Cognito pool configuration
