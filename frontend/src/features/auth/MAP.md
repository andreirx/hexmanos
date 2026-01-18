# Auth Feature Map

Authentication pages for user login and registration.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `pages/` | Directory | Route components |
| `index.ts` | File | Public exports |

## pages/

| File | Route | Purpose |
|------|-------|---------|
| `LoginPage.tsx` | `/login` | User login form |
| `RegisterPage.tsx` | `/register` | New user registration form |
| `ConfirmPage.tsx` | `/confirm` | Email verification code input |
| `AuthCallbackPage.tsx` | `/auth/callback` | OAuth redirect handler |

### LoginPage.tsx
- Username/email and password fields
- "Remember me" option
- Link to registration
- Calls `AuthContext.login()`
- Redirects to home on success

### RegisterPage.tsx
- Username, email, password fields
- Password confirmation
- Calls `AuthContext.register()`
- Redirects to confirm page on success

### ConfirmPage.tsx
- 6-digit verification code input
- Resend code option
- Calls `AuthContext.confirmRegistration()`
- Redirects to login on success

### AuthCallbackPage.tsx
- Handles OAuth code exchange
- Parses URL parameters
- Completes Amplify auth flow
- Redirects to home on success

## Styling

- Dark theme with zinc colors
- Centered card layout
- Form validation feedback
- Loading states during API calls
