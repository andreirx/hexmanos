package com.hexmanos.engine.external.postgres.user;

import com.hexmanos.engine.core.user.User;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@NoArgsConstructor
@Table(name = "users")
public class UserEntity implements Persistable<UUID> {
    @Id
    private UUID id;

    @Transient
    private boolean isNew = true;

    @Column(nullable = false, unique = true)
    private String cognitoSub;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private User.UserPool pool;

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime lastLoginAt;

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
        if (this.lastLoginAt == null) {
            this.lastLoginAt = LocalDateTime.now();
        }
    }

    @PostLoad
    @PostPersist
    public void markNotNew() {
        this.isNew = false;
    }

    @Override
    public boolean isNew() {
        return isNew;
    }

    /**
     * Mapper between Entity and Domain POJO.
     */
    public interface EntityMapper {
        static User fromEntity(UserEntity entity) {
            return new User(
                    entity.getId(),
                    entity.getCognitoSub(),
                    entity.getPool(),
                    entity.getDisplayName(),
                    entity.getEmail(),
                    entity.getCreatedAt(),
                    entity.getLastLoginAt()
            );
        }

        static UserEntity toEntity(User user) {
            UserEntity entity = new UserEntity();
            entity.setId(user.getId());
            entity.setCognitoSub(user.getCognitoSub());
            entity.setPool(user.getPool());
            entity.setDisplayName(user.getDisplayName());
            entity.setEmail(user.getEmail());
            entity.setCreatedAt(user.getCreatedAt());
            entity.setLastLoginAt(user.getLastLoginAt());
            // Note: isNew is set by repository based on existence check
            return entity;
        }
    }
}
