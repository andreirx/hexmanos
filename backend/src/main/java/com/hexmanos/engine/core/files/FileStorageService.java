package com.hexmanos.engine.core.files;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;
import java.io.InputStream;

public interface FileStorageService {
    String uploadFile(MultipartFile file);
    Resource loadFileAsResource(String fileName);
    InputStream loadFileAsInputStream(String fileName);
    void deleteFile(String fileName);
}
