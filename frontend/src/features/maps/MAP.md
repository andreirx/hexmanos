# Maps Feature Map

Map editor for composing game levels with terrain, paths, and characters.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `pages/` | Directory | Route components |
| `components/` | Directory | Map-specific components |
| `index.ts` | File | Public exports |

## pages/

| File | Route | Purpose |
|------|-------|---------|
| `MapEditorPage.tsx` | `/editor/map` | Main map editor |

### MapEditorPage.tsx

Full-featured map editor.

**Layout:**
- Left sidebar: Tools, layers, map size controls
- Center: Map canvas with grid
- Right sidebar: Tile/Character palettes, map properties

**State Management:**
- `mapData`: 2D array of terrain tile IDs
- `pathData`: 2D array of path tile IDs
- `characterData`: Array of placed characters
- `currentTool`: Active editing tool
- `activeLayer`: Current editing layer

**Tools:**
- `select` - Select cells for inspection
- `paint` - Paint with selected tile/character
- `erase` - Remove tiles/characters
- `rect` - Fill rectangle shape
- `disc` - Fill ellipse/disc shape
- `pan` - Pan the view

**Features:**
- Variable map sizes (4-128 cells)
- Three editing layers
- Auto-transitions between terrain types
- Zoom/pan with mouse wheel and right-click
- Save/load maps to backend

## components/

| File | Purpose |
|------|---------|
| `MapCanvas.tsx` | Main map rendering canvas |
| `MapGallery.tsx` | Map browser and loader |
| `MapPreview.tsx` | Thumbnail preview of map for galleries |
| `TilePalette.tsx` | Tile selection palette |
| `CharacterPalette.tsx` | Character selection palette |

### MapCanvas.tsx

HTML5 Canvas for map rendering and editing.

**Props:**
- `mapData`, `pathData`, `characterData`: Map state
- `width`, `height`: Map dimensions in cells
- `tileSize`: Pixel size of each cell
- `tool`: Current editing tool
- `onCellClick`, `onCellDrag`: Edit callbacks
- `zoom`, `panOffset`: View state

**Features:**
- Memoized terrain rendering with dirty flag
- Bresenham line algorithm for smooth path drawing
- Shape tools for rectangle/disc fills
- Mouse wheel zoom centered on cursor
- Right-click panning
- Grid overlay toggle

### MapGallery.tsx

Asset browser for loading maps.

**Features:**
- Lists all MAP type assets
- Shows map preview thumbnail via MapPreview
- Shows map name and size overlay
- Edit own maps, copy others
- Status badge display

### MapPreview.tsx

Canvas-based thumbnail preview of a map.

**Features:**
- Loads map.json from storage
- Fetches tile images for terrain/paths
- Renders at 8px per tile for compact display
- Shows loading state while fetching
- Falls back to icon on error

### TilePalette.tsx

Tile selection for terrain/path layers.

**Features:**
- Filters tiles by type (TILE or PATH)
- Shows thumbnail and variation count
- Auto-selects first tile on load
- Clear selection button

### CharacterPalette.tsx

Character selection for character layer.

**Features:**
- Lists all CHARACTER type assets
- Shows idle frame as thumbnail
- Auto-selects first character on load
- Clear selection button

## Layers

### Terrain Layer
- Base terrain tiles (grass, water, stone)
- Rendered first (bottom layer)
- Auto-transitions blend adjacent types

### Paths Layer
- Path overlays with connectivity
- Rendered above terrain
- Auto-selects correct directional variation

### Characters Layer
- Character placements
- Rendered on top
- Stores position and character asset ID

## Data Format

**definition.json:**
```json
{
  "name": "dungeon-01",
  "width": 16,
  "height": 16,
  "tileSize": 128,
  "terrain": [[...]], // 2D array of tile asset IDs
  "paths": [[...]],   // 2D array of path asset IDs
  "characters": [
    { "x": 5, "y": 3, "assetId": "hero-uuid" }
  ]
}
```

## Auto-Transitions

When a terrain tile is placed, the system:
1. Checks all adjacent cells
2. Generates transition tiles blending between types
3. Updates transition layer automatically

Requires `Auto-Transitions` toggle enabled in toolbar.
