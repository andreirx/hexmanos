package com.hexmanos.engine.external.postgres.game;

import com.hexmanos.engine.core.game.Game;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GameDB extends JpaRepository<GameEntity, UUID> {
    Optional<GameEntity> findByJoinCode(String joinCode);
    List<GameEntity> findByHostPlayerId(UUID hostPlayerId);
    List<GameEntity> findByStatusIn(List<Game.GameStatus> statuses);
    List<GameEntity> findByLastActivityAtBefore(Instant cutoff);
}
