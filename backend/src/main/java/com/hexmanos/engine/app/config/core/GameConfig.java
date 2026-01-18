package com.hexmanos.engine.app.config.core;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.game.*;
import com.hexmanos.engine.external.postgres.game.PostgresGamePlayerRepository;
import com.hexmanos.engine.external.postgres.game.PostgresGameRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@Configuration
public class GameConfig {

    @Bean
    public BCryptPasswordEncoder gamePasswordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SnapshotService snapshotService(FileStorageService fileStorageService,
                                           PostgresGameRepository gameRepository) {
        return new SnapshotService(fileStorageService, gameRepository);
    }

    @Bean
    public GameRoomManager gameRoomManager(SnapshotService snapshotService) {
        return new GameRoomManager(snapshotService);
    }

    @Bean
    public GameService gameService(PostgresGameRepository gameRepository,
                                   PostgresGamePlayerRepository playerRepository,
                                   AssetRepository assetRepository,
                                   FileStorageService fileStorageService,
                                   GameRoomManager roomManager,
                                   SnapshotService snapshotService,
                                   ObjectMapper objectMapper,
                                   BCryptPasswordEncoder gamePasswordEncoder) {
        return new GameService(
                gameRepository,
                playerRepository,
                assetRepository,
                fileStorageService,
                roomManager,
                snapshotService,
                objectMapper,
                gamePasswordEncoder
        );
    }
}
