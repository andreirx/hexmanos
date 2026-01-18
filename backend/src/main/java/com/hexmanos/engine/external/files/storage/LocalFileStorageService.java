package com.hexmanos.engine.external.files.storage;

import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.files.PresignedUploadUrl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

@Slf4j
public class LocalFileStorageService implements FileStorageService {

    private final Path fileStorageLocation;
    private final String baseUrl;

    public LocalFileStorageService(String uploadDir) {
        this(uploadDir, "http://localhost:8080");
    }

    public LocalFileStorageService(String uploadDir, String baseUrl) {
        this.fileStorageLocation = Paths.get(uploadDir).toAbsolutePath().normalize();
        this.baseUrl = baseUrl;
        try {
            Files.createDirectories(fileStorageLocation);
        } catch (Exception ex) {
            throw new RuntimeException("Could not create upload directory!", ex);
        }
    }

    @Override
    public String uploadFile(MultipartFile file) {
        String fileName = StringUtils.cleanPath(Objects.requireNonNull(file.getOriginalFilename()));
        try {
            Path targetLocation = this.fileStorageLocation.resolve(fileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);
            log.info("File uploaded to local path: {}", targetLocation);
            return "/cdn/files/" + fileName; // Mock CDN path
        } catch (IOException ex) {
            throw new RuntimeException("Failed to upload file", ex);
        }
    }

    @Override
    public Resource loadFileAsResource(String fileName) {
        try {
            Path filePath = this.fileStorageLocation.resolve(fileName).normalize();
            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists() && resource.isReadable()) return resource;
            throw new RuntimeException("File not found " + fileName);
        } catch (MalformedURLException ex) {
            throw new RuntimeException("File not found " + fileName, ex);
        }
    }

    @Override
    public InputStream loadFileAsInputStream(String fileName) {
        try {
            return new FileInputStream(fileStorageLocation.resolve(fileName).normalize().toFile());
        } catch (IOException e) {
            throw new RuntimeException("Failed to load stream: " + fileName, e);
        }
    }

    @Override
    public void deleteFile(String fileName) {
        try {
            Files.deleteIfExists(this.fileStorageLocation.resolve(fileName).normalize());
        } catch (IOException ex) {
            throw new RuntimeException("Failed to delete file", ex);
        }
    }

    @Override
    public PresignedUploadUrl generatePresignedUploadUrl(String assetType, String assetId, String fileName, String contentType) {
        // For local storage, we return the direct upload endpoint
        // The client will POST to this URL with the file
        String storageKey = String.format("%s/%s/%s", assetType, assetId, fileName);
        String uploadUrl = String.format("%s/api/assets/upload-direct?key=%s", baseUrl, storageKey);

        // Ensure the directory exists
        try {
            Path assetDir = fileStorageLocation.resolve(assetType).resolve(assetId);
            Files.createDirectories(assetDir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create asset directory", e);
        }

        return new PresignedUploadUrl(uploadUrl, storageKey, "POST", 3600);
    }

    @Override
    public boolean fileExists(String storageKey) {
        Path filePath = fileStorageLocation.resolve(storageKey).normalize();
        return Files.exists(filePath) && Files.isRegularFile(filePath);
    }

    /**
     * Upload a file to a specific storage key (used for direct uploads).
     */
    @Override
    public String uploadFileToKey(MultipartFile file, String storageKey) {
        try {
            Path targetPath = fileStorageLocation.resolve(storageKey).normalize();
            Files.createDirectories(targetPath.getParent());
            Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);
            log.info("File uploaded to local path: {}", targetPath);
            return "/cdn/files/" + storageKey;
        } catch (IOException ex) {
            throw new RuntimeException("Failed to upload file to key: " + storageKey, ex);
        }
    }

    @Override
    public void uploadBytes(byte[] data, String storageKey, String contentType) {
        try {
            Path targetPath = fileStorageLocation.resolve(storageKey).normalize();
            Files.createDirectories(targetPath.getParent());
            Files.write(targetPath, data);
            log.info("Bytes uploaded to local path: {} ({} bytes)", targetPath, data.length);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to upload bytes to key: " + storageKey, ex);
        }
    }

    @Override
    public List<String> listFiles(String directoryKey) {
        Path dirPath = fileStorageLocation.resolve(directoryKey).normalize();
        List<String> fileNames = new ArrayList<>();

        if (!Files.exists(dirPath) || !Files.isDirectory(dirPath)) {
            return fileNames;
        }

        try (Stream<Path> stream = Files.list(dirPath)) {
            stream.filter(Files::isRegularFile)
                    .map(path -> path.getFileName().toString())
                    .forEach(fileNames::add);
        } catch (IOException e) {
            log.error("Failed to list files in {}: {}", directoryKey, e.getMessage());
        }

        return fileNames;
    }

    @Override
    public void deleteFilesWithPrefix(String directoryKey, String fileNamePrefix) {
        Path dirPath = fileStorageLocation.resolve(directoryKey).normalize();

        if (!Files.exists(dirPath) || !Files.isDirectory(dirPath)) {
            return;
        }

        try (Stream<Path> stream = Files.list(dirPath)) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().startsWith(fileNamePrefix))
                    .forEach(path -> {
                        try {
                            Files.delete(path);
                            log.info("Deleted file: {}", path);
                        } catch (IOException e) {
                            log.error("Failed to delete file {}: {}", path, e.getMessage());
                        }
                    });
        } catch (IOException e) {
            log.error("Failed to list files for deletion in {}: {}", directoryKey, e.getMessage());
        }
    }

    @Override
    public void copyFile(String sourceKey, String destKey) {
        try {
            Path sourcePath = fileStorageLocation.resolve(sourceKey).normalize();
            Path destPath = fileStorageLocation.resolve(destKey).normalize();
            Files.createDirectories(destPath.getParent());
            Files.copy(sourcePath, destPath, StandardCopyOption.REPLACE_EXISTING);
            log.info("Copied file from {} to {}", sourcePath, destPath);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to copy file from " + sourceKey + " to " + destKey, ex);
        }
    }

    @Override
    public byte[] readBytes(String storageKey) {
        try {
            Path filePath = fileStorageLocation.resolve(storageKey).normalize();
            if (!Files.exists(filePath)) {
                return null;
            }
            return Files.readAllBytes(filePath);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to read bytes from " + storageKey, ex);
        }
    }
}
