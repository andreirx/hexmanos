package com.hexmanos.engine.external.postgres.game;

import com.hexmanos.engine.core.game.GamePlayer;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Data
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "game_players")
public class GamePlayerEntity implements Persistable<UUID> {
    @Id
    private UUID id;

    @Transient
    private boolean isNew = true;

    @Column(nullable = false)
    private UUID gameId;

    @Column(nullable = false)
    private UUID playerId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private GamePlayer.PlayerRole role;

    @ElementCollection
    @CollectionTable(name = "game_player_controlled_characters",
                     joinColumns = @JoinColumn(name = "game_player_id"))
    @Column(name = "character_id")
    private Set<UUID> controlledCharacterIds = new HashSet<>();

    @Column(nullable = false, updatable = false)
    private Instant joinedAt;

    @Column(nullable = false)
    private Instant lastSeenAt;

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        if (this.joinedAt == null) {
            this.joinedAt = now;
        }
        if (this.lastSeenAt == null) {
            this.lastSeenAt = now;
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
        static GamePlayer fromEntity(GamePlayerEntity entity) {
            GamePlayer player = new GamePlayer();
            player.setId(entity.getId());
            player.setGameId(entity.getGameId());
            player.setPlayerId(entity.getPlayerId());
            player.setRole(entity.getRole());
            player.setControlledCharacterIds(
                    entity.getControlledCharacterIds() != null
                            ? new HashSet<>(entity.getControlledCharacterIds())
                            : new HashSet<>()
            );
            player.setJoinedAt(entity.getJoinedAt());
            player.setLastSeenAt(entity.getLastSeenAt());
            return player;
        }

        static GamePlayerEntity toEntity(GamePlayer player, boolean isNew) {
            GamePlayerEntity entity = new GamePlayerEntity();
            entity.setId(player.getId());
            entity.setGameId(player.getGameId());
            entity.setPlayerId(player.getPlayerId());
            entity.setRole(player.getRole());
            entity.setControlledCharacterIds(
                    player.getControlledCharacterIds() != null
                            ? new HashSet<>(player.getControlledCharacterIds())
                            : new HashSet<>()
            );
            entity.setJoinedAt(player.getJoinedAt());
            entity.setLastSeenAt(player.getLastSeenAt());
            entity.setNew(isNew);
            return entity;
        }
    }
}
