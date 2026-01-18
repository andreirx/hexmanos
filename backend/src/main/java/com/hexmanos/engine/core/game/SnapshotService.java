package com.hexmanos.engine.core.game;

import com.hexmanos.engine.core.files.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for persisting and loading game state snapshots.
 * Snapshots are stored using the FileStorageService (S3 or local).
 */
@Slf4j
@RequiredArgsConstructor
public class SnapshotService {
    private static final String SNAPSHOT_PREFIX = "game-snapshots";
    private static final String SNAPSHOT_FILENAME = "state.bin";
    private static final String CONTENT_TYPE = "application/octet-stream";

    private final FileStorageService storageService;
    private final GameRepository gameRepository;

    /**
     * Save a snapshot of the game state.
     */
    public void saveSnapshot(UUID gameId, GameState state) {
        try {
            byte[] data = state.serialize();
            String storageKey = getStorageKey(gameId);
            storageService.uploadBytes(data, storageKey, CONTENT_TYPE);

            // Update the game with the snapshot storage key
            gameRepository.findById(gameId).ifPresent(game -> {
                game.setSnapshotStorageKey(storageKey);
                game.touch();
                gameRepository.save(game);
            });

            log.info("Saved snapshot for game {} ({} bytes)", gameId, data.length);
        } catch (IOException e) {
            log.error("Failed to save snapshot for game {}", gameId, e);
            throw new RuntimeException("Failed to save game snapshot", e);
        }
    }

    /**
     * Load a snapshot of the game state.
     */
    public Optional<GameState> loadSnapshot(UUID gameId) {
        try {
            String storageKey = getStorageKey(gameId);
            byte[] data = storageService.readBytes(storageKey);

            if (data == null || data.length == 0) {
                log.debug("No snapshot found for game {}", gameId);
                return Optional.empty();
            }

            GameState state = GameState.deserialize(data);
            log.info("Loaded snapshot for game {} (tick {})", gameId, state.getTick());
            return Optional.of(state);
        } catch (IOException | ClassNotFoundException e) {
            log.error("Failed to load snapshot for game {}", gameId, e);
            return Optional.empty();
        }
    }

    /**
     * Delete snapshots for a game.
     */
    public void deleteSnapshots(UUID gameId) {
        try {
            String storageKey = getStorageKey(gameId);
            storageService.deleteFile(storageKey);
            log.info("Deleted snapshot for game {}", gameId);
        } catch (Exception e) {
            log.warn("Failed to delete snapshot for game {}", gameId, e);
        }
    }

    /**
     * Check if a snapshot exists for a game.
     */
    public boolean snapshotExists(UUID gameId) {
        String storageKey = getStorageKey(gameId);
        return storageService.fileExists(storageKey);
    }

    /**
     * Get the storage key for a game's snapshot.
     */
    private String getStorageKey(UUID gameId) {
        return SNAPSHOT_PREFIX + "/" + gameId + "/" + SNAPSHOT_FILENAME;
    }
}
