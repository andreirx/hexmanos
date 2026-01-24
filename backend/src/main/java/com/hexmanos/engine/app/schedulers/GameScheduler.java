package com.hexmanos.engine.app.schedulers;

import com.hexmanos.engine.core.game.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
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
    private static final long BASE_MOVE_DELAY_MS = 200; // Base delay for movement cost 1

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
            if (!character.hasPath()) {
                continue;
            }

            // Check movement cost-based delay
            Point nextStep = character.getNextPathStep();
            if (nextStep == null) {
                continue;
            }

            // Get movement cost for the destination tile
            int movementCost = 1;
            if (terrain != null) {
                movementCost = Math.max(1, terrain.getCost(nextStep.x(), nextStep.y()));
            }

            // Calculate required delay based on movement cost
            long requiredDelay = BASE_MOVE_DELAY_MS * movementCost;
            long timeSinceLastMove = now - character.getLastMoveTime();

            // Skip if not enough time has passed
            if (timeSinceLastMove < requiredDelay) {
                continue;
            }

            try {
                GameService.MoveResult result = gameService.executePathStep(gameId, character.getId());
                if (result != null) {
                    // Record move time for movement cost timing
                    character.recordMove();

                    // Broadcast the move to all players (with animation state from backend)
                    CharacterMoveEvent event = new CharacterMoveEvent(
                            result.characterId().toString(),
                            result.x(),
                            result.y(),
                            result.direction(),
                            result.state()
                    );
                    messagingTemplate.convertAndSend("/topic/game/" + gameId, event);

                    log.debug("Path step: Character {} moved to ({}, {}) cost={} in game {}",
                            result.characterId(), result.x(), result.y(), movementCost, gameId);

                    // Check if path completed (character no longer has path after this step)
                    if (!character.hasPath()) {
                        // Set character to idle state
                        character.idle();
                        // Broadcast idle event so frontend knows to switch to idle animation
                        CharacterIdleEvent idleEvent = new CharacterIdleEvent(
                                character.getId().toString(),
                                "idle"
                        );
                        messagingTemplate.convertAndSend("/topic/game/" + gameId, idleEvent);
                        log.debug("Path completed: Character {} is now idle in game {}",
                                character.getId(), gameId);
                    }
                }
            } catch (Exception e) {
                log.warn("Path step failed for character {} in game {}: {}",
                        character.getId(), gameId, e.getMessage());
                // Clear the path on error to prevent infinite retries
                character.clearPath();
                // Set to idle on error too
                character.idle();
            }
        }
    }

    /**
     * Event broadcast when a character moves.
     * @param characterId The character ID
     * @param x New X position
     * @param y New Y position
     * @param direction Direction of movement (n, s, e, w)
     * @param state Animation state to render (walk_up, walk_down, walk_left, walk_right, idle)
     */
    public record CharacterMoveEvent(
            String characterId,
            int x,
            int y,
            String direction,
            String state
    ) {}

    /**
     * Event broadcast when a character returns to idle state.
     */
    public record CharacterIdleEvent(
            String characterId,
            String state
    ) {}
}
