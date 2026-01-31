package com.hexmanos.engine.core.game;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.map.MapMigrationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/**
 * Service for managing game lifecycle and player interactions.
 */
@Slf4j
@RequiredArgsConstructor
public class GameService {
    private final GameRepository gameRepository;
    private final GamePlayerRepository playerRepository;
    private final AssetRepository assetRepository;
    private final FileStorageService storageService;
    private final GameRoomManager roomManager;
    private final SnapshotService snapshotService;
    private final ObjectMapper objectMapper;
    private final BCryptPasswordEncoder passwordEncoder;
    private final MapMigrationService mapMigrationService;

    private static final int JOIN_CODE_LENGTH = 6;

    /**
     * Create a new game.
     */
    public Game createGame(UUID hostPlayerId, UUID mapAssetId, String name, String password) {
        // Validate map exists
        Asset mapAsset = assetRepository.findById(mapAssetId)
                .orElseThrow(() -> new IllegalArgumentException("Map not found: " + mapAssetId));

        if (mapAsset.getType() != Asset.AssetType.MAP) {
            throw new IllegalArgumentException("Asset is not a map");
        }

        // Check map status - allow PENDING maps only if created by the same user
        if (mapAsset.getStatus() != Asset.AssetStatus.APPROVED) {
            // Asset authorId is the internal user UUID, compare directly with hostPlayerId
            boolean isOwnMap = hostPlayerId.toString().equals(mapAsset.getAuthorId());

            if (!isOwnMap) {
                throw new IllegalArgumentException("Map is not approved");
            }

            if (mapAsset.getStatus() == Asset.AssetStatus.REJECTED) {
                throw new IllegalArgumentException("Map has been rejected");
            }

            log.info("Allowing PENDING map {} for owner {}", mapAssetId, hostPlayerId);
        }

        // Create the game
        Game game = new Game();
        game.setId(UUID.randomUUID());
        game.setName(name);
        game.setHostPlayerId(hostPlayerId);
        game.setMapAssetId(mapAssetId);
        game.setStatus(Game.GameStatus.WAITING);
        game.setJoinCode(generateJoinCode());
        game.setCreatedAt(Instant.now());
        game.setLastActivityAt(Instant.now());

        // Hash password if provided
        if (password != null && !password.isEmpty()) {
            game.setPasswordHash(passwordEncoder.encode(password));
        }

        game = gameRepository.save(game);

        // Add host as first player (color index 0)
        GamePlayer hostPlayer = new GamePlayer();
        hostPlayer.setId(UUID.randomUUID());
        hostPlayer.setGameId(game.getId());
        hostPlayer.setPlayerId(hostPlayerId);
        hostPlayer.setRole(GamePlayer.PlayerRole.HOST);
        hostPlayer.setColorIndex(0);
        hostPlayer.setJoinedAt(Instant.now());
        hostPlayer.setLastSeenAt(Instant.now());
        playerRepository.save(hostPlayer);

        log.info("Created game {} with host {}", game.getId(), hostPlayerId);
        return game;
    }

