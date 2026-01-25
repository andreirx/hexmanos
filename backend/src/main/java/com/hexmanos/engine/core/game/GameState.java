package com.hexmanos.engine.core.game;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.*;
import java.time.Instant;
import java.util.*;

/**
 * Represents the complete runtime state of a game.
 * This object lives in memory and gets periodically serialized to snapshots.
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class GameState implements Serializable {
    private static final long serialVersionUID = 1L;

    private UUID gameId;
    private long tick;                  // Game tick counter
    private Instant stateTime;          // Timestamp of this state
    private String mapDataJson;         // Serialized map data (JSON string)
    private List<GameCharacter> characters = new ArrayList<>();
    private Map<UUID, UUID> characterControl = new HashMap<>();  // characterId -> playerId

    // Transient fields - not serialized to snapshots
    private transient TerrainGrid terrainGrid;
    private transient List<GameProjectile> activeProjectiles;

    /**
     * Create a new game state for the given game.
     */
    public static GameState create(UUID gameId, String mapDataJson) {
        GameState state = new GameState();
        state.setGameId(gameId);
        state.setTick(0);
        state.setStateTime(Instant.now());
        state.setMapDataJson(mapDataJson);
        state.setCharacters(new ArrayList<>());
        state.setCharacterControl(new HashMap<>());
        return state;
    }

    /**
     * Add a character to the game.
     */
    public void addCharacter(GameCharacter character) {
        characters.add(character);
    }

    /**
     * Find a character by ID.
     */
    public Optional<GameCharacter> findCharacter(UUID characterId) {
        return characters.stream()
                .filter(c -> c.getId().equals(characterId))
                .findFirst();
    }

    /**
     * Check if a character is controlled by any player.
     */
    public boolean isCharacterControlled(UUID characterId) {
        return characterControl.containsKey(characterId);
    }

    /**
     * Get the player controlling a character.
     */
    public Optional<UUID> getControllingPlayer(UUID characterId) {
        return Optional.ofNullable(characterControl.get(characterId));
    }

    /**
     * Assign character control to a player.
     */
    public void assignControl(UUID characterId, UUID playerId) {
        characterControl.put(characterId, playerId);
        findCharacter(characterId).ifPresent(c -> c.setControlled(true));
    }

    /**
     * Release character control.
     */
    public void releaseControl(UUID characterId) {
        characterControl.remove(characterId);
        findCharacter(characterId).ifPresent(c -> c.setControlled(false));
    }

    /**
     * Release all characters controlled by a player.
     */
    public void releaseAllControlsForPlayer(UUID playerId) {
        List<UUID> toRelease = characterControl.entrySet().stream()
                .filter(e -> e.getValue().equals(playerId))
                .map(Map.Entry::getKey)
                .toList();
        toRelease.forEach(this::releaseControl);
    }

    /**
     * Get the character controlled by a player.
     */
    public Optional<UUID> getCharacterControlledByPlayer(UUID playerId) {
        return characterControl.entrySet().stream()
                .filter(e -> e.getValue().equals(playerId))
                .map(Map.Entry::getKey)
                .findFirst();
    }

    /**
     * Advance the game by one tick.
     */
    public void tick() {
        this.tick++;
        this.stateTime = Instant.now();
        // Future: Add autonomous character behavior here
    }

    /**
     * Initialize the terrain grid from map data.
     * Should be called after loading or restoring state.
     *
     * @param tileCosts Map of tile/path asset ID to movement cost (1 = default)
     */
    public void initializeTerrain(Map<String, Integer> tileCosts) {
        this.terrainGrid = TerrainGrid.fromMapJson(mapDataJson, tileCosts);
    }

    /**
     * Get the terrain grid (may be null if not initialized).
     */
    public TerrainGrid getTerrainGrid() {
        return terrainGrid;
    }

    /**
     * Get set of positions occupied by characters (excluding a specific character).
     */
    public Set<Point> getOccupiedPositions(UUID excludeCharacterId) {
        Set<Point> occupied = new HashSet<>();
        for (GameCharacter c : characters) {
            if (!c.getId().equals(excludeCharacterId)) {
                occupied.add(new Point(c.getX(), c.getY()));
            }
        }
        return occupied;
    }

    /**
     * Check if a position is occupied by a character (excluding a specific one).
     */
    public boolean isOccupied(int x, int y, UUID excludeCharacterId) {
        return characters.stream()
                .filter(c -> !c.getId().equals(excludeCharacterId))
                .anyMatch(c -> c.getX() == x && c.getY() == y);
    }

    // ============================================
    // Projectile management
    // ============================================

    /**
     * Add a projectile to the active projectiles list.
     */
    public void addProjectile(GameProjectile projectile) {
        if (activeProjectiles == null) {
            activeProjectiles = new ArrayList<>();
        }
        activeProjectiles.add(projectile);
    }

    /**
     * Remove a projectile by ID.
     */
    public void removeProjectile(UUID projectileId) {
        if (activeProjectiles != null) {
            activeProjectiles.removeIf(p -> p.getId().equals(projectileId));
        }
    }

    /**
     * Get all active projectiles.
     */
    public List<GameProjectile> getActiveProjectiles() {
        if (activeProjectiles == null) {
            return new ArrayList<>();
        }
        return new ArrayList<>(activeProjectiles);
    }

    /**
     * Find a character at a specific position.
     */
    public Optional<GameCharacter> findCharacterAt(int x, int y) {
        return characters.stream()
                .filter(c -> c.getX() == x && c.getY() == y)
                .findFirst();
    }

    /**
     * Serialize to bytes for snapshot storage.
     */
    public byte[] serialize() throws IOException {
        try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
             ObjectOutputStream oos = new ObjectOutputStream(bos)) {
            oos.writeObject(this);
            return bos.toByteArray();
        }
    }

    /**
     * Deserialize from bytes.
     */
    public static GameState deserialize(byte[] data) throws IOException, ClassNotFoundException {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(data);
             ObjectInputStream ois = new ObjectInputStream(bis)) {
            return (GameState) ois.readObject();
        }
    }
}
