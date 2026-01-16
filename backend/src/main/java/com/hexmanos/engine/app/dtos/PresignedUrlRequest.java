package com.hexmanos.engine.app.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresignedUrlRequest {
    private String assetType;  // characters, tiles, maps
    private String assetId;    // UUID of the asset
    private String fileName;   // e.g., sprite.png, definition.json
    private String contentType; // e.g., image/png, application/json
}
