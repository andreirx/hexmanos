# Tiles Feature Map

Tile editor for creating terrain and path tiles with land/water terrain types.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `pages/` | Directory | Route components |
| `components/` | Directory | Tile-specific components |
| `index.ts` | File | Public exports |

## pages/

| File | Route | Purpose |
|------|-------|---------|
| `TileEditorPage.tsx` | `/editor/tile` | Main tile editor |

### TileEditorPage.tsx

Tile creation and editing interface.

**Layout:**
- Left sidebar: Tools, colors, brush sizes, fill options, path drawing
- Center: Pixel canvas for tile editing
- Right sidebar: Tile gallery, properties (name, type, terrain, passable)

**State Management:**
- `variations`: Array of tile variation data
- `currentVariation`: Active variation index
- `tileType`: TILE or PATH
- `terrainType`: LAND or WATER
- `passable`: Whether entities can walk through

**Features:**
- Create terrain (TILE) or path (PATH) tiles
- Set terrain type (LAND or WATER)
- Multiple variations per tile type
- Passability toggle for game logic (auto-set for paths)
- Bulk operations for PATH tiles (fill all backgrounds, generate all paths)
- Save with presigned URL upload

## components/

| File | Purpose |
|------|---------|
| `TileGallery.tsx` | Tile browser and loader |

### TileGallery.tsx

Asset browser for loading tiles.

**Features:**
- Lists all TILE type assets (APPROVED only)
- Filters by tileType property (TILE/PATH)
- Shows first variation as thumbnail
- Click to load into editor

## Tile Types

### TILE (Terrain)
- Basic terrain tiles (grass, water, stone)
- Used on Terrain layer in map editor
- Auto-transitions generated between adjacent types
- Passability is user-configurable

### PATH
- Overlay paths for walkways and rivers
- 15 directional variations for connectivity
- Used on Paths layer in map editor
- Passability depends on terrain type:
  - **LAND paths**: Always passable (walkways, roads)
  - **WATER paths**: Never passable (rivers, streams)

## Terrain Types

### LAND
- Ground-based terrain (grass, dirt, stone)
- LAND paths are walkable (roads, bridges)

### WATER
- Water-based terrain (ocean, lake, pond)
- WATER paths are rivers (not walkable)
- Shown with cyan indicator in palettes

## Rendering Order

In the map editor, paths render in this order:
1. **Terrain layer** (base tiles)
2. **Water paths** (rivers) - drawn first
3. **Land paths** (walkways) - drawn on top

This allows land paths (bridges) to render over water paths (rivers).

## Data Format

**properties.json:**
```json
{
  "name": "Grass",
  "tileSize": 128,
  "passable": true,
  "variations": 4,
  "tileType": "TILE",
  "terrainType": "LAND"
}
```

**properties.json (River path):**
```json
{
  "name": "River",
  "tileSize": 128,
  "passable": false,
  "variations": 15,
  "tileType": "PATH",
  "terrainType": "WATER"
}
```

**File Structure:**
```
tiles/{assetId}/
├── properties.json
├── tile_0.png
├── tile_1.png
├── tile_2.png
└── tile_3.png
```

## Path Tile Variations

For PATH type tiles, 15 variations for connectivity:

| Index | Name | Directions |
|-------|------|------------|
| 0 | Isolated | None |
| 1 | N | North only |
| 2 | S | South only |
| 3 | E | East only |
| 4 | W | West only |
| 5 | NS | North + South |
| 6 | EW | East + West |
| 7 | NE | North + East |
| 8 | NW | North + West |
| 9 | SE | South + East |
| 10 | SW | South + West |
| 11 | NSE | North + South + East |
| 12 | NSW | North + South + West |
| 13 | NEW | North + East + West |
| 14 | SEW | South + East + West |
| 15 | NSEW | All four (crossroads) |
