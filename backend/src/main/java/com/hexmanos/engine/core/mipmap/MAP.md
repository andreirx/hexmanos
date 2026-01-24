# Mipmap Generator

Generates pre-scaled image variants for better rendering quality at different zoom levels.

## Files

| File | Purpose |
|------|---------|
| `MipmapGeneratorService.java` | Core mipmap generation logic with bicubic scaling |

## Mipmap Sizes

For each source PNG (128x128), generates:
- **`-mip64.png`** (64x64) - Used at zoom 0.3-0.6
- **`-mip32.png`** (32x32) - Used at zoom < 0.3

## MipmapGeneratorService

### Key Methods

| Method | Purpose |
|--------|---------|
| `hasMipmaps(prefix, fileName)` | Check if mipmaps exist for a file |
| `deleteMipmaps(prefix, fileName)` | Delete mipmaps for regeneration |
| `generateMipmaps(prefix, fileName)` | Generate mip64 and mip32 variants |
| `generateMipmapsForFiles(prefix, files)` | Batch generate for multiple files |
| `deleteAllMipmaps(prefix)` | Delete all mipmaps in a directory |

### Scaling Algorithm

Uses Java AWT with high-quality settings:
- `RenderingHints.VALUE_INTERPOLATION_BICUBIC`
- `RenderingHints.VALUE_RENDER_QUALITY`
- `RenderingHints.VALUE_ANTIALIAS_ON`

### File Filtering

Skips files that:
- Are not PNGs
- Already have `-mip` suffix (existing mipmaps)
- Contain `_transition_` (transition tiles don't need mipmaps)

## Integration

### Asset Registration (AssetService)
When a TILE or CHARACTER asset is updated, `deleteMipmaps()` is called to clear old mipmaps. The scheduler regenerates them.

### Background Scheduler (MipmapGeneratorScheduler)
Runs every 60 seconds to:
1. Iterate all TILE assets
2. Iterate all CHARACTER assets
3. Generate missing mipmaps for each PNG file

### Frontend (GamePage.tsx)
- Loads all mipmap variants during preload
- Tracks current mip level based on camera zoom
- Switches textures when zoom crosses thresholds (0.3, 0.6)
