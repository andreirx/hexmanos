package com.hexmanos.engine.core.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.map.MapMigrationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GameServiceTest {

    @Mock private GameRepository gameRepository;
    @Mock private GamePlayerRepository playerRepository;
    @Mock private AssetRepository assetRepository;
    @Mock private FileStorageService storageService;
    @Mock private GameRoomManager roomManager;
    @Mock private SnapshotService snapshotService;
    @Mock private MapMigrationService mapMigrationService;

    private GameService gameService;
    private ObjectMapper objectMapper;
    private BCryptPasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        passwordEncoder = new BCryptPasswordEncoder();
        gameService = new GameService(
                gameRepository,
                playerRepository,
                assetRepository,
                storageService,
                roomManager,
                snapshotService,
                objectMapper,
                passwordEncoder,
                mapMigrationService
        );
    }

    @Test
    @DisplayName("Should allow creating game with APPROVED map")
    void createGame_withApprovedMap_shouldSucceed() {
        // Given
        UUID hostPlayerId = UUID.randomUUID();
        UUID mapAssetId = UUID.randomUUID();
        String authorId = UUID.randomUUID().toString(); // Different author

        Asset approvedMap = createMapAsset(mapAssetId, authorId, Asset.AssetStatus.APPROVED);
        when(assetRepository.findById(mapAssetId)).thenReturn(Optional.of(approvedMap));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> inv.getArgument(0));
        when(playerRepository.save(any(GamePlayer.class))).thenAnswer(inv -> inv.getArgument(0));

        // When
        Game game = gameService.createGame(hostPlayerId, mapAssetId, "Test Game", null);

        // Then
        assertNotNull(game);
        assertEquals("Test Game", game.getName());
        assertEquals(hostPlayerId, game.getHostPlayerId());
        verify(gameRepository).save(any(Game.class));
    }

    @Test
    @DisplayName("Should allow creating game with PENDING map if user is the author")
    void createGame_withPendingMapOwnedByUser_shouldSucceed() {
        // Given
        UUID hostPlayerId = UUID.randomUUID();
        UUID mapAssetId = UUID.randomUUID();
        String authorId = hostPlayerId.toString(); // Same as host player

        Asset pendingMap = createMapAsset(mapAssetId, authorId, Asset.AssetStatus.PENDING);
        when(assetRepository.findById(mapAssetId)).thenReturn(Optional.of(pendingMap));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> inv.getArgument(0));
        when(playerRepository.save(any(GamePlayer.class))).thenAnswer(inv -> inv.getArgument(0));

        // When
        Game game = gameService.createGame(hostPlayerId, mapAssetId, "My Pending Map Game", null);

        // Then
        assertNotNull(game);
        assertEquals("My Pending Map Game", game.getName());
        assertEquals(hostPlayerId, game.getHostPlayerId());
        verify(gameRepository).save(any(Game.class));
    }

    @Test
    @DisplayName("Should reject creating game with PENDING map if user is NOT the author")
    void createGame_withPendingMapNotOwnedByUser_shouldFail() {
        // Given
        UUID hostPlayerId = UUID.randomUUID();
        UUID mapAssetId = UUID.randomUUID();
        String authorId = UUID.randomUUID().toString(); // Different author

        Asset pendingMap = createMapAsset(mapAssetId, authorId, Asset.AssetStatus.PENDING);
        when(assetRepository.findById(mapAssetId)).thenReturn(Optional.of(pendingMap));

        // When & Then
        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> gameService.createGame(hostPlayerId, mapAssetId, "Test Game", null)
        );
        assertEquals("Map is not approved", exception.getMessage());
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    @DisplayName("Should reject creating game with REJECTED map even if user is the author")
    void createGame_withRejectedMapOwnedByUser_shouldFail() {
        // Given
        UUID hostPlayerId = UUID.randomUUID();
        UUID mapAssetId = UUID.randomUUID();
        String authorId = hostPlayerId.toString(); // Same as host player

        Asset rejectedMap = createMapAsset(mapAssetId, authorId, Asset.AssetStatus.REJECTED);
        when(assetRepository.findById(mapAssetId)).thenReturn(Optional.of(rejectedMap));

        // When & Then
        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> gameService.createGame(hostPlayerId, mapAssetId, "Test Game", null)
        );
        assertEquals("Map has been rejected", exception.getMessage());
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    @DisplayName("Should reject creating game with non-existent map")
    void createGame_withNonExistentMap_shouldFail() {
        // Given
        UUID hostPlayerId = UUID.randomUUID();
        UUID mapAssetId = UUID.randomUUID();

        when(assetRepository.findById(mapAssetId)).thenReturn(Optional.empty());

        // When & Then
        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> gameService.createGame(hostPlayerId, mapAssetId, "Test Game", null)
        );
        assertTrue(exception.getMessage().contains("Map not found"));
    }

    @Test
    @DisplayName("Should reject creating game with non-MAP asset type")
    void createGame_withNonMapAsset_shouldFail() {
        // Given
        UUID hostPlayerId = UUID.randomUUID();
        UUID assetId = UUID.randomUUID();

        Asset characterAsset = new Asset();
        characterAsset.setId(assetId);
        characterAsset.setType(Asset.AssetType.CHARACTER);
        characterAsset.setStatus(Asset.AssetStatus.APPROVED);

        when(assetRepository.findById(assetId)).thenReturn(Optional.of(characterAsset));

        // When & Then
        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> gameService.createGame(hostPlayerId, assetId, "Test Game", null)
        );
        assertEquals("Asset is not a map", exception.getMessage());
    }

    private Asset createMapAsset(UUID id, String authorId, Asset.AssetStatus status) {
        Asset asset = new Asset();
        asset.setId(id);
        asset.setType(Asset.AssetType.MAP);
        asset.setName("Test Map");
        asset.setAuthorId(authorId);
        asset.setStatus(status);
        asset.setStorageKeyPrefix("maps/" + id);
        return asset;
    }
}
