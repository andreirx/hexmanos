package com.hexmanos.engine.external.postgres.game;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GamePlayerDB extends JpaRepository<GamePlayerEntity, UUID> {
    List<GamePlayerEntity> findByGameId(UUID gameId);
    Optional<GamePlayerEntity> findByGameIdAndPlayerId(UUID gameId, UUID playerId);
    void deleteByGameId(UUID gameId);
}
