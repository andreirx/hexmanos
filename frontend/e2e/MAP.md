# E2E Tests Map

Playwright end-to-end tests for the frontend application.

## Files

| File | Purpose |
|------|---------|
| `home.spec.ts` | Home page and navigation tests |
| `editor.spec.ts` | Character editor page tests |
| `tile-editor.spec.ts` | Tile editor page tests |
| `map-editor.spec.ts` | Map editor page tests |

## home.spec.ts

Tests for the landing page and navigation.

- Header visibility
- Navigation links work
- Editor links accessible

## editor.spec.ts

Tests for the character editor (`/editor/character`).

- Page loads correctly
- Canvas is visible
- Tools are functional
- Color picker works
- Gallery opens/closes
- Animation states selectable

## tile-editor.spec.ts

Tests for the tile editor (`/editor/tile`).

- Page loads correctly
- Canvas is visible
- Tools available
- Tile gallery works
- Properties panel visible

## map-editor.spec.ts

Tests for the map editor (`/editor/map`).

- Header displays
- File operations card (Load/New Map)
- Tools card (Select, Paint, Erase, Rect, Disc, Pan)
- Layers card (Terrain, Paths, Characters)
- Map size controls
- Map properties input
- Map info display
- Save button
- Zoom controls
- Auto-transitions toggle
- Tool switching
- Layer switching
- Map gallery open/close
- New map reset
- Layer-specific palettes
- Canvas element visible
- Map size changes

## Running Tests

```bash
# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test e2e/map-editor.spec.ts

# Run in headed mode (visible browser)
npx playwright test --headed

# Run with UI mode
npx playwright test --ui

# Debug a test
npx playwright test --debug
```

## Configuration

Tests configured in `playwright.config.ts`:
- Base URL: `http://localhost:5173`
- Browser: Chromium
- Screenshots on failure
- Video on retry
