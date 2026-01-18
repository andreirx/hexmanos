package com.hexmanos.engine.app.controllers;

import com.hexmanos.engine.app.dtos.MapValidationRequest;
import com.hexmanos.engine.app.dtos.MapValidationResponse;
import com.hexmanos.engine.core.map.MapValidationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/maps")
@RequiredArgsConstructor
public class MapController {

    private final MapValidationService mapValidationService;

    /**
     * Validate a map for game readiness.
     * Checks:
     * - Map has terrain tiles
     * - Map has at least one character
     * - All characters are placed on terrain (not floating)
     *
     * @param request The map data to validate
     * @return Validation result with errors, warnings, and stats
     */
    @PostMapping("/validate")
    public ResponseEntity<MapValidationResponse> validateMap(@RequestBody MapValidationRequest request) {
        log.info("Validating map: {} ({}x{})", request.getName(), request.getWidth(), request.getHeight());

        // Convert request data to validation format
        int width = request.getWidth();
        int height = request.getHeight();

        // Build terrain presence array
        boolean[][] terrain = new boolean[height][width];
        boolean[][] paths = new boolean[height][width];

        if (request.getLayers() != null) {
            // Process terrain layer
            List<List<MapValidationRequest.MapTile>> terrainLayer = request.getLayers().getTerrain();
            if (terrainLayer != null) {
                for (int y = 0; y < Math.min(height, terrainLayer.size()); y++) {
                    List<MapValidationRequest.MapTile> row = terrainLayer.get(y);
                    if (row != null) {
                        for (int x = 0; x < Math.min(width, row.size()); x++) {
                            terrain[y][x] = row.get(x) != null && row.get(x).getTileAssetId() != null;
                        }
                    }
                }
            }

            // Process paths layer
            List<List<MapValidationRequest.MapPath>> pathsLayer = request.getLayers().getPaths();
            if (pathsLayer != null) {
                for (int y = 0; y < Math.min(height, pathsLayer.size()); y++) {
                    List<MapValidationRequest.MapPath> row = pathsLayer.get(y);
                    if (row != null) {
                        for (int x = 0; x < Math.min(width, row.size()); x++) {
                            paths[y][x] = row.get(x) != null && row.get(x).getPathAssetId() != null;
                        }
                    }
                }
            }
        }

        // Build character positions list
        List<int[]> characterPositions = new ArrayList<>();
        if (request.getCharacters() != null) {
            for (MapValidationRequest.MapCharacter character : request.getCharacters()) {
                characterPositions.add(new int[]{character.getX(), character.getY()});
            }
        }

        // Run validation
        MapValidationService.ValidationResult result = mapValidationService.validate(
                width, height, terrain, paths, characterPositions
        );

        // Build response
        MapValidationResponse response = MapValidationResponse.builder()
                .valid(result.valid())
                .errors(result.errors())
                .warnings(result.warnings())
                .stats(MapValidationResponse.MapStats.builder()
                        .terrainTileCount(result.terrainTileCount())
                        .pathTileCount(result.pathTileCount())
                        .characterCount(result.characterCount())
                        .emptyCellCount(result.emptyCellCount())
                        .build())
                .build();

        return ResponseEntity.ok(response);
    }
}
