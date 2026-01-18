export type AssetType = "CHARACTER" | "TILE" | "MAP"
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
  assetType: "characters" | "tiles" | "maps"
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