    /**
     * Start a game - loads map data and characters into memory.
     */
    public Game startGame(UUID gameId, UUID requesterId) {
        Game game = getGame(gameId);

        if (!game.isHost(requesterId)) {
            throw new IllegalArgumentException("Only the host can start the game");
        }

        if (game.getStatus() != Game.GameStatus.WAITING && game.getStatus() != Game.GameStatus.PAUSED) {
            throw new IllegalArgumentException("Game cannot be started from status: " + game.getStatus());
        }

        // Try to restore from snapshot first
        if (roomManager.restoreFromSnapshot(gameId)) {
            // Initialize terrain grid after restore (transient field)
            GameState state = roomManager.getState(gameId);
            if (state != null) {
                // Load map data to get tile costs
                Asset mapAsset = assetRepository.findById(game.getMapAssetId())
                        .orElseThrow(() -> new IllegalStateException("Map not found"));
                String mapDataJson = loadMapData(mapAsset.getStorageKeyPrefix());
                Map<String, Integer> tileCosts = loadTileMovementCosts(mapDataJson);
                state.initializeTerrain(tileCosts);
            }
            game.setStatus(Game.GameStatus.RUNNING);
            game.touch();
            return gameRepository.save(game);
        }

        // Load map data
        Asset mapAsset = assetRepository.findById(game.getMapAssetId())
                .orElseThrow(() -> new IllegalStateException("Map not found"));

        String mapDataJson = loadMapData(mapAsset.getStorageKeyPrefix());
        GameState state = GameState.create(gameId, mapDataJson);

        // Load characters from map data
        List<GameCharacter> characters = extractCharactersFromMap(mapDataJson);
        for (GameCharacter character : characters) {
            state.addCharacter(character);
        }

        // Initialize terrain grid for pathfinding
        Map<String, Integer> tileCosts = loadTileMovementCosts(mapDataJson);
        state.initializeTerrain(tileCosts);

        // Load into memory
        roomManager.loadGame(gameId, state);

        game.setStatus(Game.GameStatus.RUNNING);
        game.touch();
        game = gameRepository.save(game);

        log.info("Started game {} with {} characters", gameId, characters.size());
        return game;
    }

    /**
     * Pause a game.
     */
    public Game pauseGame(UUID gameId, UUID requesterId) {
        Game game = getGame(gameId);

        if (!game.isHost(requesterId)) {
            throw new IllegalArgumentException("Only the host can pause the game");
        }

        if (game.getStatus() != Game.GameStatus.RUNNING) {
            throw new IllegalArgumentException("Game is not running");
        }

        // Save snapshot before pausing
        GameState state = roomManager.getState(gameId);
        if (state != null) {
            snapshotService.saveSnapshot(gameId, state);
        }

        game.setStatus(Game.GameStatus.PAUSED);
        game.touch();
        game = gameRepository.save(game);

        log.info("Paused game {}", gameId);
        return game;
    }

    /**
     * Stop a game completely.
     */
    public void stopGame(UUID gameId, UUID requesterId) {
        Game game = getGame(gameId);

        if (!game.isHost(requesterId)) {
            throw new IllegalArgumentException("Only the host can stop the game");
        }

        // Unload from memory
        roomManager.unloadGame(gameId);

        // Delete snapshots
        snapshotService.deleteSnapshots(gameId);

        // Delete players
        playerRepository.deleteByGameId(gameId);

        // Delete game
        gameRepository.delete(gameId);

        log.info("Stopped and deleted game {}", gameId);
    }

    /**
     * Join a game.
     */
    public GamePlayer joinGame(UUID gameId, UUID playerId, String code, String password) {
        Game game = getGame(gameId);

        if (game.getStatus() == Game.GameStatus.FINISHED) {
            throw new IllegalArgumentException("Game has ended");
        }

        // Check join code
        if (!game.getJoinCode().equals(code)) {
            throw new IllegalArgumentException("Invalid join code");
        }

        // Check password if set
        if (game.getPasswordHash() != null && !game.getPasswordHash().isEmpty()) {
            if (password == null || !passwordEncoder.matches(password, game.getPasswordHash())) {
                throw new IllegalArgumentException("Invalid password");
            }
        }

        // Check if already joined
        Optional<GamePlayer> existing = playerRepository.findByGameIdAndPlayerId(gameId, playerId);
        if (existing.isPresent()) {
            return existing.get();
        }

        // Assign next available color index (0-7)
        List<GamePlayer> existingPlayers = playerRepository.findByGameId(gameId);
        int colorIndex = existingPlayers.size() % 8; // Cycle through 8 colors

        // Create player
        GamePlayer player = new GamePlayer();
        player.setId(UUID.randomUUID());
        player.setGameId(gameId);
        player.setPlayerId(playerId);
        player.setRole(GamePlayer.PlayerRole.PLAYER);
        player.setColorIndex(colorIndex);
        player.setJoinedAt(Instant.now());
        player.setLastSeenAt(Instant.now());
        player = playerRepository.save(player);

        game.touch();
        gameRepository.save(game);

        log.info("Player {} joined game {}", playerId, gameId);
        return player;
    }

