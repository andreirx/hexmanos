package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.dtos.AssetDTO;
import com.hexmanos.engine.app.dtos.ModerationRequest;
import com.hexmanos.engine.app.dtos.PresignedUrlRequest;
import com.hexmanos.engine.app.dtos.PresignedUrlResponse;
import com.hexmanos.engine.app.dtos.RegisterAssetRequest;
import com.hexmanos.engine.app.dtos.RegisterAssetResponse;
import com.hexmanos.engine.app.dtos.UploadResponse;
import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetService;
import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.files.PresignedUploadUrl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
public class AssetController {

    private final AssetService assetService;
    private final FileStorageService fileStorageService;

    @GetMapping
    public ResponseEntity<List<AssetDTO>> getAllAssets() {
        List<AssetDTO> assets = assetService.getAll().stream()
                .map(AssetDTO.DTOMapper::toDTO)
                .toList();
        return ResponseEntity.ok(assets);
    }

    @GetMapping("/{id}")
    public ResponseEntity<AssetDTO> getAssetById(@PathVariable UUID id) {
        return assetService.getById(id)
                .map(AssetDTO.DTOMapper::toDTO)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/status/{status}")
    public ResponseEntity<List<AssetDTO>> getAssetsByStatus(@PathVariable String status) {
        try {
            Asset.AssetStatus assetStatus = Asset.AssetStatus.valueOf(status.toUpperCase());
            List<AssetDTO> assets = assetService.getByStatus(assetStatus).stream()
                    .map(AssetDTO.DTOMapper::toDTO)
                    .toList();
            return ResponseEntity.ok(assets);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping
    public ResponseEntity<AssetDTO> createAsset(@RequestBody AssetDTO.CreateRequest request) {
        Asset asset = AssetDTO.DTOMapper.toEntity(request);
        Asset created = assetService.create(asset);
        return ResponseEntity.status(HttpStatus.CREATED).body(AssetDTO.DTOMapper.toDTO(created));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<AssetDTO> approveAsset(
            @PathVariable UUID id,
            @RequestBody(required = false) ModerationRequest request) {
        try {
            String notes = request != null ? request.getNotes() : null;
            Asset approved = assetService.approve(id, notes);
            return ResponseEntity.ok(AssetDTO.DTOMapper.toDTO(approved));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<AssetDTO> rejectAsset(
            @PathVariable UUID id,
            @RequestBody(required = false) ModerationRequest request) {
        try {
            String notes = request != null ? request.getNotes() : null;
            Asset rejected = assetService.reject(id, notes);
            return ResponseEntity.ok(AssetDTO.DTOMapper.toDTO(rejected));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/archive")
    public ResponseEntity<AssetDTO> archiveAsset(
            @PathVariable UUID id,
            @RequestBody(required = false) ModerationRequest request) {
        try {
            String notes = request != null ? request.getNotes() : null;
            Asset archived = assetService.archive(id, notes);
            return ResponseEntity.ok(AssetDTO.DTOMapper.toDTO(archived));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Register an asset after files have been uploaded to storage.
     *
     * Flow:
     * 1. Frontend generates assetId (UUID)
     * 2. Frontend requests presigned URLs using POST /api/assets/presigned-url
     * 3. Frontend uploads files directly to S3/local storage
     * 4. Frontend calls this endpoint to register the asset
     * 5. Backend validates files exist and creates the asset record
     *
     * @param request Contains assetId, type, name, authorId, and list of files to validate
     * @return RegisterAssetResponse with success status and asset or error details
     */
    @PostMapping("/register")
    public ResponseEntity<RegisterAssetResponse> registerAsset(@RequestBody RegisterAssetRequest request) {
        // Validate required fields
        if (request.getAssetId() == null || request.getType() == null ||
            request.getName() == null || request.getAuthorId() == null ||
            request.getFiles() == null || request.getFiles().isEmpty()) {
            return ResponseEntity.badRequest().body(
                RegisterAssetResponse.builder()
                    .success(false)
                    .message("Missing required fields: assetId, type, name, authorId, and files are required")
                    .build()
            );
        }

        // Parse asset type
        Asset.AssetType assetType;
        try {
            assetType = Asset.AssetType.valueOf(request.getType().toUpperCase());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(
                RegisterAssetResponse.builder()
                    .success(false)
                    .message("Invalid asset type: " + request.getType() + ". Must be CHARACTER, TILE, or MAP")
                    .build()
            );
        }

        try {
            Asset registered = assetService.register(
                request.getAssetId(),
                assetType,
                request.getName(),
                request.getAuthorId(),
                request.getFiles()
            );

            log.info("Asset registered successfully: {} ({})", registered.getName(), registered.getId());

            return ResponseEntity.status(HttpStatus.CREATED).body(
                RegisterAssetResponse.builder()
                    .success(true)
                    .message("Asset registered successfully")
                    .asset(AssetDTO.DTOMapper.toDTO(registered))
                    .build()
            );
        } catch (AssetService.AssetRegistrationException e) {
            log.warn("Asset registration failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(
                RegisterAssetResponse.builder()
                    .success(false)
                    .message(e.getMessage())
                    .missingFiles(e.getMissingFiles())
                    .build()
            );
        }
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UploadResponse> uploadFile(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        String url = fileStorageService.uploadFile(file);
        String storageKey = extractStorageKey(url);

        UploadResponse response = UploadResponse.builder()
                .url(url)
                .storageKey(storageKey)
                .build();

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    private String extractStorageKey(String url) {
        // Extract filename from URL path
        // Local: /cdn/files/filename.png -> filename.png
        // S3: https://bucket.s3.amazonaws.com/prefix/filename.png -> filename.png
        int lastSlash = url.lastIndexOf('/');
        return lastSlash >= 0 ? url.substring(lastSlash + 1) : url;
    }

    /**
     * Generate a presigned URL for direct client-to-storage upload.
     * This allows the frontend to upload files directly to S3/local storage
     * without proxying through the backend.
     */
    @PostMapping("/presigned-url")
    public ResponseEntity<PresignedUrlResponse> generatePresignedUrl(@RequestBody PresignedUrlRequest request) {
        // Validate request
        if (request.getAssetType() == null || request.getAssetId() == null ||
            request.getFileName() == null || request.getContentType() == null) {
            return ResponseEntity.badRequest().build();
        }

        // Validate asset type
        if (!isValidAssetType(request.getAssetType())) {
            return ResponseEntity.badRequest().build();
        }

        PresignedUploadUrl presignedUrl = fileStorageService.generatePresignedUploadUrl(
                request.getAssetType(),
                request.getAssetId(),
                request.getFileName(),
                request.getContentType()
        );

        PresignedUrlResponse response = PresignedUrlResponse.builder()
                .uploadUrl(presignedUrl.uploadUrl())
                .storageKey(presignedUrl.storageKey())
                .httpMethod(presignedUrl.httpMethod())
                .expiresInSeconds(presignedUrl.expiresInSeconds())
                .build();

        return ResponseEntity.ok(response);
    }

    /**
     * Check if the uploaded files exist for an asset (used during registration).
     * The storage key can contain slashes, e.g., "characters/uuid/sprite.png"
     */
    @GetMapping("/verify/**")
    public ResponseEntity<Boolean> verifyFileExists(jakarta.servlet.http.HttpServletRequest request) {
        // Extract the storage key from the path after /verify/
        String fullPath = request.getRequestURI();
        String storageKey = fullPath.substring(fullPath.indexOf("/verify/") + "/verify/".length());
        boolean exists = fileStorageService.fileExists(storageKey);
        return ResponseEntity.ok(exists);
    }

    /**
     * Direct upload endpoint for local development.
     * In production (S3), clients upload directly via presigned PUT URLs.
     * For local development, the presigned URL points to this endpoint.
     *
     * @param file The file to upload
     * @param key The storage key (e.g., "characters/uuid/sprite.png")
     * @return Upload response with the CDN URL
     */
    @PostMapping(value = "/upload-direct", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UploadResponse> uploadFileDirect(
            @RequestParam("file") MultipartFile file,
            @RequestParam("key") String key) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        if (key == null || key.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        try {
            String url = fileStorageService.uploadFileToKey(file, key);
            log.info("File uploaded directly to key: {}", key);

            UploadResponse response = UploadResponse.builder()
                    .url(url)
                    .storageKey(key)
                    .build();

            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (UnsupportedOperationException e) {
            // S3 storage doesn't support direct upload through backend
            log.error("Direct upload not supported for current storage type");
            return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
        }
    }

    /**
     * Serve asset files from storage.
     * URL pattern: /api/assets/files/{assetType}/{assetId}/{fileName}
     * Example: /api/assets/files/characters/abc-123/definition.json
     */
    @GetMapping("/files/**")
    public ResponseEntity<org.springframework.core.io.Resource> serveFile(
            jakarta.servlet.http.HttpServletRequest request) {
        // Extract the storage key from the path after /files/
        String fullPath = request.getRequestURI();
        String storageKey = fullPath.substring(fullPath.indexOf("/files/") + "/files/".length());

        if (storageKey.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        try {
            org.springframework.core.io.Resource resource = fileStorageService.loadFileAsResource(storageKey);

            // Determine content type based on file extension
            String contentType = determineContentType(storageKey);

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header("Cache-Control", "public, max-age=3600")
                    .body(resource);
        } catch (Exception e) {
            log.warn("File not found: {}", storageKey);
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Get assets filtered by type.
     * Example: /api/assets/type/CHARACTER
     */
    @GetMapping("/type/{type}")
    public ResponseEntity<List<AssetDTO>> getAssetsByType(@PathVariable String type) {
        try {
            Asset.AssetType assetType = Asset.AssetType.valueOf(type.toUpperCase());
            List<AssetDTO> assets = assetService.getByType(assetType).stream()
                    .map(AssetDTO.DTOMapper::toDTO)
                    .toList();
            return ResponseEntity.ok(assets);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    private boolean isValidAssetType(String assetType) {
        return "characters".equals(assetType) ||
               "tiles".equals(assetType) ||
               "maps".equals(assetType);
    }

    private String determineContentType(String storageKey) {
        if (storageKey.endsWith(".json")) {
            return "application/json";
        } else if (storageKey.endsWith(".png")) {
            return "image/png";
        } else if (storageKey.endsWith(".jpg") || storageKey.endsWith(".jpeg")) {
            return "image/jpeg";
        } else if (storageKey.endsWith(".gif")) {
            return "image/gif";
        }
        return "application/octet-stream";
    }
}
