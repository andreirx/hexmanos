package com.hexmanos.engine.app.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Request DTO for map validation.
 * Contains the map data structure matching the frontend MapData interface.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MapValidationRequest {
    private String name;
    private int width;
    private int height;
    private int tileSize;
    private Layers layers;
    private List<MapCharacter> characters;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Layers {
        private List<List<MapTile>> terrain;  // 2D array [y][x], can contain nulls
        private List<List<MapPath>> paths;    // 2D array [y][x], can contain nulls
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MapTile {
        private String tileAssetId;
        private int seed;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MapPath {
        private String pathAssetId;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MapCharacter {
        private String characterAssetId;
        private int x;
        private int y;
    }
}
