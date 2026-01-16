package com.hexmanos.engine.app.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Response DTO for asset registration errors.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegisterAssetResponse {
    private boolean success;
    private String message;
    private AssetDTO asset;
    private List<String> missingFiles;
}
