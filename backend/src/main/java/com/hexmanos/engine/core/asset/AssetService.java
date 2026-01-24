package com.hexmanos.engine.core.asset;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hexmanos.engine.core.files.FileStorageService;
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
public class AssetService {
    private final AssetRepository assetRepository;
    private final FileStorageService fileStorageService;

    public AssetService(AssetRepository assetRepository, FileStorageService fileStorageService) {
        this.assetRepository = assetRepository;
        this.fileStorageService = fileStorageService;
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

            // For TILE assets, delete existing transitions for tile_0 so they get regenerated
            // by the background scheduler with the updated tile
            if (type == Asset.AssetType.TILE) {
                deleteTile0Transitions(storageKeyPrefix);
            }

            // Delete existing mipmaps so they get regenerated with the updated images
            if (type == Asset.AssetType.TILE || type == Asset.AssetType.CHARACTER) {
                deleteMipmaps(storageKeyPrefix);
            }
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
            // Transitions will be generated by the background scheduler
        }

        return savedAsset;
    }

    /**
     * Delete transitions for tile_0 so they can be regenerated with updated content.
     */
    private void deleteTile0Transitions(String storageKeyPrefix) {
        try {
            fileStorageService.deleteFilesWithPrefix(storageKeyPrefix, "tile_0_transition_");
            log.info("Deleted tile_0 transitions for {} - will be regenerated by background scheduler", storageKeyPrefix);
        } catch (Exception e) {
            log.error("Failed to delete tile_0 transitions for {}: {}", storageKeyPrefix, e.getMessage());
        }
    }

    /**
     * Delete all mipmap files so they can be regenerated with updated content.
     */
    private void deleteMipmaps(String storageKeyPrefix) {
        try {
            fileStorageService.deleteFilesWithPrefix(storageKeyPrefix, "-mip64.png");
            fileStorageService.deleteFilesWithPrefix(storageKeyPrefix, "-mip32.png");
            log.info("Deleted mipmaps for {} - will be regenerated by background scheduler", storageKeyPrefix);
        } catch (Exception e) {
            log.error("Failed to delete mipmaps for {}: {}", storageKeyPrefix, e.getMessage());
        }
    }

    private String getAssetTypeFolder(Asset.AssetType type) {
        return switch (type) {
            case CHARACTER -> "characters";
            case TILE -> "tiles";
            case MAP -> "maps";
            case OBJECT -> "objects";
        };
    }

    public Asset approve(UUID id, String moderationNotes) {
        return assetRepository.findById(id)
                .map(asset -> {
                    asset.setStatus(Asset.AssetStatus.APPROVED);
                    asset.setModerationNotes(moderationNotes);
                    log.info("Asset approved: {}", id);
                    return assetRepository.save(asset);
                })
                .orElseThrow(() -> new IllegalArgumentException("Asset not found: " + id));
    }

    public Asset reject(UUID id, String moderationNotes) {
        return assetRepository.findById(id)
                .map(asset -> {
                    asset.setStatus(Asset.AssetStatus.REJECTED);
                    asset.setModerationNotes(moderationNotes);
                    log.info("Asset rejected: {} - {}", id, moderationNotes);
                    return assetRepository.save(asset);
                })
                .orElseThrow(() -> new IllegalArgumentException("Asset not found: " + id));
    }

    public Asset archive(UUID id, String moderationNotes) {
        return assetRepository.findById(id)
                .map(asset -> {
                    asset.setStatus(Asset.AssetStatus.ARCHIVED);
                    asset.setModerationNotes(moderationNotes);
                    log.info("Asset archived: {}", id);
                    return assetRepository.save(asset);
                })
                .orElseThrow(() -> new IllegalArgumentException("Asset not found: " + id));
    }

    /**
     * Migrate legacy CHARACTER assets to the new visual states schema.
     * This will:
     * 1. Read each CHARACTER's definition.json
     * 2. If it doesn't have visualStates, add entityType and visualStates
     * 3. Rename all animation frame files from {state}_{frame}.png to full_{state}_{frame}.png
     *
     * @return MigrationResult with counts of migrated and skipped assets
     */
    public MigrationResult migrateCharactersToVisualStates() {
        List<Asset> characters = assetRepository.findByType(Asset.AssetType.CHARACTER);
        int migrated = 0;
        int skipped = 0;
        int failed = 0;
        List<String> errors = new ArrayList<>();

        ObjectMapper objectMapper = new ObjectMapper();
        List<String> visualStates = Arrays.asList("full", "hurt_1", "hurt_2", "critical");

        // Pattern to match legacy frame files: {animState}_{frameIndex}.png
        // e.g., idle_0.png, walk_down_1.png
        Pattern legacyPattern = Pattern.compile("^([a-z_]+)_(\\d+)\\.png$");

        for (Asset asset : characters) {
            try {
                String definitionKey = asset.getStorageKeyPrefix() + "/definition.json";

                // Read the definition.json
                byte[] definitionBytes = fileStorageService.readBytes(definitionKey);
                if (definitionBytes == null) {
                    log.warn("Skipping {} - no definition.json found", asset.getId());
                    skipped++;
                    continue;
                }

                JsonNode definition = objectMapper.readTree(definitionBytes);

                // Check if already migrated
                if (definition.has("visualStates")) {
                    log.info("Skipping {} - already has visualStates", asset.getId());
                    skipped++;
                    continue;
                }

                log.info("Migrating character: {} ({})", asset.getName(), asset.getId());

                // Update the definition.json
                ObjectNode updatedDefinition = (ObjectNode) definition;
                updatedDefinition.put("entityType", "CHARACTER");
                ArrayNode visualStatesArray = updatedDefinition.putArray("visualStates");
                for (String vs : visualStates) {
                    visualStatesArray.add(vs);
                }

                // Write updated definition.json
                String updatedJson = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(updatedDefinition);
                fileStorageService.uploadBytes(
                    updatedJson.getBytes(StandardCharsets.UTF_8),
                    definitionKey,
                    "application/json"
                );

                // List all files and rename frame files
                List<String> files = fileStorageService.listFiles(asset.getStorageKeyPrefix());
                for (String fileName : files) {
                    if (fileName.equals("definition.json")) continue;

                    Matcher matcher = legacyPattern.matcher(fileName);
                    if (matcher.matches()) {
                        String animState = matcher.group(1);
                        String frameIndex = matcher.group(2);

                        // Rename to new format: full_{animState}_{frameIndex}.png
                        String newFileName = "full_" + animState + "_" + frameIndex + ".png";
                        String sourceKey = asset.getStorageKeyPrefix() + "/" + fileName;
                        String destKey = asset.getStorageKeyPrefix() + "/" + newFileName;

                        fileStorageService.copyFile(sourceKey, destKey);
                        fileStorageService.deleteFile(sourceKey);
                        log.info("Renamed {} to {}", fileName, newFileName);
                    }
                }

                migrated++;
                log.info("Successfully migrated character: {}", asset.getName());

            } catch (Exception e) {
                failed++;
                String errorMsg = String.format("Failed to migrate %s (%s): %s",
                    asset.getName(), asset.getId(), e.getMessage());
                log.error(errorMsg, e);
                errors.add(errorMsg);
            }
        }

        return new MigrationResult(migrated, skipped, failed, errors);
    }

    /**
     * Result of the migration operation.
     */
    public static class MigrationResult {
        private final int migrated;
        private final int skipped;
        private final int failed;
        private final List<String> errors;

        public MigrationResult(int migrated, int skipped, int failed, List<String> errors) {
            this.migrated = migrated;
            this.skipped = skipped;
            this.failed = failed;
            this.errors = errors;
        }

        public int getMigrated() { return migrated; }
        public int getSkipped() { return skipped; }
        public int getFailed() { return failed; }
        public List<String> getErrors() { return errors; }
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
