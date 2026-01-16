package com.hexmanos.engine.app.config.core;

import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.asset.AssetService;
import com.hexmanos.engine.external.postgres.asset.PostgresAssetRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AssetConfig {

    @Bean
    public AssetService assetService(PostgresAssetRepository assetRepository) {
        // Wiring the Core Service manually with the Concrete Adapter
        return new AssetService(assetRepository);
    }
}
