package com.hexmanos.engine.core.user;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Domain object representing a Hexmanos user.
 * Users are synced from AWS Cognito on first login.
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class User {
    /**
     * Which Cognito pool the user belongs to.
     */
    public enum UserPool { PLAYER, ADMIN }

    /**
     * Internal user ID (UUID)
     */
    private UUID id;

    /**
     * Cognito "sub" claim - the unique identifier from Cognito.
     * This is the link between our DB and Cognito.
     */
    private String cognitoSub;

    /**
     * Which pool the user authenticated from.
     */
    private UserPool pool;

    /**
     * User's display name (Cognito "preferred_username" or "username")
     */
    private String displayName;

    /**
     * User's email address from Cognito
     */
    private String email;

    /**
     * When the user was first synced/created
     */
    private LocalDateTime createdAt;

    /**
     * Last time the user logged in (synced)
     */
    private LocalDateTime lastLoginAt;
}
