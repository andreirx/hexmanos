package com.hexmanos.engine.external.files.storage;

import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.files.PresignedUploadUrl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
public class S3FileStorageService implements FileStorageService {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final String bucketName;
    private final String prefix;

    public S3FileStorageService(S3Client s3Client, S3Presigner s3Presigner, String bucketName, String prefix) {
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
        this.bucketName = bucketName;
        this.prefix = prefix;
    }

    @Override
    public String uploadFile(MultipartFile file) {
        try {
            String fileName = generateUniqueFileName(file.getOriginalFilename());
            String key = String.format("%s/%s", prefix, fileName);

            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .contentType(file.getContentType())
                    .build();

            s3Client.putObject(request, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
            log.info("File uploaded to S3: {}", key);
            return "https://" + bucketName + ".s3.amazonaws.com/" + key;
        } catch (IOException e) {
            throw new RuntimeException("Failed to upload file to S3", e);
        }
    }

    @Override
    public Resource loadFileAsResource(String fileName) {
        try {
            String key = String.format("%s/%s", prefix, fileName);
            GetObjectRequest getObjectRequest = GetObjectRequest.builder().bucket(bucketName).key(key).build();
            InputStream inputStream = s3Client.getObject(getObjectRequest);
            Path tempFile = Files.createTempFile("s3file-", fileName);
            Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);
            return new UrlResource(tempFile.toUri());
        } catch (Exception e) {
            throw new RuntimeException("Failed to download file from S3", e);
        }
    }

    @Override
    public InputStream loadFileAsInputStream(String fileName) {
        String key = String.format("%s/%s", prefix, fileName);
        GetObjectRequest getObjectRequest = GetObjectRequest.builder().bucket(bucketName).key(key).build();
        return s3Client.getObject(getObjectRequest);
    }

    @Override
    public void deleteFile(String fileName) {
        String key = String.format("%s/%s", prefix, fileName);
        DeleteObjectRequest deleteObjectRequest = DeleteObjectRequest.builder().bucket(bucketName).key(key).build();
        s3Client.deleteObject(deleteObjectRequest);
        log.info("File deleted from S3: {}", key);
    }

    @Override
    public PresignedUploadUrl generatePresignedUploadUrl(String assetType, String assetId, String fileName, String contentType) {
        // Build the S3 key: prefix/assetType/assetId/fileName
        String storageKey = String.format("%s/%s/%s/%s", prefix, assetType, assetId, fileName);

        PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(storageKey)
                .contentType(contentType)
                .build();

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(15))
                .putObjectRequest(putObjectRequest)
                .build();

        PresignedPutObjectRequest presignedRequest = s3Presigner.presignPutObject(presignRequest);

        log.info("Generated presigned URL for key: {}", storageKey);

        return new PresignedUploadUrl(
                presignedRequest.url().toString(),
                storageKey,
                presignedRequest.httpRequest().method().name(),
                900 // 15 minutes in seconds
        );
    }

    @Override
    public boolean fileExists(String storageKey) {
        try {
            HeadObjectRequest headRequest = HeadObjectRequest.builder()
                    .bucket(bucketName)
                    .key(storageKey)
                    .build();
            s3Client.headObject(headRequest);
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    private String generateUniqueFileName(String originalFileName) {
        return System.currentTimeMillis() + "_" + UUID.randomUUID() + "_" + originalFileName;
    }

    @Override
    public void uploadBytes(byte[] data, String storageKey, String contentType) {
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(storageKey)
                .contentType(contentType)
                .build();

        s3Client.putObject(request, RequestBody.fromBytes(data));
        log.info("Bytes uploaded to S3: {} ({} bytes)", storageKey, data.length);
    }

    @Override
    public List<String> listFiles(String directoryKey) {
        List<String> fileNames = new ArrayList<>();
        String s3Prefix = String.format("%s/%s/", prefix, directoryKey);

        try {
            ListObjectsV2Request listRequest = ListObjectsV2Request.builder()
                    .bucket(bucketName)
                    .prefix(s3Prefix)
                    .build();

            ListObjectsV2Response response = s3Client.listObjectsV2(listRequest);

            for (S3Object s3Object : response.contents()) {
                String key = s3Object.key();
                // Extract just the filename from the full key
                String fileName = key.substring(s3Prefix.length());
                if (!fileName.isEmpty() && !fileName.contains("/")) {
                    fileNames.add(fileName);
                }
            }
        } catch (Exception e) {
            log.error("Failed to list files in S3 prefix {}: {}", s3Prefix, e.getMessage());
        }

        return fileNames;
    }

    @Override
    public void deleteFilesWithPrefix(String directoryKey, String fileNamePrefix) {
        String s3Prefix = String.format("%s/%s/%s", prefix, directoryKey, fileNamePrefix);

        try {
            ListObjectsV2Request listRequest = ListObjectsV2Request.builder()
                    .bucket(bucketName)
                    .prefix(s3Prefix)
                    .build();

            ListObjectsV2Response response = s3Client.listObjectsV2(listRequest);

            for (S3Object s3Object : response.contents()) {
                DeleteObjectRequest deleteRequest = DeleteObjectRequest.builder()
                        .bucket(bucketName)
                        .key(s3Object.key())
                        .build();
                s3Client.deleteObject(deleteRequest);
                log.info("Deleted S3 object: {}", s3Object.key());
            }
        } catch (Exception e) {
            log.error("Failed to delete files with prefix {} in S3: {}", s3Prefix, e.getMessage());
        }
    }

    @Override
    public void copyFile(String sourceKey, String destKey) {
        try {
            CopyObjectRequest copyRequest = CopyObjectRequest.builder()
                    .sourceBucket(bucketName)
                    .sourceKey(sourceKey)
                    .destinationBucket(bucketName)
                    .destinationKey(destKey)
                    .build();
            s3Client.copyObject(copyRequest);
            log.info("Copied S3 object from {} to {}", sourceKey, destKey);
        } catch (Exception e) {
            throw new RuntimeException("Failed to copy S3 object from " + sourceKey + " to " + destKey, e);
        }
    }

    @Override
    public byte[] readBytes(String storageKey) {
        try {
            GetObjectRequest getRequest = GetObjectRequest.builder()
                    .bucket(bucketName)
                    .key(storageKey)
                    .build();
            return s3Client.getObjectAsBytes(getRequest).asByteArray();
        } catch (NoSuchKeyException e) {
            return null;
        } catch (Exception e) {
            throw new RuntimeException("Failed to read bytes from S3: " + storageKey, e);
        }
    }
}
