package com.hexmanos.engine.core.asset;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@RequiredArgsConstructor
public class AssetService {
    private final AssetRepository assetRepository;

    public List<Asset> getAll() {
        return assetRepository.findAll();
    }

    public Optional<Asset> getById(UUID id) {
        return assetRepository.findById(id);
    }

    public List<Asset> getByStatus(Asset.AssetStatus status) {
        return assetRepository.findByStatus(status);
    }

    public Asset create(Asset asset) {
        // Business Rule: New assets are always PENDING
        asset.setStatus(Asset.AssetStatus.PENDING);

        // Business Rule: Ensure ID exists (though DB usually handles generation,
        // for Clean Arch we sometimes like the domain to know the ID early)
        if (asset.getId() == null) {
            asset.setId(UUID.randomUUID());
        }

        log.info("Registering new asset: {}", asset.getName());
        return assetRepository.save(asset);
    }

    public Asset approve(UUID id) {
        return assetRepository.findById(id)
                .map(asset -> {
                    asset.setStatus(Asset.AssetStatus.APPROVED);
                    log.info("Asset approved: {}", id);
                    return assetRepository.save(asset);
                })
                .orElseThrow(() -> new IllegalArgumentException("Asset not found: " + id));
    }
}
