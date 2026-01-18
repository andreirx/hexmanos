package com.hexmanos.engine.external.postgres.game;

import com.hexmanos.engine.core.game.GamePlayer;
import com.hexmanos.engine.core.game.GamePlayerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hexmanos.engine.external.postgres.game.GamePlayerEntity.EntityMapper;

@Component
@RequiredArgsConstructor
public class PostgresGamePlayerRepository implements GamePlayerRepository {
    private final GamePlayerDB db;

    @Override
    public Optional<GamePlayer> findById(UUID id) {
        return db.findById(id).map(EntityMapper::fromEntity);
    }

    @Override
    public List<GamePlayer> findByGameId(UUID gameId) {
        return db.findByGameId(gameId).stream()
                .map(EntityMapper::fromEntity)
                .toList();
    }

    @Override
    public Optional<GamePlayer> findByGameIdAndPlayerId(UUID gameId, UUID playerId) {
        return db.findByGameIdAndPlayerId(gameId, playerId).map(EntityMapper::fromEntity);
    }

    @Override
    public GamePlayer save(GamePlayer player) {
        boolean exists = player.getId() != null && db.existsById(player.getId());
        GamePlayerEntity entity = EntityMapper.toEntity(player, !exists);
        return EntityMapper.fromEntity(db.save(entity));
    }

    @Override
    @Transactional
    public void deleteByGameId(UUID gameId) {
        db.deleteByGameId(gameId);
    }

    @Override
    public void delete(UUID id) {
        db.deleteById(id);
    }
}
