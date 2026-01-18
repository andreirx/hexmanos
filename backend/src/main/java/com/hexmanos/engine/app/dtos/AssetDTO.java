package com.hexmanos.engine.app.dtos;

import com.hexmanos.engine.core.asset.Asset;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AssetDTO {
    private UUID id;
    private String type;
    private String name;
    private String authorId;
    private String authorName;
    private String authorEmail;
    private String status;
    private String storageKeyPrefix;
    private LocalDateTime createdAt;
    private String moderationNotes;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateRequest {
        private String type;
        private String name;
        private String authorId;
        private String storageKeyPrefix;
    }

    public static class DTOMapper {

        public static AssetDTO toDTO(Asset asset) {
            if (asset == null) return null;
            return AssetDTO.builder()
                    .id(asset.getId())
                    .type(asset.getType() != null ? asset.getType().name() : null)
                    .name(asset.getName())
                    .authorId(asset.getAuthorId())
                    .status(asset.getStatus() != null ? asset.getStatus().name() : null)
                    .storageKeyPrefix(asset.getStorageKeyPrefix())
                    .createdAt(asset.getCreatedAt())
                    .moderationNotes(asset.getModerationNotes())
                    .build();
        }

        public static Asset toEntity(CreateRequest request) {
            if (request == null) return null;
            Asset asset = new Asset();
            asset.setType(request.getType() != null ? Asset.AssetType.valueOf(request.getType()) : null);
            asset.setName(request.getName());
            asset.setAuthorId(request.getAuthorId());
            asset.setStorageKeyPrefix(request.getStorageKeyPrefix());
            asset.setCreatedAt(LocalDateTime.now());
            return asset;
        }
    }
}
