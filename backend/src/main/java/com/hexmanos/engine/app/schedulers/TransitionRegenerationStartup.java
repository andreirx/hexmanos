package com.hexmanos.engine.app.schedulers;

import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetRepository;
import com.hexmanos.engine.core.transition.TransitionGeneratorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * One-time startup listener to regenerate all tile transitions.
 * This is needed when the transition algorithm changes.
 *
 * The listener deletes all existing transitions, and the TransitionGeneratorScheduler
 * will regenerate them on its next run (within 60 seconds).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TransitionRegenerationStartup {

    private final AssetRepository assetRepository;
    private final TransitionGeneratorService transitionGeneratorService;

    // Set this to true to trigger regeneration on next startup, then set back to false
    private static final boolean REGENERATE_ON_STARTUP = false;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (!REGENERATE_ON_STARTUP) {
            log.info("Transition regeneration skipped (REGENERATE_ON_STARTUP = false)");
            return;
        }

        log.info("Starting transition regeneration - deleting all existing transitions...");

        try {
            List<Asset> tileAssets = assetRepository.findByType(Asset.AssetType.TILE);
            int count = 0;

            for (Asset asset : tileAssets) {
                String storageKeyPrefix = asset.getStorageKeyPrefix();
                if (storageKeyPrefix == null || storageKeyPrefix.isEmpty()) {
                    continue;
                }

                // Delete existing transitions - scheduler will regenerate
                if (transitionGeneratorService.hasTransitionsForTile0(storageKeyPrefix)) {
                    transitionGeneratorService.deleteTransitionsForTile0(storageKeyPrefix);
                    count++;
                }
            }

            log.info("Deleted transitions for {} tile assets. Scheduler will regenerate them.", count);
        } catch (Exception e) {
            log.error("Failed to regenerate transitions: {}", e.getMessage(), e);
        }
    }
}
