package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.dtos.GameDTOs.*;
import com.hexmanos.engine.core.game.*;
import com.hexmanos.engine.core.user.User;
import com.hexmanos.engine.core.user.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;
    private final UserService userService;

    /**
     * Create a new game.
     */
    @PostMapping
    public ResponseEntity<GameDTO> createGame(
            @RequestBody CreateGameRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            Game game = gameService.createGame(
                    playerId,
                    request.mapAssetId(),
                    request.name(),
                    request.password()
            );
            List<GamePlayer> players = gameService.getPlayers(game.getId());
            List<GameCharacter> characters = gameService.getCharacters(game.getId());
            Map<UUID, UUID> characterControl = gameService.getCharacterControl(game.getId());
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(GameDTO.from(game, players, characters, characterControl));
        } catch (IllegalArgumentException e) {
            log.warn("Failed to create game: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Get games hosted by the current user.
     */
    @GetMapping
    public ResponseEntity<List<GameDTO>> getMyGames(@AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<Game> games = gameService.getMyGames(playerId);
        List<GameDTO> dtos = games.stream()
                .map(GameDTO::fromSimple)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    /**
     * Get a game by ID with full details.
     */
    @GetMapping("/{gameId}")
    public ResponseEntity<GameDTO> getGame(
            @PathVariable UUID gameId,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            Game game = gameService.getGame(gameId);
            List<GamePlayer> players = gameService.getPlayers(gameId);
            List<GameCharacter> characters = gameService.getCharacters(gameId);
            Map<UUID, UUID> characterControl = gameService.getCharacterControl(gameId);
            return ResponseEntity.ok(GameDTO.from(game, players, characters, characterControl));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Start a game.
     */
    @PostMapping("/{gameId}/start")
    public ResponseEntity<GameDTO> startGame(
            @PathVariable UUID gameId,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            Game game = gameService.startGame(gameId, playerId);
            List<GamePlayer> players = gameService.getPlayers(gameId);
            List<GameCharacter> characters = gameService.getCharacters(gameId);
            Map<UUID, UUID> characterControl = gameService.getCharacterControl(gameId);
            return ResponseEntity.ok(GameDTO.from(game, players, characters, characterControl));
        } catch (IllegalArgumentException e) {
            log.warn("Failed to start game: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Pause a game.
     */
    @PostMapping("/{gameId}/pause")
    public ResponseEntity<GameDTO> pauseGame(
            @PathVariable UUID gameId,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            Game game = gameService.pauseGame(gameId, playerId);
            List<GamePlayer> players = gameService.getPlayers(gameId);
            List<GameCharacter> characters = gameService.getCharacters(gameId);
            Map<UUID, UUID> characterControl = gameService.getCharacterControl(gameId);
            return ResponseEntity.ok(GameDTO.from(game, players, characters, characterControl));
        } catch (IllegalArgumentException e) {
            log.warn("Failed to pause game: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Stop a game completely.
     */
    @PostMapping("/{gameId}/stop")
    public ResponseEntity<Void> stopGame(
            @PathVariable UUID gameId,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            gameService.stopGame(gameId, playerId);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            log.warn("Failed to stop game: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Join a game.
     */
    @PostMapping("/{gameId}/join")
    public ResponseEntity<GamePlayerDTO> joinGame(
            @PathVariable UUID gameId,
            @RequestBody JoinGameRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            GamePlayer player = gameService.joinGame(
                    gameId,
                    playerId,
                    request.code(),
                    request.password()
            );
            return ResponseEntity.ok(GamePlayerDTO.from(player));
        } catch (IllegalArgumentException e) {
            log.warn("Failed to join game: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Leave a game.
     */
    @PostMapping("/{gameId}/leave")
    public ResponseEntity<Void> leaveGame(
            @PathVariable UUID gameId,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        gameService.leaveGame(gameId, playerId);
        return ResponseEntity.ok().build();
    }

    /**
     * Take control of a character.
     */
    @PostMapping("/{gameId}/characters/{characterId}/take-over")
    public ResponseEntity<Void> takeOverCharacter(
            @PathVariable UUID gameId,
            @PathVariable UUID characterId,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            gameService.takeOverCharacter(gameId, playerId, characterId);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            log.warn("Failed to take over character: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Release control of a character.
     */
    @PostMapping("/{gameId}/characters/relinquish")
    public ResponseEntity<Void> relinquishCharacter(
            @PathVariable UUID gameId,
            @AuthenticationPrincipal Jwt jwt) {
        UUID playerId = getPlayerId(jwt);
        if (playerId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        gameService.relinquishCharacter(gameId, playerId);
        return ResponseEntity.ok().build();
    }

    /**
     * Get the internal player ID from JWT.
     */
    private UUID getPlayerId(Jwt jwt) {
        if (jwt == null) {
            return null;
        }

        String cognitoSub = jwt.getSubject();
        if (cognitoSub == null) {
            return null;
        }

        // Sync user to ensure they exist and get their internal ID
        String email = jwt.getClaimAsString("email");
        String username = jwt.getClaimAsString("cognito:username");
        if (username == null) {
            username = jwt.getClaimAsString("preferred_username");
        }
        if (username == null) {
            username = email != null ? email.split("@")[0] : "user";
        }

        String issuer = jwt.getIssuer().toString();
        User.UserPool pool = issuer.contains("admin") ? User.UserPool.ADMIN : User.UserPool.PLAYER;

        User user = userService.syncFromCognito(cognitoSub, pool, username, email);
        return user.getId();
    }
}
