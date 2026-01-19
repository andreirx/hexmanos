package com.hexmanos.engine.app.config.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Value("${app.cognito.player.issuer-uri}")
    private String playerIssuerUri;

    @Value("${app.cognito.admin.issuer-uri}")
    private String adminIssuerUri;

    @Value("${app.security.enabled:true}")
    private boolean securityEnabled;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        if (securityEnabled) {
            http
                .authorizeHttpRequests(auth -> auth
                    // Public endpoints
                    .requestMatchers("/actuator/health").permitAll()
                    .requestMatchers("/api/public/**").permitAll()
                    .requestMatchers("/api/assets/files/**").permitAll() // Asset files are public
                    // All other API endpoints require authentication
                    .requestMatchers("/api/**").authenticated()
                    .anyRequest().permitAll()
                )
                .oauth2ResourceServer(oauth2 -> oauth2
                    .jwt(jwt -> jwt.decoder(multiIssuerJwtDecoder()))
                );
        } else {
            // WARNING: Local dev only - allow all requests without authentication
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        }

        return http.build();
    }

    /**
     * Custom JWT decoder that accepts tokens from both Player and Admin Cognito pools.
     * It tries the player pool first, then falls back to admin pool.
     */
    @Bean
    public JwtDecoder multiIssuerJwtDecoder() {
        // Create decoders for both pools
        JwtDecoder playerDecoder = JwtDecoders.fromIssuerLocation(playerIssuerUri);
        JwtDecoder adminDecoder = JwtDecoders.fromIssuerLocation(adminIssuerUri);

        return token -> {
            // Try player pool first
            try {
                return playerDecoder.decode(token);
            } catch (JwtException e) {
                // Fall back to admin pool
                return adminDecoder.decode(token);
            }
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(
            "http://localhost:5173",  // Player frontend
            "http://localhost:5174",  // Admin frontend
            "http://localhost:8080"
        ));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Authorization"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
