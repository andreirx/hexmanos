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
