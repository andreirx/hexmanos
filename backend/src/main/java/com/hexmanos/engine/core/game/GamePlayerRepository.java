package com.hexmanos.engine.core.game;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GamePlayerRepository {
    Optional<GamePlayer> findById(UUID id);
    List<GamePlayer> findByGameId(UUID gameId);
    Optional<GamePlayer> findByGameIdAndPlayerId(UUID gameId, UUID playerId);
    GamePlayer save(GamePlayer player);
    void deleteByGameId(UUID gameId);
    void delete(UUID id);
}
