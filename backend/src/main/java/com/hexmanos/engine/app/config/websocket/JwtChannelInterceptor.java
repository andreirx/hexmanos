package com.hexmanos.engine.app.config.websocket;

import com.hexmanos.engine.core.user.User;
import com.hexmanos.engine.core.user.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtChannelInterceptor implements ChannelInterceptor {

    private final JwtDecoder jwtDecoder;
    private final UserService userService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            // Extract JWT from Authorization header during CONNECT
            String authHeader = accessor.getFirstNativeHeader("Authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                try {
                    Jwt jwt = jwtDecoder.decode(token);

                    // Extract user info and sync to database
                    String cognitoSub = jwt.getSubject();
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

                    // Create authentication principal with user ID
                    WebSocketPrincipal principal = new WebSocketPrincipal(user.getId(), username);
                    accessor.setUser(new UsernamePasswordAuthenticationToken(
                            principal,
                            null,
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
                    ));

                    log.debug("WebSocket connected for user: {} ({})", username, user.getId());
                } catch (JwtException e) {
                    log.warn("Invalid JWT token in WebSocket connection: {}", e.getMessage());
                    throw new IllegalArgumentException("Invalid JWT token");
                }
            } else {
                log.warn("No Authorization header in WebSocket CONNECT");
                throw new IllegalArgumentException("Missing Authorization header");
            }
        }

        return message;
    }

    /**
     * Custom principal that holds the internal user ID (UUID) for game operations.
     */
    public record WebSocketPrincipal(UUID userId, String username) implements java.security.Principal {
        @Override
        public String getName() {
            return username;
        }
    }
}
