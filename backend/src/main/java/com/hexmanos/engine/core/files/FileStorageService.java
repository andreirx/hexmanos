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

    /**
     * Upload a file to a specific storage key.
     * Used for local development where presigned URLs point to a backend endpoint.
     * For S3, this is a no-op since files are uploaded directly via presigned PUT.
     *
     * @param file The file to upload
     * @param storageKey The full storage key (e.g., "characters/uuid/sprite.png")
     * @return The URL where the file can be accessed
     */
    default String uploadFileToKey(MultipartFile file, String storageKey) {
        throw new UnsupportedOperationException("Direct upload not supported for this storage type");
    }

    /**
     * Upload raw bytes to a specific storage key.
     * Used for server-side generated content like transition tiles.
     *
     * @param data The raw bytes to upload
     * @param storageKey The full storage key (e.g., "tiles/uuid/transition_n.png")
     * @param contentType The MIME type (e.g., "image/png")
     */
    void uploadBytes(byte[] data, String storageKey, String contentType);

    /**
     * List all files in a directory/prefix.
     * Returns just the file names (not the full path).
     *
     * @param directoryKey The directory/prefix to list (e.g., "tiles/uuid")
     * @return List of file names in the directory
     */
    java.util.List<String> listFiles(String directoryKey);

    /**
     * Delete multiple files matching a prefix pattern.
     *
     * @param directoryKey The directory/prefix
     * @param fileNamePrefix The prefix of files to delete (e.g., "tile_0_transition_")
     */
    void deleteFilesWithPrefix(String directoryKey, String fileNamePrefix);

    /**
     * Copy a file from one storage key to another.
     *
     * @param sourceKey The source storage key
     * @param destKey The destination storage key
     */
    void copyFile(String sourceKey, String destKey);

    /**
     * Read file content as bytes.
     *
     * @param storageKey The storage key
     * @return The file content as bytes, or null if file doesn't exist
     */
    byte[] readBytes(String storageKey);
}
