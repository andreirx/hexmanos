# Game Feature

Multiplayer game lobby and Phaser-based game client with real-time WebSocket sync.

## Architecture Principle: Backend is Single Source of Truth

**The frontend is a RENDERER, not a state manager.**

| Concern | Owner | Examples |
|---------|-------|----------|
| Game State | **Backend** | Character positions, animation states, health, paths, control |
| Display | **Frontend** | Mipmap selection, zoom level, visual effects, UI panels |

### Rules
1. **Backend tells frontend what to render** via WebSocket events
2. **Events include animation state** - frontend doesn't decide walk vs idle
3. **Frontend renders exactly what backend says** - no local game state
4. **Frontend can interpolate/cache** for smoothness but syncs frequently
5. **Zoom/mipmap changes are display-only** - they don't affect game state

### The Local Truth Mirror Pattern

The frontend maintains a **Local Truth Mirror** (`characterStates` Map) that tracks what the backend last told us - NOT what the sprite is currently showing.

```typescript
// Local Truth Mirror - tracks backend's authoritative state
private characterStates: Map<string, {
  x: number
  y: number
  state: string      // "idle", "walk_up", etc. - THE REAL STATE
  assetId: string
}> = new Map()
```

**Why this matters:**
- When a character has no walk animation, the sprite shows idle as a visual FALLBACK
- But the mirror remembers: "this character is actually WALKING"
- When we zoom (switch mipmaps), we ask the MIRROR what state to render, not the sprite
- This prevents the bug where zooming makes characters "forget" they were walking

**Update flow:**
1. `animateCharacterMove()` - updates mirror with backend state FIRST, then renders
2. `setCharacterState()` - updates mirror AND renders (with visual fallback if needed)
3. `switchMipLevel()` - reads from mirror to know the REAL state, reapplies animation
4. `updateCharacters()` - updates mirror positions, preserves animation state

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Feature exports (LobbyPage, GamePage) |
| `pages/LobbyPage.tsx` | Game lobby - create, join, list games |
| `pages/GamePage.tsx` | Active game view with Phaser canvas and GameScene |

## Pages

### LobbyPage
- Lists games the current user has created or joined
- Create game dialog (name, map selection, optional password)
- Join game dialog (game ID, join code, optional password)
- Start/Enter/Stop game actions
- Requires authentication

### GamePage
- Loads game state from API
- Renders map and characters using Phaser 3
- Left sidebar: game controls, player list, character control panel
- Right sidebar: character list with selection
- Take over/Relinquish character control
- Pause/Stop game actions (host only)
- Real-time WebSocket connection status indicator

## GameScene (Phaser.Scene)

The core game rendering engine embedded in GamePage.tsx.

### Rendering Pipeline (4-Pass)
1. **Terrain Pass** - Base terrain tiles with seed-based variation selection
2. **Transition Pass** - Edge transitions using the Stacking Algorithm (getTransitionDirections)
3. **Path Pass** - Water paths first, then land paths (for bridges), using calculatePathVariation
4. **Character Pass** - Character/object sprites with idle animations

### Character Sprites
- Loads ALL idle frames from definition.json (`states.idle.frames`)
- Creates Phaser animations for multi-frame idle states (4 FPS, looping)
- Sprites are interactive (click to select)
- NO tinting used - selection indicated by glowing disc underlay

### Player Colors
8 distinct colors assigned to players (index 0-7):
- 0: Red (`0xff4444`)
- 1: Green (`0x44ff44`)
- 2: Blue (`0x4444ff`)
- 3: Yellow (`0xffff44`)
- 4: Magenta (`0xff44ff`)
- 5: Cyan (`0x44ffff`)
- 6: Orange (`0xff8844`)
- 7: Purple (`0x8844ff`)

Host gets color 0, subsequent players cycle through colors.

### Selection Indicator
- Soft glowing disc rendered under the controlled character
- Uses **current player's color** (not hardcoded green)
- Multiple concentric semi-transparent circles for glow effect
- Alpha values: 0.1 to 0.3 for soft glow
- Radius based on TILE_SIZE (0.6x to 1.4x)
- Moves with character during animations

### Character Glow (All Controlled Characters)
- Each character has a glow graphics layer
- When controlled by any player, shows that player's color glow
- `characterGlows` Map tracks glow per character
- `updateCharacterGlow(characterId, controlledByPlayerId)` updates glow state
- Glows animate with character movement

### Click-Based Control
- **Left-click character:** Auto take control (releases current if any)
- **Left-click empty tile:** Release current character
- **Left-click controlled character:** No-op (already controlled)
- **Character controlled by other player:** Shows "unavailable" in console
- No Take/Release buttons in UI - pure click interaction

