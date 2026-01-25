package com.hexmanos.engine.core.game;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Represents a projectile in flight during an active game.
 * This is a transient in-memory object, not serialized to snapshots.
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class GameProjectile {
    private UUID id;
    private UUID gameId;
    private UUID sourceCharacterId;
    private UUID attackingPlayerId;
    private UUID projectileAssetId;

    // Current position (floating point for smooth movement)
    private double currentX;
    private double currentY;

    // Target position
    private int targetX;
    private int targetY;

    // Movement
    private double velocityX;  // Tiles per millisecond
    private double velocityY;
    private int speed;         // Tiles per second

    // Attack info
    private int damage;
    private String attackId;

    // Lifecycle
    private long createdAt;
    private static final long MAX_LIFETIME_MS = 10000;  // 10 second timeout

    /**
     * Create a new projectile from a ranged attack.
     */
    public static GameProjectile create(
            UUID gameId,
            GameCharacter source,
            UUID attackingPlayerId,
            AttackDefinition attack,
            int targetX,
            int targetY
    ) {
        GameProjectile p = new GameProjectile();
        p.setId(UUID.randomUUID());
        p.setGameId(gameId);
        p.setSourceCharacterId(source.getId());
        p.setAttackingPlayerId(attackingPlayerId);
        p.setProjectileAssetId(attack.projectileAssetId());
        p.setCurrentX(source.getX());
        p.setCurrentY(source.getY());
        p.setTargetX(targetX);
        p.setTargetY(targetY);
        p.setSpeed(attack.projectileSpeed());
        p.setDamage(attack.damage());
        p.setAttackId(attack.id());
        p.setCreatedAt(System.currentTimeMillis());

        // Calculate velocity vector (tiles per millisecond)
        double dx = targetX - source.getX();
        double dy = targetY - source.getY();
        double distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            double tilesPerMs = attack.projectileSpeed() / 1000.0;
            p.setVelocityX((dx / distance) * tilesPerMs);
            p.setVelocityY((dy / distance) * tilesPerMs);
        }

        return p;
    }

    /**
     * Update projectile position based on elapsed time.
     * Returns true if projectile has reached target or timed out.
     */
    public boolean tick(long deltaMs) {
        currentX += velocityX * deltaMs;
        currentY += velocityY * deltaMs;

        // Check if reached target (within 0.5 tile threshold)
        double dx = targetX - currentX;
        double dy = targetY - currentY;
        if (Math.sqrt(dx * dx + dy * dy) < 0.5) {
            return true;
        }

        // Check if overshot target (dot product check)
        double toTargetX = targetX - currentX;
        double toTargetY = targetY - currentY;
        if (velocityX * toTargetX + velocityY * toTargetY < 0) {
            // We've passed the target
            return true;
        }

        // Check timeout
        return System.currentTimeMillis() - createdAt > MAX_LIFETIME_MS;
    }

    /**
     * Get current tile X position (rounded).
     */
    public int getCurrentTileX() {
        return (int) Math.round(currentX);
    }

    /**
     * Get current tile Y position (rounded).
     */
    public int getCurrentTileY() {
        return (int) Math.round(currentY);
    }

    /**
     * Check if projectile is still alive (not timed out).
     */
    public boolean isAlive() {
        return System.currentTimeMillis() - createdAt <= MAX_LIFETIME_MS;
    }
}
