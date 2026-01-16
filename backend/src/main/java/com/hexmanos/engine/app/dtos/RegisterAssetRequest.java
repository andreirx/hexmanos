package com.hexmanos.engine.app.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

/**
 * Request DTO for registering an asset after files have been uploaded.
 *
 * Flow:
 * 1. Frontend generates assetId (UUID)
 * 2. Frontend requests presigned URLs using that assetId
 * 3. Frontend uploads files directly to S3/local storage
 * 4. Frontend calls POST /api/assets/register with this request
 * 5. Backend validates files exist and creates the asset record
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegisterAssetRequest {
    /**
     * The asset ID that was used when generating presigned URLs.
     * This must match the ID used in the upload paths.
     */
    private UUID assetId;

    /**
     * Asset type: CHARACTER, TILE, or MAP
     */
    private String type;

    /**
     * Display name for the asset
     */
    private String name;

    /**
     * The Cognito sub of the author (will be extracted from JWT in production)
     */
    private String authorId;

    /**
     * List of files that should exist at the storage location.
     * For CHARACTER: ["sprite.png", "definition.json"]
     * For TILE: ["tile.png", "properties.json"]
     * For MAP: ["layout.json", "thumbnail.png"]
     */
    private List<String> files;
}
