package com.hexmanos.engine.app.config.core;

import com.hexmanos.engine.core.user.UserService;
import com.hexmanos.engine.external.postgres.user.PostgresUserRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class UserConfig {

    @Bean
    public UserService userService(PostgresUserRepository userRepository) {
        return new UserService(userRepository);
    }
}
