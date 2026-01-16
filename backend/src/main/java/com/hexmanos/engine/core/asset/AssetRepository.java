package com.hexmanos.engine.core.asset;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AssetRepository {
    List<Asset> findAll();
    Optional<Asset> findById(UUID id);
    List<Asset> findByStatus(Asset.AssetStatus status);
    Asset save(Asset asset);
}
