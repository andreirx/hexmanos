# Maps Feature Map

Map editor for composing game levels with terrain, paths, characters, and objects.

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
- Right sidebar: Tile/Character/Object palettes, map properties

**State Management:**
- `mapData`: 2D array of terrain tile IDs
- `pathData`: 2D array of path tile IDs
- `characterData`: Array of placed characters/objects
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
| `TilePalette.tsx` | Tile selection palette (terrain/paths) |
| `CharacterPalette.tsx` | Character and Object selection palette |

### MapCanvas.tsx

HTML5 Canvas for map rendering and editing.

**Props:**
- `mapData`, `pathData`, `characterData`: Map state
- `width`, `height`: Map dimensions in cells
- `tileSize`: Pixel size of each cell
- `tool`: Current editing tool
- `onCellClick`, `onCellDrag`: Edit callbacks
- `zoom`, `panOffset`: View state

**Rendering Passes:**
1. **Terrain** - Base terrain tiles
2. **Transitions** - Stacking algorithm for tile blending
3. **Water Paths** - Rivers (WATER terrain type) drawn first
4. **Land Paths** - Walkways (LAND terrain type) drawn on top
5. **Characters/Objects** - Animated entities with visual states

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
- Lists all MAP type assets (APPROVED only)
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
- Shows only APPROVED assets
- Shows thumbnail and variation count
- Cyan dot indicator for WATER terrain tiles
- Auto-selects first tile on load
- Clear selection button

### CharacterPalette.tsx

Character and Object selection for entity layer.

**Features:**
- Tabs for Characters and Objects
- Lists only APPROVED assets
- Shows idle frame as thumbnail (with visual states support)
- Auto-selects first entity on load
- Clear selection button

## Layers

### Terrain Layer
- Base terrain tiles (grass, water, stone)
- Rendered first (bottom layer)
- Auto-transitions blend adjacent types

### Paths Layer
- Path overlays with connectivity
- Rendered above terrain in two passes:
  - **Water paths (rivers)** - Not passable, drawn first
  - **Land paths (walkways)** - Passable, drawn on top
- Auto-selects correct directional variation

### Characters Layer
- Character and Object placements
- Rendered on top
- Stores position and entity asset ID
- Animated in preview (idle animation)

## Data Format

**map.json:**
```json
{
  "name": "dungeon-01",
  "width": 16,
  "height": 16,
  "tileSize": 128,
  "layers": {
    "terrain": [[{"tileAssetId": "uuid", "seed": 123}, ...]],
    "paths": [[{"pathAssetId": "uuid"}, ...]]
  },
  "characters": [
    { "characterAssetId": "hero-uuid", "x": 5, "y": 3 }
  ]
}
```

## Auto-Transitions

When a terrain tile is placed, the system:
1. Checks all adjacent cells (8 directions)
2. Compares asset IDs - higher ID wins
3. Draws transition overlay from winning tile onto neighbor
4. Creates smooth blending between different terrain types

Requires `Show Transitions` toggle enabled in toolbar.

## Path Connectivity

Paths auto-connect using a 4-bit system:
- Bit 3 (8): Connection up
- Bit 2 (4): Connection down
- Bit 1 (2): Connection left
- Bit 0 (1): Connection right

The system checks adjacent cells for matching path asset IDs and selects the appropriate directional variation (0-14).