    /**
     * Leave a game.
     */
    public void leaveGame(UUID gameId, UUID playerId) {
        Game game = getGame(gameId);

        Optional<GamePlayer> player = playerRepository.findByGameIdAndPlayerId(gameId, playerId);
        if (player.isEmpty()) {
            return; // Not in game
        }

        // Release any controlled character
        roomManager.relinquishControl(gameId, playerId);

        // Remove player
        playerRepository.delete(player.get().getId());

        game.touch();
        gameRepository.save(game);

        log.info("Player {} left game {}", playerId, gameId);
    }

    /**
     * Take control of a character.
     */
    public void takeOverCharacter(UUID gameId, UUID playerId, UUID characterId) {
        Game game = getGame(gameId);

        if (game.getStatus() != Game.GameStatus.RUNNING) {
            throw new IllegalArgumentException("Game is not running");
        }

        // Verify player is in game
        playerRepository.findByGameIdAndPlayerId(gameId, playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player not in game"));

        // Take control
        if (!roomManager.takeControl(gameId, characterId, playerId)) {
            throw new IllegalArgumentException("Cannot take control of character");
        }

        // Update player record
        playerRepository.findByGameIdAndPlayerId(gameId, playerId).ifPresent(player -> {
            player.takeControl(characterId);
            playerRepository.save(player);
        });

        game.touch();
        gameRepository.save(game);
    }

    /**
     * Release control of a character.
     */
    public void relinquishCharacter(UUID gameId, UUID playerId) {
        Game game = getGame(gameId);

        roomManager.relinquishControl(gameId, playerId);

        // Update player record
        playerRepository.findByGameIdAndPlayerId(gameId, playerId).ifPresent(player -> {
            player.relinquishControl();
            playerRepository.save(player);
        });

        game.touch();
        gameRepository.save(game);
    }

    /**
     * Get games hosted by a player.
     */
    public List<Game> getMyGames(UUID playerId) {
        return gameRepository.findByHostPlayerId(playerId);
    }

    /**
     * Get a game by ID.
     */
    public Game getGame(UUID gameId) {
        return gameRepository.findById(gameId)
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + gameId));
    }

    /**
     * Get players in a game.
     */
    public List<GamePlayer> getPlayers(UUID gameId) {
        return playerRepository.findByGameId(gameId);
    }

    /**
     * Get characters in a game.
     */
    public List<GameCharacter> getCharacters(UUID gameId) {
        return roomManager.getCharacters(gameId);
    }

    /**
     * Get the character control map (characterId -> playerId).
     */
    public Map<UUID, UUID> getCharacterControl(UUID gameId) {
        GameState state = roomManager.getState(gameId);
        if (state == null) {
            return Map.of();
        }
        return state.getCharacterControl();
    }

    /**
     * Move a character in the game.
     * Returns the updated character position, or throws if invalid.
     */
    public MoveResult moveCharacter(UUID gameId, UUID playerId, String direction) {
        Game game = getGame(gameId);

        if (game.getStatus() != Game.GameStatus.RUNNING) {
            throw new IllegalArgumentException("Game is not running");
        }

        // Get the character controlled by this player
        UUID characterId = roomManager.getControlledCharacter(gameId, playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player does not control any character"));

        // Validate direction and convert to delta
        int dx = 0, dy = 0;
        switch (direction.toLowerCase()) {
            case "n", "up" -> dy = -1;
            case "s", "down" -> dy = 1;
            case "e", "right" -> dx = 1;
            case "w", "left" -> dx = -1;
            default -> throw new IllegalArgumentException("Invalid direction: " + direction);
        }

        // Execute the move
        if (!roomManager.moveCharacter(gameId, characterId, dx, dy)) {
            throw new IllegalArgumentException("Move failed");
        }

        // Get the updated character and game state
        GameState state = roomManager.getState(gameId);
        GameCharacter character = state.findCharacter(characterId)
                .orElseThrow(() -> new IllegalStateException("Character not found after move"));

        // Calculate duration based on terrain cost at destination
        int movementCost = 1;
        TerrainGrid terrain = state.getTerrainGrid();
        if (terrain != null) {
            movementCost = Math.max(1, terrain.getCost(character.getX(), character.getY()));
        }
        long duration = BASE_MOVE_DELAY_MS * movementCost;

        game.touch();
        gameRepository.save(game);

        // Return with the character's animation state and duration
        return new MoveResult(characterId, character.getX(), character.getY(), direction, character.getCurrentState(), duration);
    }

    /**
     * Base move delay in milliseconds for movement cost 1.
     * Higher movement costs multiply this value.
     */
    public static final long BASE_MOVE_DELAY_MS = 200;

    /**
     * Result of a character move operation.
     * @param characterId The character that moved
     * @param x New X position
     * @param y New Y position
     * @param direction The direction of movement (n, s, e, w)
     * @param state The animation state (walk_up, walk_down, etc. or idle)
     * @param duration The duration in milliseconds for this move (based on terrain cost)
     */
    public record MoveResult(UUID characterId, int x, int y, String direction, String state, long duration) {}

    /**
     * Result of a path request operation.
     */
    public record PathResult(UUID characterId, List<int[]> path) {
        public static PathResult from(UUID characterId, List<Point> points) {
            List<int[]> pathCoords = points.stream()
                    .map(p -> new int[]{p.x(), p.y()})
                    .toList();
            return new PathResult(characterId, pathCoords);
        }
    }

    /**
     * Request a path for a character to move to a target position.
     * Uses A* pathfinding.
     */
    public PathResult requestPath(UUID gameId, UUID playerId, int targetX, int targetY) {
        Game game = getGame(gameId);

        if (game.getStatus() != Game.GameStatus.RUNNING) {
            throw new IllegalArgumentException("Game is not running");
        }

        // Get the character controlled by this player
        UUID characterId = roomManager.getControlledCharacter(gameId, playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player does not control any character"));

        // Request path
        List<Point> path = roomManager.requestPath(gameId, characterId, targetX, targetY);

        if (path.isEmpty()) {
            throw new IllegalArgumentException("No path found to target");
        }

        game.touch();
        gameRepository.save(game);

        return PathResult.from(characterId, path);
    }

    /**
     * Cancel the current path for a player's controlled character.
     */
    public void cancelPath(UUID gameId, UUID playerId) {
        Game game = getGame(gameId);

        // Get the character controlled by this player
        roomManager.getControlledCharacter(gameId, playerId).ifPresent(characterId ->
                roomManager.cancelPath(gameId, characterId)
        );

        game.touch();
        gameRepository.save(game);
    }

    /**
     * Execute the next step in a character's path.
     * Returns the move result if a step was taken, or null if no path or at end.
     */
    public MoveResult executePathStep(UUID gameId, UUID characterId) {
        GameState state = roomManager.getState(gameId);
        if (state == null) {
            return null;
        }

        Point newPos = roomManager.executePathStep(gameId, characterId);
        if (newPos == null) {
            return null;
        }

        // Determine direction from the move
        GameCharacter character = state.findCharacter(characterId).orElse(null);
        if (character == null) {
            return null;
        }

        // Get direction from character's current state (set by move())
        String direction = switch (character.getCurrentState()) {
            case "walk_up" -> "n";
            case "walk_down" -> "s";
            case "walk_left" -> "w";
            case "walk_right" -> "e";
            default -> "s";
        };

        // Calculate duration based on terrain cost at destination
        int movementCost = 1;
        TerrainGrid terrain = state.getTerrainGrid();
        if (terrain != null) {
            movementCost = Math.max(1, terrain.getCost(newPos.x(), newPos.y()));
        }
        long duration = BASE_MOVE_DELAY_MS * movementCost;

        return new MoveResult(characterId, newPos.x(), newPos.y(), direction, character.getCurrentState(), duration);
    }

    // ============================================
    // Attack methods
    // ============================================

    /**
     * Result of an attack operation.
     */
    public record AttackResult(
            UUID characterId,
            String attackId,
            int targetX,
            int targetY,
            String direction,
            String state,
            long animationDuration,
            UUID projectileId,         // Null for melee
            UUID projectileAssetId,    // Null for melee
            int projectileSpeed        // 0 for melee
    ) {}

    /**
     * Execute an attack from a player's controlled character.
     */
    public AttackResult attack(UUID gameId, UUID playerId, String attackId, int targetX, int targetY) {
        Game game = getGame(gameId);

        if (game.getStatus() != Game.GameStatus.RUNNING) {
            throw new IllegalArgumentException("Game is not running");
        }

        // Get controlled character
        UUID characterId = roomManager.getControlledCharacter(gameId, playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player does not control any character"));

        GameState state = roomManager.getState(gameId);
        GameCharacter character = state.findCharacter(characterId)
                .orElseThrow(() -> new IllegalStateException("Character not found"));

        // Load attack definition from character asset
        AttackDefinition attack = loadAttackDefinition(character.getAssetId(), attackId);
        if (attack == null) {
            throw new IllegalArgumentException("Attack not found: " + attackId);
        }

        // Validate cooldown
        if (!character.canAttack(attackId, attack.cooldownMs())) {
            throw new IllegalArgumentException("Attack on cooldown");
        }

        // Validate range (Chebyshev distance - allows diagonal)
        int dx = Math.abs(targetX - character.getX());
        int dy = Math.abs(targetY - character.getY());
        int distance = Math.max(dx, dy);
        if (distance > attack.range()) {
            throw new IllegalArgumentException("Target out of range");
        }

        // Determine facing direction based on target
        String direction = calculateDirection(character.getX(), character.getY(), targetX, targetY);
        character.setFacing(direction);

        // Start attack animation
        long animDuration = attack.getAnimationDurationMs();
        character.startAttack(attackId, animDuration, attack.cooldownMs());

        // Handle projectile for ranged attacks
        UUID projectileId = null;
        if (attack.isRanged()) {
            GameProjectile projectile = GameProjectile.create(
                    gameId, character, playerId, attack, targetX, targetY
            );
            state.addProjectile(projectile);
            projectileId = projectile.getId();
        }
        // Note: Melee damage is handled by the scheduler after animation completes

        game.touch();
        gameRepository.save(game);

        return new AttackResult(
                characterId,
                attackId,
                targetX,
                targetY,
                direction,
                character.getCurrentState(),
                animDuration,
                projectileId,
                attack.projectileAssetId(),
                attack.projectileSpeed()
        );
    }

    /**
     * Apply melee damage to a target at a position.
     * Called by the scheduler after melee attack animation completes.
     */
    public GameCharacter applyMeleeDamage(UUID gameId, UUID attackerCharacterId, String attackId, int targetX, int targetY) {
        GameState state = roomManager.getState(gameId);
        if (state == null) {
            return null;
        }

        GameCharacter attacker = state.findCharacter(attackerCharacterId).orElse(null);
        if (attacker == null) {
            return null;
        }

        // Load attack definition
        AttackDefinition attack = loadAttackDefinition(attacker.getAssetId(), attackId);
        if (attack == null || !attack.isMelee()) {
            return null;
        }

        // Find character at target position
        Optional<GameCharacter> targetChar = state.findCharacterAt(targetX, targetY);
        if (targetChar.isEmpty()) {
            return null; // No target at that position
        }

        GameCharacter target = targetChar.get();
        if (target.getId().equals(attackerCharacterId)) {
            return null; // Can't hit self
        }

        // Apply damage
        target.takeDamage(attack.damage());
        return target;
    }

    /**
     * Load attack definition from a character asset's definition.json.
     */
    public AttackDefinition loadAttackDefinition(UUID assetId, String attackId) {
        Asset asset = assetRepository.findById(assetId).orElse(null);
        if (asset == null) {
            return null;
        }

        String defKey = asset.getStorageKeyPrefix() + "/definition.json";
        byte[] data = storageService.readBytes(defKey);
        if (data == null) {
            return null;
        }

        try {
            JsonNode root = objectMapper.readTree(data);
            JsonNode attacks = root.get("attacks");
            if (attacks == null || !attacks.isArray()) {
                return null;
            }

            for (JsonNode atk : attacks) {
                if (attackId.equals(atk.get("id").asText())) {
                    return new AttackDefinition(
                            atk.get("id").asText(),
                            atk.has("name") ? atk.get("name").asText() : attackId,
                            AttackDefinition.AttackType.valueOf(atk.get("type").asText()),
                            atk.get("range").asInt(),
                            atk.get("damage").asInt(),
                            atk.get("cooldownMs").asLong(),
                            atk.has("projectileAssetId") && !atk.get("projectileAssetId").isNull()
                                    ? UUID.fromString(atk.get("projectileAssetId").asText())
                                    : null,
                            atk.has("projectileSpeed") ? atk.get("projectileSpeed").asInt() : 0
                    );
                }
            }
        } catch (Exception e) {
            log.error("Failed to load attack definition from {}: {}", defKey, e.getMessage());
        }
        return null;
    }

    /**
     * Load all attack definitions for a character asset.
     */
    public List<AttackDefinition> loadAllAttackDefinitions(UUID assetId) {
        List<AttackDefinition> attacks = new ArrayList<>();
        Asset asset = assetRepository.findById(assetId).orElse(null);
        if (asset == null) {
            return attacks;
        }

        String defKey = asset.getStorageKeyPrefix() + "/definition.json";
        byte[] data = storageService.readBytes(defKey);
        if (data == null) {
            return attacks;
        }

        try {
            JsonNode root = objectMapper.readTree(data);
            JsonNode attacksNode = root.get("attacks");
            if (attacksNode == null || !attacksNode.isArray()) {
                return attacks;
            }

            for (JsonNode atk : attacksNode) {
                try {
                    attacks.add(new AttackDefinition(
                            atk.get("id").asText(),
                            atk.has("name") ? atk.get("name").asText() : atk.get("id").asText(),
                            AttackDefinition.AttackType.valueOf(atk.get("type").asText()),
                            atk.get("range").asInt(),
                            atk.get("damage").asInt(),
                            atk.get("cooldownMs").asLong(),
                            atk.has("projectileAssetId") && !atk.get("projectileAssetId").isNull()
                                    ? UUID.fromString(atk.get("projectileAssetId").asText())
                                    : null,
                            atk.has("projectileSpeed") ? atk.get("projectileSpeed").asInt() : 0
                    ));
                } catch (Exception e) {
                    log.warn("Failed to parse attack: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Failed to load attack definitions from {}: {}", defKey, e.getMessage());
        }
        return attacks;
    }

    /**
     * Get the room manager for scheduler access.
     */
    public GameRoomManager getRoomManager() {
        return roomManager;
    }

    /**
     * Calculate direction from source to target.
     */
    private String calculateDirection(int fromX, int fromY, int toX, int toY) {
        int dx = toX - fromX;
        int dy = toY - fromY;

        // Prefer horizontal/vertical over diagonal
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? "right" : "left";
        } else {
            return dy > 0 ? "down" : "up";
        }
    }

    /**
     * Restore all RUNNING games from snapshots on startup.
     * Called after backend restart to recover in-memory state.
     */
    public void restoreRunningGames() {
        List<Game> activeGames = gameRepository.findActiveGames();
        int restored = 0;

        for (Game game : activeGames) {
            if (game.getStatus() != Game.GameStatus.RUNNING) {
                continue;
            }

            if (roomManager.isLoaded(game.getId())) {
                continue; // Already in memory
            }

            try {
                if (roomManager.restoreFromSnapshot(game.getId())) {
                    // Initialize terrain grid (transient field lost during serialization)
                    GameState state = roomManager.getState(game.getId());
                    if (state != null) {
                        Asset mapAsset = assetRepository.findById(game.getMapAssetId()).orElse(null);
                        if (mapAsset != null) {
                            String mapDataJson = loadMapData(mapAsset.getStorageKeyPrefix());
                            Map<String, Integer> tileCosts = loadTileMovementCosts(mapDataJson);
                            state.initializeTerrain(tileCosts);
                        }
                    }
                    restored++;
                    log.info("Auto-restored RUNNING game {} from snapshot", game.getId());
                } else {
                    log.warn("No snapshot found for RUNNING game {}, resetting to WAITING", game.getId());
                    game.setStatus(Game.GameStatus.WAITING);
                    gameRepository.save(game);
                }
            } catch (Exception e) {
                log.error("Failed to restore game {}: {}", game.getId(), e.getMessage(), e);
            }
        }

        if (restored > 0) {
            log.info("Restored {} RUNNING game(s) from snapshots on startup", restored);
        }
    }

    /**
     * Clean up expired games.
     */
    public void cleanupExpiredGames(Instant cutoff) {
        List<Game> expired = gameRepository.findExpiredGames(cutoff);
        for (Game game : expired) {
            log.info("Cleaning up expired game {}", game.getId());
            roomManager.unloadGame(game.getId());
            snapshotService.deleteSnapshots(game.getId());
            playerRepository.deleteByGameId(game.getId());
            gameRepository.delete(game.getId());
        }
        if (!expired.isEmpty()) {
            log.info("Cleaned up {} expired games", expired.size());
        }
    }

    /**
     * Generate a random join code.
     */
    private String generateJoinCode() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        Random random = new Random();
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < JOIN_CODE_LENGTH; i++) {
            code.append(chars.charAt(random.nextInt(chars.length())));
        }
        return code.toString();
    }

    /**
     * Load map data from storage, migrating to new format if needed.
     * If migration occurs, the updated map.json is saved back to storage.
     */
    private String loadMapData(String storageKeyPrefix) {
        String mapDataKey = storageKeyPrefix + "/map.json";
        byte[] data = storageService.readBytes(mapDataKey);
        if (data == null) {
            throw new IllegalStateException("Map data not found: " + mapDataKey);
        }

        String mapJson = new String(data, StandardCharsets.UTF_8);

        // Check if migration is needed (old format with single "paths" layer)
        if (mapMigrationService.needsMigration(mapJson)) {
            log.info("Migrating map {} to new waterPaths/groundPaths format", storageKeyPrefix);
            mapJson = mapMigrationService.migrate(mapJson);

            // Persist the migrated map back to storage
            try {
                storageService.uploadBytes(
                    mapJson.getBytes(StandardCharsets.UTF_8),
                    mapDataKey,
                    "application/json"
                );
                log.info("Saved migrated map to {}", mapDataKey);
            } catch (Exception e) {
                log.error("Failed to save migrated map to storage, continuing with in-memory migration", e);
            }
        }

        return mapJson;
    }

    /**
     * Extract characters from map data JSON.
     */
    private List<GameCharacter> extractCharactersFromMap(String mapDataJson) {
        List<GameCharacter> characters = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(mapDataJson);
            JsonNode charactersNode = root.get("characters");
            if (charactersNode != null && charactersNode.isArray()) {
                for (JsonNode charNode : charactersNode) {
                    String characterAssetId = charNode.get("characterAssetId").asText();
                    int x = charNode.get("x").asInt();
                    int y = charNode.get("y").asInt();

                    // Get character name from asset
                    String name = "Character";
                    try {
                        Asset charAsset = assetRepository.findById(UUID.fromString(characterAssetId)).orElse(null);
                        if (charAsset != null) {
                            name = charAsset.getName();
                        }
                    } catch (Exception e) {
                        log.warn("Could not load character asset name", e);
                    }

                    GameCharacter character = GameCharacter.fromPlacement(
                            UUID.fromString(characterAssetId),
                            name,
                            x,
                            y
                    );
                    characters.add(character);
                }
            }
        } catch (Exception e) {
            log.error("Failed to extract characters from map data", e);
        }
        return characters;
    }

    /**
     * Load movement costs for all tiles referenced in the map.
     * Reads each tile's properties.json to get passable and movementCost values.
     *
     * @return Map of tile asset ID to movement cost (0 = impassable)
     */
    private Map<String, Integer> loadTileMovementCosts(String mapDataJson) {
        Map<String, Integer> tileCosts = new HashMap<>();
        Set<String> tileAssetIds = new HashSet<>();

        try {
            JsonNode root = objectMapper.readTree(mapDataJson);
            JsonNode layers = root.get("layers");
            if (layers == null) {
                return tileCosts;
            }

            int height = root.get("height").asInt();
            int width = root.get("width").asInt();

            // Collect tile asset IDs from terrain layer
            JsonNode terrain = layers.get("terrain");
            if (terrain != null && terrain.isArray()) {
                for (int y = 0; y < terrain.size() && y < height; y++) {
                    JsonNode row = terrain.get(y);
                    if (row != null && row.isArray()) {
                        for (int x = 0; x < row.size() && x < width; x++) {
                            JsonNode cell = row.get(x);
                            if (cell != null && !cell.isNull() && cell.has("tileAssetId")) {
                                tileAssetIds.add(cell.get("tileAssetId").asText());
                            }
                        }
                    }
                }
            }

            // Collect path asset IDs from water and ground path layers
            collectPathAssetIds(layers, "waterPaths", height, width, tileAssetIds);
            collectPathAssetIds(layers, "groundPaths", height, width, tileAssetIds);

            // Load properties for each unique tile asset
            for (String assetId : tileAssetIds) {
                try {
                    Asset asset = assetRepository.findById(UUID.fromString(assetId)).orElse(null);
                    if (asset == null) {
                        log.warn("Tile asset not found: {}", assetId);
                        continue;
                    }

                    String propertiesKey = asset.getStorageKeyPrefix() + "/properties.json";
                    byte[] propertiesData = storageService.readBytes(propertiesKey);
                    if (propertiesData == null) {
                        log.debug("No properties.json for tile {}, using default passable=true, cost=1", assetId);
                        tileCosts.put(assetId, 1);
                        continue;
                    }

                    JsonNode props = objectMapper.readTree(propertiesData);

                    // Check passable flag (default true)
                    boolean passable = props.has("passable") ? props.get("passable").asBoolean(true) : true;
                    if (!passable) {
                        tileCosts.put(assetId, 0); // Impassable
                        log.debug("Tile {} is impassable", assetId);
                    } else {
                        // Get movement cost (default 1)
                        int movementCost = props.has("movementCost") ? props.get("movementCost").asInt(1) : 1;
                        if (movementCost <= 0) {
                            movementCost = 1; // Ensure at least 1 if passable
                        }
                        tileCosts.put(assetId, movementCost);
                        log.debug("Tile {} has movement cost {}", assetId, movementCost);
                    }
                } catch (Exception e) {
                    log.warn("Failed to load properties for tile {}: {}", assetId, e.getMessage());
                    tileCosts.put(assetId, 1); // Default to passable
                }
            }

            log.info("Loaded movement costs for {} tile assets", tileCosts.size());
        } catch (Exception e) {
            log.error("Failed to load tile movement costs from map data", e);
        }

        return tileCosts;
    }

    /**
     * Helper to collect path asset IDs from a path layer.
     */
    private void collectPathAssetIds(JsonNode layers, String layerName, int height, int width, Set<String> assetIds) {
        JsonNode pathLayer = layers.get(layerName);
        if (pathLayer != null && pathLayer.isArray()) {
            for (int y = 0; y < pathLayer.size() && y < height; y++) {
                JsonNode row = pathLayer.get(y);
                if (row != null && row.isArray()) {
                    for (int x = 0; x < row.size() && x < width; x++) {
                        JsonNode cell = row.get(x);
                        if (cell != null && !cell.isNull() && cell.has("pathAssetId")) {
                            assetIds.add(cell.get("pathAssetId").asText());
                        }
                    }
                }
            }
        }
    }
}
