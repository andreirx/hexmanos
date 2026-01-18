package com.hexmanos.engine.external.postgres.asset;

import com.hexmanos.engine.core.asset.Asset;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "asset_index")
public class AssetEntity implements Persistable<UUID> {
    @Id
    private UUID id;

    @Transient
    private boolean isNew = true;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Asset.AssetType type;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String authorId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Asset.AssetStatus status;

    // RENAMED from s3KeyPrefix to avoid naming strategy collisions
    // Hibernate will map this to: storage_key_prefix
    @Column(nullable = false)
    private String storageKeyPrefix;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column
    private String moderationNotes;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    @PostLoad
    @PostPersist
    public void markNotNew() {
        this.isNew = false;
    }

    @Override
    public boolean isNew() {
        return isNew;
    }

    public interface EntityMapper {
        static Asset fromEntity(AssetEntity entity) {
            Asset asset = new Asset();
            asset.setId(entity.getId());
            asset.setType(entity.getType());
            asset.setName(entity.getName());
            asset.setAuthorId(entity.getAuthorId());
            asset.setStatus(entity.getStatus());
            asset.setStorageKeyPrefix(entity.getStorageKeyPrefix());
            asset.setCreatedAt(entity.getCreatedAt());
            asset.setModerationNotes(entity.getModerationNotes());
            return asset;
        }

        static AssetEntity toEntity(Asset asset) {
            AssetEntity entity = new AssetEntity();
            entity.setId(asset.getId());
            entity.setType(asset.getType());
            entity.setName(asset.getName());
            entity.setAuthorId(asset.getAuthorId());
            entity.setStatus(asset.getStatus());
            entity.setStorageKeyPrefix(asset.getStorageKeyPrefix());
            entity.setCreatedAt(asset.getCreatedAt());
            entity.setModerationNotes(asset.getModerationNotes());
            // Note: isNew is set by repository based on existence check
            return entity;
        }
    }
}
