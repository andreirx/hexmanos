export type AssetType = "CHARACTER" | "TILE" | "MAP" | "OBJECT"
export type AssetStatus = "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED"

export interface AssetDTO {
  id: string
  type: AssetType
  name: string
  authorId: string
  status: AssetStatus
  storageKeyPrefix: string
  createdAt: string
}

export interface CreateAssetRequest {
  type: AssetType
  name: string
  authorId: string
  storageKeyPrefix: string
}

export interface UploadResponse {
  url: string
  storageKey: string
}

export interface PresignedUrlRequest {
  assetType: "characters" | "tiles" | "maps" | "objects"
  assetId: string
  fileName: string
  contentType: string
}

export interface PresignedUrlResponse {
  uploadUrl: string
  storageKey: string
  httpMethod: string
  expiresInSeconds: number
}

// New register endpoint types
export interface RegisterAssetRequest {
  assetId: string
  type: AssetType
  name: string
  authorId: string
  files: string[]
}

export interface RegisterAssetResponse {
  success: boolean
  message: string
  asset: AssetDTO | null
  missingFiles: string[] | null
}

// User types
export interface UserDTO {
  id: string
  cognitoSub: string
  pool: "PLAYER" | "ADMIN"
  displayName: string
  email: string
  createdAt: string
  lastLoginAt: string
}

export interface SyncUserRequest {
  cognitoSub: string
  pool: string
  displayName: string
  email?: string
}

// Map validation types
export interface MapValidationRequest {
  name: string
  width: number
  height: number
  tileSize: number
  layers: {
    terrain: (MapValidationTile | null)[][]
    paths: (MapValidationPath | null)[][]
  }
  characters: MapValidationCharacter[]
}

export interface MapValidationTile {
  tileAssetId: string
  seed: number
}

export interface MapValidationPath {
  pathAssetId: string
}

export interface MapValidationCharacter {
  characterAssetId: string
  x: number
  y: number
}

export interface MapValidationResponse {
  valid: boolean
  errors: string[]
  warnings: string[]
  stats: {
    terrainTileCount: number
    pathTileCount: number
    characterCount: number
    emptyCellCount: number
  }
}

// Game types
export type GameStatus = "WAITING" | "RUNNING" | "PAUSED" | "FINISHED"
export type PlayerRole = "HOST" | "PLAYER" | "OBSERVER"

export interface GameDTO {
  id: string
  name: string
  mapAssetId: string
  status: GameStatus
  joinCode: string
  createdAt: string
  lastActivityAt: string
  players: GamePlayerDTO[]
  characters: GameCharacterDTO[]
}

export interface GamePlayerDTO {
  id: string
  playerId: string
  role: PlayerRole
  controlledCharacterId?: string
  colorIndex: number  // 0-7 for 8 different player colors
  joinedAt: string
  lastSeenAt: string
}

// Character facing direction
export type CharacterFacing = "up" | "down" | "left" | "right"

// Character animation states
export type CharacterState =
  | "idle" | "idle_up" | "idle_down" | "idle_left" | "idle_right"  // Idle states
  | "walk_up" | "walk_down" | "walk_left" | "walk_right"            // Walk states
  | "attack_up" | "attack_down" | "attack_left" | "attack_right"    // Attack states

export interface GameCharacterDTO {
  id: string
  assetId: string
  name: string
  x: number
  y: number
  currentState: string      // Current animation state (idle, walk_down, attack_up, etc.)
  visualState: string       // Health visual state (full, hurt_1, hurt_2, critical)
  facing: CharacterFacing   // Direction character is facing
  health: number
  maxHealth: number
  controlled: boolean
  controlledByPlayerId?: string  // The player ID controlling this character (for color lookup)
}

export interface CreateGameRequest {
  mapAssetId: string
  name: string
  password?: string
}

export interface JoinGameRequest {
  code: string
  password?: string
}

// Attack types
export type AttackType = "MELEE" | "RANGED"

export interface AttackDefinition {
  id: string
  name: string
  type: AttackType
  range: number
  damage: number
  cooldownMs: number
  projectileAssetId?: string  // Only for RANGED attacks
  projectileSpeed?: number    // Only for RANGED attacks (tiles per second)
}

// WebSocket event types for attacks and projectiles
export interface AttackStartEvent {
  characterId: string
  attackId: string
  targetX: number
  targetY: number
  direction: string
  state: string
  animationDuration: number
}

export interface ProjectileSpawnEvent {
  projectileId: string
  projectileAssetId: string
  sourceCharacterId: string
  startX: number
  startY: number
  targetX: number
  targetY: number
  speed: number  // tiles per second
}

export interface ProjectileUpdateEvent {
  projectileId: string
  x: number          // Current tile X (rounded)
  y: number          // Current tile Y (rounded)
  preciseX: number   // Floating point for smooth animation
  preciseY: number
}

export interface ProjectileHitEvent {
  projectileId: string
  x: number
  y: number
  hitCharacterId?: string  // null if hit terrain
  damage: number
}

export interface DamageEvent {
  characterId: string
  damage: number
  newHealth: number
  newVisualState: string
  sourceCharacterId?: string
  attackId?: string
}

export interface CharacterDeathEvent {
  characterId: string
  killedByCharacterId?: string
}
