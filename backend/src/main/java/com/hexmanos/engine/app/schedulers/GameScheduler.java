package com.hexmanos.engine.app.schedulers;

import com.hexmanos.engine.core.game.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Background scheduler for game-related tasks:
 * - Periodic snapshot saving for active games
 * - Cleanup of expired games (2-day inactivity timeout)
 * - Game loop for automatic path execution
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GameScheduler {

    private final GameService gameService;
    private final GameRoomManager roomManager;
    private final SnapshotService snapshotService;
    private final SimpMessagingTemplate messagingTemplate;

    private static final Duration EXPIRY_DURATION = Duration.ofDays(2);

    /**
     * Restore all RUNNING games from snapshots on startup.
     */
    @PostConstruct
    public void restoreGamesOnStartup() {
        log.info("Restoring active games from snapshots...");
        try {
            gameService.restoreRunningGames();
        } catch (Exception e) {
            log.error("Failed to restore games on startup: {}", e.getMessage(), e);
        }
    }

    /**
     * Save snapshots for all active games.
     * Runs every 5 minutes (300000 ms).
     */
    @Scheduled(fixedDelay = 300000)
    public void saveSnapshots() {
        Set<UUID> activeGameIds = roomManager.getActiveGameIds();
        if (activeGameIds.isEmpty()) {
            return;
        }

        log.debug("Saving snapshots for {} active game(s)...", activeGameIds.size());

        int saved = 0;
        for (UUID gameId : activeGameIds) {
            try {
                GameState state = roomManager.getState(gameId);
                if (state != null) {
                    snapshotService.saveSnapshot(gameId, state);
                    saved++;
                }
            } catch (Exception e) {
                log.error("Failed to save snapshot for game {}: {}", gameId, e.getMessage());
            }
        }

        if (saved > 0) {
            log.info("Saved snapshots for {} game(s)", saved);
        }
    }

    /**
     * Clean up expired games (inactive for more than 2 days).
     * Runs every hour.
     */
    @Scheduled(cron = "0 0 * * * *") // Every hour at minute 0
    public void cleanupExpiredGames() {
        log.debug("Running expired game cleanup...");

        Instant cutoff = Instant.now().minus(EXPIRY_DURATION);
        try {
            gameService.cleanupExpiredGames(cutoff);
        } catch (Exception e) {
            log.error("Failed to cleanup expired games: {}", e.getMessage());
        }
    }

    /**
     * Tick all active games (advance game state).
     * Runs every second for autonomous game behavior.
     * Currently just updates the tick counter - future AI behavior will be added here.
     */
    @Scheduled(fixedDelay = 1000)
    public void tickGames() {
        Set<UUID> activeGameIds = roomManager.getActiveGameIds();
        for (UUID gameId : activeGameIds) {
            try {
                roomManager.tick(gameId);
            } catch (Exception e) {
                log.error("Failed to tick game {}: {}", gameId, e.getMessage());
            }
        }
    }

    /**
     * Execute path steps for all characters with active paths.
     * Runs every 200ms for smooth step-by-step movement.
     */
    @Scheduled(fixedDelay = 200)
    public void executePathSteps() {
        Set<UUID> activeGameIds = roomManager.getActiveGameIds();
        if (activeGameIds.isEmpty()) {
            return;
        }

        for (UUID gameId : activeGameIds) {
            try {
                executePathStepsForGame(gameId);
            } catch (Exception e) {
                log.error("Failed to execute path steps for game {}: {}", gameId, e.getMessage());
            }
        }
    }

    /**
     * Execute path steps for all characters in a game.
     * Movement is delayed based on terrain movement cost:
     * - Cost 1 = 200ms between steps
     * - Cost 2 = 400ms between steps
     * - Cost 3 = 600ms between steps, etc.
     */
    private void executePathStepsForGame(UUID gameId) {
        GameState state = roomManager.getState(gameId);
        if (state == null) {
            return;
        }

        TerrainGrid terrain = state.getTerrainGrid();
        long now = System.currentTimeMillis();

        List<GameCharacter> characters = state.getCharacters();
        for (GameCharacter character : characters) {

            // === CASE 1: Character has an active path — execute next step ===
            if (character.hasPath()) {
                executeActivePathStep(gameId, character, terrain, now);
                continue;
            }

            // === CASE 2: Character has a movement intention but no path — retry ===
            if (character.hasMovementIntention() && !character.hasPath()) {
                // Check if already within radius (e.g. got pushed closer by other movement)
                if (character.isWithinTargetRadius()) {
                    character.clearMovementIntention();
                    character.idle();
                    CharacterIdleEvent idleEvent = new CharacterIdleEvent(
                            character.getId().toString(), "idle");
                    messagingTemplate.convertAndSend("/topic/game/" + gameId, idleEvent);
                    roomManager.getBatchMovementRecorder()
                            .recordCharacterArrival(character.getId(), character.getX(), character.getY());
                    log.debug("Character {} within radius of target, marking as arrived", character.getId());
                    continue;
                }

                // Throttle retry attempts
                if (!character.canRetryPath(GameRoomManager.PATH_RETRY_INTERVAL_MS)) {
                    continue;
                }

                List<Point> newPath = roomManager.retryPath(gameId, character.getId());
                if (!newPath.isEmpty()) {
                    // Broadcast the new path to frontend so it can visualize it
                    PathStartEvent pathEvent = new PathStartEvent(
                            character.getId().toString(),
                            newPath.stream().map(p -> new int[]{p.x(), p.y()}).toList()
                    );
                    messagingTemplate.convertAndSend("/topic/game/" + gameId, pathEvent);
                    log.debug("Retry path sent for character {} in game {}: {} steps",
                            character.getId(), gameId, newPath.size());
                }
            }
        }
    }

    /**
     * Execute a single path step for a character that has an active path.
     */
    private void executeActivePathStep(UUID gameId, GameCharacter character,
                                       TerrainGrid terrain, long now) {
        Point nextStep = character.getNextPathStep();
        if (nextStep == null) {
            return;
        }

        // Get movement cost for the destination tile
        int movementCost = 1;
        if (terrain != null) {
            movementCost = Math.max(1, terrain.getCost(nextStep.x(), nextStep.y()));
        }

        // Calculate required delay based on movement cost
        long requiredDelay = GameService.BASE_MOVE_DELAY_MS * movementCost;
        long timeSinceLastMove = now - character.getLastMoveTime();

        // Skip if not enough time has passed
        if (timeSinceLastMove < requiredDelay) {
            return;
        }

        try {
            GameService.MoveResult result = gameService.executePathStep(gameId, character.getId());
            if (result != null) {
                // Record move time for movement cost timing
                character.recordMove();

                // Broadcast the move to all players
                CharacterMoveEvent event = new CharacterMoveEvent(
                        result.characterId().toString(),
                        result.x(),
                        result.y(),
                        result.direction(),
                        result.state(),
                        result.duration()
                );
                messagingTemplate.convertAndSend("/topic/game/" + gameId, event);

                log.debug("Path step: Character {} moved to ({}, {}) cost={} in game {}",
                        result.characterId(), result.x(), result.y(), movementCost, gameId);

                // Check if path completed
                if (!character.hasPath()) {
                    // Check if movement intention is also satisfied
                    if (character.hasMovementIntention()) {
                        if (character.isAtTargetDestination() || character.isWithinTargetRadius()) {
                            character.clearMovementIntention();
                            roomManager.getBatchMovementRecorder()
                                    .recordCharacterArrival(character.getId(), result.x(), result.y());
                        }
                        // else: intention remains, will retry in next tick cycle
                    }

                    // Only idle if no intention left (otherwise keep "waiting to retry")
                    if (!character.hasMovementIntention()) {
                        character.idle();
                        CharacterIdleEvent idleEvent = new CharacterIdleEvent(
                                character.getId().toString(), "idle");
                        messagingTemplate.convertAndSend("/topic/game/" + gameId, idleEvent);
                        log.debug("Path completed: Character {} is now idle in game {}",
                                character.getId(), gameId);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Path step failed for character {} in game {}: {}",
                    character.getId(), gameId, e.getMessage());
            // Clear path but keep intention for retry
            character.clearPath();
            character.idle();
        }
    }

    // ============================================
    // Projectile tick (20 FPS for smooth movement)
    // ============================================

    private static final long PROJECTILE_TICK_MS = 50;  // 20 FPS for projectiles

    /**
     * Tick all active projectiles.
     * Runs every 50ms for smooth projectile movement.
     */
    @Scheduled(fixedDelay = 50)
    public void tickProjectiles() {
        Set<UUID> activeGameIds = roomManager.getActiveGameIds();
        if (activeGameIds.isEmpty()) {
            return;
        }

        for (UUID gameId : activeGameIds) {
            try {
                tickProjectilesForGame(gameId);
            } catch (Exception e) {
                log.error("Failed to tick projectiles for game {}: {}", gameId, e.getMessage());
            }
        }
    }

    /**
     * Process all projectiles for a game.
     */
    private void tickProjectilesForGame(UUID gameId) {
        GameState state = roomManager.getState(gameId);
        if (state == null) {
            return;
        }

        List<GameProjectile> projectiles = state.getActiveProjectiles();
        if (projectiles.isEmpty()) {
            return;
        }

        List<GameProjectile> toRemove = new ArrayList<>();

        for (GameProjectile projectile : projectiles) {
            // Update position
            boolean reached = projectile.tick(PROJECTILE_TICK_MS);

            // Broadcast position update for smooth animation
            ProjectileUpdateEvent updateEvent = new ProjectileUpdateEvent(
                    projectile.getId().toString(),
                    projectile.getCurrentTileX(),
                    projectile.getCurrentTileY(),
                    projectile.getCurrentX(),
                    projectile.getCurrentY()
            );
            messagingTemplate.convertAndSend("/topic/game/" + gameId, updateEvent);

            if (reached) {
                // Handle impact
                handleProjectileImpact(gameId, state, projectile);
                toRemove.add(projectile);
            }
        }

        // Remove completed projectiles
        for (GameProjectile p : toRemove) {
            state.removeProjectile(p.getId());
        }
    }

    /**
     * Handle projectile impact - check for hits and apply damage.
     */
    private void handleProjectileImpact(UUID gameId, GameState state, GameProjectile projectile) {
        int hitX = projectile.getCurrentTileX();
        int hitY = projectile.getCurrentTileY();

        // Check for character at impact location (excluding the attacker)
        Optional<GameCharacter> hitCharacter = state.getCharacters().stream()
                .filter(c -> c.getX() == hitX && c.getY() == hitY)
                .filter(c -> !c.getId().equals(projectile.getSourceCharacterId()))
                .findFirst();

        String hitCharacterId = null;
        if (hitCharacter.isPresent()) {
            GameCharacter target = hitCharacter.get();
            hitCharacterId = target.getId().toString();

            // Apply damage
            target.takeDamage(projectile.getDamage());

            // Broadcast damage event
            DamageEvent damageEvent = new DamageEvent(
                    target.getId().toString(),
                    projectile.getDamage(),
                    target.getHealth(),
                    target.getVisualState(),
                    projectile.getSourceCharacterId().toString(),
                    projectile.getAttackId()
            );
            messagingTemplate.convertAndSend("/topic/game/" + gameId, damageEvent);

            log.debug("Projectile hit: {} took {} damage from {} in game {}",
                    target.getName(), projectile.getDamage(), projectile.getSourceCharacterId(), gameId);

            // Check for death
            if (!target.isAlive()) {
                CharacterDeathEvent deathEvent = new CharacterDeathEvent(
                        target.getId().toString(),
                        projectile.getSourceCharacterId().toString()
                );
                messagingTemplate.convertAndSend("/topic/game/" + gameId, deathEvent);
                log.info("Character {} was killed by {} in game {}",
                        target.getName(), projectile.getSourceCharacterId(), gameId);
            }
        }

        // Broadcast hit event (for impact animation)
        ProjectileHitEvent hitEvent = new ProjectileHitEvent(
                projectile.getId().toString(),
                hitX,
                hitY,
                hitCharacterId,
                projectile.getDamage()
        );
        messagingTemplate.convertAndSend("/topic/game/" + gameId, hitEvent);
    }

    // ============================================
    // Attack animation completion tracking
    // ============================================

    /**
     * Check for completed attack animations and apply melee damage.
     * Runs every 100ms.
     */
    @Scheduled(fixedDelay = 100)
    public void checkAttackAnimations() {
        Set<UUID> activeGameIds = roomManager.getActiveGameIds();
        if (activeGameIds.isEmpty()) {
            return;
        }

        for (UUID gameId : activeGameIds) {
            try {
                checkAttackAnimationsForGame(gameId);
            } catch (Exception e) {
                log.error("Failed to check attack animations for game {}: {}", gameId, e.getMessage());
            }
        }
    }

    /**
     * Check attack animations for a game and return characters to idle.
     */
    private void checkAttackAnimationsForGame(UUID gameId) {
        GameState state = roomManager.getState(gameId);
        if (state == null) {
            return;
        }

        for (GameCharacter character : state.getCharacters()) {
            // Check if attack animation just completed
            if (character.getActiveAttackId() != null && !character.isAttacking()) {
                // Return to idle
                character.endAttack();

                // Broadcast idle event
                CharacterIdleEvent idleEvent = new CharacterIdleEvent(
                        character.getId().toString(),
                        character.getCurrentState()
                );
                messagingTemplate.convertAndSend("/topic/game/" + gameId, idleEvent);
            }
        }
    }

    // ============================================
    // Event records
    // ============================================

    /**
     * Event broadcast when a character moves.
     * @param characterId The character ID
     * @param x New X position
     * @param y New Y position
     * @param direction Direction of movement (n, s, e, w)
     * @param state Animation state to render (walk_up, walk_down, walk_left, walk_right, idle)
     * @param duration Duration in milliseconds for this move animation (based on terrain cost)
     */
    public record CharacterMoveEvent(
            String characterId,
            int x,
            int y,
            String direction,
            String state,
            long duration
    ) {}

    /**
     * Event broadcast when a character returns to idle state.
     */
    public record CharacterIdleEvent(
            String characterId,
            String state
    ) {}

    /**
     * Event broadcast when a character gets a new path (including retries).
     */
    public record PathStartEvent(
            String characterId,
            java.util.List<int[]> path
    ) {}

    /**
     * Event broadcast when a character starts an attack.
     */
    public record AttackStartEvent(
            String characterId,
            String attackId,
            int targetX,
            int targetY,
            String direction,
            String state,
            long animationDuration
    ) {}

    /**
     * Event broadcast when a projectile is spawned.
     */
    public record ProjectileSpawnEvent(
            String projectileId,
            String projectileAssetId,
            String sourceCharacterId,
            int startX,
            int startY,
            int targetX,
            int targetY,
            int speed
    ) {}

    /**
     * Event broadcast with projectile position updates (for smooth animation).
     */
    public record ProjectileUpdateEvent(
            String projectileId,
            int x,
            int y,
            double preciseX,
            double preciseY
    ) {}

    /**
     * Event broadcast when a projectile hits something.
     */
    public record ProjectileHitEvent(
            String projectileId,
            int x,
            int y,
            String hitCharacterId,  // null if hit terrain
            int damage
    ) {}

    /**
     * Event broadcast when a character takes damage.
     */
    public record DamageEvent(
            String characterId,
            int damage,
            int newHealth,
            String newVisualState,
            String sourceCharacterId,
            String attackId
    ) {}

    /**
     * Event broadcast when a character dies.
     */
    public record CharacterDeathEvent(
            String characterId,
            String killedByCharacterId
    ) {}
}
