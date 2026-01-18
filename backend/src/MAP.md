# Backend Source Map

Java source code organized by Clean Architecture layers.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `main/` | Directory | Application source code |
| `test/` | Directory | Test source code (if present) |

## main/java/com/hexmanos/engine/

### Entry Point

| File | Purpose |
|------|---------|
| `HexmanosEngineApplication.java` | Spring Boot main class with `@EnableScheduling` |

### app/ - Driver Layer

Framework-specific code with Spring annotations.

| Directory | Purpose |
|-----------|---------|
| `config/core/` | Bean definitions for Core services |
| `config/security/` | Security configuration |
| `controllers/` | REST API endpoints |
| `dtos/` | Data transfer objects |
| `schedulers/` | Background job definitions |

#### config/core/
| File | Purpose |
|------|---------|
| `AssetConfig.java` | Wires `AssetService` bean |
| `FileStorageConfig.java` | Wires file storage service bean |
| `TransitionConfig.java` | Wires `TransitionGeneratorService` bean |
| `UserConfig.java` | Wires `UserService` bean |

#### config/security/
| File | Purpose |
|------|---------|
| `SecurityConfig.java` | OAuth2 Resource Server, CORS, JWT multi-issuer decoder |

#### controllers/
| File | Purpose |
|------|---------|
| `AssetController.java` | `/api/assets/*` endpoints for asset management and moderation |
| `UserController.java` | `/api/users/*` endpoints for user sync |

#### dtos/
| File | Purpose |
|------|---------|
| `AssetDTO.java` | Asset data for API responses (includes moderationNotes) |
| `UserDTO.java` | User data for API responses |
| `RegisterAssetRequest.java` | Request body for asset registration |
| `RegisterAssetResponse.java` | Response for asset registration |
| `PresignedUrlRequest.java` | Request for presigned upload URLs |
| `PresignedUrlResponse.java` | Response with presigned URLs |
| `UploadResponse.java` | Response for direct file upload |
| `ModerationRequest.java` | Request body for moderation actions (notes field) |

#### schedulers/
| File | Purpose |
|------|---------|
| `TransitionGeneratorScheduler.java` | Periodic tile transition generation |
| `TransitionRegenerationStartup.java` | Regenerate transitions on startup |

### core/ - Domain Layer

Pure Java business logic. No Spring annotations.

| Directory | Purpose |
|-----------|---------|
| `asset/` | Asset domain model and logic |
| `files/` | File storage abstraction |
| `transition/` | Tile transition generation |
| `user/` | User domain model and logic |

#### asset/
| File | Purpose |
|------|---------|
| `Asset.java` | Domain POJO with `AssetType` and `AssetStatus` enums |
| `AssetService.java` | Business logic: create, register, approve, reject, archive |
| `AssetRepository.java` | Port interface for persistence |

**Asset.AssetType enum**: `CHARACTER`, `TILE`, `MAP`

**Asset.AssetStatus enum**: `PENDING`, `APPROVED`, `REJECTED`, `ARCHIVED`

**Asset fields**:
- `id` (UUID)
- `type` (AssetType)
- `name` (String)
- `authorId` (String)
- `status` (AssetStatus)
- `storageKeyPrefix` (String)
- `createdAt` (LocalDateTime)
- `moderationNotes` (String) - Admin comments on approval/rejection

#### files/
| File | Purpose |
|------|---------|
| `FileStorageService.java` | Port interface for file operations |
| `PresignedUploadUrl.java` | Value object for presigned URL data |

#### transition/
| File | Purpose |
|------|---------|
| `TransitionGeneratorService.java` | Generates transition tiles between types |

#### user/
| File | Purpose |
|------|---------|
| `User.java` | Domain POJO for user data |
| `UserService.java` | Business logic for user management |
| `UserRepository.java` | Port interface for persistence |

### external/ - Adapter Layer

Infrastructure implementations.

| Directory | Purpose |
|-----------|---------|
| `files/storage/` | File storage adapters |
| `postgres/` | Database adapters |

#### files/storage/
| File | Purpose |
|------|---------|
| `LocalFileStorageService.java` | Stores files to local disk (`~/hexmanos_uploads`) |
| `S3FileStorageService.java` | Stores files to AWS S3 with presigned URLs |

#### postgres/asset/
| File | Purpose |
|------|---------|
| `AssetEntity.java` | JPA `@Entity` with `EntityMapper` inner interface |
| `AssetDB.java` | Spring Data `JpaRepository<AssetEntity, UUID>` |
| `PostgresAssetRepository.java` | Implements `AssetRepository` port |

#### postgres/user/
| File | Purpose |
|------|---------|
| `UserEntity.java` | JPA `@Entity` with `EntityMapper` |
| `UserDB.java` | Spring Data `JpaRepository<UserEntity, UUID>` |
| `PostgresUserRepository.java` | Implements `UserRepository` port |

## main/resources/

| Item | Purpose |
|------|---------|
| `application.properties` | Default configuration |
| `application-local.properties` | Local development profile |
| `application-m1max.properties` | M1 Max server profile |
| `db/migration/` | Flyway SQL migrations |

### db/migration/
| File | Purpose |
|------|---------|
| `V1__init_schema.sql` | Initial database schema |
| `V20260116113411__seed_sample_assets.sql` | Sample asset data |
| `V20260116160205__create_users_table.sql` | User table creation |
| `V20260118070552__add_moderation_notes_to_assets.sql` | Add moderation_notes column |

## Architecture Rules

1. **Core never imports from App or External**
2. **App imports from Core only (not External)**
3. **External implements Core interfaces**
4. **DTOs stay in App layer, never leak to Core**
5. **Entities stay in External layer, mapped to POJOs**
