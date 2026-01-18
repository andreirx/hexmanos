package com.hexmanos.engine.app.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Response DTO for map validation results.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MapValidationResponse {
    private boolean valid;
    private List<String> errors;
    private List<String> warnings;
    private MapStats stats;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MapStats {
        private int terrainTileCount;
        private int pathTileCount;
        private int characterCount;
        private int emptyCellCount;
    }
}
