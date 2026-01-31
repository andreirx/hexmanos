package com.hexmanos.engine.core.game;

import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Debug recorder for batch movement operations.
 * When enabled, writes text files capturing the full context of each batch pathfind:
 * terrain grid, initial character positions, target, computed paths, and final positions.
 *
 * Guarded by an enabled flag — no-op when disabled.
 */
@Slf4j
public class BatchMovementRecorder {

    private final boolean enabled;
    private final Path outputDir;
    private final DateTimeFormatter formatter = DateTimeFormatter
            .ofPattern("yyyyMMdd_HHmmss_SSS")
            .withZone(ZoneId.systemDefault());

    // Track active batch recordings: batchId -> recording context
    private final Map<String, BatchRecording> activeRecordings = new ConcurrentHashMap<>();

    public BatchMovementRecorder(boolean enabled, Path outputDir) {
        this.enabled = enabled;
        this.outputDir = outputDir;

        if (enabled) {
            try {
                Files.createDirectories(outputDir);
                log.info("BatchMovementRecorder ENABLED, output dir: {}", outputDir);
            } catch (IOException e) {
                log.error("Failed to create batch recording output dir: {}", outputDir, e);
            }
        } else {
            log.info("BatchMovementRecorder DISABLED");
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Record the initial state of a batch path request.
     * Call this from GameRoomManager.requestBatchPath() BEFORE computing paths.
     *
     * @return a batchId string to pass to recordCompletion later, or null if disabled
     */
    public String recordBatchRequest(
            UUID gameId,
            Set<UUID> characterIds,
            int targetX, int targetY,
            TerrainGrid terrain,
            Map<UUID, Point> charPositions,
            Set<Point> occupiedBeforeBatch) {

        if (!enabled) return null;

        String batchId = formatter.format(Instant.now()) + "_" + gameId.toString().substring(0, 8);

        StringBuilder sb = new StringBuilder();
        sb.append("=== BATCH MOVEMENT RECORDING ===\n");
        sb.append("Batch ID: ").append(batchId).append("\n");
        sb.append("Game ID: ").append(gameId).append("\n");
        sb.append("Timestamp: ").append(Instant.now()).append("\n");
        sb.append("Target: (").append(targetX).append(", ").append(targetY).append(")\n");
        sb.append("Characters in batch: ").append(characterIds.size()).append("\n\n");

        // Character initial positions
        sb.append("--- INITIAL CHARACTER POSITIONS ---\n");
        for (Map.Entry<UUID, Point> entry : charPositions.entrySet()) {
            sb.append("  ").append(entry.getKey()).append(" -> (")
              .append(entry.getValue().x()).append(", ")
              .append(entry.getValue().y()).append(")\n");
        }
        sb.append("\n");

        // Terrain grid (costs)
        if (terrain != null) {
            sb.append("--- TERRAIN GRID (").append(terrain.getWidth()).append("x")
              .append(terrain.getHeight()).append(") ---\n");
            sb.append("Legend: 0=impassable, 1+=movement cost\n");

            // Only render a window around the characters and target to keep files manageable
            int minX = targetX, maxX = targetX, minY = targetY, maxY = targetY;
            for (Point p : charPositions.values()) {
                minX = Math.min(minX, p.x());
                maxX = Math.max(maxX, p.x());
                minY = Math.min(minY, p.y());
                maxY = Math.max(maxY, p.y());
            }
            // Expand by 5 tiles in each direction
            minX = Math.max(0, minX - 5);
            maxX = Math.min(terrain.getWidth() - 1, maxX + 5);
            minY = Math.max(0, minY - 5);
            maxY = Math.min(terrain.getHeight() - 1, maxY + 5);

            sb.append("Window: (").append(minX).append(",").append(minY)
              .append(") to (").append(maxX).append(",").append(maxY).append(")\n");

            // Header row with X coordinates
            sb.append("     ");
            for (int x = minX; x <= maxX; x++) {
                sb.append(String.format("%3d", x));
            }
            sb.append("\n");

            for (int y = minY; y <= maxY; y++) {
                sb.append(String.format("%3d: ", y));
                for (int x = minX; x <= maxX; x++) {
                    int cost = terrain.getCost(x, y);
                    // Mark special positions
                    Point pos = new Point(x, y);
                    boolean isCharPos = charPositions.values().contains(pos);
                    boolean isTarget = (x == targetX && y == targetY);
                    boolean isOccupied = occupiedBeforeBatch.contains(pos);

                    if (isTarget) {
                        sb.append("  T");
                    } else if (isCharPos) {
                        sb.append("  C");
                    } else if (isOccupied) {
                        sb.append("  X");
                    } else if (cost == 0) {
                        sb.append("  #");
                    } else {
                        sb.append(String.format("%3d", cost));
                    }
                }
                sb.append("\n");
            }
            sb.append("T=target, C=character, X=occupied(other), #=impassable\n\n");
        }

        // Store for later completion
        BatchRecording recording = new BatchRecording(batchId, sb.toString(), charPositions, targetX, targetY);
        activeRecordings.put(batchId, recording);

        return batchId;
    }

    /**
     * Record the computed paths and slot assignments after batch pathfinding completes.
     * Call this from GameRoomManager.requestBatchPath() AFTER computing paths.
     */
    public void recordBatchResult(
            String batchId,
            Map<UUID, Point> slotAssignments,
            Map<UUID, List<Point>> computedPaths) {

        if (!enabled || batchId == null) return;

        BatchRecording recording = activeRecordings.get(batchId);
        if (recording == null) {
            log.warn("No active recording for batchId: {}", batchId);
            return;
        }

        StringBuilder sb = new StringBuilder(recording.initialContent);

        // Slot assignments
        sb.append("--- SLOT ASSIGNMENTS ---\n");
        for (Map.Entry<UUID, Point> entry : slotAssignments.entrySet()) {
            Point start = recording.initialPositions.get(entry.getKey());
            Point dest = entry.getValue();
            sb.append("  ").append(entry.getKey())
              .append(": (").append(start != null ? start.x() : "?").append(",")
              .append(start != null ? start.y() : "?").append(") -> (")
              .append(dest.x()).append(",").append(dest.y()).append(")\n");
        }
        sb.append("\n");

        // Computed paths
        sb.append("--- COMPUTED PATHS ---\n");
        for (Map.Entry<UUID, List<Point>> entry : computedPaths.entrySet()) {
            sb.append("  ").append(entry.getKey()).append(": ");
            List<Point> path = entry.getValue();
            if (path.isEmpty()) {
                sb.append("NO PATH FOUND");
            } else {
                sb.append(path.size()).append(" steps: ");
                for (int i = 0; i < path.size(); i++) {
                    if (i > 0) sb.append(" -> ");
                    sb.append("(").append(path.get(i).x()).append(",").append(path.get(i).y()).append(")");
                }
            }
            sb.append("\n");
        }

        // Characters that didn't get paths
        Set<UUID> noPath = new HashSet<>(recording.initialPositions.keySet());
        noPath.removeAll(computedPaths.keySet());
        if (!noPath.isEmpty()) {
            sb.append("\n  Characters with NO path: ");
            noPath.forEach(id -> sb.append(id).append(" "));
            sb.append("\n");
        }

        sb.append("\nResult: ").append(computedPaths.size()).append("/")
          .append(recording.initialPositions.size()).append(" characters got paths\n");

        // Track which characters need final position recording
        recording.pendingCharacterIds = new HashSet<>(computedPaths.keySet());
        recording.finalPositions = new HashMap<>();
        recording.initialContent = sb.toString();

        // Write the initial + paths file immediately
        writeRecordingFile(batchId, recording.initialContent, "_request.txt");

        // If no paths were computed, close the recording
        if (computedPaths.isEmpty()) {
            activeRecordings.remove(batchId);
        }
    }

    /**
     * Record a character's final position after completing its path.
     * Call this from GameScheduler when a character's path completes.
     */
    public void recordCharacterArrival(UUID characterId, int finalX, int finalY) {
        if (!enabled) return;

        // Check all active recordings for this character
        for (Map.Entry<String, BatchRecording> entry : activeRecordings.entrySet()) {
            BatchRecording recording = entry.getValue();
            if (recording.pendingCharacterIds != null && recording.pendingCharacterIds.remove(characterId)) {
                recording.finalPositions.put(characterId, new Point(finalX, finalY));

                // If all characters have arrived, write the completion file
                if (recording.pendingCharacterIds.isEmpty()) {
                    writeCompletionFile(entry.getKey(), recording);
                    activeRecordings.remove(entry.getKey());
                }
            }
        }
    }

    /**
     * Record a character whose path was cancelled (blocked, error, etc).
     */
    public void recordCharacterPathCancelled(UUID characterId, int currentX, int currentY) {
        if (!enabled) return;

        for (Map.Entry<String, BatchRecording> entry : activeRecordings.entrySet()) {
            BatchRecording recording = entry.getValue();
            if (recording.pendingCharacterIds != null && recording.pendingCharacterIds.remove(characterId)) {
                recording.finalPositions.put(characterId, new Point(currentX, currentY));
                recording.cancelledCharacters.add(characterId);

                if (recording.pendingCharacterIds.isEmpty()) {
                    writeCompletionFile(entry.getKey(), recording);
                    activeRecordings.remove(entry.getKey());
                }
            }
        }
    }

    private void writeCompletionFile(String batchId, BatchRecording recording) {
        StringBuilder sb = new StringBuilder(recording.initialContent);
        sb.append("\n--- FINAL POSITIONS ---\n");

        for (Map.Entry<UUID, Point> entry : recording.finalPositions.entrySet()) {
            Point initial = recording.initialPositions.get(entry.getKey());
            Point finalPos = entry.getValue();
            boolean cancelled = recording.cancelledCharacters.contains(entry.getKey());
            sb.append("  ").append(entry.getKey())
              .append(": (").append(initial != null ? initial.x() : "?").append(",")
              .append(initial != null ? initial.y() : "?").append(") -> (")
              .append(finalPos.x()).append(",").append(finalPos.y()).append(")")
              .append(cancelled ? " [CANCELLED]" : " [COMPLETED]")
              .append("\n");
        }

        int completed = recording.finalPositions.size() - recording.cancelledCharacters.size();
        sb.append("\nCompleted: ").append(completed).append("/").append(recording.finalPositions.size()).append("\n");
        sb.append("Cancelled: ").append(recording.cancelledCharacters.size()).append("\n");
        sb.append("Finished at: ").append(Instant.now()).append("\n");

        writeRecordingFile(batchId, sb.toString(), "_complete.txt");
    }

    private void writeRecordingFile(String batchId, String content, String suffix) {
        try {
            Path file = outputDir.resolve("batch_" + batchId + suffix);
            Files.writeString(file, content);
            log.info("Wrote batch recording: {}", file);
        } catch (IOException e) {
            log.error("Failed to write batch recording for {}: {}", batchId, e.getMessage());
        }
    }

    private static class BatchRecording {
        final String batchId;
        String initialContent;
        final Map<UUID, Point> initialPositions;
        final int targetX;
        final int targetY;
        Set<UUID> pendingCharacterIds;
        Map<UUID, Point> finalPositions = new HashMap<>();
        Set<UUID> cancelledCharacters = new HashSet<>();

        BatchRecording(String batchId, String initialContent, Map<UUID, Point> initialPositions,
                       int targetX, int targetY) {
            this.batchId = batchId;
            this.initialContent = initialContent;
            this.initialPositions = new HashMap<>(initialPositions);
            this.targetX = targetX;
            this.targetY = targetY;
        }
    }
}
