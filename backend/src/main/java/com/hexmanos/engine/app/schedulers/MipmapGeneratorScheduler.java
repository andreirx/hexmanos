package com.hexmanos.engine.app.schedulers;

import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.mipmap.MipmapGeneratorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Background scheduler that generates mipmaps for TILE, CHARACTER, and OBJECT assets
 * that don't have mipmaps yet.
 *
 * Generates 64x64 and 32x32 variants for all PNG files (excluding transitions
 * and existing mipmaps).
 *
 * Runs every 60 seconds.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MipmapGeneratorScheduler {

    private final AssetRepository assetRepository;
    private final FileStorageService fileStorageService;
    private final MipmapGeneratorService mipmapGeneratorService;

    @Scheduled(fixedDelay = 60000) // 60 seconds
    public void generateMissingMipmaps() {
        log.debug("Running mipmap generator scheduler...");

        int totalGenerated = 0;

        // Process TILE assets
        List<Asset> tileAssets = assetRepository.findByType(Asset.AssetType.TILE);
        totalGenerated += processAssets(tileAssets, "tile");

        // Process CHARACTER assets
        List<Asset> characterAssets = assetRepository.findByType(Asset.AssetType.CHARACTER);
        totalGenerated += processAssets(characterAssets, "character");

        // Process OBJECT assets (for projectiles and other objects)
        List<Asset> objectAssets = assetRepository.findByType(Asset.AssetType.OBJECT);
        totalGenerated += processAssets(objectAssets, "object");

        if (totalGenerated > 0) {
            log.info("Mipmap generator scheduler completed: generated mipmaps for {} file(s)", totalGenerated);
        }
    }

    /**
     * Process a list of assets and generate mipmaps for their PNG files.
     *
     * @param assets List of assets to process
     * @param assetType Type label for logging
     * @return Number of files for which mipmaps were generated
     */
    private int processAssets(List<Asset> assets, String assetType) {
        int generated = 0;

        for (Asset asset : assets) {
            String storageKeyPrefix = asset.getStorageKeyPrefix();

            // Skip if no storage key
            if (storageKeyPrefix == null || storageKeyPrefix.isEmpty()) {
                continue;
            }

            try {
                // List all files in the asset directory
                List<String> files = fileStorageService.listFiles(storageKeyPrefix);
                if (files == null || files.isEmpty()) {
                    continue;
                }

                int filesGenerated = mipmapGeneratorService.generateMipmapsForFiles(storageKeyPrefix, files);
                if (filesGenerated > 0) {
                    log.info("Generated mipmaps for {} {} files in asset: {} ({})",
                            filesGenerated, assetType, asset.getName(), asset.getId());
                    generated += filesGenerated;
                }
            } catch (Exception e) {
                log.error("Failed to generate mipmaps for {} asset {}: {}",
                        assetType, asset.getId(), e.getMessage());
            }
        }

        return generated;
    }
}
