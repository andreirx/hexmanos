# External Postgres Game Adapters

JPA entities and repository adapters for game persistence.

## Files

| File | Purpose |
|------|---------|
| `GameEntity.java` | JPA entity for `games` table with EntityMapper |
| `GamePlayerEntity.java` | JPA entity for `game_players` table with EntityMapper |
| `GameDB.java` | Spring Data JpaRepository for GameEntity |
| `GamePlayerDB.java` | Spring Data JpaRepository for GamePlayerEntity |
| `PostgresGameRepository.java` | Adapter implementing core GameRepository |
| `PostgresGamePlayerRepository.java` | Adapter implementing core GamePlayerRepository |

## Database Tables

### games
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Display name |
| host_player_id | UUID | Creator's user ID |
| map_asset_id | UUID | FK to assets |
| status | VARCHAR(50) | WAITING/RUNNING/PAUSED/FINISHED |
| join_code | VARCHAR(10) | Unique, 6-char alphanumeric |
| password_hash | VARCHAR(255) | Optional BCrypt hash |
| snapshot_storage_key | VARCHAR(500) | Path to latest snapshot |
| created_at | TIMESTAMPTZ | Creation time |
| last_activity_at | TIMESTAMPTZ | Last activity (for expiry) |

### game_players
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| game_id | UUID | FK to games (CASCADE DELETE) |
| player_id | UUID | User's internal ID |
| role | VARCHAR(50) | HOST/PLAYER/OBSERVER |
| controlled_character_id | UUID | Currently controlled character |
| joined_at | TIMESTAMPTZ | Join time |
| last_seen_at | TIMESTAMPTZ | Activity tracking |

## Pattern

Follows standard Hexagonal Architecture adapter pattern:
1. **Entity** - JPA annotated class with `Persistable<UUID>` interface
2. **EntityMapper** - Inner interface with `fromEntity()` / `toEntity()` static methods
3. **DB** - Spring Data `JpaRepository<Entity, UUID>` interface
4. **Adapter** - `@Component` implementing core repository interface

## Queries

### GameDB
- `findByJoinCode(String)` - Look up game by invite code
- `findByHostPlayerId(UUID)` - List games owned by player
- `findByStatusIn(List)` - Find active games (WAITING/RUNNING)
- `findByLastActivityAtBefore(Instant)` - Find expired games

### GamePlayerDB
- `findByGameId(UUID)` - List players in a game
- `findByGameIdAndPlayerId(UUID, UUID)` - Check if player is in game
- `deleteByGameId(UUID)` - Remove all players when game ends
