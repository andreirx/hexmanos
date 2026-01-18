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
