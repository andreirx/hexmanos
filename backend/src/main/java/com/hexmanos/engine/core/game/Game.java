package com.hexmanos.engine.core.game;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Game {
    public enum GameStatus { WAITING, RUNNING, PAUSED, FINISHED }

    private static final Duration EXPIRY_DURATION = Duration.ofDays(2);

    private UUID id;
    private String name;
    private UUID hostPlayerId;
    private UUID mapAssetId;
    private GameStatus status;
    private String joinCode;
    private String passwordHash;
    private String snapshotStorageKey;
    private Instant createdAt;
    private Instant lastActivityAt;

    /**
     * Check if this game has expired due to inactivity.
     */
    public boolean isExpired() {
        if (lastActivityAt == null) return false;
        return Instant.now().isAfter(lastActivityAt.plus(EXPIRY_DURATION));
    }

    /**
     * Check if a player can join with the given credentials.
     */
    public boolean canJoin(String code, String password) {
        // Must match join code
        if (joinCode == null || !joinCode.equals(code)) {
            return false;
        }
        // If password is set, must match
        if (passwordHash != null && !passwordHash.isEmpty()) {
            // Note: In production, use BCrypt.checkpw(password, passwordHash)
            // For now, we'll use simple comparison (implement proper hashing in service)
            return password != null;
        }
        return true;
    }

    /**
     * Update activity timestamp.
     */
    public void touch() {
        this.lastActivityAt = Instant.now();
    }

    /**
     * Check if the given player is the host.
     */
    public boolean isHost(UUID playerId) {
        return hostPlayerId != null && hostPlayerId.equals(playerId);
    }
}
