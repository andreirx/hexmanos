# Game Engine Architecture

## Backend as Single Source of Truth

The backend is AUTHORITATIVE for all game state. The frontend is a RENDERER.

### Backend Owns (Authoritative)
- Character positions, states, health, control assignments, paths
- Game status (WAITING, RUNNING, PAUSED, FINISHED)
- All gameplay logic (movement, collision, pathfinding, attacks, damage)
- Projectile lifecycle (spawn, tick, collision, impact)

### Frontend Owns (Display Only)
- Mipmap selection (texture resolution based on zoom)
- Zoom level (camera 0.1x - 2x)
- Animation rendering (Phaser plays what backend dictates)
- Visual effects (glows, particles, damage numbers)
- UI state (panels, scroll position)

## WebSocket Contract

Backend sends state changes via STOMP over WebSocket:

| Event | Fields | Purpose |
|-------|--------|---------|
| `CharacterMoveEvent` | characterId, x, y, direction, state, duration | Movement with animation |
| `CharacterIdleEvent` | characterId, state | Return to idle |
| `AttackStartEvent` | characterId, attackId, targetX/Y, direction, state, animationDuration | Attack animation |
| `ProjectileSpawnEvent` | projectileId, projectileAssetId, sourceCharacterId, start/target X/Y, speed | Projectile created |
| `ProjectileUpdateEvent` | projectileId, x, y, preciseX/Y | Position sync (20 FPS) |
| `ProjectileHitEvent` | projectileId, x, y, hitCharacterId, damage | Impact |
| `DamageEvent` | characterId, damage, newHealth, newVisualState, sourceCharacterId | HP change |
| `CharacterDeathEvent` | characterId, killedByCharacterId | Death |

Frontend commands: `/move`, `/idle`, `/path`, `/cancelPath`, `/attack`

## Local Truth Mirror Pattern

**Problem:** When a character lacks a walk animation, frontend shows idle as fallback.
On zoom/mip-switch, asking the sprite "what are you playing?" returns "idle" - losing real state.

**Solution:** `characterStates` Map preserves backend's authoritative state independently
of sprite visuals. On mip-level switch, consult the mirror, not the sprite.

## Projectile System

### Object Assets as Projectiles
- Characters define attacks in `definition.json` with an `attacks` array
- Ranged attacks reference an OBJECT asset via `projectileAssetId`
- Objects have `idle` (flying/looping) and `landed` (impact/plays-once) animation states

### Frontend Rendering
- Phaser sprites loaded dynamically from OBJECT asset files
- Idle animation loops during flight, landed animation plays on impact
- Sprite persists on map after landing (showing last landed frame)
- All spawn handlers must be idempotent (React StrictMode causes duplicate WebSocket subscriptions)

### Backend Lifecycle
- `GameProjectile` tracks position with floating-point precision
- `GameScheduler` ticks projectiles at 50ms (20 FPS)
- On hit: damage applied, events broadcast, projectile removed from state

## Mipmap System
- Assets have 128px (full), 64px (mip64), 32px (mip32) variants
- Backend scheduler auto-generates mipmaps for TILE, CHARACTER, and OBJECT assets
- Frontend selects mip level based on camera zoom
