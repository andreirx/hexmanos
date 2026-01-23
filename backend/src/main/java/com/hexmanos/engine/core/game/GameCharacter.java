package com.hexmanos.engine.core.game;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
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
    private String currentState;    // idle, walk_down, etc.
    private String visualState;     // full, hurt_1, etc.
    private int health;
    private int maxHealth;
    private boolean controlled;     // Has active player control

    // Pathfinding state
    private transient List<Point> currentPath;  // transient = not serialized to snapshots
    private transient int pathIndex;

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
     */
    public void move(int dx, int dy) {
        this.x += dx;
        this.y += dy;
        // Update state based on movement direction
        if (dx > 0) {
            this.currentState = "walk_right";
        } else if (dx < 0) {
            this.currentState = "walk_left";
        } else if (dy > 0) {
            this.currentState = "walk_down";
        } else if (dy < 0) {
            this.currentState = "walk_up";
        }
    }

    /**
     * Set to idle state.
     */
    public void idle() {
        this.currentState = "idle";
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
}
