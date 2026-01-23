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
     */
    private void executePathStepsForGame(UUID gameId) {
        GameState state = roomManager.getState(gameId);
        if (state == null) {
            return;
        }

        List<GameCharacter> characters = state.getCharacters();
        for (GameCharacter character : characters) {
            if (!character.hasPath()) {
                continue;
            }

            try {
                GameService.MoveResult result = gameService.executePathStep(gameId, character.getId());
                if (result != null) {
                    // Broadcast the move to all players
                    CharacterMoveEvent event = new CharacterMoveEvent(
                            result.characterId().toString(),
                            result.x(),
                            result.y(),
                            result.direction()
                    );
                    messagingTemplate.convertAndSend("/topic/game/" + gameId, event);

                    log.debug("Path step: Character {} moved to ({}, {}) in game {}",
                            result.characterId(), result.x(), result.y(), gameId);
                }
            } catch (Exception e) {
                log.warn("Path step failed for character {} in game {}: {}",
                        character.getId(), gameId, e.getMessage());
                // Clear the path on error to prevent infinite retries
                character.clearPath();
            }
        }
    }

    /**
     * Event broadcast when a character moves.
     */
    public record CharacterMoveEvent(
            String characterId,
            int x,
            int y,
            String direction
    ) {}
}
