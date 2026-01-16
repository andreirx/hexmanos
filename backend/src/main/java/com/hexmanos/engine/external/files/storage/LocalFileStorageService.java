package com.hexmanos.engine.external.files.storage;

import com.hexmanos.engine.core.files.FileStorageService;
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
import java.util.Objects;

@Slf4j
public class LocalFileStorageService implements FileStorageService {

    private final Path fileStorageLocation;

    public LocalFileStorageService(String uploadDir) {
        fileStorageLocation = Paths.get(uploadDir).toAbsolutePath().normalize();
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
}
