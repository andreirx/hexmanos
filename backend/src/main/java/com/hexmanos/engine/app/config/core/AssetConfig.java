package com.hexmanos.engine.app.config.core;

import com.hexmanos.engine.core.asset.AssetService;
import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.external.postgres.asset.PostgresAssetRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AssetConfig {

    @Bean
    public AssetService assetService(PostgresAssetRepository assetRepository,
                                     FileStorageService fileStorageService) {
        // Wiring the Core Service manually with the Concrete Adapters
        return new AssetService(assetRepository, fileStorageService);
    }
}
