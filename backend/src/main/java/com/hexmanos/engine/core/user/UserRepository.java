package com.hexmanos.engine.core.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository port for User domain.
 * Returns POJOs, not entities.
 */
public interface UserRepository {
    List<User> findAll();
    Optional<User> findById(UUID id);
    List<User> findByIds(List<UUID> ids);
    Optional<User> findByCognitoSub(String cognitoSub);
    User save(User user);
}
