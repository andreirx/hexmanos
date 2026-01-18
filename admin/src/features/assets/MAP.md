# Assets Feature Map

Asset moderation and library management.

## Pages

| File | Route | Purpose |
|------|-------|---------|
| `AssetListPage.tsx` | `/assets` | View all assets with filters |
| `PendingAssetsPage.tsx` | `/assets/pending` | FIFO queue of pending assets |

## Components

| File | Purpose |
|------|---------|
| `AssetCard.tsx` | Display asset with moderation actions |
| `AssetFilters.tsx` | Status and type filter controls |
| `AssetDetailModal.tsx` | Full-screen modal showing all frames/variations |
| `MapThumbnail.tsx` | Canvas-based map preview for asset cards |

## Page Details

### AssetListPage

Full asset library with filtering capabilities.

- Filter by status (All, Pending, Approved, Rejected, Archived)
- Filter by type (All, Character, Tile, Map)
- Grid display of AssetCard components
- Updates list after moderation actions

### PendingAssetsPage

FIFO queue for reviewing new asset submissions.

- Shows only PENDING assets
- Sorted by creation date (oldest first)
- Each approval/rejection removes from queue
- Empty state when queue is clear

## Component Details

### AssetCard

Displays asset with preview and moderation controls.

| Section | Content |
|---------|---------|
| Header | Asset type badge, name, creation date |
| Preview | Sprite/tile image from storage |
| Author | Author ID display |
| Status | Colored status badge |
| Actions | Approve (green), Reject (red) buttons |

### Status Colors

| Status | Badge Color |
|--------|-------------|
| PENDING | Yellow |
| APPROVED | Green |
| REJECTED | Red |
| ARCHIVED | Gray |

### AssetFilters

Filter controls for AssetListPage.

| Filter | Options |
|--------|---------|
| Status | All, PENDING, APPROVED, REJECTED, ARCHIVED |
| Type | All, CHARACTER, TILE, MAP |

### AssetDetailModal

Full-screen modal for inspecting all asset content.

| Asset Type | Display |
|------------|---------|
| CHARACTER | All animation states with frames, playback controls |
| TILE | All variations with path direction labels |
| MAP | Full map preview rendered on canvas |

Opens when clicking asset thumbnail in card.

### MapThumbnail

Canvas-based map preview for AssetCard.

- Loads map.json and tile images
- Renders terrain and path layers
- Uses 8px tiles for small preview
- Shows loading state with pulsing icon

## Moderation Workflow

```
User submits asset
        ↓
PENDING (appears in queue)
        ↓
Admin reviews preview
        ↓
    ┌───┴───┐
Approve   Reject
    ↓       ↓
APPROVED  REJECTED
    ↓
(Later) Archive → ARCHIVED
```
