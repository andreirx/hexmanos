package com.hexmanos.engine.core.game;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Represents a character instance in an active game.
 * This is an in-memory object that gets serialized to snapshots.
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class GameCharacter implements Serializable {
    private static final long serialVersionUID = 1L;

    private UUID id;
    private UUID assetId;           // Reference to character asset
    private String name;
    private int x;                  // Grid position
    private int y;
    private String currentState;    // idle, idle_down, walk_down, attack_down, etc.
    private String visualState;     // full, hurt_1, etc.
    private String facing;          // up, down, left, right - direction character is facing
    private int health;
    private int maxHealth;
    private boolean controlled;     // Has active player control

    // Pathfinding state
    private transient List<Point> currentPath;  // transient = not serialized to snapshots
    private transient int pathIndex;
    private transient long lastMoveTime;        // For movement cost-based timing

    // Attack state (transient - not serialized to snapshots)
    private transient Map<String, Long> attackCooldowns;  // attackId -> last used timestamp
    private transient String activeAttackId;              // Currently executing attack
    private transient long attackAnimationEndTime;        // When attack animation ends

    /**
     * Create a new game character from a map placement.
     */
    public static GameCharacter fromPlacement(UUID assetId, String name, int x, int y) {
        GameCharacter character = new GameCharacter();
        character.setId(UUID.randomUUID());
        character.setAssetId(assetId);
        character.setName(name);
        character.setX(x);
        character.setY(y);
        character.setCurrentState("idle");
        character.setVisualState("full");
        character.setFacing("down");  // Default facing direction
        character.setHealth(100);
        character.setMaxHealth(100);
        character.setControlled(false);
        return character;
    }

    /**
     * Check if character is alive.
     */
    public boolean isAlive() {
        return health > 0;
    }

    /**
     * Take damage.
     */
    public void takeDamage(int amount) {
        this.health = Math.max(0, this.health - amount);
        updateVisualState();
    }

    /**
     * Heal.
     */
    public void heal(int amount) {
        this.health = Math.min(maxHealth, this.health + amount);
        updateVisualState();
    }

    /**
     * Update visual state based on health percentage.
     */
    private void updateVisualState() {
        float healthPercent = (float) health / maxHealth;
        if (healthPercent > 0.75f) {
            this.visualState = "full";
        } else if (healthPercent > 0.5f) {
            this.visualState = "hurt_1";
        } else if (healthPercent > 0.25f) {
            this.visualState = "hurt_2";
        } else {
            this.visualState = "critical";
        }
    }

    /**
     * Move character by delta.
     * Updates position, facing direction, and current state.
     */
    public void move(int dx, int dy) {
        this.x += dx;
        this.y += dy;
        // Update facing direction and state based on movement direction
        if (dx > 0) {
            this.facing = "right";
            this.currentState = "walk_right";
        } else if (dx < 0) {
            this.facing = "left";
            this.currentState = "walk_left";
        } else if (dy > 0) {
            this.facing = "down";
            this.currentState = "walk_down";
        } else if (dy < 0) {
            this.facing = "up";
            this.currentState = "walk_up";
        }
    }

    /**
     * Set to idle state in current facing direction.
     * Uses directional idle (idle_up, idle_down, etc.) based on facing.
     */
    public void idle() {
        // Use directional idle based on facing direction
        this.currentState = "idle_" + (this.facing != null ? this.facing : "down");
    }

    /**
     * Set to simple idle state (backwards compatible, no direction).
     */
    public void idleSimple() {
        this.currentState = "idle";
    }

    /**
     * Set to attack state in current facing direction.
     */
    public void attack() {
        this.currentState = "attack_" + (this.facing != null ? this.facing : "down");
    }

    // ============================================
    // Attack methods
    // ============================================

    /**
     * Check if character can perform an attack (not on cooldown, not attacking).
     */
    public boolean canAttack(String attackId, long cooldownMs) {
        // Can't attack while currently attacking
        if (isAttacking()) {
            return false;
        }

        // Check cooldown
        if (attackCooldowns == null) {
            attackCooldowns = new HashMap<>();
        }
        Long lastUsed = attackCooldowns.get(attackId);
        return lastUsed == null || System.currentTimeMillis() - lastUsed >= cooldownMs;
    }

    /**
     * Start an attack. Sets the animation state and records cooldown.
     *
     * @param attackId The attack being performed
     * @param animationDurationMs How long the attack animation lasts
     * @param cooldownMs The attack's cooldown period
     */
    public void startAttack(String attackId, long animationDurationMs, long cooldownMs) {
        if (attackCooldowns == null) {
            attackCooldowns = new HashMap<>();
        }

        this.activeAttackId = attackId;
        this.attackAnimationEndTime = System.currentTimeMillis() + animationDurationMs;
        this.attackCooldowns.put(attackId, System.currentTimeMillis());

        // Set animation state based on facing direction
        this.currentState = "attack_" + (this.facing != null ? this.facing : "down");
    }

    /**
     * End the current attack and return to idle.
     */
    public void endAttack() {
        this.activeAttackId = null;
        idle();
    }

    /**
     * Check if character is currently executing an attack.
     */
    public boolean isAttacking() {
        return activeAttackId != null && System.currentTimeMillis() < attackAnimationEndTime;
    }

    /**
     * Get the currently active attack ID, or null if not attacking.
     */
    public String getActiveAttackId() {
        return activeAttackId;
    }

    /**
     * Get the time remaining on attack animation in milliseconds.
     */
    public long getAttackAnimationTimeRemaining() {
        if (!isAttacking()) {
            return 0;
        }
        return Math.max(0, attackAnimationEndTime - System.currentTimeMillis());
    }

    /**
     * Get the cooldown remaining for a specific attack in milliseconds.
     */
    public long getAttackCooldownRemaining(String attackId, long cooldownMs) {
        if (attackCooldowns == null) {
            return 0;
        }
        Long lastUsed = attackCooldowns.get(attackId);
        if (lastUsed == null) {
            return 0;
        }
        long elapsed = System.currentTimeMillis() - lastUsed;
        return Math.max(0, cooldownMs - elapsed);
    }

    // ============================================
    // Pathfinding methods
    // ============================================

    /**
     * Set a new path for the character to follow.
     * The first point should be the current position.
     */
    public void setPath(List<Point> path) {
        this.currentPath = new ArrayList<>(path);
        this.pathIndex = 0; // Start at current position
    }

    /**
     * Get the next step in the path (the point to move to).
     * Returns null if no path or at end of path.
     */
    public Point getNextPathStep() {
        if (!hasPath()) {
            return null;
        }
        // pathIndex points to current position, next step is pathIndex + 1
        int nextIndex = pathIndex + 1;
        if (nextIndex >= currentPath.size()) {
            return null; // At end of path
        }
        return currentPath.get(nextIndex);
    }

    /**
     * Advance to the next point in the path.
     * Should be called after successfully moving to the next step.
     */
    public void advancePath() {
        if (hasPath()) {
            pathIndex++;
            // If we've reached the end, clear the path
            if (pathIndex >= currentPath.size() - 1) {
                clearPath();
            }
        }
    }

    /**
     * Clear the current path.
     */
    public void clearPath() {
        this.currentPath = null;
        this.pathIndex = 0;
    }

    /**
     * Check if character has an active path.
     */
    public boolean hasPath() {
        return currentPath != null && !currentPath.isEmpty() && pathIndex < currentPath.size() - 1;
    }

    /**
     * Get the full current path (for visualization).
     */
    public List<Point> getCurrentPath() {
        return currentPath != null ? new ArrayList<>(currentPath) : List.of();
    }

    /**
     * Get remaining path points from current position.
     */
    public List<Point> getRemainingPath() {
        if (currentPath == null || pathIndex >= currentPath.size()) {
            return List.of();
        }
        return new ArrayList<>(currentPath.subList(pathIndex, currentPath.size()));
    }

    /**
     * Get the last move time (for movement cost-based timing).
     */
    public long getLastMoveTime() {
        return lastMoveTime;
    }

    /**
     * Record that the character just moved.
     */
    public void recordMove() {
        this.lastMoveTime = System.currentTimeMillis();
    }
}
