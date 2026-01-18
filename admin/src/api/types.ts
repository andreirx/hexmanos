export type AssetType = "CHARACTER" | "TILE" | "MAP"
export type AssetStatus = "PENDING" | "APPROVED" | "ARCHIVED"

export interface AssetDTO {
  id: string
  type: AssetType
  name: string
  authorId: string
  authorName?: string
  authorEmail?: string
  status: AssetStatus
  storageKeyPrefix: string
  createdAt: string
  moderationNotes?: string
}

export interface ModerationRequest {
  notes?: string
}
