# Editor Feature Map

Character and Object sprite editor with visual states and animation support.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `pages/` | Directory | Route components |
| `components/` | Directory | Editor-specific components |
| `index.ts` | File | Public exports |

## pages/

| File | Route | Purpose |
|------|-------|---------|
| `EditorPage.tsx` | `/editor/character` | Main character/object editor |

### EditorPage.tsx

Full-featured sprite editor for characters and objects.

**Entity Types:**
- **CHARACTER**: Animated entities with 7 animation states (idle, walk, action)
- **OBJECT**: Static/simple entities with only idle animation

**Visual States:**
- Characters: `full`, `hurt_1`, `hurt_2`, `critical` (HP-based)
- Objects: `new`, `worn`, `damaged`, `broken` (degradation)
- Each visual state has its own complete sprite set

**Layout:**
- Left sidebar: Tools, colors, brush sizes
- Center: 128x128 pixel canvas
- Right sidebar: Entity gallery, visual states, animation states, frame timeline

**State Management:**
- `entityType`: CHARACTER or OBJECT
- `currentVisualState`: Active visual state (e.g., "full", "new")
- `frames`: All animation frames per visual state per animation state
- `currentAnimState`: Active animation state
- `currentFrame`: Active frame index
- `undoStack`/`redoStack`: Per-frame history

**Features:**
- Create new characters/objects or load existing
- Visual state tabs for switching between health/degradation states
- Copy from another visual state when switching to empty state
- Convert Character ↔ Object (with frame preservation warnings)
- Save to backend with presigned URL upload
- Animation preview with play/pause
- Undo/redo (10 levels per frame)

## components/

| File | Purpose |
|------|---------|
| `PixelCanvas.tsx` | HTML5 Canvas drawing component |
| `CharacterGallery.tsx` | Asset browser and loader |

### PixelCanvas.tsx

128x128 pixel drawing canvas.

**Props:**
- `width`, `height`: Canvas dimensions
- `pixels`: 2D array of color values
- `onPixelChange`: Callback for edits
- `tool`: Current drawing tool
- `color`: Current brush color
- `brushSize`: 1, 2, 4, 8, or 16

**Tools:**
- `pencil`: Draw pixels with current brush size
- `eraser`: Clear pixels (transparent) with current brush size
- `line`: Click-drag to draw straight lines (preview shown while dragging)
- `select`: Rectangle selection with move/resize handles

**Features:**
- `image-rendering: pixelated` for crisp pixels
- Mouse wheel zoom centered on cursor
- Right-click / middle-click / Alt+click pan
- Auto-calculated initial zoom to fit canvas
- Preserves zoom/pan when switching frames

**Tool Previews (CRITICAL - DO NOT REMOVE):**
- **Pencil/Eraser hover**: Shows all pixels that will be affected by the brush
  - Blue fill+outline for pencil, red fill+outline for eraser
  - Works with all brush sizes (1, 2, 4, 8, 16)
  - Preview disappears while actively drawing
- **Line tool**: Shows ALL pixels that will be drawn (using Bresenham algorithm)
  - Each pixel shown with blue fill and outline
  - Respects brush size (shows thick line preview for larger brushes)
  - Preview updates in real-time as you drag

**Brush Sizes:**
- 1, 2, 4, 8, or 16 pixels
- Applies to pencil, eraser, and line tools
- Bresenham line algorithm used for smooth drawing when dragging

### CharacterGallery.tsx

Asset browser for loading characters and objects.

**Features:**
- Lists both CHARACTER and OBJECT type assets
- Filter tabs: All / Characters / Objects
- Shows thumbnail from first visual state (e.g., `full_idle_0.png`)
- Click to load into editor
- Distinguishes between own assets (edit) and others (copy)

## Animation States

### Character States (7)
1. `idle` - Standing still (required)
2. `walk_down` - Walking downward
3. `walk_up` - Walking upward
4. `walk_left` - Walking left
5. `walk_right` - Walking right
6. `action_build` - Building action
7. `action_attack` - Attack action

### Object States (1)
1. `idle` - Static appearance (required)

Each state supports 1-8 frames.

## Data Format

**definition.json (Character with visual states):**
```json
{
  "name": "Knight",
  "spriteSize": 128,
  "entityType": "CHARACTER",
  "visualStates": ["full", "hurt_1", "hurt_2", "critical"],
  "states": {
    "idle": { "frames": 4, "loop": true },
    "walk_down": { "frames": 6, "loop": true }
  }
}
```

**definition.json (Object with visual states):**
```json
{
  "name": "Barrel",
  "spriteSize": 128,
  "entityType": "OBJECT",
  "visualStates": ["new", "worn", "damaged", "broken"],
  "states": {
    "idle": { "frames": 1, "loop": true }
  }
}
```

**File Structure (new format with visual states):**
```
characters/{assetId}/
├── definition.json
├── full_idle_0.png
├── full_idle_1.png
├── full_walk_down_0.png
├── hurt_1_idle_0.png
├── critical_idle_0.png
└── ...

objects/{assetId}/
├── definition.json
├── new_idle_0.png
├── worn_idle_0.png
├── damaged_idle_0.png
└── broken_idle_0.png
```

**Legacy format (without visual states):**
```
characters/{assetId}/
├── definition.json
├── idle_0.png
├── idle_1.png
├── walk_down_0.png
└── ...
```

## Backward Compatibility

- Assets without `visualStates` field are treated as having `["default"]`
- Legacy files (`idle_0.png`) work alongside new format (`full_idle_0.png`)
- When loading legacy assets, editor auto-detects format
