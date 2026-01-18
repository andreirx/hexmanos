# Components Map

Reusable UI components.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `ui/` | Base UI primitives (Button, Card) |
| `layout/` | Layout components (Header) |

## ui/

| File | Components | Description |
|------|------------|-------------|
| `button.tsx` | `Button` | Variant-based button with cva |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Card container with sections |

### Button Variants

| Variant | Style |
|---------|-------|
| `default` | Zinc background |
| `destructive` | Red background |
| `outline` | Border only |
| `secondary` | Zinc-800 background |
| `ghost` | Transparent, hover effect |
| `link` | Underlined text |

### Button Sizes

| Size | Padding |
|------|---------|
| `default` | `h-9 px-4 py-2` |
| `sm` | `h-8 px-3` |
| `lg` | `h-10 px-8` |
| `icon` | `h-9 w-9` |

## layout/

| File | Component | Description |
|------|-----------|-------------|
| `Header.tsx` | `Header` | Admin header with navigation and logout |

### Header Features

- Logo link to home
- Navigation links: Pending Queue, All Assets
- User email display
- Logout button
