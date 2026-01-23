package com.hexmanos.engine.core.game;

/**
 * Simple immutable point representing grid coordinates.
 */
public record Point(int x, int y) {

    /**
     * Get Manhattan distance to another point.
     */
    public int manhattanDistance(Point other) {
        return Math.abs(x - other.x) + Math.abs(y - other.y);
    }

    /**
     * Get a new point offset by dx, dy.
     */
    public Point offset(int dx, int dy) {
        return new Point(x + dx, y + dy);
    }

    @Override
    public String toString() {
        return "(" + x + "," + y + ")";
    }
}
