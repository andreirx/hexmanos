package com.hexmanos.engine.core.game;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.files.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

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

        // Add host as first player
        GamePlayer hostPlayer = new GamePlayer();
        hostPlayer.setId(UUID.randomUUID());
        hostPlayer.setGameId(game.getId());
        hostPlayer.setPlayerId(hostPlayerId);
        hostPlayer.setRole(GamePlayer.PlayerRole.HOST);
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

        // Create player
        GamePlayer player = new GamePlayer();
        player.setId(UUID.randomUUID());
        player.setGameId(gameId);
        player.setPlayerId(playerId);
        player.setRole(GamePlayer.PlayerRole.PLAYER);
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
     * Load map data from storage.
     */
    private String loadMapData(String storageKeyPrefix) {
        String mapDataKey = storageKeyPrefix + "/map.json";
        byte[] data = storageService.readBytes(mapDataKey);
        if (data == null) {
            throw new IllegalStateException("Map data not found: " + mapDataKey);
        }
        return new String(data);
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
}
