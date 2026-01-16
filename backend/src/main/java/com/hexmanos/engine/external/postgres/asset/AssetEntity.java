package com.hexmanos.engine.external.postgres.asset;

import com.hexmanos.engine.core.asset.Asset;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "asset_index")
public class AssetEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

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

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public interface EntityMapper {
        static Asset fromEntity(AssetEntity entity) {
            return new Asset(
                    entity.getId(),
                    entity.getType(),
                    entity.getName(),
                    entity.getAuthorId(),
                    entity.getStatus(),
                    entity.getStorageKeyPrefix(),
                    entity.getCreatedAt()
            );
        }

        static AssetEntity toEntity(Asset asset) {
            return new AssetEntity(
                    asset.getId(),
                    asset.getType(),
                    asset.getName(),
                    asset.getAuthorId(),
                    asset.getStatus(),
                    asset.getStorageKeyPrefix(),
                    asset.getCreatedAt()
            );
        }
    }
}
