# Patterns & Lessons Learned

Hard-won knowledge from debugging and development. Read this before working on related areas.

## The Pointer Pattern (Global)
- S3 stores ALL heavy assets (PNGs, JSON definitions)
- Postgres stores ONLY metadata and pointers (S3 keys, owner IDs, status)
- Never store blobs in DB. Entities store a `storageKeyPrefix` string, not file content.

## React StrictMode Double-Mount (Frontend)
**Problem:** `main.tsx` wraps app in `<StrictMode>`, which double-mounts components in dev.
This causes duplicate WebSocket connections and duplicate event handlers.

**Solution:** All WebSocket event handlers (especially `spawnProjectile`, `handleProjectileHit`)
must be **idempotent**. Check if entity already exists before creating. Example:
```typescript
if (this.projectileSprites.has(event.projectileId)) return // Already spawned
```

## State Desync on Mip-Level Switch (Frontend/Phaser)
**Problem:** When a character has no walk animation, we show idle as visual fallback.
On zoom, asking the sprite what it's playing returns "idle" - but the character is walking.

**Solution:** `characterStates` Map (Local Truth Mirror) tracks backend state independently
of sprite visuals. On mip switch, read from mirror, not sprite.

## Asset File Naming Convention
Characters and objects use visual states in filenames:
```
{visualState}_{animState}_{frameIndex}.png
Example: full_idle_0.png, hurt_1_walk_down_2.png, new_landed_0.png
```
Legacy assets without visual states use `default` or omit the prefix: `idle_0.png`

## Object Animation States
- `idle`: Looping animation (e.g., projectile in flight)
- `landed`: Plays once (e.g., projectile impact), then stays on last frame
- Defined in object's `definition.json` under `states`

## Character Visual States
- Characters: `full`, `hurt_1`, `hurt_2`, `critical` (HP-based)
- Objects: `new`, `worn`, `damaged`, `broken` (degradation)
- Each visual state has its own complete sprite set

## Phaser Texture Loading (Async)
**Problem:** Dynamic texture loading via `this.load.image()` + `this.load.start()` is async.
The `load.once("complete")` callback may fire after other game events (like projectile hit).

**Solution:** Always check entity state before applying loaded textures. Remove entities from
tracking maps immediately on state change (e.g., remove from `projectileSprites` on hit, not
after animation completes).

## JPA Repository Generics Trap
- `{Feature}DB extends JpaRepository<{Feature}Entity, ID>` - use the ENTITY class
- NEVER: `extends JpaRepository<Asset, UUID>` (using the Core POJO)
- This compiles but fails at runtime with cryptic Hibernate errors

## Flyway Migration Safety
- Timestamp-based versioning: `V{YYYYMMDDHHMMSS}__{Description}.sql`
- NEVER edit a committed migration. Create a new one to fix mistakes.
- No `IF NOT EXISTS` - dirty state should fail loudly.
