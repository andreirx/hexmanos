package com.hexmanos.engine.core.asset;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Asset {
    public enum AssetType { CHARACTER, TILE, MAP }
    public enum AssetStatus { PENDING, APPROVED, REJECTED, ARCHIVED }

    private UUID id;
    private AssetType type;
    private String name;
    private String authorId;
    private AssetStatus status;
    private String storageKeyPrefix;
    private LocalDateTime createdAt;
    private String moderationNotes;
}
