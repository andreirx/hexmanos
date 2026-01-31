package com.hexmanos.engine.core.game;

import java.util.*;

/**
 * Finds N valid destination slots near a target point using spiral search,
 * then assigns characters to slots using greedy closest-pair matching.
 * Used for squad movement ("bunching" pattern - Starcraft style).
 */
public class SlotFinder {

    /**
     * Find N passable, unoccupied tiles nearest to the target using spiral search.
     * Uses Chebyshev distance rings (square rings) expanding outward from target.
     * Within each ring, points are sorted by Euclidean distance to target.
     *
     * @param target Center point to search around
     * @param count Number of slots needed
     * @param grid Terrain grid for passability checks
     * @param occupied Set of occupied positions to avoid
     * @return List of valid slot positions, closest to target first
     */
    public static List<Point> findSlots(Point target, int count, TerrainGrid grid, Set<Point> occupied) {
        List<Point> slots = new ArrayList<>();

        // Check target itself first
        if (grid.isInBounds(target.x(), target.y())
                && grid.isPassable(target.x(), target.y())
                && !occupied.contains(target)) {
            slots.add(target);
            if (slots.size() >= count) return slots;
        }

        // Spiral outward ring by ring (Chebyshev distance)
        int maxRadius = Math.max(grid.getWidth(), grid.getHeight());
        for (int r = 1; r <= maxRadius && slots.size() < count; r++) {
            List<Point> ring = getRingPoints(target, r);
            for (Point p : ring) {
                if (!grid.isInBounds(p.x(), p.y())) continue;
                if (!grid.isPassable(p.x(), p.y())) continue;
                if (occupied.contains(p)) continue;
                if (slots.contains(p)) continue;
                slots.add(p);
                if (slots.size() >= count) return slots;
            }
        }

        return slots;
    }

    /**
     * Generate points at Chebyshev distance r from center (a square ring).
     * Returns them sorted by Euclidean distance to center (closest first).
     */
    private static List<Point> getRingPoints(Point center, int r) {
        List<Point> points = new ArrayList<>();

        // Top and bottom rows of the ring
        for (int dx = -r; dx <= r; dx++) {
            points.add(new Point(center.x() + dx, center.y() - r)); // top
            points.add(new Point(center.x() + dx, center.y() + r)); // bottom
        }
        // Left and right columns (excluding corners already added)
        for (int dy = -r + 1; dy <= r - 1; dy++) {
            points.add(new Point(center.x() - r, center.y() + dy)); // left
            points.add(new Point(center.x() + r, center.y() + dy)); // right
        }

        // Sort by Euclidean distance to center (prefer cardinal directions over corners)
        points.sort(Comparator.comparingDouble(p -> {
            double dx = p.x() - center.x();
            double dy = p.y() - center.y();
            return dx * dx + dy * dy;
        }));

        return points;
    }

    /**
     * Assign characters to slots using greedy closest-pair matching.
     * For each slot (closest to target first), assign the nearest unassigned character.
     * This minimizes path crossing and total travel distance.
     *
     * @param characterPositions Map of characterId -> current position
     * @param slots Ordered list of destination slots (closest to target first)
     * @return Map of characterId -> assigned slot
     */
    public static Map<UUID, Point> assignCharactersToSlots(
            Map<UUID, Point> characterPositions, List<Point> slots) {

        Map<UUID, Point> assignments = new HashMap<>();
        Set<UUID> assigned = new HashSet<>();

        // For each slot (prioritizing closest to target), find nearest unassigned character
        for (Point slot : slots) {
            if (assigned.size() >= characterPositions.size()) break;

            UUID closestChar = null;
            int closestDist = Integer.MAX_VALUE;

            for (Map.Entry<UUID, Point> entry : characterPositions.entrySet()) {
                if (assigned.contains(entry.getKey())) continue;
                int dist = entry.getValue().manhattanDistance(slot);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestChar = entry.getKey();
                }
            }

            if (closestChar != null) {
                assignments.put(closestChar, slot);
                assigned.add(closestChar);
            }
        }

        return assignments;
    }
}
