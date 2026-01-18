package com.hexmanos.engine.app.config.core;

import com.hexmanos.engine.core.map.MapValidationService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MapConfig {

    @Bean
    public MapValidationService mapValidationService() {
        return new MapValidationService();
    }
}
