# Backend Map: Spring Boot API

Spring Boot 3.4.1 REST API following Clean Architecture (Hexagonal). Java 17 with Gradle build system.

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
│   ├── transition/                   # Tile transition logic
│   └── user/                         # User domain
└── external/                         # Adapter Layer
    ├── files/storage/                # S3 and local file adapters
    └── postgres/                     # Database adapters
        ├── asset/                    # Asset entity + repository
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
| `controllers` | `@RestController` REST endpoints |
| `dtos` | Record classes for API request/response |
| `schedulers` | `@Scheduled` background jobs |

### Core Layer (Domain)
Pure Java business logic. No Spring dependencies.

| Package | Contents |
|---------|----------|
| `asset` | Asset POJO, AssetService, AssetRepository interface |
| `files` | FileStorageService interface, PresignedUploadUrl |
| `transition` | TransitionGeneratorService for tile blending |
| `user` | User POJO, UserService, UserRepository interface |

### External Layer (Adapters)
Infrastructure implementations.

| Package | Contents |
|---------|----------|
| `files.storage` | LocalFileStorageService, S3FileStorageService |
| `postgres.asset` | AssetEntity, AssetDB, PostgresAssetRepository |
| `postgres.user` | UserEntity, UserDB, PostgresUserRepository |

## Key Files

### Entry Point
- `HexmanosEngineApplication.java` - `@SpringBootApplication` with `@EnableScheduling`

### Controllers
- `AssetController.java` - Asset CRUD, moderation, presigned URLs, file serving
- `UserController.java` - User sync from Cognito

### Services
- `AssetService.java` - Asset registration, validation, approval, rejection, archival
- `UserService.java` - User management
- `TransitionGeneratorService.java` - Auto-generate tile transitions

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
    └── V20260118070552__add_moderation_notes_to_assets.sql
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

## Asset Status Workflow

```
PENDING ──approve──> APPROVED ──archive──> ARCHIVED
    │
    └──reject───> REJECTED
```

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

## Dependencies

Key dependencies from `build.gradle`:
- Spring Boot Starter Web
- Spring Boot Starter Data JPA
- Spring Boot Starter Security
- Spring Boot Starter OAuth2 Resource Server
- PostgreSQL Driver
- AWS SDK for S3
- Flyway Migration
- Lombok
