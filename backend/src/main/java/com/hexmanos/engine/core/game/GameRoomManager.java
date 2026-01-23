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
     * Move a character in the game (single step).
     * Validates terrain passability and character collisions.
     */
    public boolean moveCharacter(UUID gameId, UUID characterId, int dx, int dy) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return false;
        }

        Optional<GameCharacter> characterOpt = state.findCharacter(characterId);
        if (characterOpt.isEmpty()) {
            return false;
        }

        GameCharacter character = characterOpt.get();
        int newX = character.getX() + dx;
        int newY = character.getY() + dy;

        // Check terrain passability if terrain grid is initialized
        TerrainGrid terrain = state.getTerrainGrid();
        if (terrain != null) {
            if (!terrain.isInBounds(newX, newY) || !terrain.isPassable(newX, newY)) {
                log.debug("Move blocked: terrain not passable at ({}, {})", newX, newY);
                return false;
            }
        }

        // Check for character collisions
        if (state.isOccupied(newX, newY, characterId)) {
            log.debug("Move blocked: position ({}, {}) occupied by another character", newX, newY);
            return false;
        }

        // Clear any existing path when manually moving
        character.clearPath();

        character.move(dx, dy);
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

    // ============================================
    // Pathfinding methods
    // ============================================

    /**
     * Request a path for a character to a target position.
     * Returns the computed path, or empty list if no path found.
     */
    public List<Point> requestPath(UUID gameId, UUID characterId, int targetX, int targetY) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return Collections.emptyList();
        }

        Optional<GameCharacter> characterOpt = state.findCharacter(characterId);
        if (characterOpt.isEmpty()) {
            return Collections.emptyList();
        }

        GameCharacter character = characterOpt.get();
        TerrainGrid terrain = state.getTerrainGrid();
        if (terrain == null) {
            log.warn("Terrain grid not initialized for game {}", gameId);
            return Collections.emptyList();
        }

        // Compute path using A*
        Point start = new Point(character.getX(), character.getY());
        Point target = new Point(targetX, targetY);
        Set<Point> obstacles = state.getOccupiedPositions(characterId);

        List<Point> path = Pathfinder.findPath(start, target, terrain, obstacles);

        if (!path.isEmpty()) {
            character.setPath(path);
            log.debug("Set path for character {} in game {}: {} steps", characterId, gameId, path.size());
        } else {
            log.debug("No path found for character {} to ({}, {}) in game {}", characterId, targetX, targetY, gameId);
        }

        return path;
    }

    /**
     * Cancel the current path for a character.
     */
    public void cancelPath(UUID gameId, UUID characterId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return;
        }

        state.findCharacter(characterId).ifPresent(character -> {
            character.clearPath();
            log.debug("Cancelled path for character {} in game {}", characterId, gameId);
        });
    }

    /**
     * Execute the next path step for a character.
     * Returns the new position if moved, or null if no move was made.
     */
    public Point executePathStep(UUID gameId, UUID characterId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return null;
        }

        Optional<GameCharacter> characterOpt = state.findCharacter(characterId);
        if (characterOpt.isEmpty()) {
            return null;
        }

        GameCharacter character = characterOpt.get();
        if (!character.hasPath()) {
            return null;
        }

        Point nextStep = character.getNextPathStep();
        if (nextStep == null) {
            character.clearPath();
            return null;
        }

        // Calculate delta
        int dx = nextStep.x() - character.getX();
        int dy = nextStep.y() - character.getY();

        // Re-validate the move (terrain or characters may have changed)
        TerrainGrid terrain = state.getTerrainGrid();
        if (terrain != null && !terrain.isPassable(nextStep.x(), nextStep.y())) {
            log.debug("Path step blocked by terrain at {}", nextStep);
            character.clearPath();
            return null;
        }

        if (state.isOccupied(nextStep.x(), nextStep.y(), characterId)) {
            log.debug("Path step blocked by character at {}", nextStep);
            character.clearPath();
            return null;
        }

        // Execute the move (don't use moveCharacter as it clears the path)
        character.move(dx, dy);
        character.advancePath();

        return nextStep;
    }

    /**
     * Check if a character has an active path.
     */
    public boolean hasPath(UUID gameId, UUID characterId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return false;
        }

        return state.findCharacter(characterId)
                .map(GameCharacter::hasPath)
                .orElse(false);
    }
}
