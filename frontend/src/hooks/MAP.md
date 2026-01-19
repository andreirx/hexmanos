# Hooks

Custom React hooks for cross-cutting concerns.

## Files

| File | Purpose |
|------|---------|
| `useGameWebSocket.ts` | Real-time game state synchronization via STOMP/WebSocket |

## useGameWebSocket

Manages WebSocket connection for real-time game updates.

### Usage

```typescript
const { isConnected, sendMove, sendIdle } = useGameWebSocket({
  gameId: "uuid",
  onCharacterMove: (event) => { /* handle move */ },
  onError: (message) => { /* handle error */ },
  onConnected: () => { /* connection established */ },
  onDisconnected: () => { /* connection lost */ },
})
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `gameId` | string | Yes | UUID of the game to connect to |
| `onCharacterMove` | function | No | Called when any character moves |
| `onError` | function | No | Called on WebSocket/game errors |
| `onConnected` | function | No | Called when connection established |
| `onDisconnected` | function | No | Called when connection lost |

### Return Values

| Value | Type | Description |
|-------|------|-------------|
| `isConnected` | boolean | Current connection status |
| `sendMove` | function | Send move command (direction: "n"/"s"/"e"/"w") |
| `sendIdle` | function | Send idle command (character stopped) |

### Architecture

**Connection Setup:**
1. Fetches JWT token from AWS Amplify Auth
2. Creates STOMP client with SockJS transport
3. Connects with Authorization header
4. Subscribes to game topic and user error queue

**Stability Patterns (CRITICAL):**
- Callbacks stored in `callbacksRef` to avoid effect re-runs
- `sendMove` and `sendIdle` have EMPTY dependency arrays (stable references)
- `currentGameIdRef` tracks active game to prevent stale closures
- `isConnectingRef` prevents concurrent connection attempts
- useEffect only depends on `gameId` - callback changes don't trigger reconnect

**Why These Patterns:**
- React's useCallback/useEffect dependency arrays can cause infinite loops
- Storing callbacks in refs breaks the dependency chain
- Stable function references prevent Phaser from losing callbacks on re-render

### STOMP Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `webSocketFactory` | SockJS | Fallback for browsers without native WebSocket |
| `reconnectDelay` | 5000ms | Auto-reconnect after disconnect |
| `heartbeatIncoming` | 10000ms | Server heartbeat interval |
| `heartbeatOutgoing` | 10000ms | Client heartbeat interval |

### Subscriptions

| Topic | Purpose |
|-------|---------|
| `/topic/game/{gameId}` | Broadcasts for all players (character moves) |
| `/user/queue/errors` | User-specific error messages |

### Messages

**Outbound:**
- `/app/game/{gameId}/move` - `{ direction: "n"/"s"/"e"/"w" }`
- `/app/game/{gameId}/idle` - `{}`

**Inbound:**
- `CharacterMoveEvent` - `{ characterId, x, y, direction }`

### Browser Compatibility

Requires `window.global = window` polyfill in index.html for SockJS compatibility.
SockJS expects Node.js `global` variable which doesn't exist in browsers.

### Troubleshooting

**Connection loops (connect/disconnect repeatedly):**
- Check that callback functions are stable (use refs, not inline functions)
- Verify gameId isn't changing on every render
- Check `isConnectingRef` guard is working

**Authentication failures:**
- Verify JWT token is valid and not expired
- Check backend JwtChannelInterceptor is configured
- Look for STOMP error frames in console

**Messages not received:**
- Verify subscription to correct topic
- Check backend is broadcasting to `/topic/game/{gameId}`
- Confirm message format matches `CharacterMoveEvent` interface
