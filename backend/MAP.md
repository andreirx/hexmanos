# Backend Map: Spring Boot API

Spring Boot 3.4.1 REST API following Clean Architecture (Hexagonal). Java 17 with Gradle build system.

## Architecture Principle: Backend is Single Source of Truth

**For game state, the backend is AUTHORITATIVE.** The frontend is a renderer.

- Backend owns: character positions, animation states, health, paths, control, game status
- Frontend owns: mipmap/zoom selection, visual effects, UI state (display concerns only)
- WebSocket events include animation state - frontend renders what backend says
- This prevents desync bugs during frontend-only operations like zoom changes

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `src/` | Directory | Source code and resources |
| `build/` | Directory | Gradle build output (gitignored) |
| `gradle/` | Directory | Gradle wrapper files |
| `build.gradle` | File | Gradle build configuration |
| `settings.gradle` | File | Gradle project settings |
| `gradlew` | File | Gradle wrapper script (Unix) |
| `gradlew.bat` | File | Gradle wrapper script (Windows) |
| `local.env` | File | Local environment variables |

## Source Structure

```
src/main/java/com/hexmanos/engine/
├── HexmanosEngineApplication.java    # Spring Boot entry point
├── app/                              # Driver Layer (Framework)
│   ├── config/
│   │   ├── core/                     # Bean wiring for domain services
│   │   └── security/                 # OAuth2 + CORS configuration
│   ├── controllers/                  # REST endpoints
│   ├── dtos/                         # Request/Response objects
│   └── schedulers/                   # Background jobs
├── core/                             # Domain Layer (Pure Java)
│   ├── asset/                        # Asset domain
│   ├── files/                        # File storage port
│   ├── game/                         # Game engine domain
│   ├── transition/                   # Tile transition logic
│   └── user/                         # User domain
└── external/                         # Adapter Layer
    ├── files/storage/                # S3 and local file adapters
    └── postgres/                     # Database adapters
        ├── asset/                    # Asset entity + repository
        ├── game/                     # Game entity + repository
        └── user/                     # User entity + repository
```

See [src/MAP.md](src/MAP.md) for detailed source documentation.

## Clean Architecture Layers

### App Layer (Driver)
Framework-specific code. Contains Spring annotations.

| Package | Contents |
|---------|----------|
| `config.core` | `@Bean` definitions wiring Core services |
| `config.security` | OAuth2 Resource Server, CORS, JWT validation |
| `config.websocket` | STOMP/WebSocket configuration, JWT authentication |
| `controllers` | `@RestController` REST endpoints, `@MessageMapping` WebSocket handlers |
| `dtos` | Record classes for API request/response |
| `schedulers` | `@Scheduled` background jobs |

### Core Layer (Domain)
Pure Java business logic. No Spring dependencies.

| Package | Contents |
|---------|----------|
| `asset` | Asset POJO, AssetService, AssetRepository interface |
| `files` | FileStorageService interface, PresignedUploadUrl |
| `game` | Game, GamePlayer, GameCharacter, GameState POJOs, GameService, GameRoomManager, SnapshotService |
| `mipmap` | MipmapGeneratorService for zoom-quality image variants |
| `transition` | TransitionGeneratorService for tile blending |
| `user` | User POJO, UserService, UserRepository interface |

### External Layer (Adapters)
Infrastructure implementations.

| Package | Contents |
|---------|----------|
| `files.storage` | LocalFileStorageService, S3FileStorageService |
| `postgres.asset` | AssetEntity, AssetDB, PostgresAssetRepository |
| `postgres.game` | GameEntity, GamePlayerEntity, GameDB, GamePlayerDB, Postgres adapters |
| `postgres.user` | UserEntity, UserDB, PostgresUserRepository |

## Key Files

### Entry Point
- `HexmanosEngineApplication.java` - `@SpringBootApplication` with `@EnableScheduling`

### Controllers
- `AssetController.java` - Asset CRUD, moderation, presigned URLs, file serving
- `GameController.java` - Game lifecycle, player management, character control
- `UserController.java` - User sync from Cognito

### Services
- `AssetService.java` - Asset registration, validation, approval, rejection, archival
- `GameService.java` - Game lifecycle orchestration
- `GameRoomManager.java` - In-memory game state management
- `SnapshotService.java` - Game state persistence
- `TransitionGeneratorService.java` - Auto-generate tile transitions
- `UserService.java` - User management

### Repository Pattern
Each domain has:
1. **Port** (Core): `{Domain}Repository.java` - interface returning POJOs
2. **Spring Data** (External): `{Domain}DB.java` - `JpaRepository<Entity, UUID>`
3. **Adapter** (External): `Postgres{Domain}Repository.java` - implements port

## Resources

```
src/main/resources/
├── application.properties           # Default config
├── application-local.properties     # Local dev profile
├── application-m1max.properties     # M1 Max server profile
└── db/migration/                    # Flyway SQL migrations
    ├── V1__init_schema.sql
    ├── V20260116113411__seed_sample_assets.sql
    ├── V20260116160205__create_users_table.sql
    ├── V20260118070552__add_moderation_notes_to_assets.sql
    └── V20260118120000__create_game_tables.sql
```

## Profiles

| Profile | Database | Storage | Security |
|---------|----------|---------|----------|
| `local` | localhost:5433/hexmanos | ~/hexmanos_uploads | Disabled |
| `m1max` | localhost:5433/hexmanos | AWS S3 | Enabled |

