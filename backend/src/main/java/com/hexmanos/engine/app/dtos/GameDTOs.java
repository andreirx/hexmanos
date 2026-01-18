package com.hexmanos.engine.app.dtos;

import com.hexmanos.engine.core.game.Game;
import com.hexmanos.engine.core.game.GameCharacter;
import com.hexmanos.engine.core.game.GamePlayer;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * DTOs for the Game API.
 */
public class GameDTOs {

    // Request DTOs

    public record CreateGameRequest(
            UUID mapAssetId,
            String name,
            String password
    ) {}

    public record JoinGameRequest(
            String code,
            String password
    ) {}

    public record TakeOverRequest(
            UUID characterId
    ) {}

    // Response DTOs

    public record GameDTO(
            UUID id,
            String name,
            UUID mapAssetId,
            String status,
            String joinCode,
            Instant createdAt,
            Instant lastActivityAt,
            List<GamePlayerDTO> players,
            List<GameCharacterDTO> characters
    ) {
        public static GameDTO from(Game game, List<GamePlayer> players, List<GameCharacter> characters) {
            return new GameDTO(
                    game.getId(),
                    game.getName(),
                    game.getMapAssetId(),
                    game.getStatus().name(),
                    game.getJoinCode(),
                    game.getCreatedAt(),
                    game.getLastActivityAt(),
                    players.stream().map(GamePlayerDTO::from).toList(),
                    characters.stream().map(GameCharacterDTO::from).toList()
            );
        }

        public static GameDTO fromSimple(Game game) {
            return new GameDTO(
                    game.getId(),
                    game.getName(),
                    game.getMapAssetId(),
                    game.getStatus().name(),
                    game.getJoinCode(),
                    game.getCreatedAt(),
                    game.getLastActivityAt(),
                    List.of(),
                    List.of()
            );
        }
    }

    public record GamePlayerDTO(
            UUID id,
            UUID playerId,
            String role,
            UUID controlledCharacterId,
            Instant joinedAt,
            Instant lastSeenAt
    ) {
        public static GamePlayerDTO from(GamePlayer player) {
            return new GamePlayerDTO(
                    player.getId(),
                    player.getPlayerId(),
                    player.getRole().name(),
                    player.getControlledCharacterId(),
                    player.getJoinedAt(),
                    player.getLastSeenAt()
            );
        }
    }

    public record GameCharacterDTO(
            UUID id,
            UUID assetId,
            String name,
            int x,
            int y,
            String currentState,
            String visualState,
            int health,
            int maxHealth,
            boolean controlled
    ) {
        public static GameCharacterDTO from(GameCharacter character) {
            return new GameCharacterDTO(
                    character.getId(),
                    character.getAssetId(),
                    character.getName(),
                    character.getX(),
                    character.getY(),
                    character.getCurrentState(),
                    character.getVisualState(),
                    character.getHealth(),
                    character.getMaxHealth(),
                    character.isControlled()
            );
        }
    }
}
