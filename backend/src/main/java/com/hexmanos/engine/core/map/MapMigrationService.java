package com.hexmanos.engine.core.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service for migrating map data between format versions.
 *
 * Migration V1 -> V2:
 * - Old format: single "paths" layer
 * - New format: separate "waterPaths" and "groundPaths" layers
 *
 * On migration, all legacy paths are moved to groundPaths (roads),
 * and waterPaths is initialized empty.
 */
@Slf4j
@RequiredArgsConstructor
public class MapMigrationService {
    private final ObjectMapper objectMapper;

    /**
     * Check if a map needs migration to the new format.
     *
     * @param mapJson The map JSON string
     * @return true if migration is needed
     */
    public boolean needsMigration(String mapJson) {
        try {
            JsonNode root = objectMapper.readTree(mapJson);
            JsonNode layers = root.get("layers");
            if (layers == null) return false;

            // Needs migration if has "paths" but no "waterPaths"
            boolean hasPaths = layers.has("paths");
            boolean hasWaterPaths = layers.has("waterPaths");

            return hasPaths && !hasWaterPaths;
        } catch (Exception e) {
            log.warn("Failed to check migration status for map", e);
            return false;
        }
    }

    /**
     * Migrate a map from the old format (single paths layer) to the new format
     * (separate waterPaths and groundPaths layers).
     *
     * @param mapJson The original map JSON string
     * @return The migrated map JSON string, or the original if no migration needed
     */
    public String migrate(String mapJson) {
        try {
            JsonNode root = objectMapper.readTree(mapJson);
            JsonNode layers = root.get("layers");

            if (layers == null || !layers.has("paths") || layers.has("waterPaths")) {
                // No migration needed
                return mapJson;
            }

            log.info("Migrating map to new format (splitting paths into waterPaths/groundPaths)");

            ObjectNode rootObj = (ObjectNode) root;
            ObjectNode layersObj = (ObjectNode) layers;

            // Get map dimensions
            int height = root.get("height").asInt();
            int width = root.get("width").asInt();

            // Get existing paths
            JsonNode existingPaths = layers.get("paths");

            // Create empty waterPaths array (same dimensions as paths)
            JsonNode waterPaths = createEmptyPathLayer(height, width);

            // Use existing paths as groundPaths (legacy paths become roads)
            JsonNode groundPaths = existingPaths;

            // Update layers
            layersObj.set("waterPaths", waterPaths);
            layersObj.set("groundPaths", groundPaths);
            layersObj.remove("paths");

            String migratedJson = objectMapper.writeValueAsString(rootObj);
            log.info("Map migration complete: {} x {} map", width, height);

            return migratedJson;
        } catch (Exception e) {
            log.error("Failed to migrate map, returning original", e);
            return mapJson;
        }
    }

    /**
     * Create an empty path layer (2D array of nulls).
     */
    private JsonNode createEmptyPathLayer(int height, int width) {
        try {
            // Create array of arrays with nulls
            Object[][] emptyLayer = new Object[height][width];
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    emptyLayer[y][x] = null;
                }
            }
            return objectMapper.valueToTree(emptyLayer);
        } catch (Exception e) {
            log.error("Failed to create empty path layer", e);
            return objectMapper.createArrayNode();
        }
    }
}
