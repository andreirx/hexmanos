package com.hexmanos.engine.core.mipmap;

import com.hexmanos.engine.core.files.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * Generates mipmap variants (smaller resolution versions) of PNG images.
 * Used for better rendering quality at different zoom levels.
 *
 * For each source PNG (128x128), generates:
 * - {filename}-mip64.png (64x64)
 * - {filename}-mip32.png (32x32)
 *
 * Uses high-quality bicubic interpolation for smooth downscaling.
 */
@Slf4j
@RequiredArgsConstructor
public class MipmapGeneratorService {

    private final FileStorageService fileStorageService;

    /**
     * Mipmap size variants to generate.
     */
    public enum MipmapSize {
        MIP64(64, "-mip64"),
        MIP32(32, "-mip32");

        private final int size;
        private final String suffix;

        MipmapSize(int size, String suffix) {
            this.size = size;
            this.suffix = suffix;
        }

        public int getSize() {
            return size;
        }

        /**
         * Generate the output filename for a given base file.
         * E.g., for "tile_0.png" and MIP64, returns "tile_0-mip64.png"
         */
        public String getFileName(String baseFileName) {
            // Extract the base name without extension (e.g., "tile_0" from "tile_0.png")
            String baseName = baseFileName.replace(".png", "");
            return baseName + suffix + ".png";
        }
    }

    /**
     * Check if mipmaps already exist for a given file.
     * Checks only for the 64px mipmap as they are always generated together.
     *
     * @param storageKeyPrefix The storage prefix (e.g., "tiles/uuid")
     * @param fileName The source file name (e.g., "tile_0.png")
     * @return true if mipmaps exist for the file
     */
    public boolean hasMipmaps(String storageKeyPrefix, String fileName) {
        String mipmapKey = storageKeyPrefix + "/" + MipmapSize.MIP64.getFileName(fileName);
        return fileStorageService.fileExists(mipmapKey);
    }

    /**
     * Delete all mipmap files for a given source file.
     * Used to force regeneration when the source image changes.
     *
     * @param storageKeyPrefix The storage prefix (e.g., "tiles/uuid")
     * @param fileName The source file name (e.g., "tile_0.png")
     */
    public void deleteMipmaps(String storageKeyPrefix, String fileName) {
        String baseName = fileName.replace(".png", "");
        try {
            for (MipmapSize size : MipmapSize.values()) {
                String mipmapKey = storageKeyPrefix + "/" + size.getFileName(fileName);
                if (fileStorageService.fileExists(mipmapKey)) {
                    fileStorageService.deleteFile(mipmapKey);
                }
            }
            log.debug("Deleted mipmaps for {}/{}", storageKeyPrefix, fileName);
        } catch (Exception e) {
            log.error("Failed to delete mipmaps for {}/{}: {}", storageKeyPrefix, fileName, e.getMessage());
        }
    }

    /**
     * Generate mipmaps for a single PNG file.
     *
     * @param storageKeyPrefix The storage prefix (e.g., "tiles/uuid")
     * @param fileName The source file name (e.g., "tile_0.png")
     */
    public void generateMipmaps(String storageKeyPrefix, String fileName) {
        log.debug("Generating mipmaps for {}/{}", storageKeyPrefix, fileName);

        try {
            // Load the source image
            String sourceKey = storageKeyPrefix + "/" + fileName;
            InputStream inputStream = fileStorageService.loadFileAsInputStream(sourceKey);
            if (inputStream == null) {
                log.warn("Source file not found: {}", sourceKey);
                return;
            }

            BufferedImage sourceImage = ImageIO.read(inputStream);
            inputStream.close();

            if (sourceImage == null) {
                log.error("Failed to read source image: {}", sourceKey);
                return;
            }

            // Generate each mipmap size
            for (MipmapSize size : MipmapSize.values()) {
                BufferedImage scaledImage = scaleImage(sourceImage, size.getSize());
                String mipmapKey = storageKeyPrefix + "/" + size.getFileName(fileName);

                byte[] pngBytes = bufferedImageToPng(scaledImage);
                fileStorageService.uploadBytes(pngBytes, mipmapKey, "image/png");

                log.debug("Generated mipmap: {}", mipmapKey);
            }

        } catch (IOException e) {
            log.error("Failed to generate mipmaps for {}/{}: {}", storageKeyPrefix, fileName, e.getMessage());
        }
    }

    /**
     * Generate mipmaps for all PNG files in a storage prefix.
     * Skips files that already have mipmaps and generated files (transitions, existing mipmaps).
     *
     * @param storageKeyPrefix The storage prefix (e.g., "tiles/uuid")
     * @param fileNames List of file names to process
     * @return Number of files for which mipmaps were generated
     */
    public int generateMipmapsForFiles(String storageKeyPrefix, List<String> fileNames) {
        int generated = 0;

        for (String fileName : fileNames) {
            // Skip non-PNG files
            if (!fileName.endsWith(".png")) {
                continue;
            }

            // Skip files that are already mipmaps
            if (fileName.contains("-mip")) {
                continue;
            }

            // NOTE: Transition files (_transition_) DO need mipmaps because the game
            // loads textures at the current mip level. Without mipmaps, transitions
            // won't render at non-full zoom levels.

            // Skip if mipmaps already exist
            if (hasMipmaps(storageKeyPrefix, fileName)) {
                continue;
            }

            try {
                generateMipmaps(storageKeyPrefix, fileName);
                generated++;
            } catch (Exception e) {
                log.error("Failed to generate mipmaps for {}/{}: {}", storageKeyPrefix, fileName, e.getMessage());
            }
        }

        return generated;
    }

    /**
     * Delete all mipmaps for all PNG files in a storage prefix.
     * Used when an asset is updated to force regeneration.
     *
     * @param storageKeyPrefix The storage prefix (e.g., "tiles/uuid")
     */
    public void deleteAllMipmaps(String storageKeyPrefix) {
        try {
            // Delete all files matching the mipmap patterns
            for (MipmapSize size : MipmapSize.values()) {
                fileStorageService.deleteFilesWithPrefix(storageKeyPrefix, size.suffix + ".png");
            }
            log.info("Deleted all mipmaps for {} - will be regenerated", storageKeyPrefix);
        } catch (Exception e) {
            log.error("Failed to delete mipmaps for {}: {}", storageKeyPrefix, e.getMessage());
        }
    }

    /**
     * Scale an image to the target size using high-quality bicubic interpolation.
     */
    private BufferedImage scaleImage(BufferedImage source, int targetSize) {
        BufferedImage scaled = new BufferedImage(targetSize, targetSize, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = scaled.createGraphics();

        // Use high-quality rendering hints for smooth downscaling
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        g2d.drawImage(source, 0, 0, targetSize, targetSize, null);
        g2d.dispose();

        return scaled;
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
