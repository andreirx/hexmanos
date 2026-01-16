package com.hexmanos.engine.core.files;

public record PresignedUploadUrl(
        String uploadUrl,
        String storageKey,
        String httpMethod,
        long expiresInSeconds
) {}
