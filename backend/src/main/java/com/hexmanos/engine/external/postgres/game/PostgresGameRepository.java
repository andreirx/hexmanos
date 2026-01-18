package com.hexmanos.engine.external.postgres.game;

import com.hexmanos.engine.core.game.Game;
import com.hexmanos.engine.core.game.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hexmanos.engine.external.postgres.game.GameEntity.EntityMapper;

@Component
@RequiredArgsConstructor
public class PostgresGameRepository implements GameRepository {
    private final GameDB db;

    @Override
    public Optional<Game> findById(UUID id) {
        return db.findById(id).map(EntityMapper::fromEntity);
    }

    @Override
    public Optional<Game> findByJoinCode(String code) {
        return db.findByJoinCode(code).map(EntityMapper::fromEntity);
    }

    @Override
    public List<Game> findByHostPlayerId(UUID playerId) {
        return db.findByHostPlayerId(playerId).stream()
                .map(EntityMapper::fromEntity)
                .toList();
    }

    @Override
    public List<Game> findActiveGames() {
        return db.findByStatusIn(List.of(Game.GameStatus.WAITING, Game.GameStatus.RUNNING)).stream()
                .map(EntityMapper::fromEntity)
                .toList();
    }

    @Override
    public List<Game> findExpiredGames(Instant cutoff) {
        return db.findByLastActivityAtBefore(cutoff).stream()
                .map(EntityMapper::fromEntity)
                .toList();
    }

    @Override
    public Game save(Game game) {
        boolean exists = game.getId() != null && db.existsById(game.getId());
        GameEntity entity = EntityMapper.toEntity(game, !exists);
        return EntityMapper.fromEntity(db.save(entity));
    }

    @Override
    public void delete(UUID id) {
        db.deleteById(id);
    }
}
