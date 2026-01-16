package com.hexmanos.engine.external.postgres.user;

import com.hexmanos.engine.core.user.User;
import com.hexmanos.engine.core.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hexmanos.engine.external.postgres.user.UserEntity.EntityMapper;

/**
 * Adapter implementing UserRepository port using PostgreSQL.
 */
@Component
@RequiredArgsConstructor
public class PostgresUserRepository implements UserRepository {
    private final UserDB db;

    @Override
    public List<User> findAll() {
        return db.findAll().stream().map(EntityMapper::fromEntity).toList();
    }

    @Override
    public Optional<User> findById(UUID id) {
        return db.findById(id).map(EntityMapper::fromEntity);
    }

    @Override
    public Optional<User> findByCognitoSub(String cognitoSub) {
        return db.findByCognitoSub(cognitoSub).map(EntityMapper::fromEntity);
    }

    @Override
    public User save(User user) {
        // Check if this is an update or insert
        boolean exists = user.getId() != null && db.existsById(user.getId());

        UserEntity entity = EntityMapper.toEntity(user);
        entity.setNew(!exists);

        return EntityMapper.fromEntity(db.save(entity));
    }
}
