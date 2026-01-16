export type AssetType = "CHARACTER" | "TILE" | "MAP"
export type AssetStatus = "PENDING" | "APPROVED" | "ARCHIVED"

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
