# Editor Feature Map

Character sprite editor with animation state support.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `pages/` | Directory | Route components |
| `components/` | Directory | Editor-specific components |
| `index.ts` | File | Public exports |

## pages/

| File | Route | Purpose |
|------|-------|---------|
| `EditorPage.tsx` | `/editor/character` | Main character editor |

### EditorPage.tsx

Full-featured character sprite editor.

**Layout:**
- Left sidebar: Tools, colors, brush sizes
- Center: 128x128 pixel canvas
- Right sidebar: Character gallery, animation states, frame timeline

**State Management:**
- `frames`: All animation frames per state
- `currentState`: Active animation state
- `currentFrame`: Active frame index
- `undoStack`/`redoStack`: Per-frame history

**Features:**
- Create new characters or load existing
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
- `pencil`: Draw pixels
- `eraser`: Clear pixels (transparent)
- `select`: Rectangle selection (future)

**Features:**
- `image-rendering: pixelated` for crisp pixels
- Mouse wheel zoom centered on cursor
- Right-click pan
- Auto-calculated initial zoom to fit canvas
- Preserves zoom/pan when switching frames

### CharacterGallery.tsx

Asset browser for loading characters.

**Features:**
- Lists all CHARACTER type assets
- Shows thumbnail (idle_0.png)
- Click to load into editor
- Search/filter (future)

## Animation States

7 predefined states:
1. `idle` - Standing still
2. `walk_down` - Walking downward
3. `walk_up` - Walking upward
4. `walk_left` - Walking left
5. `walk_right` - Walking right
6. `action_build` - Building action
7. `action_attack` - Attack action

Each state supports 1-8 frames.

## Data Format

**definition.json:**
```json
{
  "name": "Hero",
  "frameSize": 128,
  "states": {
    "idle": { "frames": 4, "loop": true },
    "walk_down": { "frames": 4, "loop": true }
  }
}
```

**File Structure:**
```
characters/{assetId}/
├── definition.json
├── idle_0.png
├── idle_1.png
├── walk_down_0.png
└── ...
```
