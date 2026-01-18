# Context Map

Global state management via React Context API.

## Files

| File | Purpose |
|------|---------|
| `AuthContext.tsx` | Authentication state and Cognito integration |

## AuthContext.tsx

Provides authentication state and methods throughout the app.

### State

```typescript
interface AuthContextType {
  user: CognitoUser | null      // Current authenticated user
  isLoading: boolean            // Auth state loading
  isAuthenticated: boolean      // User is logged in
  accessToken: string | null    // JWT for API calls
  login: (username, password) => Promise<void>
  register: (username, email, password) => Promise<void>
  confirmRegistration: (username, code) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}
```

### Features

1. **Cognito Integration**
   - Uses AWS Amplify Auth
   - Configured for hexmanos-players pool
   - Handles JWT token management

2. **Session Persistence**
   - Checks for existing session on mount
   - Auto-refreshes tokens before expiry

3. **User Sync**
   - Syncs Cognito user to backend on login
   - Creates backend user record if needed

### Usage

```tsx
// Wrap app with provider
<AuthProvider>
  <App />
</AuthProvider>

// Use in components
const { user, login, logout, isAuthenticated } = useAuth()
```

### Auth Flow

1. **Registration**: `register()` → Cognito signUp → Verification email
2. **Confirmation**: `confirmRegistration()` → Verify code → Account active
3. **Login**: `login()` → Cognito signIn → Store tokens → Sync user
4. **Logout**: `logout()` → Cognito signOut → Clear state
