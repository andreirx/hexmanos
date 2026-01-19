/**
 * Shared map rendering logic used by both MapCanvas (editor) and GamePage (game client).
 * This ensures the Map Editor and Game Client render maps identically.
 */

// ============================================
// Types
// ============================================

export interface MapTile {
  tileAssetId: string
  seed: number
}

export interface MapPath {
  pathAssetId: string
}

// ============================================
// Constants
// ============================================

/**
 * Direction offsets for checking neighboring tiles.
 * Used for transition calculations.
 */
export const DIRECTION_OFFSETS = {
  n:  { dx: 0,  dy: -1 },
  ne: { dx: 1,  dy: -1 },
  e:  { dx: 1,  dy: 0 },
  se: { dx: 1,  dy: 1 },
  s:  { dx: 0,  dy: 1 },
  sw: { dx: -1, dy: 1 },
  w:  { dx: -1, dy: 0 },
  nw: { dx: -1, dy: -1 }
} as const

export type TransitionDirection = keyof typeof DIRECTION_OFFSETS

/**
 * All transition directions in order.
 */
export const ALL_DIRECTIONS: TransitionDirection[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"]

// ============================================
// Seeded Random Helpers
// ============================================

/**
 * Generate a pseudo-random number from a seed (0-1 range).
 * Used for deterministic tile variation selection.
 */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

/**
 * Get the tile variation index from a seed and variation count.
 * @param seed The tile's seed value
 * @param variations Total number of variations available
 * @returns The variation index (0 to variations-1)
 */
export function getVariationFromSeed(seed: number, variations: number): number {
  return Math.floor(seededRandom(seed) * variations)
}

// ============================================
// Transition Logic
// ============================================

/**
 * Get the list of directions where THIS tile should project its transition
 * onto neighboring cells.
 *
 * The Stacking Algorithm:
 * - If neighbor is void (empty): always project transition
 * - If neighbor is different: dominant tile (higher assetId) projects onto the other
 *
 * @param x Current tile X position
 * @param y Current tile Y position
 * @param width Map width in tiles
 * @param height Map height in tiles
 * @param terrainLayer The 2D terrain layer array
 * @returns Array of directions where transitions should be drawn
 */
export function getTransitionDirections(
  x: number,
  y: number,
  width: number,
  height: number,
  terrainLayer: (MapTile | null)[][]
): TransitionDirection[] {
  const tile = terrainLayer[y]?.[x]
  if (!tile) return []

  const directions: TransitionDirection[] = []

  for (const dir of ALL_DIRECTIONS) {
    const offset = DIRECTION_OFFSETS[dir]
    const nx = x + offset.dx
    const ny = y + offset.dy

    // Skip if neighbor is out of bounds
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue

    const neighbor = terrainLayer[ny]?.[nx]

    // Determine if we should draw transition
    let shouldDraw = false

    if (!neighbor) {
      // Condition 1: Neighbor is void - always draw transition
      shouldDraw = true
    } else if (neighbor.tileAssetId !== tile.tileAssetId) {
      // Condition 2: Different tile - dominant tile (higher assetId) wins
      shouldDraw = tile.tileAssetId > neighbor.tileAssetId
    }

    if (shouldDraw) {
      directions.push(dir)
    }
  }

  return directions
}

/**
 * Get the neighbor position for a given direction.
 * Useful when you need to know WHERE to draw the transition.
 *
 * @param x Current tile X position
 * @param y Current tile Y position
 * @param direction The direction to get neighbor for
 * @returns The neighbor coordinates {nx, ny}
 */
export function getNeighborPosition(
  x: number,
  y: number,
  direction: TransitionDirection
): { nx: number; ny: number } {
  const offset = DIRECTION_OFFSETS[direction]
  return {
    nx: x + offset.dx,
    ny: y + offset.dy
  }
}

// ============================================
// Path Logic
// ============================================

/**
 * Calculate the path variation based on connectivity to neighboring path tiles.
 *
 * Bitmask encoding:
 * - UP (North) = 8
 * - DOWN (South) = 4
 * - LEFT (West) = 2
 * - RIGHT (East) = 1
 *
 * The final variation is: bits === 0 ? 0 : bits - 1
 * This gives variations 0-14 (15 total) for all connectivity combinations.
 *
 * @param x Current path X position
 * @param y Current path Y position
 * @param width Map width in tiles
 * @param height Map height in tiles
 * @param pathLayer The 2D path layer array
 * @param currentPathAssetId The asset ID of the current path tile
 * @returns The variation index (0-14) to use for this path tile
 */
export function calculatePathVariation(
  x: number,
  y: number,
  width: number,
  height: number,
  pathLayer: (MapPath | null)[][],
  currentPathAssetId: string
): number {
  let bits = 0

  // Check UP (North) - adds 8
  if (y > 0 && pathLayer[y - 1]?.[x]?.pathAssetId === currentPathAssetId) {
    bits |= 8
  }

  // Check DOWN (South) - adds 4
  if (y < height - 1 && pathLayer[y + 1]?.[x]?.pathAssetId === currentPathAssetId) {
    bits |= 4
  }

  // Check LEFT (West) - adds 2
  if (x > 0 && pathLayer[y]?.[x - 1]?.pathAssetId === currentPathAssetId) {
    bits |= 2
  }

  // Check RIGHT (East) - adds 1
  if (x < width - 1 && pathLayer[y]?.[x + 1]?.pathAssetId === currentPathAssetId) {
    bits |= 1
  }

  // Convert bitmask to variation index
  // 0 means isolated (no connections) -> variation 0
  // 1-15 means connected -> variation (bits - 1) = 0-14
  return bits === 0 ? 0 : bits - 1
}

// ============================================
// Movement Helpers
// ============================================

/**
 * Get the neighboring tile position for movement.
 * Only supports cardinal directions (n, s, e, w).
 *
 * @param x Current X position
 * @param y Current Y position
 * @param direction Movement direction
 * @returns New position or null if direction is diagonal
 */
export function getMoveTarget(
  x: number,
  y: number,
  direction: "n" | "s" | "e" | "w"
): { x: number; y: number } {
  const offset = DIRECTION_OFFSETS[direction]
  return {
    x: x + offset.dx,
    y: y + offset.dy
  }
}

/**
 * Check if a position is within map bounds.
 */
export function isInBounds(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return x >= 0 && x < width && y >= 0 && y < height
}
