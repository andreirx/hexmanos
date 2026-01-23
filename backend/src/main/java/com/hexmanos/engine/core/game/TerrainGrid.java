package com.hexmanos.engine.core.game;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

import java.util.Map;

/**
 * Grid holding terrain movement costs for pathfinding.
 * A cost of 0 means impassable.
 */
@Slf4j
public class TerrainGrid {
    private final int width;
    private final int height;
    private final int[][] costs;  // 0 = impassable, 1+ = movement cost

    public TerrainGrid(int width, int height) {
        this.width = width;
        this.height = height;
        this.costs = new int[height][width];
        // Default to cost 1 (passable)
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                costs[y][x] = 1;
            }
        }
    }

    /**
     * Create a TerrainGrid from map JSON and tile movement costs.
     *
     * @param mapDataJson The map JSON string
     * @param tileMovementCosts Map of tile asset ID to movement cost (defaults to 1 if not found)
     */
    public static TerrainGrid fromMapJson(String mapDataJson, Map<String, Integer> tileMovementCosts) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(mapDataJson);

            int width = root.get("width").asInt();
            int height = root.get("height").asInt();

            TerrainGrid grid = new TerrainGrid(width, height);

            // Process terrain layer
            JsonNode layers = root.get("layers");
            if (layers != null) {
                JsonNode terrain = layers.get("terrain");
                if (terrain != null && terrain.isArray()) {
                    for (int y = 0; y < terrain.size() && y < height; y++) {
                        JsonNode row = terrain.get(y);
                        if (row != null && row.isArray()) {
                            for (int x = 0; x < row.size() && x < width; x++) {
                                JsonNode cell = row.get(x);
                                if (cell != null && !cell.isNull()) {
                                    String tileAssetId = cell.has("tileAssetId")
                                            ? cell.get("tileAssetId").asText()
                                            : null;
                                    if (tileAssetId != null) {
                                        int cost = tileMovementCosts.getOrDefault(tileAssetId, 1);
                                        grid.setCost(x, y, cost);
                                    }
                                } else {
                                    // No terrain = impassable
                                    grid.setCost(x, y, 0);
                                }
                            }
                        }
                    }
                }

                // Process water paths (rivers are impassable unless there's a ground path on top)
                processPathLayer(layers, "waterPaths", grid, tileMovementCosts, width, height);
                // Process ground paths (roads may reduce cost)
                processPathLayer(layers, "groundPaths", grid, tileMovementCosts, width, height);
            }

            log.debug("Created terrain grid {}x{}", width, height);
            return grid;
        } catch (Exception e) {
            log.error("Failed to parse map JSON for terrain grid", e);
            throw new RuntimeException("Failed to parse map JSON", e);
        }
    }

    private static void processPathLayer(JsonNode layers, String layerName, TerrainGrid grid,
                                         Map<String, Integer> tileMovementCosts, int width, int height) {
        JsonNode pathLayer = layers.get(layerName);
        if (pathLayer != null && pathLayer.isArray()) {
            for (int y = 0; y < pathLayer.size() && y < height; y++) {
                JsonNode row = pathLayer.get(y);
                if (row != null && row.isArray()) {
                    for (int x = 0; x < row.size() && x < width; x++) {
                        JsonNode cell = row.get(x);
                        if (cell != null && !cell.isNull()) {
                            String pathAssetId = cell.has("pathAssetId")
                                    ? cell.get("pathAssetId").asText()
                                    : null;
                            if (pathAssetId != null) {
                                int cost = tileMovementCosts.getOrDefault(pathAssetId, 1);
                                // For paths, override the terrain cost
                                // Cost 0 means impassable (water paths)
                                // Cost > 0 means passable with that cost (ground paths/roads)
                                if (cost > 0) {
                                    // Ground path - set to path cost
                                    grid.setCost(x, y, cost);
                                } else if ("waterPaths".equals(layerName)) {
                                    // Water path with cost 0 - impassable unless ground path on top
                                    grid.setCost(x, y, 0);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public void setCost(int x, int y, int cost) {
        if (isInBounds(x, y)) {
            costs[y][x] = cost;
        }
    }

    public int getCost(int x, int y) {
        if (!isInBounds(x, y)) {
            return 0; // Out of bounds = impassable
        }
        return costs[y][x];
    }

    public boolean isPassable(int x, int y) {
        return getCost(x, y) > 0;
    }

    public boolean isInBounds(int x, int y) {
        return x >= 0 && x < width && y >= 0 && y < height;
    }
}
