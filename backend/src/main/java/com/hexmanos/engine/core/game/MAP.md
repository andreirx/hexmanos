# Core Game Domain

Pure Java game engine domain layer. No Spring dependencies.

## Files

| File | Purpose |
|------|---------|
| `Game.java` | Game POJO with status enum (WAITING/RUNNING/PAUSED/FINISHED), join code, password hash, snapshot key |
| `GamePlayer.java` | Player-game association with role (HOST/PLAYER/OBSERVER) and controlled character tracking |
| `GameCharacter.java` | In-memory character state - position, health, visual state, animation state |
| `GameState.java` | Complete runtime game state with serialization for snapshots |
| `GameRepository.java` | Port interface for Game persistence |
| `GamePlayerRepository.java` | Port interface for GamePlayer persistence |
| `GameService.java` | Main orchestrator - game lifecycle, player management, character control |
| `GameRoomManager.java` | In-memory state manager - loads/unloads games, handles ticks and character control |
| `SnapshotService.java` | Persists GameState to FileStorageService (S3/local) |

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

### GameCharacter (In-Memory)
- **id**: UUID (generated at game start)
- **assetId**: Reference to CHARACTER asset
- **x, y**: Grid position
- **currentState**: Animation state (idle, walk_down, etc.)
- **visualState**: Health state (full, hurt_1, hurt_2, critical)
- **health/maxHealth**: HP tracking
- **controlled**: Whether a player is controlling

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
- `moveCharacter()` - Updates character position

### SnapshotService
- Saves to `game-snapshots/{gameId}/state.bin`
- Uses Java serialization for GameState
