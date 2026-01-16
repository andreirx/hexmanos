package com.hexmanos.engine.core.files;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;
import java.io.InputStream;

public interface FileStorageService {
    String uploadFile(MultipartFile file);
    Resource loadFileAsResource(String fileName);
    InputStream loadFileAsInputStream(String fileName);
    void deleteFile(String fileName);

    /**
     * Generate a presigned URL for direct client upload.
     * @param assetType The asset type (characters, tiles, maps)
     * @param assetId The unique asset ID
     * @param fileName The file name (e.g., sprite.png, definition.json)
     * @param contentType The MIME type of the file
     * @return PresignedUploadUrl with upload URL and storage key
     */
    PresignedUploadUrl generatePresignedUploadUrl(String assetType, String assetId, String fileName, String contentType);

    /**
     * Check if a file exists at the given storage key.
     */
    boolean fileExists(String storageKey);
}
