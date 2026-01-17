package com.hexmanos.engine.app.schedulers;

import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.transition.TransitionGeneratorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Background scheduler that generates tile transitions for TILE assets
 * that don't have transitions yet.
 *
 * Only generates transitions for tile_0.png (first variation).
 * Runs every 60 seconds.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TransitionGeneratorScheduler {

    private final AssetRepository assetRepository;
    private final TransitionGeneratorService transitionGeneratorService;

    @Scheduled(fixedDelay = 60000) // 60 seconds
    public void generateMissingTransitions() {
        log.debug("Running transition generator scheduler...");

        List<Asset> tileAssets = assetRepository.findByType(Asset.AssetType.TILE);

        int generated = 0;
        for (Asset asset : tileAssets) {
            String storageKeyPrefix = asset.getStorageKeyPrefix();

            // Skip if no storage key (shouldn't happen but be safe)
            if (storageKeyPrefix == null || storageKeyPrefix.isEmpty()) {
                continue;
            }

            // Skip if tile_0 doesn't exist
            if (!transitionGeneratorService.hasTile0(storageKeyPrefix)) {
                continue;
            }

            // Skip if transitions already exist
            if (transitionGeneratorService.hasTransitionsForTile0(storageKeyPrefix)) {
                continue;
            }

            // Generate transitions for tile_0
            try {
                log.info("Generating transitions for tile asset: {} ({})", asset.getName(), asset.getId());
                transitionGeneratorService.generateTransitionsForTile0(storageKeyPrefix);
                generated++;
            } catch (Exception e) {
                log.error("Failed to generate transitions for asset {}: {}", asset.getId(), e.getMessage());
            }
        }

        if (generated > 0) {
            log.info("Transition generator scheduler completed: generated transitions for {} tile(s)", generated);
        }
    }
}
