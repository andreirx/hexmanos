package com.hexmanos.engine.core.transition;

import com.hexmanos.engine.core.files.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Generates 8 transition tiles from a base tile image.
 * Used for smooth transitions between different tile types on maps.
 *
 * Transition directions:
 * - Cardinal (N, E, S, W): 32px solid edge, 32px linear fade, rest transparent
 * - Diagonal (NE, SE, SW, NW): 32x32px solid corner, diagonal fade for 32px
 *
 * For 128x128 tiles, the transitions are positioned from the edge inward.
 */
@Slf4j
@RequiredArgsConstructor
public class TransitionGeneratorService {

    private final FileStorageService fileStorageService;

    private static final int SOLID_PIXELS = 32;
    private static final int FADE_PIXELS = 32;

    /**
     * The 8 transition directions.
     */
    public enum Direction {
        N("n"),
        NE("ne"),
        E("e"),
        SE("se"),
        S("s"),
        SW("sw"),
        W("w"),
        NW("nw");

        private final String suffix;

        Direction(String suffix) {
            this.suffix = suffix;
        }

        /**
         * Generate the output filename for a given base tile.
         * E.g., for tile_0.png and direction N, returns tile_0_transition_n.png
         */
        public String getFileName(String baseTileFileName) {
            // Extract the base name without extension (e.g., "tile_0" from "tile_0.png")
            String baseName = baseTileFileName.replace(".png", "");
            return baseName + "_transition_" + suffix + ".png";
        }
    }

    /**
     * Generate all 8 transition images from a base tile.
     *
     * @param storageKeyPrefix The storage prefix where the base tile is stored (e.g., "tiles/uuid")
     * @param baseFileName The base tile filename (e.g., "tile_0.png")
     */
    public void generateTransitions(String storageKeyPrefix, String baseFileName) {
        log.info("Generating transitions for {}/{}", storageKeyPrefix, baseFileName);

        try {
            // Load the base tile image
            String baseStorageKey = storageKeyPrefix + "/" + baseFileName;
            InputStream inputStream = fileStorageService.loadFileAsInputStream(baseStorageKey);
            BufferedImage baseTile = ImageIO.read(inputStream);
            inputStream.close();

            if (baseTile == null) {
                log.error("Failed to read base tile image: {}", baseStorageKey);
                return;
            }

            int width = baseTile.getWidth();
            int height = baseTile.getHeight();

            log.info("Base tile dimensions: {}x{}", width, height);

            // Generate each direction
            for (Direction direction : Direction.values()) {
                BufferedImage transition = generateTransition(baseTile, direction, width, height);
                String transitionKey = storageKeyPrefix + "/" + direction.getFileName(baseFileName);

                byte[] pngBytes = bufferedImageToPng(transition);
                fileStorageService.uploadBytes(pngBytes, transitionKey, "image/png");

                log.info("Generated transition: {}", transitionKey);
            }

            log.info("Successfully generated all 8 transitions for {}", storageKeyPrefix);

        } catch (IOException e) {
            log.error("Failed to generate transitions for {}: {}", storageKeyPrefix, e.getMessage(), e);
        }
    }

    /**
     * Generate a single transition image for the given direction.
     */
    private BufferedImage generateTransition(BufferedImage source, Direction direction, int width, int height) {
        BufferedImage result = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);

        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int sourceRgb = source.getRGB(x, y);
                int alpha = calculateAlpha(direction, x, y, width, height);

                // Extract RGB and apply new alpha
                int rgb = sourceRgb & 0x00FFFFFF;
                int newPixel = (alpha << 24) | rgb;

                result.setRGB(x, y, newPixel);
            }
        }

        return result;
    }

    /**
     * Calculate the alpha value for a pixel based on the transition direction.
     * Returns 0-255 alpha value.
     */
    private int calculateAlpha(Direction direction, int x, int y, int width, int height) {
        return switch (direction) {
            case N -> calculateNorthAlpha(y, height);
            case S -> calculateSouthAlpha(y, height);
            case E -> calculateEastAlpha(x, width);
            case W -> calculateWestAlpha(x, width);
            case NE -> calculateCornerAlpha(width - 1 - x, y);
            case NW -> calculateCornerAlpha(x, y);
            case SE -> calculateCornerAlpha(width - 1 - x, height - 1 - y);
            case SW -> calculateCornerAlpha(x, height - 1 - y);
        };
    }

    /**
     * North transition: solid at top, fade down, transparent at bottom.
     */
    private int calculateNorthAlpha(int y, int height) {
        if (y < SOLID_PIXELS) {
            // Solid zone (top 32px)
            return 255;
        } else if (y < SOLID_PIXELS + FADE_PIXELS) {
            // Fade zone (next 32px)
            int fadeProgress = y - SOLID_PIXELS;
            return 255 - (fadeProgress * 255 / FADE_PIXELS);
        } else {
            // Transparent zone
            return 0;
        }
    }

    /**
     * South transition: solid at bottom, fade up, transparent at top.
     */
    private int calculateSouthAlpha(int y, int height) {
        int distFromBottom = height - 1 - y;
        if (distFromBottom < SOLID_PIXELS) {
            return 255;
        } else if (distFromBottom < SOLID_PIXELS + FADE_PIXELS) {
            int fadeProgress = distFromBottom - SOLID_PIXELS;
            return 255 - (fadeProgress * 255 / FADE_PIXELS);
        } else {
            return 0;
        }
    }

    /**
     * East transition: solid at right, fade left, transparent at left.
     */
    private int calculateEastAlpha(int x, int width) {
        int distFromRight = width - 1 - x;
        if (distFromRight < SOLID_PIXELS) {
            return 255;
        } else if (distFromRight < SOLID_PIXELS + FADE_PIXELS) {
            int fadeProgress = distFromRight - SOLID_PIXELS;
            return 255 - (fadeProgress * 255 / FADE_PIXELS);
        } else {
            return 0;
        }
    }

    /**
     * West transition: solid at left, fade right, transparent at right.
     */
    private int calculateWestAlpha(int x, int width) {
        if (x < SOLID_PIXELS) {
            return 255;
        } else if (x < SOLID_PIXELS + FADE_PIXELS) {
            int fadeProgress = x - SOLID_PIXELS;
            return 255 - (fadeProgress * 255 / FADE_PIXELS);
        } else {
            return 0;
        }
    }

    /**
     * Corner transition using diagonal distance from the corner.
     * cornerDistX and cornerDistY are distances from the respective corner.
     */
    private int calculateCornerAlpha(int cornerDistX, int cornerDistY) {
        // Use maximum of x and y distance for a square-ish corner
        // Alternatively, use diagonal distance for a circular fade

        // If both are within solid zone, it's solid
        if (cornerDistX < SOLID_PIXELS && cornerDistY < SOLID_PIXELS) {
            return 255;
        }

        // Calculate diagonal distance from the corner
        double distance = Math.sqrt(cornerDistX * cornerDistX + cornerDistY * cornerDistY);

        if (distance < SOLID_PIXELS) {
            return 255;
        } else if (distance < SOLID_PIXELS + FADE_PIXELS) {
            double fadeProgress = distance - SOLID_PIXELS;
            return (int) (255 - (fadeProgress * 255 / FADE_PIXELS));
        } else {
            return 0;
        }
    }

    /**
     * Convert a BufferedImage to PNG bytes.
     */
    private byte[] bufferedImageToPng(BufferedImage image) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, "PNG", baos);
        return baos.toByteArray();
    }
}
