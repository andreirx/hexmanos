package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.dtos.AssetDTO;
import com.hexmanos.engine.app.dtos.PresignedUrlRequest;
import com.hexmanos.engine.app.dtos.PresignedUrlResponse;
import com.hexmanos.engine.app.dtos.UploadResponse;
import com.hexmanos.engine.core.asset.Asset;
import com.hexmanos.engine.core.asset.AssetService;
import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.files.PresignedUploadUrl;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

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
    public ResponseEntity<AssetDTO> approveAsset(@PathVariable UUID id) {
        try {
            Asset approved = assetService.approve(id);
            return ResponseEntity.ok(AssetDTO.DTOMapper.toDTO(approved));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
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
     */
    @GetMapping("/verify/{storageKey}")
    public ResponseEntity<Boolean> verifyFileExists(@PathVariable String storageKey) {
        boolean exists = fileStorageService.fileExists(storageKey);
        return ResponseEntity.ok(exists);
    }

    private boolean isValidAssetType(String assetType) {
        return "characters".equals(assetType) ||
               "tiles".equals(assetType) ||
               "maps".equals(assetType);
    }
}
