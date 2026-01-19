# WebSocket Configuration

Spring WebSocket and STOMP messaging configuration for real-time game communication.

## Files

| File | Purpose |
|------|---------|
| `WebSocketConfig.java` | STOMP broker and endpoint configuration |
| `JwtChannelInterceptor.java` | JWT authentication for WebSocket connections |

## WebSocketConfig

Configures Spring's WebSocket message broker.

### Endpoints

| Endpoint | Transport | Purpose |
|----------|-----------|---------|
| `/ws/game` | SockJS | Primary WebSocket endpoint with fallback |

### Message Broker

| Prefix | Type | Purpose |
|--------|------|---------|
| `/topic` | Simple Broker | Broadcast to all subscribers |
| `/user` | Simple Broker | User-specific messages |
| `/app` | Application | Messages handled by @MessageMapping controllers |

### CORS Configuration

Allowed origins:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:5174` (Admin dev server)
- `https://hexmanos.com` (Production)
- `https://admin.hexmanos.com` (Admin production)

### Key Annotations

- `@EnableWebSocketMessageBroker` - Enables STOMP messaging
- `WebSocketMessageBrokerConfigurer` - Interface for custom config

## JwtChannelInterceptor

Validates JWT tokens during WebSocket CONNECT frame.

### Authentication Flow

1. Client sends STOMP CONNECT with `Authorization: Bearer <token>` header
2. Interceptor extracts token from CONNECT frame headers
3. Token validated using Spring's `JwtDecoder` (configured for Cognito)
4. On success: Creates `WebSocketPrincipal` with user ID (from `sub` claim)
5. On failure: Throws `MessageDeliveryException` (connection rejected)

### WebSocketPrincipal

Simple `Principal` implementation that wraps the Cognito user ID:
- `getName()` returns the user's Cognito `sub` claim (UUID)
- Used by controllers via `Principal` parameter in @MessageMapping methods

### Security Notes

- Token validation happens ONCE at CONNECT time
- Subsequent messages use the established principal
- Invalid/missing token = connection rejected immediately
- Token expiration after connect does NOT disconnect (session-based)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing Authorization header | Connection rejected with "Missing Authorization header" |
| Invalid/malformed token | Connection rejected with "Invalid JWT token" |
| Expired token | Connection rejected (JwtDecoder throws) |
| Valid token | Connection established, principal set |

## Integration with Controllers

Controllers receive authenticated user via `Principal`:

```java
@MessageMapping("/game/{gameId}/move")
public void move(@DestinationVariable UUID gameId,
                 @Payload MoveRequest request,
                 Principal principal) {
    UUID playerId = UUID.fromString(principal.getName());
    // Process move...
}
```

## Client Requirements

1. Obtain JWT token (from Cognito)
2. Include in STOMP CONNECT headers:
   ```javascript
   connectHeaders: {
     Authorization: `Bearer ${token}`
   }
   ```
3. Use SockJS for transport (fallback support)