### Camera System
- **No character controlled:** WASD/arrows pan the camera, zoom 0.25x, centered on map
- **Character controlled:** WASD/arrows send move commands, zoom 1x, camera follows character
- Mouse wheel zoom (0.1x to 2x range)
- Animated zoom transitions (300ms, Cubic.easeOut easing)

### Pathfinding (Right-Click)
- **Right-click target tile:** Sends path request to backend
- Backend computes A* path and executes steps automatically (200ms per step)
- Path visualization currently **disabled** (will be re-enabled for squad movement)
- Manual movement (WASD) cancels active path
- New path request cancels previous path

### Movement System

**Input Handling:**
- Keyboard checked in `update()` loop (60 FPS)
- Direction priority: up > down > left > right
- Debounce: 200ms between move inputs
- Movement blocked while character is animating

**Backend-Driven Animation State (CRITICAL):**
- Animation state is AUTHORITATIVE from the backend - frontend does not manage walk->idle transitions locally
- `CharacterMoveEvent` includes `state` field (walk_up, walk_down, walk_left, walk_right)
- `CharacterIdleEvent` tells frontend when to switch to idle (path completion)
- This prevents animation desync during zoom level changes

**Animation Methods:**
- `animateCharacterMove(characterId, newX, newY, state)` - Called on WebSocket CharacterMoveEvent
- `setCharacterState(characterId, state)` - Sets animation/texture from backend state
- `setCharacterIdleTexture(characterId)` - Guaranteed fallback to visible idle texture
- Phaser tweens move sprites over 150ms (Linear easing)
- `movingCharacters` Set tracks animating characters to prevent double-moves
- Selection indicator tweens in sync with character sprite

**Path vs Manual Move Handling:**
- `charactersWithActivePath` Set tracks characters executing a path
- For PATH moves: wait for `CharacterIdleEvent` from backend
- For MANUAL moves (WASD): auto-switch to idle after animation completes
- This distinction prevents walk animation playing forever after single moves

### React Integration

**Initialization (CRITICAL):**
- Uses `hasEverInitializedRef` that is NEVER reset to prevent React Strict Mode double-init
- Game data stored in `gameDataRef` for Phaser init (avoids stale closures)
- useEffect dependency is `[mapData]` only - game state updates use `scene.updateCharacters()`
- Phaser instance stored in `phaserGameRef`

**State Flow:**
1. `loadGame()` fetches game data, stores in state AND ref
2. useEffect creates Phaser ONCE when mapData is ready
3. `handleTakeOver()` calls API, then `scene.setControlledCharacter()`, then `setGame()`
4. `handleRelinquish()` calls API, then `scene.clearControlledCharacter()`, then `setGame()`
5. WebSocket events call `scene.animateCharacterMove()` directly

**Why This Architecture:**
- Phaser should NOT be recreated when React state changes
- Scene methods update Phaser state without triggering React re-renders
- React state updates UI (sidebars), Phaser handles canvas rendering
- This separation prevents the "Phaser recreation" bug where controlledCharacterId was lost

**Cleanup on Unmount:**
- When navigating away from game screen, controlled character is released
- Uses refs (`gameIdRef`, `controlledCharacterIdRef`) to avoid stale closures
- Calls `relinquishCharacter(gameId)` in useEffect cleanup
- Fire-and-forget API call (component is unmounting)

## WebSocket Integration

Uses the `useGameWebSocket` hook from `@/hooks/useGameWebSocket.ts`:

### Connection
- Endpoint: `/ws/game` via STOMP over SockJS
- JWT token in `Authorization` header during STOMP CONNECT
- Auto-reconnect with 5 second delay
- Heartbeat: 10 second incoming/outgoing

### Subscriptions
- `/topic/game/{gameId}` - Game-wide events (character moves)
- `/user/queue/errors` - User-specific error messages

### Messages
| Direction | Destination | Payload | Purpose |
|-----------|-------------|---------|---------|
| Send | `/app/game/{gameId}/move` | `{ direction: "n"/"s"/"e"/"w" }` | Move controlled character |
| Send | `/app/game/{gameId}/idle` | `{}` | Mark character as idle |
| Send | `/app/game/{gameId}/path` | `{ targetX, targetY }` | Request A* path to target |
| Send | `/app/game/{gameId}/cancelPath` | `{}` | Cancel current path |
| Receive | `/topic/game/{gameId}` | `CharacterMoveEvent` | Character position update |
| Receive | `/topic/game/{gameId}` | `PathStartEvent` | Path computed, started |
| Receive | `/topic/game/{gameId}` | `PathCancelEvent` | Path cancelled |

