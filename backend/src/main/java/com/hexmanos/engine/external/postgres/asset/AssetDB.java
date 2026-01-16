package com.hexmanos.engine.external.postgres.asset;

import com.hexmanos.engine.core.asset.Asset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssetDB extends JpaRepository<AssetEntity, UUID> {
    List<AssetEntity> findByStatus(Asset.AssetStatus status);
}
