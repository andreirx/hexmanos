# Hexmanos Engine - AI Instructions

<!-- BEGIN BEADS INTEGRATION -->
# Beads Workflow (Strict Enforcement)
1. **Source of Truth:** The `bd` database is the ONLY source of truth for work. Do NOT create Markdown plan files.
2. **Discovery:** Run `bd ready` to find unblocked work.
3. **Tracking:**
   - Run `bd create "Title" -t task` for new discovered work.
   - Run `bd update <id> --status in_progress` when starting.
   - Run `bd close <id>` when finished.
4. **Context:** If you need project context, read `AGENTS.md` and the `docs/` folder.
<!-- END BEADS INTEGRATION -->

# Architecture Standards (Immutable)

## 1. Global Pattern: The Pointer Pattern
- **S3 (MinIO/AWS):** Stores ALL heavy assets (PNGs, JSON definitions).
- **Postgres:** Stores ONLY metadata and pointers (S3 Keys, Owner IDs, Status).
- **No Blobs in DB:** Never store JSON payloads or Images in Postgres columns.
- **Reference:** Entities store a `s3Key` string, not the file content.

## 2. Backend Architecture (Spring Boot + Java 17)
We follow a strict **Clean Architecture** separating `App` (Driver), `Core` (Domain), and `External` (Driven).

### Package Structure
**Group:** `com.hexmanos.engine`

#### A. `backend.app` (The Driver / Framework Layer)
*   **Purpose:** Bootstrapping, Controllers, DTOs, Configuration.
*   **Packages:**
    *   `config`: Spring `@Configuration` classes.
        *   `core`: Manual wiring of Core Services (e.g., `AssetConfig`).
        *   `web`: CORS, MVC settings.
        *   `security`: OAuth2 Resource Server config.
    *   `controllers`: REST endpoints.
    *   `dtos`: Request/Response records.
    *   `schedulers`: Spring `@Scheduled` tasks.
*   **Rules:**
    *   Controllers talk ONLY to `Core` Services.
    *   Controllers map DTOs <-> Core POJOs.

#### B. `backend.core` (The Domain Layer)
*   **Purpose:** Pure Business Logic. **NO Spring Annotations** (except maybe `@Transactional` if strictly needed, but prefer avoiding).
*   **Structure:** One package per Domain Object (e.g., `asset`, `game`, `player`).
*   **Contents per Package:**
    *   **POJO:** The domain object (e.g., `Asset`). Contains logic & Enums.
    *   **Service:** The business logic (e.g., `AssetService`).
    *   **Repository Port:** Interface (e.g., `AssetRepository`).
*   **Rules:**
    *   POJOs are pure Java.
    *   Services are instantiated via `backend.app.config.core`.

#### C. `backend.external` (The Adapters Layer)
*   **Purpose:** Implementation of Ports (DB, S3, AI).
*   **Structure:** One package per Domain Object or External System.
*   **Contents (e.g., `db.asset`):**
    *   **Entity:** JPA `@Entity` (e.g., `AssetEntity`).
    *   **Mapper:** Static methods/MapStruct inside Entity to convert POJO <-> Entity.
    *   **JpaRepository:** Spring Data interface (extends `JpaRepository`).
    *   **Adapter:** Implements `Core.AssetRepository`. Uses `JpaRepository`.
*   **Rules:**
    *   The `Core` never sees `JPA` annotations.
    *   Adapter handles the "Deep vs Shallow" mapping logic.

## 3. Frontend Architecture (React 19 + Tailwind 4)
*   **Stack:** React 19, TypeScript, Vite, Tailwind 4 (CSS-native).
*   **Structure:**
    *   `src/api`: Axios clients typed with Backend DTOs.
    *   `src/components`: Reusable UI (Atomic design).
    *   `src/features`: Feature-based grouping (e.g., `editor`, `lobby`).
    *   `src/context`: Global state (Auth, Theme).
    *   `src/pages`: Route roots.
*   **Pixel Art Rule:** All canvas operations must use `image-rendering: pixelated`.

## 4. Deployment & Infrastructure
*   **Hybrid Host:**
    *   **M1 Max:** Runs Spring Boot API + WebSockets.
    *   **Cloudflare Tunnel:** Exposes localhost to public internet.
*   **AWS Services:**
    *   **Cognito:** Auth Provider (Backend validates JWT).
    *   **S3:** File Storage.

# Landing the Plane (Session Completion)
**When ending a work session:**
1.  **File issues** for remaining work using `bd create`.
2.  **Run quality gates** (Tests, Build).
3.  **Update issue status** (`bd close`).
4.  **PUSH TO REMOTE**:
    ```bash
    git pull --rebase
    bd sync
    git push
    ```
