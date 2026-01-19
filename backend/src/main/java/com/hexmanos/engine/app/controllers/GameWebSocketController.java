package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.config.websocket.JwtChannelInterceptor.WebSocketPrincipal;
import com.hexmanos.engine.core.game.GameService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
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

            // Broadcast the move to all players in the game
            CharacterMoveEvent event = new CharacterMoveEvent(
                    result.characterId().toString(),
                    result.x(),
                    result.y(),
                    result.direction()
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
     * Event broadcast when a character moves.
     */
    public record CharacterMoveEvent(
            String characterId,
            int x,
            int y,
            String direction
    ) {}

    /**
     * Event sent to user for errors.
     */
    public record ErrorEvent(String message) {}
}
