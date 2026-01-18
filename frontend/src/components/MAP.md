# Components Map

Shared UI components used across the application.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `layout/` | App-wide layout components |
| `ui/` | Low-level UI primitives |

## layout/

App-wide layout components.

| File | Purpose |
|------|---------|
| `Header.tsx` | Top navigation bar with logo and auth links |
| `index.ts` | Public exports |

### Header.tsx
Navigation component with:
- Logo link to home
- Editor links (Character, Tile, Map)
- Auth status (Sign In/Sign Up or user info)

## ui/

Low-level UI primitives built on Radix UI.

| File | Purpose |
|------|---------|
| `button.tsx` | Button component with variants |
| `card.tsx` | Card container with header/content slots |

### button.tsx
Button with variants:
- `default` - Primary blue button
- `destructive` - Red danger button
- `outline` - Bordered button
- `ghost` - Transparent button
- `link` - Link-styled button

Sizes: `default`, `sm`, `lg`, `icon`

### card.tsx
Card components:
- `Card` - Container with border and shadow
- `CardHeader` - Top section
- `CardTitle` - Heading text
- `CardDescription` - Subheading text
- `CardContent` - Main content area
- `CardFooter` - Bottom section

## Styling

All components use:
- Tailwind 4 utility classes
- Dark theme (zinc color palette)
- `class-variance-authority` for variants
- `tailwind-merge` for class combining
