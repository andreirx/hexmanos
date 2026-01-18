package com.hexmanos.engine.core.map;

import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.List;

/**
 * Service for validating map data before it can be used in the game engine.
 * Checks basic requirements like terrain coverage and character placement.
 */
@Slf4j
public class MapValidationService {

    /**
     * Validation result containing errors, warnings, and statistics.
     */
    public record ValidationResult(
            boolean valid,
            List<String> errors,
            List<String> warnings,
            int terrainTileCount,
            int pathTileCount,
            int characterCount,
            int emptyCellCount
    ) {}

    /**
     * Validate a map for game readiness.
     *
     * @param width Map width in cells
     * @param height Map height in cells
     * @param terrain 2D array of terrain tiles (can contain nulls)
     * @param paths 2D array of path tiles (can contain nulls)
     * @param characterPositions List of character positions as [x, y] pairs
     * @return ValidationResult with errors, warnings, and stats
     */
    public ValidationResult validate(
            int width,
            int height,
            boolean[][] terrain,  // true = has terrain, false = empty
            boolean[][] paths,    // true = has path, false = empty
            List<int[]> characterPositions  // List of [x, y] positions
    ) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        int terrainCount = 0;
        int pathCount = 0;
        int emptyCount = 0;

        // Count terrain and empty cells
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                if (terrain[y][x]) {
                    terrainCount++;
                } else {
                    emptyCount++;
                }
                if (paths[y][x]) {
                    pathCount++;
                }
            }
        }

        // Validation Rule 1: Must have terrain
        if (terrainCount == 0) {
            errors.add("Map has no terrain tiles. Add at least some ground for characters to walk on.");
        }

        // Validation Rule 2: Must have at least one character
        int characterCount = characterPositions.size();
        if (characterCount == 0) {
            errors.add("Map has no characters. Add at least one character to the map.");
        }

        // Validation Rule 3: Characters must be on terrain
        List<int[]> floatingCharacters = new ArrayList<>();
        for (int[] pos : characterPositions) {
            int x = pos[0];
            int y = pos[1];

            // Check bounds
            if (x < 0 || x >= width || y < 0 || y >= height) {
                errors.add(String.format("Character at (%d, %d) is outside map bounds.", x, y));
                continue;
            }

            // Check if on terrain
            if (!terrain[y][x]) {
                floatingCharacters.add(pos);
            }
        }

        if (!floatingCharacters.isEmpty()) {
            StringBuilder sb = new StringBuilder("Characters not on terrain: ");
            for (int i = 0; i < floatingCharacters.size(); i++) {
                if (i > 0) sb.append(", ");
                int[] pos = floatingCharacters.get(i);
                sb.append(String.format("(%d, %d)", pos[0], pos[1]));
            }
            sb.append(". Move them onto terrain tiles.");
            errors.add(sb.toString());
        }

        // Warnings (non-blocking)
        int totalCells = width * height;
        double coveragePercent = (double) terrainCount / totalCells * 100;

        if (coveragePercent < 10) {
            warnings.add(String.format("Low terrain coverage (%.1f%%). Consider adding more ground.", coveragePercent));
        }

        if (emptyCount > totalCells * 0.9) {
            warnings.add("Most of the map is empty. This may feel sparse during gameplay.");
        }

        boolean isValid = errors.isEmpty();

        log.info("Map validation: valid={}, errors={}, warnings={}, terrain={}, paths={}, characters={}",
                isValid, errors.size(), warnings.size(), terrainCount, pathCount, characterCount);

        return new ValidationResult(
                isValid,
                errors,
                warnings,
                terrainCount,
                pathCount,
                characterCount,
                emptyCount
        );
    }
}
