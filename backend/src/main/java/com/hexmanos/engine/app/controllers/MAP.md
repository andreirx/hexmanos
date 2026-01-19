# Controllers

REST and WebSocket controllers for the Hexmanos API.

## Files

| File | Purpose |
|------|---------|
| `AssetController.java` | CRUD operations for assets (tiles, characters, objects, maps) |
| `GameController.java` | Game lifecycle management (create, join, start, stop) |
| `GameWebSocketController.java` | Real-time game commands via WebSocket |
| `MapController.java` | Map validation endpoint |
| `UserController.java` | User profile operations |

## GameController (REST)

Manages game lifecycle via REST API.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/games` | Create new game |
| GET | `/api/games` | List user's games (created or joined) |
| GET | `/api/games/{id}` | Get game details with players and characters |
| POST | `/api/games/{id}/start` | Start game (host only) |
| POST | `/api/games/{id}/pause` | Pause game (host only) |
| POST | `/api/games/{id}/stop` | Stop and cleanup game (host only) |
| POST | `/api/games/{id}/join` | Join game with code/password |
| POST | `/api/games/{id}/leave` | Leave game |
| POST | `/api/games/{id}/characters/{charId}/take-over` | Take control of character |
| POST | `/api/games/{id}/characters/relinquish` | Release character control |

### Authentication

All endpoints require valid JWT token in `Authorization` header.
User ID extracted from token's `sub` claim.

## GameWebSocketController (STOMP)

Handles real-time game commands over WebSocket.

### Message Mappings

| Destination | Payload | Purpose |
|-------------|---------|---------|
| `/app/game/{gameId}/move` | `MoveRequest` | Move controlled character |
| `/app/game/{gameId}/idle` | - | Mark character as idle |

### MoveRequest

```java
record MoveRequest(String direction) {}
// direction: "n", "s", "e", "w"
```

### Broadcast Events

Broadcasts to `/topic/game/{gameId}`:

**CharacterMoveEvent:**
```java
record CharacterMoveEvent(
    UUID characterId,
    int x,
    int y,
    String direction
) {}
```

### Error Handling

Errors sent to `/user/queue/errors`:
```java
record GameError(String message) {}
```

Error scenarios:
- Player not in game
- Player doesn't control any character
- Invalid move (blocked tile, out of bounds)
- Character at destination

### Flow

1. Client sends move to `/app/game/{gameId}/move`
2. Controller validates player owns a character in this game
3. Calls `GameService.moveCharacter()` for business logic
4. On success: broadcasts `CharacterMoveEvent` to all players
5. On failure: sends error to requesting user only

## AssetController (REST)

Full CRUD for game assets with S3 storage.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/assets` | List assets (optional type filter) |
| GET | `/api/assets/{id}` | Get asset by ID |
| GET | `/api/assets/my` | List current user's assets |
| POST | `/api/assets` | Create new asset |
| PUT | `/api/assets/{id}` | Update asset (owner only) |
| DELETE | `/api/assets/{id}` | Delete asset (owner only) |
| POST | `/api/assets/{id}/files/{filename}` | Upload asset file to S3 |
| POST | `/api/assets/{id}/submit` | Submit for review |
| POST | `/api/assets/{id}/approve` | Approve asset (admin) |
| POST | `/api/assets/{id}/reject` | Reject asset (admin) |

### Asset Types

- `TILE` - Terrain and path tiles
- `CHARACTER` - Playable characters
- `OBJECT` - Non-playable objects (NPCs, items)
- `MAP` - Game maps

## MapController (REST)

Map validation utilities.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/maps/validate` | Validate map structure |

Validates:
- All referenced tile assets exist
- All referenced character assets exist
- Map dimensions are valid
- Required layers present

## UserController (REST)

User profile management.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/users/me` | Get current user profile |
| PUT | `/api/users/me` | Update profile |

## Security

All controllers protected by Spring Security OAuth2 Resource Server.
JWT tokens validated against AWS Cognito.
User ID available via `@AuthenticationPrincipal Jwt jwt` or `Principal`.
