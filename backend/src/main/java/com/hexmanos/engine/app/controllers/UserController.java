package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.dtos.UserDTO;
import com.hexmanos.engine.core.user.User;
import com.hexmanos.engine.core.user.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final RestTemplate restTemplate;

    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}")
    private String issuerUri;

    public UserController(UserService userService) {
        this.userService = userService;
        this.restTemplate = new RestTemplate();
    }

    /**
     * Fetch user info from Cognito's userinfo endpoint when access token lacks claims.
     */
    private Map<String, Object> fetchUserInfo(String accessToken, String issuer) {
        try {
            // Build userinfo URL from issuer (e.g., https://cognito-idp.region.amazonaws.com/poolId)
            // Cognito userinfo is at the domain, not the issuer. Extract region and construct URL.
            // Format: https://<domain>.auth.<region>.amazoncognito.com/oauth2/userInfo
            // But simpler: use issuer to get region, then use known domain

            // For now, use the standard OIDC userinfo path relative to issuer
            // Cognito's userinfo is actually at the hosted UI domain, not the issuer
            // We need to construct it from the pool ID
            String poolId = issuer.substring(issuer.lastIndexOf("/") + 1);
            String region = poolId.split("_")[0];

            // The userinfo endpoint needs the Cognito domain, which we'd need to configure
            // Simpler approach: extract from issuer and use Cognito's direct endpoint
            String userInfoUrl = issuer + "/oauth2/userInfo";

            // Actually Cognito userinfo is NOT at issuer/oauth2/userInfo
            // It's at https://<your-domain>.auth.<region>.amazoncognito.com/oauth2/userInfo
            // We need the domain prefix which isn't in the JWT

            // Alternative: Use AWS SDK to call GetUser API
            // For now, let's try the standard approach and see if it works

            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            HttpEntity<String> entity = new HttpEntity<>(headers);

            // Try the Cognito userinfo endpoint (may need adjustment)
            ResponseEntity<Map> response = restTemplate.exchange(
                    "https://hexmanos-players-324037297014.auth." + region + ".amazoncognito.com/oauth2/userInfo",
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                log.info("UserInfo response: {}", response.getBody());
                return response.getBody();
            }
        } catch (Exception e) {
            log.warn("Failed to fetch userinfo: {}", e.getMessage());
        }
        return Map.of();
    }

    /**
     * Get all users (admin only in production).
     */
    @GetMapping
    public ResponseEntity<List<UserDTO>> getAllUsers() {
        List<UserDTO> users = userService.getAll().stream()
                .map(UserDTO.DTOMapper::toDTO)
                .toList();
        return ResponseEntity.ok(users);
    }

    /**
     * Get a user by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<UserDTO> getUserById(@PathVariable UUID id) {
        return userService.getById(id)
                .map(UserDTO.DTOMapper::toDTO)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Get the current authenticated user's profile.
     * Automatically syncs from Cognito JWT claims.
     */
    @GetMapping("/me")
    public ResponseEntity<UserDTO> getCurrentUser(@AuthenticationPrincipal Jwt jwt) {
        if (jwt == null) {
            return ResponseEntity.status(401).build();
        }

        String cognitoSub = jwt.getSubject();
        String email = jwt.getClaimAsString("email");
        String displayName = jwt.getClaimAsString("name");

        // If email or name missing from access token, fetch from userinfo endpoint
        // This is needed for Google OAuth users where claims are only in ID token
        if (email == null || displayName == null) {
            Map<String, Object> userInfo = fetchUserInfo(jwt.getTokenValue(), jwt.getIssuer().toString());
            if (!userInfo.isEmpty()) {
                if (email == null) {
                    email = (String) userInfo.get("email");
                }
                if (displayName == null) {
                    displayName = (String) userInfo.get("name");
                }
            }
        }

        // Fallback chain for display name
        if (displayName == null || displayName.isBlank()) {
            displayName = jwt.getClaimAsString("preferred_username");
        }
        if (displayName == null || displayName.isBlank()) {
            displayName = email != null ? email.split("@")[0] : null;
        }
        if (displayName == null || displayName.isBlank()) {
            String cognitoUsername = jwt.getClaimAsString("cognito:username");
            // Don't use Google_xxx usernames
            if (cognitoUsername != null && !cognitoUsername.startsWith("Google_")) {
                displayName = cognitoUsername;
            }
        }
        if (displayName == null || displayName.isBlank()) {
            displayName = "user";
        }

        // Determine pool from issuer
        String issuer = jwt.getIssuer().toString();
        User.UserPool pool = issuer.contains("admin") ? User.UserPool.ADMIN : User.UserPool.PLAYER;

        // Sync user (creates if not exists, updates last login if exists)
        User user = userService.syncFromCognito(cognitoSub, pool, displayName, email);

        return ResponseEntity.ok(UserDTO.DTOMapper.toDTO(user));
    }

    /**
     * Explicitly sync a user from Cognito.
     * Called by frontend after successful Cognito authentication.
     */
    @PostMapping("/sync")
    public ResponseEntity<UserDTO> syncUser(@RequestBody UserDTO.SyncRequest request) {
        if (request.getCognitoSub() == null || request.getCognitoSub().isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        User.UserPool pool;
        try {
            pool = User.UserPool.valueOf(request.getPool().toUpperCase());
        } catch (Exception e) {
            pool = User.UserPool.PLAYER;
        }

        User user = userService.syncFromCognito(
                request.getCognitoSub(),
                pool,
                request.getDisplayName(),
                request.getEmail()
        );

        log.info("User synced via explicit call: {}", user.getDisplayName());
        return ResponseEntity.ok(UserDTO.DTOMapper.toDTO(user));
    }
}
