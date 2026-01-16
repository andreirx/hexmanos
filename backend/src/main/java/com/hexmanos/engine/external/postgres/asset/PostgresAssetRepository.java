package com.hexmanos.engine.external.postgres.asset;

import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hexmanos.engine.external.postgres.asset.AssetEntity.EntityMapper;

@Component
@RequiredArgsConstructor
public class PostgresAssetRepository implements AssetRepository {
    private final AssetDB db;

    @Override
    public List<Asset> findAll() {
        return db.findAll().stream().map(EntityMapper::fromEntity).toList();
    }

    @Override
    public Optional<Asset> findById(UUID id) {
        return db.findById(id).map(EntityMapper::fromEntity);
    }

    @Override
    public List<Asset> findByStatus(Asset.AssetStatus status) {
        return db.findByStatus(status).stream().map(EntityMapper::fromEntity).toList();
    }

    @Override
    public Asset save(Asset asset) {
        // Check if this is an update or insert
        boolean exists = asset.getId() != null && db.existsById(asset.getId());

        AssetEntity entity = EntityMapper.toEntity(asset);
        entity.setNew(!exists); // Mark as new only if it doesn't exist

        return EntityMapper.fromEntity(db.save(entity));
    }
}
