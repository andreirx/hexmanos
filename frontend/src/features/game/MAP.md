# Game Feature

Multiplayer game lobby and Phaser-based game client with real-time WebSocket sync.

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

### Selection Indicator
- Soft glowing green disc rendered under the controlled character
- Multiple concentric semi-transparent circles for glow effect
- Colors: `0x00ff88` and `0x00ffaa` with varying alpha (0.1 to 0.3)
- Radius based on TILE_SIZE (0.6x to 1.4x)
- Moves with character during animations

### Camera System
- **No character controlled:** WASD/arrows pan the camera, zoom 0.25x, centered on map
- **Character controlled:** WASD/arrows send move commands, zoom 1x, camera follows character
- Mouse wheel zoom (0.1x to 2x range)
- Animated zoom transitions (300ms, Cubic.easeOut easing)

### Movement System

**Input Handling:**
- Keyboard checked in `update()` loop (60 FPS)
- Direction priority: up > down > left > right
- Debounce: 200ms between move inputs
- Movement blocked while character is animating

**Animation (CRITICAL - DO NOT REMOVE):**
- `animateCharacterMove(characterId, newX, newY)` - Called on WebSocket event
- Phaser tweens move sprites over 150ms (Linear easing)
- `movingCharacters` Set tracks animating characters to prevent double-moves
- Selection indicator tweens in sync with character sprite
- Character data updated in `onComplete` callback

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
| Receive | `/topic/game/{gameId}` | `CharacterMoveEvent` | Character position update |

### CharacterMoveEvent
```typescript
{
  characterId: string
  x: number
  y: number
  direction: string
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

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `TILE_SIZE` | 128px | Pixel size of each map tile |
| `moveDebounceTime` | 200ms | Minimum time between move inputs |
| `moveDuration` | 150ms | Character movement tween duration |
| `zoomDuration` | 300ms | Camera zoom tween duration |

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
