package com.hexmanos.engine.app.config.core;

import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.external.files.storage.LocalFileStorageService;
import com.hexmanos.engine.external.files.storage.S3FileStorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Slf4j
@Configuration
public class FileStorageConfig {

    @Bean
    @ConditionalOnProperty(name = "app.storage.type", havingValue = "local")
    FileStorageService localFileStorageService(@Value("${app.storage.local.dir}") String uploadDir) {
        log.info("Initializing Local File Storage: {}", uploadDir);
        return new LocalFileStorageService(uploadDir);
    }

    @Bean
    @ConditionalOnProperty(name = "app.storage.type", havingValue = "s3")
    FileStorageService s3FileStorageService(
            @Value("${app.storage.aws.bucket}") String bucketName,
            @Value("${app.storage.aws.prefix}") String prefix,
            @Value("${aws.region}") String region) {
        log.info("Initializing S3 File Storage: {}/{}", bucketName, prefix);
        S3Client s3Client = S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
        return new S3FileStorageService(s3Client, bucketName, prefix);
    }
}
