# Hexmanos Engine - AI Instructions

<!-- BEGIN BEADS INTEGRATION -->
# Beads Workflow (Strict Enforcement)
1. **Source of Truth:** The `bd` database is the ONLY source of truth for work. Do NOT create Markdown plan files.
2. **Discovery:** Run `bd ready` to find unblocked work.
3. **Tracking:**
    - Run `bd create "Title" -t task` for new discovered work.
    - Run `bd update <id> --status in_progress` when starting.
    - Run `bd close <id>` when finished.
4. **Context:** If you need project context, read `AGENTS.md` and the `docs/` folder and the MAP.md files in every folder.
<!-- END BEADS INTEGRATION -->

# Architecture Standards (Immutable)

## 1. Global Pattern: The Pointer Pattern
- **S3 (MinIO/AWS):** Stores ALL heavy assets (PNGs, JSON definitions).
- **Postgres:** Stores ONLY metadata and pointers (S3 Keys, Owner IDs, Status).
- **No Blobs in DB:** Never store JSON payloads or Images in Postgres columns.
- **Reference:** Entities store a `s3Key` string, not the file content.

## 1.5. Game State Architecture: Backend as Single Source of Truth

**The backend is the AUTHORITATIVE source for all game state.** The frontend is a RENDERER that reflects backend state.

### What Backend Owns (Authoritative)
- **Character positions** (x, y coordinates)
- **Character states** (idle, walk_up, walk_down, walk_left, walk_right)
- **Character health, control assignments, paths**
- **Game status** (WAITING, RUNNING, PAUSED, FINISHED)
- **All gameplay logic** (movement validation, collision, pathfinding)

### What Frontend Owns (Display Concerns Only)
- **Mipmap selection** (which texture resolution based on zoom level)
- **Zoom level** (camera zoom 0.1x - 2x)
- **Animation rendering** (Phaser plays animations, but backend says WHICH animation)
- **Visual effects** (glows, selection indicators, particles)
- **UI state** (which panel is open, scroll position)

### The Contract
1. **Backend sends state changes via WebSocket events** (CharacterMoveEvent, CharacterIdleEvent)
2. **Events include the animation state** (`state: "walk_up"`) - frontend doesn't decide this
3. **Frontend renders exactly what backend tells it** - no local state management for game logic
4. **Frontend can cache/interpolate for smoothness** but must sync frequently to reset assumptions

### Why This Matters
- **Prevents desync bugs**: Frontend can't get out of sync if it doesn't manage state
- **Multiplayer-ready**: All clients see the same state because backend is authoritative
- **Zoom-safe**: Changing mip levels doesn't affect game state, only rendering
- **Debuggable**: Backend state is the truth, frontend is just a view

### Implementation Rules
```
Backend:
- CharacterMoveEvent includes { characterId, x, y, direction, state }
- CharacterIdleEvent sent when character should stop walking
- Game loop broadcasts all state changes

Frontend - LOCAL TRUTH MIRROR PATTERN:
- characterStates Map tracks backend's authoritative state (NOT the sprite's animation)
- animateCharacterMove() updates mirror FIRST, then renders with fallback
- setCharacterState() updates mirror AND renders (fallback if animation missing)
- switchMipLevel() reads from MIRROR to know the REAL state, not the sprite
- This prevents state desync when visual fallbacks are used (e.g., idle shown when walking)
```

### The State Desync Problem (and Solution)
**Problem:** When a character has no walk animation, we show idle as a visual fallback.
If we then zoom and ask the sprite "what animation are you playing?", it says "idle" -
but the character is actually WALKING. We've lost the real state.

**Solution:** The Local Truth Mirror (`characterStates` Map) preserves the backend's
authoritative state independently of what the sprite is visually showing. When we
switch mip levels, we consult the mirror, not the sprite.

## 2. Backend Architecture (Spring Boot + Java 17 + gradle)
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
*   **Database:** Native Local Postgres (db is named `hexmanos`). NO DOCKER.
*   **Storage Strategy:**
    *   `local` profile: Writes to `${user.home}/hexmanos_uploads`.
    *   `m1max` profile: Writes to AWS S3.
*   **Auth:** AWS Cognito (Tokens validated in backend via OAuth2 Resource Server).

# 5. Backend Coding Standards (The "Glam" Pattern)

We follow a strict **Hexagonal/Clean Architecture** adapted for Spring Boot.
**Package Group:** `com.hexmanos.engine`

### A. The Three Layers
1.  **`core` (The Domain)** - Pure Java. No Spring dependencies (except simple utils).
2.  **`external` (The Adapter)** - Infrastructure implementations (Postgres, S3, Email).
3.  **`app` (The Driver)** - Web, Config, DTOs.

