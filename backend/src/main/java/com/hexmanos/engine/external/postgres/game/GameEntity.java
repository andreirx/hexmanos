package com.hexmanos.engine.external.postgres.game;

import com.hexmanos.engine.core.game.Game;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

import java.time.Instant;
import java.util.UUID;

@Data
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "games")
public class GameEntity implements Persistable<UUID> {
    @Id
    private UUID id;

    @Transient
    private boolean isNew = true;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private UUID hostPlayerId;

    @Column(nullable = false)
    private UUID mapAssetId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Game.GameStatus status;

    @Column(nullable = false, unique = true)
    private String joinCode;

    @Column
    private String passwordHash;

    @Column
    private String snapshotStorageKey;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant lastActivityAt;

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        if (this.lastActivityAt == null) {
            this.lastActivityAt = now;
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

    public interface EntityMapper {
        static Game fromEntity(GameEntity entity) {
            Game game = new Game();
            game.setId(entity.getId());
            game.setName(entity.getName());
            game.setHostPlayerId(entity.getHostPlayerId());
            game.setMapAssetId(entity.getMapAssetId());
            game.setStatus(entity.getStatus());
            game.setJoinCode(entity.getJoinCode());
            game.setPasswordHash(entity.getPasswordHash());
            game.setSnapshotStorageKey(entity.getSnapshotStorageKey());
            game.setCreatedAt(entity.getCreatedAt());
            game.setLastActivityAt(entity.getLastActivityAt());
            return game;
        }

        static GameEntity toEntity(Game game, boolean isNew) {
            GameEntity entity = new GameEntity();
            entity.setId(game.getId());
            entity.setName(game.getName());
            entity.setHostPlayerId(game.getHostPlayerId());
            entity.setMapAssetId(game.getMapAssetId());
            entity.setStatus(game.getStatus());
            entity.setJoinCode(game.getJoinCode());
            entity.setPasswordHash(game.getPasswordHash());
            entity.setSnapshotStorageKey(game.getSnapshotStorageKey());
            entity.setCreatedAt(game.getCreatedAt());
            entity.setLastActivityAt(game.getLastActivityAt());
            entity.setNew(isNew);
            return entity;
        }
    }
}
