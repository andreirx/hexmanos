package com.hexmanos.engine.app.config.core;

import com.hexmanos.engine.core.files.FileStorageService;
import com.hexmanos.engine.core.transition.TransitionGeneratorService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TransitionConfig {

    @Bean
    public TransitionGeneratorService transitionGeneratorService(FileStorageService fileStorageService) {
        return new TransitionGeneratorService(fileStorageService);
    }
}