## API Endpoints

### Assets
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/assets` | `getAllAssets()` | List all assets |
| GET | `/api/assets/{id}` | `getAssetById()` | Get single asset |
| GET | `/api/assets/type/{type}` | `getAssetsByType()` | Filter by type |
| GET | `/api/assets/status/{status}` | `getAssetsByStatus()` | Filter by status |
| POST | `/api/assets` | `createAsset()` | Create asset |
| POST | `/api/assets/register` | `registerAsset()` | Register with file validation |
| POST | `/api/assets/presigned-url` | `getPresignedUrls()` | Get upload URL |
| GET | `/api/assets/files/**` | `serveAssetFile()` | Serve asset files |
| POST | `/api/assets/upload` | `uploadFile()` | Direct upload |
| GET | `/api/assets/verify/**` | `verifyFileExists()` | Check file exists |

### Asset Moderation (Admin)
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/assets/{id}/approve` | `approveAsset()` | Approve asset (with optional notes) |
| POST | `/api/assets/{id}/reject` | `rejectAsset()` | Reject asset (with notes) |
| POST | `/api/assets/{id}/archive` | `archiveAsset()` | Archive asset (with optional notes) |

### Users
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/users/sync` | `syncUser()` |

### Games
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/games` | `createGame()` | Create new game |
| GET | `/api/games` | `getMyGames()` | List my games |
| GET | `/api/games/{id}` | `getGame()` | Get game details |
| POST | `/api/games/{id}/start` | `startGame()` | Start game |
| POST | `/api/games/{id}/pause` | `pauseGame()` | Pause game |
| POST | `/api/games/{id}/stop` | `stopGame()` | Stop game |
| POST | `/api/games/{id}/join` | `joinGame()` | Join game with code |
| POST | `/api/games/{id}/leave` | `leaveGame()` | Leave game |
| POST | `/api/games/{id}/characters/{charId}/take-over` | `takeOverCharacter()` | Control character |
| POST | `/api/games/{id}/characters/relinquish` | `relinquishCharacter()` | Release character |

## Asset Status Workflow

```
PENDING ──approve──> APPROVED ──archive──> ARCHIVED
    │
    └──reject───> REJECTED
```

## Game Status Workflow

```
WAITING ──start──> RUNNING ──pause──> PAUSED
    │                  │                 │
    │                  │                 └──start──> RUNNING
    │                  │
    └─────────────> FINISHED <──stop────┘
```

Game features:
- **Single map per game** with characters from map placements
- **Invite-only access** with join code and optional password
- **Player-character disconnection** - take over/relinquish control
- **Autonomous execution** - game runs even without players
- **2-day inactivity timeout** - games auto-cleanup
- **Periodic snapshots** - game state persisted for crash recovery

## Running

```bash
# Development (local profile)
./gradlew bootRun --args='--spring.profiles.active=local'

# Production (m1max profile)
./gradlew bootRun --args='--spring.profiles.active=m1max'

# Build JAR
./gradlew build

# Run tests
./gradlew test
```

## WebSocket / Real-Time API

STOMP over SockJS for real-time game state synchronization.

### Endpoint

| Path | Transport | Purpose |
|------|-----------|---------|
| `/ws/game` | SockJS (with WebSocket fallback) | Game real-time communication |

### Authentication

JWT token validated during STOMP CONNECT:
1. Client includes `Authorization: Bearer <token>` header in CONNECT frame
2. `JwtChannelInterceptor` extracts and validates token using Spring's `JwtDecoder`
3. Creates `WebSocketPrincipal` with user's Cognito `sub` claim
4. Invalid/missing token = connection rejected

### Message Mappings (GameWebSocketController)

| Destination | Payload | Response | Description |
|-------------|---------|----------|-------------|
| `/app/game/{gameId}/move` | `{ direction: "n"/"s"/"e"/"w" }` | Broadcast `CharacterMoveEvent` | Move controlled character |
| `/app/game/{gameId}/idle` | `{}` | - | Mark character as idle |

### Subscriptions

| Topic | Content | Purpose |
|-------|---------|---------|
| `/topic/game/{gameId}` | `CharacterMoveEvent` | All game events broadcast to players |
| `/user/queue/errors` | `{ message: string }` | User-specific error messages |

### CharacterMoveEvent

```json
{
  "characterId": "uuid",
  "x": 5,
  "y": 10,
  "direction": "n",
  "state": "walk_up",
  "duration": 200
}
```

- **state**: Animation state to render (walk_up, walk_down, walk_left, walk_right)
- **duration**: Move duration in ms (BASE_MOVE_DELAY_MS × movementCost). Backend is Single Source of Truth for timing.

### Movement Flow

1. Client sends move request to `/app/game/{gameId}/move`
2. Controller extracts player ID from Principal
3. `GameService.moveCharacter()` validates and executes move
4. On success: broadcasts `CharacterMoveEvent` to `/topic/game/{gameId}`
5. On failure: sends error to `/user/queue/errors`

See [app/config/websocket/MAP.md](src/main/java/com/hexmanos/engine/app/config/websocket/MAP.md) for configuration details.

## Dependencies

Key dependencies from `build.gradle`:
- Spring Boot Starter Web
- Spring Boot Starter Data JPA
- Spring Boot Starter Security
- Spring Boot Starter OAuth2 Resource Server
- Spring Boot Starter WebSocket
- PostgreSQL Driver
- AWS SDK for S3
- Flyway Migration
- Lombok