### B. The Persistence Pattern (Strict)
Data access MUST follow this 3-part pattern to decouple Domain from Hibernate.

**1. The Port (Core Layer)**
*   **Location:** `core.{feature}.{Feature}Repository.java`
*   **Type:** `interface`
*   **Signature:** Returns **POJOs** (`Optional<Category>`), NOT Entities.
*   **Example:**
    ```java
    public interface CategoryRepository {
        List<Category> findAll();
        Optional<Category> findByName(String name);
        Category save(Category category);
    }
    ```

**2. The Spring Data Interface (External Layer)**
*   **Location:** `external.postgres.{feature}.{Feature}DB.java`
*   **Type:** `interface extends JpaRepository<Entity, Long>`
*   **Annotation:** `@Repository`
*   **Signature:** Returns **Entities**.
*   **Example:**
    ```java
    @Repository
    public interface CategoryDB extends JpaRepository<CategoryEntity, Long> {
        Optional<CategoryEntity> findByName(String name);
    }
    ```

**3. The Adapter Implementation (External Layer)**
*   **Location:** `external.postgres.{feature}.Postgres{Feature}Repository.java`
*   **Type:** `class implements {Feature}Repository`
*   **Annotation:** `@Component` (or `@Repository`)
*   **Logic:** Injects `{Feature}DB`. Maps Entities <-> POJOs using the Entity's inner mapper.
*   **Example:**
    ```java
    @Component
    @RequiredArgsConstructor
    public class PostgresCategoryRepository implements CategoryRepository {
        private final CategoryDB db; // The Spring Data Repo

        @Override
        public Optional<Category> findByName(String name) {
            return db.findByName(name).map(EntityMapper::fromEntity);
        }
    }
    ```

### C. Entity Rules (`external.postgres.{feature}`)
1.  **Inner Mapper:** Every `@Entity` class MUST contain a `public interface EntityMapper` with static `fromEntity` and `toEntity` methods.
2.  **No Logic:** Entities are dumb data containers with JPA annotations.

### D. Service Rules (`core.{feature}`)
1.  **No Spring Annotations:** Do NOT use `@Service`.
2.  **Wiring:** Services are instantiated in `app.config.core.{Feature}Config.java` using `@Bean`.
3.  **Business Logic:** ALL validation and business rules live here.

### E. Common Pitfalls (Critical)
1.  **Repository Generics:**
    *   `{Feature}DB` extends `JpaRepository<{Feature}Entity, ID>`.
    *   **NEVER** use the Core POJO in the `JpaRepository` generic type.
    *   *Bad:* `extends JpaRepository<Asset, UUID>`
    *   *Good:* `extends JpaRepository<AssetEntity, UUID>`
2.  **Imports:**
    *   Be extremely careful when importing names like `Asset` vs `AssetEntity`.
    *   Use full package names in static imports if ambiguous.

### F. Database Migrations (Flyway Rules)
1.  **Versioning Strategy:** Use **Timestamp-based** versioning to prevent collisions between AI agents or branches.
    *   **Format:** `V{YYYYMMDDHHMMSS}__{Description}.sql`
    *   *Example:* `V20260116103000__create_asset_table.sql`
2.  **Location:** `backend/src/main/resources/db/migration/`
3.  **Content Rules:**
    *   **No Extensions:** Avoid `CREATE EXTENSION` unless strictly necessary.
    *   **Portable Types:** Use standard SQL types where possible.
    *   **Idempotency:** Scripts should run exactly once. Do not use `IF NOT EXISTS` for table creation (Flyway handles the version tracking); if a table exists when it shouldn't, the state is dirty and should fail.
    *   **Immutable:** Never edit an existing `V` file after it has been committed/run. Create a new migration to fix mistakes.
4.  **Baseline:**
    *   If the database is fresh, start with the Init migration.
    *   If adopting an existing DB, use `V{timestamp}__baseline.sql` and set `spring.flyway.baseline-on-migrate=true`.

### G. Naming Strategy Rules (No Magic Strings)
1.  **No Manual Mapping:** Never use `@Column(name = "...")` or `@Table(name = "...")`.
    *   *Reason:* We rely on Spring Boot's default `SpringPhysicalNamingStrategy` (CamelCase -> snake_case).
2.  **Field Naming:** Java fields must be `camelCase`.
    *   *Example:* `storageKeyPrefix` (Java) -> `storage_key_prefix` (SQL).
3.  **Ambiguity:** Avoid variable names starting with numbers or acronyms that confuse the tokenizer (e.g., `s3Key` might map unpredictably). Use semantic names (`storageKey`).
4.  **SQL Migrations:** Must be written in `snake_case` to match the expected Hibernate output.

---

# 6. Frontend Coding Standards (React 19)

