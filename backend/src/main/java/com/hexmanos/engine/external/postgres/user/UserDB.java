package com.hexmanos.engine.external.postgres.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for UserEntity.
 */
@Repository
public interface UserDB extends JpaRepository<UserEntity, UUID> {
    Optional<UserEntity> findByCognitoSub(String cognitoSub);
}
