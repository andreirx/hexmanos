# Backend Architecture (Spring Boot + Java 17 + Gradle)

Strict **Clean Architecture** separating `App` (Driver), `Core` (Domain), and `External` (Driven).

## Package Structure

**Group:** `com.hexmanos.engine`

### `backend.app` (The Driver / Framework Layer)
- **Purpose:** Bootstrapping, Controllers, DTOs, Configuration.
- **Packages:**
  - `config.core`: Manual wiring of Core Services (e.g., `AssetConfig`).
  - `config.web`: CORS, MVC settings.
  - `config.security`: OAuth2 Resource Server config.
  - `controllers`: REST endpoints.
  - `dtos`: Request/Response records.
  - `schedulers`: Spring `@Scheduled` tasks.
- **Rules:** Controllers talk ONLY to Core Services. Controllers map DTOs <-> Core POJOs.

### `backend.core` (The Domain Layer)
- **Purpose:** Pure Business Logic. **NO Spring Annotations.**
- **Structure:** One package per Domain Object (e.g., `asset`, `game`, `player`).
- **Contents per Package:** POJO (domain object), Service (business logic), Repository Port (interface).
- **Rules:** POJOs are pure Java. Services instantiated via `backend.app.config.core`.

### `backend.external` (The Adapters Layer)
- **Purpose:** Implementation of Ports (DB, S3, AI).
- **Structure:** One package per Domain Object or External System.
- **Contents (e.g., `db.asset`):** Entity (JPA), Mapper (static methods), JpaRepository, Adapter.
- **Rules:** Core never sees JPA annotations. Adapter handles mapping logic.

## Persistence Pattern (3-Part, Strict)

Data access MUST follow this pattern to decouple Domain from Hibernate:

**1. Port (Core Layer):** `core.{feature}.{Feature}Repository.java`
- Interface returning POJOs, NOT Entities.

**2. Spring Data Interface (External):** `external.postgres.{feature}.{Feature}DB.java`
- `interface extends JpaRepository<{Feature}Entity, ID>` with `@Repository`.

**3. Adapter (External):** `external.postgres.{feature}.Postgres{Feature}Repository.java`
- `class implements {Feature}Repository`, injects `{Feature}DB`, maps via Entity's inner mapper.

## Entity Rules
- Every `@Entity` MUST contain `public interface EntityMapper` with static `fromEntity`/`toEntity`.
- Entities are dumb data containers with JPA annotations only.

## Service Rules
- No `@Service` annotation. Wired in `app.config.core.{Feature}Config.java` via `@Bean`.
- ALL validation and business rules live in services.

## Common Pitfalls
- `{Feature}DB` extends `JpaRepository<{Feature}Entity, ID>` - NEVER use the Core POJO.
- Be careful with `Asset` vs `AssetEntity` imports.

## Flyway Migrations
- **Format:** `V{YYYYMMDDHHMMSS}__{Description}.sql` (timestamp-based).
- **Location:** `backend/src/main/resources/db/migration/`
- No `CREATE EXTENSION`. No `IF NOT EXISTS`. Never edit committed migrations.

## Naming Strategy
- No `@Column(name=...)` or `@Table(name=...)` - rely on `SpringPhysicalNamingStrategy`.
- Java `camelCase` -> SQL `snake_case` automatically.
- Avoid acronym prefixes (e.g., use `storageKey` not `s3Key`).
