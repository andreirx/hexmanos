package com.hexmanos.engine.core.game;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Manages in-memory game state for all active games.
 * This is the "room manager" that holds the runtime state of games.
 */
@Slf4j
@RequiredArgsConstructor
public class GameRoomManager {
    private final Map<UUID, GameState> activeGames = new ConcurrentHashMap<>();
    private final SnapshotService snapshotService;
    private final BatchMovementRecorder batchMovementRecorder;

    public BatchMovementRecorder getBatchMovementRecorder() {
        return batchMovementRecorder;
    }

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

        // Clear any existing path and intention when manually moving
        character.clearPath();
        character.clearMovementIntention();

        character.move(dx, dy);
        character.recordMove();  // Record for movement cost-based timing
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
     * A player can control multiple characters. Only rejects if character is controlled by a different player.
     */
    public boolean takeControl(UUID gameId, UUID characterId, UUID playerId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return false;
        }

        // Check if character exists
        Optional<GameCharacter> character = state.findCharacter(characterId);
        if (character.isEmpty()) {
            return false;
        }

        // Check if controlled by a different player
        Optional<UUID> currentOwner = state.getControllingPlayer(characterId);
        if (currentOwner.isPresent() && !currentOwner.get().equals(playerId)) {
            return false; // Controlled by someone else
        }

