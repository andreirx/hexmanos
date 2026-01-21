package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.dtos.UserDTO;
import com.hexmanos.engine.core.user.User;
import com.hexmanos.engine.core.user.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

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

        // For display name, prefer: name > preferred_username > email prefix > cognito:username
        // This handles Google OAuth users who get ugly usernames like "Google_123456789"
        String displayName = jwt.getClaimAsString("name");
        if (displayName == null || displayName.isBlank()) {
            displayName = jwt.getClaimAsString("preferred_username");
        }
        if (displayName == null || displayName.isBlank()) {
            displayName = email != null ? email.split("@")[0] : null;
        }
        if (displayName == null || displayName.isBlank()) {
            displayName = jwt.getClaimAsString("cognito:username");
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
