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

export interface GameCharacterDTO {
  id: string
  assetId: string
  name: string
  x: number
  y: number
  currentState: string
  visualState: string
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