        // Assign control (no longer releases other characters)
        state.assignControl(characterId, playerId);
        log.info("Player {} took control of character {} in game {}", playerId, characterId, gameId);
        return true;
    }

    /**
     * Release all character control for a player.
     */
    public void relinquishControl(UUID gameId, UUID playerId) {
        GameState state = activeGames.get(gameId);
        if (state != null) {
            state.releaseAllControlsForPlayer(playerId);
            log.info("Player {} relinquished all control in game {}", playerId, gameId);
        }
    }

    /**
     * Release control of a specific character by a player.
     */
    public void relinquishControl(UUID gameId, UUID playerId, UUID characterId) {
        GameState state = activeGames.get(gameId);
        if (state != null) {
            Optional<UUID> owner = state.getControllingPlayer(characterId);
            if (owner.isPresent() && owner.get().equals(playerId)) {
                state.releaseControl(characterId);
                log.info("Player {} released character {} in game {}", playerId, characterId, gameId);
            }
        }
    }

    /**
     * Get the first character ID controlled by a player (backward compat).
     */
    public Optional<UUID> getControlledCharacter(UUID gameId, UUID playerId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return Optional.empty();
        }
        return state.getCharacterControlledByPlayer(playerId);
    }

    /**
     * Get all characters controlled by a player.
     */
    public Set<UUID> getControlledCharacters(UUID gameId, UUID playerId) {
        GameState state = activeGames.get(gameId);
        if (state == null) {
            return Set.of();
        }
        return state.getCharactersControlledByPlayer(playerId);
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

        // Set movement intention (exact destination, radius 0 for single-char moves)
        character.setMovementIntention(target, 0);

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
            character.clearMovementIntention(); // Explicit cancel = stop trying
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
            // Clear path steps but keep movement intention for retry
            character.clearPath();
            return null;
        }

        if (state.isOccupied(nextStep.x(), nextStep.y(), characterId)) {
            log.debug("Path step blocked by character at {}", nextStep);
            // Clear path steps but keep movement intention for retry
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

    // ============================================
    // Movement intention retry
    // ============================================

    /** How often to retry pathfinding for blocked characters (ms). */
    public static final long PATH_RETRY_INTERVAL_MS = 1500;

    /**
     * Retry pathfinding for a character that has a movement intention but no active path.
     * On retry, if the character has a radius > 0, we accept any passable tile within
     * that radius of the original target.
     *
     * @return the new path if one was found, empty list otherwise
     */
    public List<Point> retryPath(UUID gameId, UUID characterId) {
        GameState state = activeGames.get(gameId);
        if (state == null) return Collections.emptyList();

        Optional<GameCharacter> characterOpt = state.findCharacter(characterId);
        if (characterOpt.isEmpty()) return Collections.emptyList();

        GameCharacter character = characterOpt.get();
        if (!character.hasMovementIntention()) return Collections.emptyList();

        // Check if already arrived (within radius)
        if (character.isWithinTargetRadius()) {
            log.debug("Character {} arrived within radius of target, clearing intention", characterId);
            character.clearMovementIntention();
            return Collections.emptyList();
        }

        TerrainGrid terrain = state.getTerrainGrid();
        if (terrain == null) return Collections.emptyList();

        Point start = new Point(character.getX(), character.getY());
        Point target = character.getTargetDestination();
        Set<Point> obstacles = state.getOccupiedPositions(characterId);

        // First try: exact target
        List<Point> path = Pathfinder.findPath(start, target, terrain, obstacles);

        // If exact target fails and we have a radius, try nearby tiles
        if (path.isEmpty() && character.getTargetRadius() > 0) {
            // Use SlotFinder to find 1 passable tile near the target
            List<Point> nearbySlots = SlotFinder.findSlots(target, 1, terrain, obstacles);
            if (!nearbySlots.isEmpty()) {
                Point nearby = nearbySlots.get(0);
                path = Pathfinder.findPath(start, nearby, terrain, obstacles);
                if (!path.isEmpty()) {
                    log.debug("Retry: found alternative path for character {} to ({},{}) instead of ({},{})",
                            characterId, nearby.x(), nearby.y(), target.x(), target.y());
                }
            }
        }

        if (!path.isEmpty()) {
            character.setPath(path);
            log.debug("Retry succeeded: character {} got new path ({} steps)", characterId, path.size());
        }

        character.recordPathRetry();
        return path;
    }

    // ============================================
    // Batch pathfinding (squad movement)
    // ============================================

    /**
     * Request paths for multiple characters to nearby slots around a target.
     * Uses spiral search to find N valid tiles near target, then assigns
     * characters to slots using greedy closest-pair matching.
     *
     * @return Map of characterId -> computed path (only includes characters that got valid paths)
     */
    public Map<UUID, List<Point>> requestBatchPath(
            UUID gameId, Set<UUID> characterIds, int targetX, int targetY) {

        GameState state = activeGames.get(gameId);
        if (state == null) return Map.of();

        TerrainGrid terrain = state.getTerrainGrid();
        if (terrain == null) {
            log.warn("Terrain grid not initialized for game {}", gameId);
            return Map.of();
        }

        // Build character position map
        Map<UUID, Point> charPositions = new HashMap<>();
        for (UUID charId : characterIds) {
            state.findCharacter(charId).ifPresent(c ->
                    charPositions.put(charId, new Point(c.getX(), c.getY()))
            );
        }

        if (charPositions.isEmpty()) return Map.of();

        Point target = new Point(targetX, targetY);

        // Occupied = all characters EXCEPT those in the batch (they are all moving)
        // Use a mutable copy so we can reserve destination slots during pathfinding
        Set<Point> occupied = new HashSet<>(state.getOccupiedPositions(characterIds));

        // Debug recording: capture initial state
        String batchId = batchMovementRecorder.recordBatchRequest(
                gameId, characterIds, targetX, targetY, terrain, charPositions, occupied);

        // Find N slots near target (slots already exclude occupied positions)
        List<Point> slots = SlotFinder.findSlots(target, charPositions.size(), terrain, occupied);
        if (slots.isEmpty()) {
            log.debug("No valid slots found near ({}, {}) for {} characters", targetX, targetY, charPositions.size());
            return Map.of();
        }

        // Assign characters to slots (closest unit to closest slot)
        Map<UUID, Point> assignments = SlotFinder.assignCharactersToSlots(charPositions, slots);

        // Compute retry radius based on batch size (larger groups get more leeway)
        int retryRadius = Math.max(1, (int) Math.ceil(Math.sqrt(charPositions.size())));

        // Set movement intentions for ALL characters in the batch (even if pathfind fails initially)
        for (Map.Entry<UUID, Point> entry : assignments.entrySet()) {
            UUID charId = entry.getKey();
            Point dest = entry.getValue();
            state.findCharacter(charId).ifPresent(c ->
                    c.setMovementIntention(dest, retryRadius));
        }

        // Best-effort: compute individual A* paths, reserving each destination slot
        // so subsequent pathfinds in this batch don't target the same cell.
        Map<UUID, List<Point>> results = new HashMap<>();
        for (Map.Entry<UUID, Point> entry : assignments.entrySet()) {
            UUID charId = entry.getKey();
            Point dest = entry.getValue();
            Point start = charPositions.get(charId);

            List<Point> path = Pathfinder.findPath(start, dest, terrain, occupied);
            if (!path.isEmpty()) {
                state.findCharacter(charId).ifPresent(c -> c.setPath(path));
                results.put(charId, path);
                // Reserve the destination slot so the next character's pathfind won't
                // route through or target this cell
                occupied.add(dest);
                log.debug("Batch path: character {} -> ({}, {}), {} steps", charId, dest.x(), dest.y(), path.size());
            } else {
                log.debug("Batch path: no path found for character {} from ({},{}) to ({},{}), will retry later",
                        charId, start.x(), start.y(), dest.x(), dest.y());
            }
        }

        // Debug recording: capture computed paths and assignments
        batchMovementRecorder.recordBatchResult(batchId, assignments, results);

        log.info("Batch path for {} characters to ({}, {}): {}/{} paths computed in game {}",
                characterIds.size(), targetX, targetY, results.size(), assignments.size(), gameId);
        return results;
    }
}
