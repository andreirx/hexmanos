package com.hexmanos.engine.core.game;

import java.util.*;

/**
 * A* pathfinding implementation for grid-based movement.
 */
public class Pathfinder {

    // Movement directions: N, S, E, W (no diagonals)
    private static final int[][] DIRECTIONS = {
            {0, -1},  // North
            {0, 1},   // South
            {1, 0},   // East
            {-1, 0}   // West
    };

    /**
     * Find the shortest path from start to target using A* algorithm.
     *
     * @param start     Starting position
     * @param target    Target position
     * @param grid      Terrain grid with movement costs
     * @param obstacles Set of positions blocked by other characters
     * @return List of points from start to target (inclusive), or empty list if no path found
     */
    public static List<Point> findPath(Point start, Point target, TerrainGrid grid, Set<Point> obstacles) {
        // Early exit if target is blocked
        if (!grid.isPassable(target.x(), target.y()) || obstacles.contains(target)) {
            return Collections.emptyList();
        }

        // Early exit if start equals target
        if (start.equals(target)) {
            return List.of(start);
        }

        // Priority queue ordered by f = g + h (lowest first)
        PriorityQueue<Node> openSet = new PriorityQueue<>(Comparator.comparingInt(n -> n.f));

        // Maps for tracking visited nodes and their costs
        Map<Point, Integer> gScore = new HashMap<>();
        Map<Point, Point> cameFrom = new HashMap<>();
        Set<Point> closedSet = new HashSet<>();

        // Initialize start node
        gScore.put(start, 0);
        openSet.add(new Node(start, 0, heuristic(start, target)));

        while (!openSet.isEmpty()) {
            Node current = openSet.poll();

            // Skip if already processed with better score
            if (closedSet.contains(current.point)) {
                continue;
            }
            closedSet.add(current.point);

            // Found the target - reconstruct path
            if (current.point.equals(target)) {
                return reconstructPath(cameFrom, current.point);
            }

            // Explore neighbors
            for (int[] dir : DIRECTIONS) {
                Point neighbor = current.point.offset(dir[0], dir[1]);

                // Skip if out of bounds, impassable, blocked, or already processed
                if (!grid.isInBounds(neighbor.x(), neighbor.y()) ||
                        !grid.isPassable(neighbor.x(), neighbor.y()) ||
                        obstacles.contains(neighbor) ||
                        closedSet.contains(neighbor)) {
                    continue;
                }

                // Calculate tentative g score
                int moveCost = grid.getCost(neighbor.x(), neighbor.y());
                int tentativeG = gScore.get(current.point) + moveCost;

                // Skip if we've found a better path to this neighbor
                if (tentativeG >= gScore.getOrDefault(neighbor, Integer.MAX_VALUE)) {
                    continue;
                }

                // This is a better path - record it
                cameFrom.put(neighbor, current.point);
                gScore.put(neighbor, tentativeG);

                int h = heuristic(neighbor, target);
                openSet.add(new Node(neighbor, tentativeG, tentativeG + h));
            }
        }

        // No path found
        return Collections.emptyList();
    }

    /**
     * Heuristic function (Manhattan distance).
     */
    private static int heuristic(Point a, Point b) {
        return a.manhattanDistance(b);
    }

    /**
     * Reconstruct the path from start to end using the cameFrom map.
     */
    private static List<Point> reconstructPath(Map<Point, Point> cameFrom, Point current) {
        List<Point> path = new ArrayList<>();
        path.add(current);

        while (cameFrom.containsKey(current)) {
            current = cameFrom.get(current);
            path.add(current);
        }

        Collections.reverse(path);
        return path;
    }

    /**
     * Internal node class for the priority queue.
     */
    private record Node(Point point, int g, int f) {}
}
