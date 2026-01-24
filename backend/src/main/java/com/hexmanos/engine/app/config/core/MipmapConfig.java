package com.hexmanos.engine.app.config.core;

import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.mipmap.MipmapGeneratorService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MipmapConfig {

    @Bean
    public MipmapGeneratorService mipmapGeneratorService(FileStorageService fileStorageService) {
        return new MipmapGeneratorService(fileStorageService);
    }
}
