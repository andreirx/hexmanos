package com.hexmanos.engine.core.game;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GameRepository {
    Optional<Game> findById(UUID id);
    Optional<Game> findByJoinCode(String code);
    List<Game> findByHostPlayerId(UUID playerId);
    List<Game> findActiveGames();
    List<Game> findExpiredGames(Instant cutoff);
    Game save(Game game);
    void delete(UUID id);
}
