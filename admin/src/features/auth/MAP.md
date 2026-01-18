# Auth Feature Map

Admin authentication pages.

## Pages

| File | Route | Purpose |
|------|-------|---------|
| `LoginPage.tsx` | `/login` | Admin login form |

## LoginPage

Email/password login form for admin users.

### Features

- Email and password inputs
- Form validation
- Error message display
- Loading state during auth
- Redirect to `/assets/pending` on success
- Uses `useAuth().signIn()` from context

### UI

- Centered card layout
- Dark theme (zinc-950 background)
- Hexmanos Admin branding
