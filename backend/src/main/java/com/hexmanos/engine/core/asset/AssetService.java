package com.hexmanos.engine.core.asset;

import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.transition.TransitionGeneratorService;
import lombok.extern.slf4j.Slf4j;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
public class AssetService {
    private final AssetRepository assetRepository;
    private final FileStorageService fileStorageService;
    private final TransitionGeneratorService transitionGeneratorService;

    public AssetService(AssetRepository assetRepository, FileStorageService fileStorageService,
                        TransitionGeneratorService transitionGeneratorService) {
        this.assetRepository = assetRepository;
        this.fileStorageService = fileStorageService;
        this.transitionGeneratorService = transitionGeneratorService;
    }

    public List<Asset> getAll() {
        return assetRepository.findAll();
    }

    public Optional<Asset> getById(UUID id) {
        return assetRepository.findById(id);
    }

    public List<Asset> getByStatus(Asset.AssetStatus status) {
        return assetRepository.findByStatus(status);
    }

    public List<Asset> getByType(Asset.AssetType type) {
        return assetRepository.findByType(type);
    }

    public Asset create(Asset asset) {
        // Business Rule: New assets are always PENDING
        asset.setStatus(Asset.AssetStatus.PENDING);

        // Business Rule: Ensure ID exists (though DB usually handles generation,
        // for Clean Arch we sometimes like the domain to know the ID early)
        if (asset.getId() == null) {
            asset.setId(UUID.randomUUID());
        }

        log.info("Registering new asset: {}", asset.getName());
        return assetRepository.save(asset);
    }

    /**
     * Register an asset after files have been uploaded to storage.
     * Validates that all required files exist before creating the database record.
     *
     * @param assetId The UUID that was used when generating presigned URLs
     * @param type The asset type (CHARACTER, TILE, MAP)
     * @param name The display name
     * @param authorId The Cognito sub of the author
     * @param files List of filenames to validate (e.g., ["sprite.png", "definition.json"])
     * @return The created asset
     * @throws AssetRegistrationException if files are missing or validation fails
     */
    public Asset register(UUID assetId, Asset.AssetType type, String name, String authorId, List<String> files) {
        // Build the storage key prefix based on asset type
        String assetTypeFolder = getAssetTypeFolder(type);
        String storageKeyPrefix = assetTypeFolder + "/" + assetId.toString();

        // Validate all required files exist
        List<String> missingFiles = new ArrayList<>();
        for (String fileName : files) {
            String fullKey = storageKeyPrefix + "/" + fileName;
            if (!fileStorageService.fileExists(fullKey)) {
                missingFiles.add(fileName);
            }
        }

        if (!missingFiles.isEmpty()) {
            log.error("Asset registration failed - missing files: {} for asset {}", missingFiles, assetId);
            throw new AssetRegistrationException(
                "Missing required files: " + String.join(", ", missingFiles),
                assetId,
                missingFiles
            );
        }

        // Check if asset already exists - if so, update it (upsert pattern)
        Optional<Asset> existingAsset = assetRepository.findById(assetId);

        Asset savedAsset;
        if (existingAsset.isPresent()) {
            // Update existing asset
            Asset asset = existingAsset.get();
            asset.setName(name);
            // Note: we don't change type, authorId, or storageKeyPrefix on update
            log.info("Updating existing asset {} with {} validated files", name, files.size());
            savedAsset = assetRepository.save(asset);
        } else {
            // Create new asset record
            Asset asset = new Asset();
            asset.setId(assetId);
            asset.setType(type);
            asset.setName(name);
            asset.setAuthorId(authorId);
            asset.setStatus(Asset.AssetStatus.PENDING);
            asset.setStorageKeyPrefix(storageKeyPrefix);
            asset.setCreatedAt(LocalDateTime.now());

            log.info("Registering new asset {} with {} validated files at {}", name, files.size(), storageKeyPrefix);
            savedAsset = assetRepository.save(asset);
        }

        // Generate transitions for TILE assets
        if (type == Asset.AssetType.TILE) {
            generateTileTransitions(storageKeyPrefix, files);
        }

        return savedAsset;
    }

    /**
     * Generate transition tiles for each variation of a TILE asset.
     */
    private void generateTileTransitions(String storageKeyPrefix, List<String> files) {
        // Find all tile_N.png files and generate transitions for each
        for (String fileName : files) {
            if (fileName.startsWith("tile_") && fileName.endsWith(".png")) {
                try {
                    transitionGeneratorService.generateTransitions(storageKeyPrefix, fileName);
                } catch (Exception e) {
                    log.error("Failed to generate transitions for {}/{}: {}", storageKeyPrefix, fileName, e.getMessage());
                    // Continue with other files even if one fails
                }
            }
        }
    }

    private String getAssetTypeFolder(Asset.AssetType type) {
        return switch (type) {
            case CHARACTER -> "characters";
            case TILE -> "tiles";
            case MAP -> "maps";
        };
    }

    public Asset approve(UUID id) {
        return assetRepository.findById(id)
                .map(asset -> {
                    asset.setStatus(Asset.AssetStatus.APPROVED);
                    log.info("Asset approved: {}", id);
                    return assetRepository.save(asset);
                })
                .orElseThrow(() -> new IllegalArgumentException("Asset not found: " + id));
    }

    /**
     * Exception thrown when asset registration fails due to missing files or validation errors.
     */
    public static class AssetRegistrationException extends RuntimeException {
        private final UUID assetId;
        private final List<String> missingFiles;

        public AssetRegistrationException(String message, UUID assetId, List<String> missingFiles) {
            super(message);
            this.assetId = assetId;
            this.missingFiles = missingFiles;
        }

        public UUID getAssetId() {
            return assetId;
        }

        public List<String> getMissingFiles() {
            return missingFiles;
        }
    }
}
