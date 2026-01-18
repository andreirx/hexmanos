package com.hexmanos.engine.core.game;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages in-memory game state for all active games.
 * This is the "room manager" that holds the runtime state of games.
 */
@Slf4j
@RequiredArgsConstructor
public class GameRoomManager {
    private final Map<UUID, GameState> activeGames = new ConcurrentHashMap<>();
    private final SnapshotService snapshotService;

    /**
     * Load a game into memory with the given initial state.
     */
    public void loadGame(UUID gameId, GameState state) {
        activeGames.put(gameId, state);
        log.info("Loaded game {} into memory (tick {})", gameId, state.getTick());
    }

    /**
     * Try to restore a game from snapshot. Returns true if restored successfully.
     */
    public boolean restoreFromSnapshot(UUID gameId) {
        Optional<GameState> snapshot = snapshotService.loadSnapshot(gameId);
        if (snapshot.isPresent()) {
            activeGames.put(gameId, snapshot.get());
            log.info("Restored game {} from snapshot (tick {})", gameId, snapshot.get().getTick());
            return true;
        }
        return false;
    }

    /**
     * Unload a game from memory.
     */
    public void unloadGame(UUID gameId) {
        GameState state = activeGames.remove(gameId);
        if (state != null) {
            log.info("Unloaded game {} from memory (tick {})", gameId, state.getTick());
        }
    }

    /**
     * Get the current state of a game.
     */
    public GameState getState(UUID gameId) {
        return activeGames.get(gameId);
    }

    /**
     * Check if a game is loaded in memory.
     */
    public boolean isLoaded(UUID gameId) {
        return activeGames.containsKey(gameId);
    }

    /**
     * Get all active game IDs.
     */
    public Set<UUID> getActiveGameIds() {
        return new HashSet<>(activeGames.keySet());
    }

    /**
     * Advance a game by one tick.
     */
    public void tick(UUID gameId) {
        GameState state = activeGames.get(gameId);
        if (state != null) {
            state.tick();
        }
    }

    /**
     * Move a character in the game.
     */
    public boolean moveCharacter(UUID gameId, UUID characterId, int dx, int dy) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return false;
        }

        Optional<GameCharacter> character = state.findCharacter(characterId);
        if (character.isEmpty()) {
            return false;
        }

        // TODO: Add collision detection with map terrain
        character.get().move(dx, dy);
        return true;
    }

    /**
     * Set a character to idle state.
     */
    public void idleCharacter(UUID gameId, UUID characterId) {
        GameState state = activeGames.get(gameId);
        if (state != null) {
            state.findCharacter(characterId).ifPresent(GameCharacter::idle);
        }
    }

    /**
     * Assign character control to a player.
     */
    public boolean takeControl(UUID gameId, UUID characterId, UUID playerId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return false;
        }

        // Check if character exists and is not already controlled
        Optional<GameCharacter> character = state.findCharacter(characterId);
        if (character.isEmpty()) {
            return false;
        }

        if (state.isCharacterControlled(characterId)) {
            return false; // Already controlled
        }

        // Release any existing control by this player
        state.releaseAllControlsForPlayer(playerId);

        // Assign control
        state.assignControl(characterId, playerId);
        log.info("Player {} took control of character {} in game {}", playerId, characterId, gameId);
        return true;
    }

    /**
     * Release character control for a player.
     */
    public void relinquishControl(UUID gameId, UUID playerId) {
        GameState state = activeGames.get(gameId);
        if (state != null) {
            state.releaseAllControlsForPlayer(playerId);
            log.info("Player {} relinquished control in game {}", playerId, gameId);
        }
    }

    /**
     * Get the character ID controlled by a player.
     */
    public Optional<UUID> getControlledCharacter(UUID gameId, UUID playerId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return Optional.empty();
        }
        return state.getCharacterControlledByPlayer(playerId);
    }

    /**
     * Add a character to a game.
     */
    public void addCharacter(UUID gameId, GameCharacter character) {
        GameState state = activeGames.get(gameId);
        if (state != null) {
            state.addCharacter(character);
        }
    }

    /**
     * Get all characters in a game.
     */
    public List<GameCharacter> getCharacters(UUID gameId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return Collections.emptyList();
        }
        return state.getCharacters();
    }
}
