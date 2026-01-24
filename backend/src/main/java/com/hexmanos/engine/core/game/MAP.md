# Core Game Domain

Pure Java game engine domain layer. No Spring dependencies.

## Architecture Principle: Backend is Single Source of Truth

**This package is the AUTHORITATIVE source for all game state.**

The frontend is a renderer that reflects what this package says. When in doubt:
- Backend decides character positions, states, paths, health
- Backend broadcasts state changes via WebSocket events
- Events include animation state (`state: "walk_up"`) - frontend doesn't decide this
- Frontend renders exactly what backend tells it

This prevents desync bugs, especially during frontend-only operations like zoom/mipmap changes.

## Files

| File | Purpose |
|------|---------|
| `Game.java` | Game POJO with status enum (WAITING/RUNNING/PAUSED/FINISHED), join code, password hash, snapshot key |
| `GamePlayer.java` | Player-game association with role (HOST/PLAYER/OBSERVER), controlled character, and **colorIndex** |
| `GameCharacter.java` | In-memory character state - position, health, visual state, animation state, **path state** |
| `GameState.java` | Complete runtime game state with serialization for snapshots, **terrainGrid** for pathfinding |
| `GameRepository.java` | Port interface for Game persistence |
| `GamePlayerRepository.java` | Port interface for GamePlayer persistence |
| `GameService.java` | Main orchestrator - game lifecycle, player management, character control, **pathfinding**, **MoveResult with animation state** |
| `GameRoomManager.java` | In-memory state manager - loads/unloads games, handles ticks and character control, **path execution** |
| `SnapshotService.java` | Persists GameState to FileStorageService (S3/local) |
| `Point.java` | Simple coordinate record for pathfinding with manhattanDistance |
| `TerrainGrid.java` | Grid of movement costs parsed from map JSON and tile properties |
| `Pathfinder.java` | A* pathfinding algorithm implementation |

## Domain Model

### Game
- **id**: UUID
- **name**: Display name
- **hostPlayerId**: UUID of creator
- **mapAssetId**: Reference to MAP asset
- **status**: WAITING → RUNNING ↔ PAUSED → FINISHED
- **joinCode**: 6-char alphanumeric for invites
- **passwordHash**: Optional BCrypt hash
- **snapshotStorageKey**: Path to latest snapshot

### GamePlayer
- **id**: UUID
- **gameId**: Reference to game
- **playerId**: Internal user UUID (from Cognito sync)
- **role**: HOST, PLAYER, or OBSERVER
- **controlledCharacterId**: Currently controlled character (nullable)
- **colorIndex**: Player color (0-7), assigned on join, host gets 0

### GameCharacter (In-Memory)
- **id**: UUID (generated at game start)
- **assetId**: Reference to CHARACTER asset
- **x, y**: Grid position
- **currentState**: Animation state (idle, walk_down, etc.)
- **visualState**: Health state (full, hurt_1, hurt_2, critical)
- **health/maxHealth**: HP tracking
- **controlled**: Whether a player is controlling
- **currentPath**: List of Points for auto-movement (transient)
- **pathIndex**: Current position in path (transient)

### GameState (In-Memory)
- **gameId**: Reference to game
- **tick**: Game tick counter
- **mapDataJson**: Serialized map data
- **characters**: List of GameCharacter
- **characterControl**: Map of characterId → playerId

## Key Behaviors

### GameService
- `createGame()` - Creates WAITING game with join code
- `startGame()` - Loads map, extracts characters, sets RUNNING
- `pauseGame()` - Saves snapshot, sets PAUSED
- `stopGame()` - Unloads, deletes snapshots, removes game
- `joinGame()` - Validates code/password, creates GamePlayer
- `takeOverCharacter()` - Assigns character control to player
- `relinquishCharacter()` - Releases character control

### GameRoomManager
- `loadGame()` - Initializes GameState in memory
- `tick()` - Advances game state (autonomous behavior)
- `takeControl()` / `relinquishControl()` - Character assignment
- `moveCharacter()` - Updates character position (validates terrain passability)
- `requestPath()` - Computes A* path and stores in character
- `executePathStep()` - Moves character one step along path
- `cancelPath()` - Clears character's current path

### SnapshotService
- Saves to `game-snapshots/{gameId}/state.bin`
- Uses Java serialization for GameState

## Pathfinding

### TerrainGrid
- Created from map JSON + tile properties
- Movement cost per cell (0 = impassable, 1+ = passable)
- Loads `passable` and `movementCost` from each tile's `properties.json`
- Water tiles marked impassable in properties are blocked
- Ground paths (roads) can override terrain cost

### Pathfinder (A*)
- Manhattan distance heuristic
- Respects terrain costs and character obstacles
- Returns list of Points from start to target (exclusive of start)
- Empty list means no path found

### Path Execution (GameScheduler)
- Runs every 200ms via `@Scheduled(fixedDelay = 200)`
- Iterates all active games and characters with paths
- Calls `GameService.executePathStep()` for each
- Broadcasts `CharacterMoveEvent` via WebSocket (includes animation `state` from character)
- On path completion: broadcasts `CharacterIdleEvent` so frontend switches to idle animation
- Clears path on collision or terrain change

## WebSocket Events (Backend-Driven Animation State)

The backend is AUTHORITATIVE for character animation state. Frontend renders exactly what backend tells it.

### CharacterMoveEvent
```java
record CharacterMoveEvent(
    String characterId,
    int x, int y,
    String direction,  // n, s, e, w
    String state       // walk_up, walk_down, walk_left, walk_right (from GameCharacter.currentState)
)
```

### CharacterIdleEvent
```java
record CharacterIdleEvent(
    String characterId,
    String state       // Always "idle" - sent when path completes
)
```

This architecture prevents animation state getting out of sync during zoom level changes on the frontend.

### Frontend's Local Truth Mirror
The frontend maintains a `characterStates` Map that tracks what the backend told it - NOT what
the sprite is visually showing. This is critical because:
- When a character has no walk animation, the sprite shows idle as a visual fallback
- But the mirror remembers: "this character is actually WALKING"
- When zooming (switching mipmaps), frontend asks the MIRROR what state to render
- This prevents the bug where zooming makes characters "forget" they were walking

## Tile Properties Loading

On game start, `loadTileMovementCosts()`:
1. Extracts all unique tile/path asset IDs from map JSON
2. Loads `properties.json` for each from S3/storage
3. Reads `passable` (boolean, default true) and `movementCost` (int, default 1)
4. If `passable=false`, cost is 0 (impassable)
5. Returns Map<assetId, cost> for TerrainGrid initialization