### Event Types
```typescript
interface CharacterMoveEvent {
  characterId: string
  x: number
  y: number
  direction: string   // n, s, e, w
  state: string       // Animation state from backend (walk_up, walk_down, walk_left, walk_right)
}

interface CharacterIdleEvent {
  characterId: string
  state: string       // Always "idle" - sent when path completes
}

interface PathStartEvent {
  characterId: string
  path: [number, number][]  // Array of [x, y] coordinates
}

interface PathCancelEvent {
  characterId: string
}
```

## API Integration

### Game API (`@/api/games.ts`)
- `getGame(id)` - Load game state with players and characters
- `createGame(...)` - Create new game from map
- `joinGame(id, code, password?)` - Join existing game
- `startGame(id)` - Start game (host only)
- `pauseGame(id)` - Pause game (host only)
- `stopGame(id)` - Stop and cleanup game (host only)
- `takeOverCharacter(gameId, characterId)` - Take control
- `relinquishCharacter(gameId)` - Release control

### Asset API (`@/api/assets.ts`)
- `getAssetById(id)` - Get asset metadata (storageKeyPrefix)
- `getAssetFile(prefix, filename)` - Load JSON files (map.json, definition.json, properties.json)
- `getAssetFileUrl(prefix, filename)` - Get image URLs for tiles/sprites

## Mipmap System

For smooth rendering at different zoom levels, the game uses mipmaps (pre-generated smaller versions of textures).

### Mipmap Levels
| Level | Size | Zoom Range | Suffix |
|-------|------|------------|--------|
| `full` | 128x128 | >= 0.6 | (none) |
| `mip64` | 64x64 | 0.3 - 0.6 | `-mip64` |
| `mip32` | 32x32 | < 0.3 | `-mip32` |

### Automatic Switching
When camera zoom changes (mouse wheel), the scene automatically switches all textures to the appropriate mipmap level:
- Terrain tiles (tracked in `terrainImages` Map)
- Path tiles (tracked in `pathImages` Map)
- Character sprites and animations (animations have mip-specific keys)

### Backend Generation
Mipmaps are auto-generated by `MipmapGeneratorScheduler` for all TILE and CHARACTER assets. On asset update, existing mipmaps are deleted so they regenerate with new content.

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `TILE_SIZE` | 128px | Pixel size of each map tile |
| `moveDebounceTime` | 200ms | Minimum time between move inputs |
| `moveDuration` | 150ms | Base character movement tween duration |
| `zoomDuration` | 300ms | Camera zoom tween duration |

## Movement Cost System

Characters move slower on difficult terrain based on the `movementCost` property of tiles and paths.

### How It Works
| Cost | Effect |
|------|--------|
| 1 | Normal speed (base duration) |
| 2 | 2x slower (movement + animation) |
| 3 | 3x slower |
| etc. | Multiplier effect |

### Implementation
1. **Frontend Animation Scaling:**
   - `getMovementCostAt(x, y)` looks up cost from terrain/path at destination
   - `adjustedDuration = moveDuration * movementCost`
   - `sprite.anims.timeScale = 1 / movementCost` slows animation frame rate

2. **Backend Path Execution:**
   - `GameScheduler` delays path steps by `200ms * movementCost`
   - `character.recordMove()` tracks last move time
   - Next step blocked until required delay has passed

### Tile Priority
- Ground path cost overrides terrain cost (roads are easier)
- Water path cost can block movement (rivers)
- Highest cost wins when multiple layers overlap

## Troubleshooting

### Character not moving after take-over
- Check that only ONE GameScene instance exists (React Strict Mode issue)
- Verify `controlledCharacterId` is set in the scene (not just React state)
- Check WebSocket is connected (green indicator)

### Multiple Phaser instances
- This was fixed by using `hasEverInitializedRef` that is never reset
- If you see multiple scene instances in logs, the ref guard is broken

### Zoom/pan not working
- Controlled mode: WASD moves character, NOT camera
- Uncontrolled mode: WASD pans camera
- Check `controlledCharacterId` value in scene

### Selection indicator not showing
- Indicator created in `create()`, positioned in `setControlledCharacter()`
- Check `selectionIndicator.setVisible(true)` is called
- Indicator follows character via separate tween in `animateCharacterMove()`

### Characters becoming invisible during zoom
- Fixed by backend-driven animation state - frontend no longer manages local animation state
- `setCharacterIdleTexture()` provides guaranteed fallback texture
- `sprite.setVisible(true)` is enforced after every mip level switch
- If character has no walk frames, idle animation/texture is shown during movement

### Characters stuck in walk animation
- For path moves: backend sends `CharacterIdleEvent` when path completes
- For manual moves: frontend auto-switches to idle after animation (if no active path)
- Check `charactersWithActivePath` Set is properly cleared on path cancel/complete