### A. Tech Stack
*   **Framework:** React 19 + Vite + TypeScript.
*   **Styling:** Tailwind 4. Use `@apply` sparingly; prefer utility classes.
*   **Networking:** Axios.
*   **State:** React Context API (for global auth/theme) + Local State.

### B. Directory Structure
```text
src/
├── api/              # Axios instances & DTO types
├── assets/           # Static images/fonts
├── components/       # Shared UI
│   ├── ui/           # Low-level primitives (Button, Input - Shadcn style)
│   ├── dialogs/      # Business logic dialogs (e.g., CreateAssetDialog)
│   └── layout/       # Sidebars, Headers
├── context/          # Providers (TenantContext, AuthContext)
├── features/         # Feature-specific logic (e.g., /editor, /admin)
├── lib/              # Utilities (cn, string formatters)
└── pages/            # Route Views (connects Logic to UI)
```

### C. API & DTO Matching
1.  **Types:** Create TypeScript interfaces in `src/api/types.ts` that strictly match the Backend DTOs (`backend.app.dtos`).
2.  **Client:** Use a centralized Axios instance (`src/lib/api.ts`) that handles:
    *   Base URL injection.
    *   Auth Header injection (Cognito Token).
    *   Response Interceptors (Auto-redirect on 401).

### D. Component Rules
1.  **Pixel Art:** Any `<canvas>` or `<img>` rendering game assets MUST have the class `rendering-pixelated` (or Tailwind equivalent `image-pixelated` defined in index.css).
2.  **Dialogs:** Place complex dialogs in `src/components/dialogs/`. They should accept `isOpen` and `onClose` props.
3.  **Forms:** Use Controlled Components.

### E. Game Engine (Canvas)
*   **No Phaser (Editor):** The *Asset Editor* uses raw HTML5 Canvas API for maximum control over the 32x32 grid.
*   **Phaser (Game):** Only the *Play Mode* uses Phaser (future phase).

# 7. Project Governance (The Prime Directive)

**You are the Project Manager.**
Do not wait for the human to define tasks.
You possess the Master Plan (`HEXMANOS-full-MVP.txt` in the READONLY folder).
You can "bd create" tasks.
You have beads and you can "bd ready" and "bd list" to understand what's next.
You have MAP.md files in every folder describing its contents - a gist of the project and each file and immediate subfolder listed and with a short summary of how they fit in the grand shcheme of things.  and then in each subfolder there are MAP.md files at every level.
USE THEM for documentation and UPDATE them after a task is complete and "bd close" the tasks.
NEVER REMOVE FUNCTIONALITY - if we have it, it was intended - unless EXPLICITLY ASKED FOR BY THE USER.
When there's a problem, NEVER CONTRADICT THE EVIDENCE - think harder.
Do not put TODOs in the code, put tasks in beads.
When you work on a task changing structures or formats or schemas (refactoring), check if you need to make changes to all components editors, game engine, admin interface, and game renderer.
Always mind the software development best practices. Clean code, clean architecture, contracts between modules.

### A. Backlog Management
1.  **Check Status:** Always start by checking `bd ready`.
2.  **Auto-Populate:** If `bd ready` is empty or the current Epic is finished:
    *   **Read** `HEXMANOS-full-MVP.txt` to find the next Phase.
    *   **Create** the Epic: `bd create "Phase X: [Name]" -t epic`.
    *   **Create** the Tasks: Break the phase down into 4-8 granular coding tasks using `bd create ... --label [backend|frontend]`.
    *   **Link Dependencies:** Use `bd dep add` to ensure logical flow (e.g., Backend API must exist before Frontend UI).
3.  **Epics:** Group work into Epics to keep the context clean.

### B. The End-State Architecture (North Star)
Every line of code you write must converge towards this final infrastructure. **Do not deviate.**

*   **Hosting (Hybrid):**
    *   **Compute:** M1 Max Server (running Spring Boot Backend + React Frontend via Vite/Nginx).
    *   **Ingress:** Cloudflare Tunnel (Exposing localhost to public).
    *   **Database:** Native Postgres 17 on M1 Max (Local).
    *   **Asset Storage:** AWS S3 (Production) / Local Disk (Dev).
*   **External Services (AWS):**
    *   **Auth:** AWS Cognito (Two Pools: `hexmanos-admins`, `hexmanos-players`).
    *   **Email:** AWS SES (Transactional emails).
*   **Commerce:**
    *   **Provider:** **PADDLE** (Strictly NO Stripe).
    *   **Logic:** Player "Paid/Free" status is stored in the local Postgres `users` table.
    *   **Enforcement:** Backend checks DB flag before allowing Game Session creation.
*   **Game Runtime:**
    *   **Engine:** Spring Boot (Single JVM, logical rooms).
    *   **State:** In-Memory + Scheduled DB Snapshotting.

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
