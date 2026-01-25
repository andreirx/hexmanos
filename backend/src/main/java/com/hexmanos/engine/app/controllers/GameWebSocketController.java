package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.config.websocket.JwtChannelInterceptor.WebSocketPrincipal;
import com.hexmanos.engine.core.game.GameCharacter;
import com.hexmanos.engine.core.game.GameService;
import com.hexmanos.engine.core.game.GameState;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

/**
 * WebSocket controller for real-time game interactions.
 * Uses STOMP over WebSocket for bi-directional communication.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class GameWebSocketController {

    private final GameService gameService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Handle character movement requests.
     * Client sends: /app/game/{gameId}/move
     * Server broadcasts: /topic/game/{gameId}
     */
    @MessageMapping("/game/{gameId}/move")
    public void moveCharacter(
            @DestinationVariable UUID gameId,
            @Payload MoveRequest request,
            Principal principal) {

        UUID playerId = extractPlayerId(principal);
        if (playerId == null) {
            log.warn("Move request with no authenticated user");
            return;
        }

        try {
            GameService.MoveResult result = gameService.moveCharacter(gameId, playerId, request.direction());

            // Broadcast the move to all players in the game (with backend-dictated duration)
            CharacterMoveEvent event = new CharacterMoveEvent(
                    result.characterId().toString(),
                    result.x(),
                    result.y(),
                    result.direction(),
                    result.state(),
                    result.duration()
            );

            messagingTemplate.convertAndSend("/topic/game/" + gameId, event);

            log.debug("Character {} moved to ({}, {}) in game {}",
                    result.characterId(), result.x(), result.y(), gameId);
        } catch (IllegalArgumentException e) {
            log.warn("Move failed for player {} in game {}: {}", playerId, gameId, e.getMessage());
            // Send error back to the user
            sendErrorToUser(principal, "Move failed: " + e.getMessage());
        }
    }

    /**
     * Handle character idle requests (stop moving).
     * Client sends: /app/game/{gameId}/idle
     * Server broadcasts: /topic/game/{gameId}
     */
    @MessageMapping("/game/{gameId}/idle")
    public void idleCharacter(
            @DestinationVariable UUID gameId,
            Principal principal) {

        UUID playerId = extractPlayerId(principal);
        if (playerId == null) {
            return;
        }

        // TODO: Implement idle state handling if needed
        log.debug("Idle request from player {} in game {}", playerId, gameId);
    }

    /**
     * Handle pathfinding request.
     * Client sends: /app/game/{gameId}/path
     * Server broadcasts: /topic/game/{gameId} (PathStartEvent)
     */
    @MessageMapping("/game/{gameId}/path")
    public void requestPath(
            @DestinationVariable UUID gameId,
            @Payload PathRequest request,
            Principal principal) {

        UUID playerId = extractPlayerId(principal);
        if (playerId == null) {
            log.warn("Path request with no authenticated user");
            return;
        }

        try {
            GameService.PathResult result = gameService.requestPath(gameId, playerId, request.targetX(), request.targetY());

            // Broadcast the path start to all players
            PathStartEvent event = new PathStartEvent(
                    result.characterId().toString(),
                    result.path()
            );

            messagingTemplate.convertAndSend("/topic/game/" + gameId, event);

            log.debug("Path set for character {} in game {}: {} steps",
                    result.characterId(), gameId, result.path().size());
        } catch (IllegalArgumentException e) {
            log.warn("Path request failed for player {} in game {}: {}", playerId, gameId, e.getMessage());
            sendErrorToUser(principal, "Path failed: " + e.getMessage());
        }
    }

    /**
     * Handle path cancellation.
     * Client sends: /app/game/{gameId}/cancelPath
     * Server broadcasts: /topic/game/{gameId} (PathCancelEvent)
     */
    @MessageMapping("/game/{gameId}/cancelPath")
    public void cancelPath(
            @DestinationVariable UUID gameId,
            Principal principal) {

        UUID playerId = extractPlayerId(principal);
        if (playerId == null) {
            return;
        }

        gameService.cancelPath(gameId, playerId);

        // Get the character ID to broadcast cancellation
        // Note: we need to broadcast so all clients know to clear the path visualization
        // Since character is no longer tracked, we just broadcast a general cancel for this player
        log.debug("Path cancelled by player {} in game {}", playerId, gameId);
    }

    /**
     * Handle attack requests.
     * Client sends: /app/game/{gameId}/attack
     * Server broadcasts: /topic/game/{gameId} (AttackStartEvent, and ProjectileSpawnEvent for ranged)
     */
    @MessageMapping("/game/{gameId}/attack")
    public void attack(
            @DestinationVariable UUID gameId,
            @Payload AttackRequest request,
            Principal principal) {

        UUID playerId = extractPlayerId(principal);
        if (playerId == null) {
            log.warn("Attack request with no authenticated user");
            return;
        }

        try {
            GameService.AttackResult result = gameService.attack(
                    gameId, playerId, request.attackId(), request.targetX(), request.targetY()
            );

            // Broadcast attack start
            AttackStartEvent attackEvent = new AttackStartEvent(
                    result.characterId().toString(),
                    result.attackId(),
                    result.targetX(),
                    result.targetY(),
                    result.direction(),
                    result.state(),
                    result.animationDuration()
            );
            messagingTemplate.convertAndSend("/topic/game/" + gameId, attackEvent);

            // If ranged attack, also broadcast projectile spawn
            if (result.projectileId() != null) {
                // Get character position for projectile start
                GameState state = gameService.getRoomManager().getState(gameId);
                GameCharacter character = state.findCharacter(result.characterId()).orElse(null);

                if (character != null) {
                    ProjectileSpawnEvent spawnEvent = new ProjectileSpawnEvent(
                            result.projectileId().toString(),
                            result.projectileAssetId().toString(),
                            result.characterId().toString(),
                            character.getX(),
                            character.getY(),
                            result.targetX(),
                            result.targetY(),
                            result.projectileSpeed()
                    );
                    messagingTemplate.convertAndSend("/topic/game/" + gameId, spawnEvent);
                }
            }

            log.debug("Attack {} by character {} at ({}, {}) in game {}",
                    result.attackId(), result.characterId(), result.targetX(), result.targetY(), gameId);

        } catch (IllegalArgumentException e) {
            log.warn("Attack failed for player {} in game {}: {}", playerId, gameId, e.getMessage());
            sendErrorToUser(principal, "Attack failed: " + e.getMessage());
        }
    }

    /**
     * Extract the internal player UUID from the Principal.
     */
    private UUID extractPlayerId(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            if (auth.getPrincipal() instanceof WebSocketPrincipal wsPrincipal) {
                return wsPrincipal.userId();
            }
        }
        return null;
    }

    /**
     * Send an error message back to a specific user.
     */
    private void sendErrorToUser(Principal principal, String errorMessage) {
        if (principal != null) {
            messagingTemplate.convertAndSendToUser(
                    principal.getName(),
                    "/queue/errors",
                    new ErrorEvent(errorMessage)
            );
        }
    }

    /**
     * Request payload for move commands.
     */
    public record MoveRequest(String direction) {}

    /**
     * Request payload for path commands.
     */
    public record PathRequest(int targetX, int targetY) {}

    /**
     * Request payload for attack commands.
     */
    public record AttackRequest(String attackId, int targetX, int targetY) {}

    /**
     * Event broadcast when a character moves.
     * @param characterId The character ID
     * @param x New X position
     * @param y New Y position
     * @param direction Direction of movement (n, s, e, w)
     * @param state Animation state to render (walk_up, walk_down, walk_left, walk_right, idle)
     * @param duration Duration in milliseconds for this move animation (based on terrain cost)
     */
    public record CharacterMoveEvent(
            String characterId,
            int x,
            int y,
            String direction,
            String state,
            long duration
    ) {}

    /**
     * Event broadcast when a character starts a path.
     */
    public record PathStartEvent(
            String characterId,
            List<int[]> path  // List of [x, y] coordinates
    ) {}

    /**
     * Event broadcast when a character's path is cancelled.
     */
    public record PathCancelEvent(String characterId) {}

    /**
     * Event sent to user for errors.
     */
    public record ErrorEvent(String message) {}

    /**
     * Event broadcast when a character starts an attack.
     */
    public record AttackStartEvent(
            String characterId,
            String attackId,
            int targetX,
            int targetY,
            String direction,
            String state,
            long animationDuration
    ) {}

    /**
     * Event broadcast when a projectile is spawned (ranged attacks).
     */
    public record ProjectileSpawnEvent(
            String projectileId,
            String projectileAssetId,
            String sourceCharacterId,
            int startX,
            int startY,
            int targetX,
            int targetY,
            int speed
    ) {}
}
