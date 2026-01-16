package com.hexmanos.engine.core.user;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Business logic for User domain.
 * Handles user sync from Cognito on login.
 */
@Slf4j
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;

    public List<User> getAll() {
        return userRepository.findAll();
    }

    public Optional<User> getById(UUID id) {
        return userRepository.findById(id);
    }

    public Optional<User> getByCognitoSub(String cognitoSub) {
        return userRepository.findByCognitoSub(cognitoSub);
    }

    /**
     * Sync a user from Cognito.
     * If the user exists, update lastLoginAt.
     * If the user doesn't exist, create a new record.
     *
     * @param cognitoSub The Cognito "sub" claim
     * @param pool Which Cognito pool (PLAYER or ADMIN)
     * @param displayName The username/preferred_username
     * @param email The user's email
     * @return The synced user
     */
    public User syncFromCognito(String cognitoSub, User.UserPool pool, String displayName, String email) {
        Optional<User> existingUser = userRepository.findByCognitoSub(cognitoSub);

        if (existingUser.isPresent()) {
            // Update last login time
            User user = existingUser.get();
            user.setLastLoginAt(LocalDateTime.now());
            // Update email/displayName in case they changed in Cognito
            user.setEmail(email);
            user.setDisplayName(displayName);
            log.info("User synced (existing): {} - {}", displayName, cognitoSub);
            return userRepository.save(user);
        } else {
            // Create new user
            User newUser = new User();
            newUser.setId(UUID.randomUUID());
            newUser.setCognitoSub(cognitoSub);
            newUser.setPool(pool);
            newUser.setDisplayName(displayName);
            newUser.setEmail(email);
            newUser.setCreatedAt(LocalDateTime.now());
            newUser.setLastLoginAt(LocalDateTime.now());
            log.info("User synced (new): {} - {}", displayName, cognitoSub);
            return userRepository.save(newUser);
        }
    }
}
