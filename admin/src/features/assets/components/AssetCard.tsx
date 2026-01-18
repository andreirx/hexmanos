import { useState, useEffect } from "react"
import { Check, X, Archive, User, Mail, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MapThumbnail } from "./MapThumbnail"
import { approveAsset, rejectAsset, archiveAsset, getAssetFileUrl, getAssetFile } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

interface EntityDefinition {
  visualStates?: string[]
}

interface AssetCardProps {
  asset: AssetDTO
  onUpdated: (asset: AssetDTO) => void
  onRemoved: () => void
  onViewDetails?: () => void
}

export function AssetCard({ asset, onUpdated, onRemoved, onViewDetails }: AssetCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState("")
  const [thumbnailUrl, setThumbnailUrl] = useState<string>("")

  // Load thumbnail URL based on asset type and visual states
  useEffect(() => {
    async function loadThumbnail() {
      if (asset.type === "CHARACTER" || asset.type === "OBJECT") {
        try {
          // Try to load definition to get visual states
          const definition = await getAssetFile<EntityDefinition>(
            asset.storageKeyPrefix,
            "definition.json"
          )
          if (definition.visualStates && definition.visualStates.length > 0) {
            // New format with visual states
            const firstVs = definition.visualStates[0]
            setThumbnailUrl(getAssetFileUrl(asset.storageKeyPrefix, `${firstVs}_idle_0.png`, true))
          } else {
            // Legacy format
            setThumbnailUrl(getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png", true))
          }
        } catch {
          // Fallback to legacy format
          setThumbnailUrl(getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png", true))
        }
      } else if (asset.type === "TILE") {
        setThumbnailUrl(getAssetFileUrl(asset.storageKeyPrefix, "tile_0.png", true))
      }
      // MAP type uses MapThumbnail component, no URL needed
    }
    loadThumbnail()
  }, [asset.storageKeyPrefix, asset.type])

  async function handleApprove() {
    setIsLoading(true)
    try {
      const updated = await approveAsset(asset.id, notes ? { notes } : undefined)
      onUpdated(updated)
      setShowNotes(false)
      setNotes("")
    } catch (err) {
      console.error("Failed to approve:", err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleReject() {
    if (!notes.trim()) {
      setShowNotes(true)
      return
    }
    setIsLoading(true)
    try {
      await rejectAsset(asset.id, { notes })
      onRemoved() // Remove from pending list
      setShowNotes(false)
      setNotes("")
    } catch (err) {
      console.error("Failed to reject:", err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleArchive() {
    setIsLoading(true)
    try {
      const updated = await archiveAsset(asset.id, notes ? { notes } : undefined)
      onUpdated(updated)
      setShowNotes(false)
      setNotes("")
    } catch (err) {
      console.error("Failed to archive:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
    APPROVED: "bg-green-500/20 text-green-400 border-green-500/50",
    REJECTED: "bg-red-500/20 text-red-400 border-red-500/50",
    ARCHIVED: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50",
  }

  const typeColors: Record<string, string> = {
    CHARACTER: "bg-purple-500/20 text-purple-400",
    TILE: "bg-blue-500/20 text-blue-400",
    MAP: "bg-emerald-500/20 text-emerald-400",
    OBJECT: "bg-orange-500/20 text-orange-400",
  }

  return (
    <Card className="overflow-hidden" data-testid="asset-card">
      {/* Thumbnail - clickable to view details */}
      <div
        className="aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-zinc-700 transition-colors group"
        onClick={onViewDetails}
        title="Click to view all frames/variations"
      >
        {asset.type === "MAP" ? (
          <MapThumbnail
            storageKeyPrefix={asset.storageKeyPrefix}
            className="w-full h-full group-hover:scale-105 transition-transform"
          />
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={asset.name}
            className="w-full h-full object-contain rendering-pixelated group-hover:scale-105 transition-transform"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = "none"
              target.parentElement!.innerHTML = '<span class="text-4xl text-zinc-600">?</span>'
            }}
          />
        ) : (
          <span className="text-4xl text-zinc-600 animate-pulse">...</span>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-zinc-100 truncate" title={asset.name}>
            {asset.name}
          </h3>
          <span className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[asset.status]}`}>
            {asset.status}
          </span>
        </div>

        {/* Meta */}
        <div className="space-y-1 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded ${typeColors[asset.type]}`}>
              {asset.type}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="truncate" title={asset.authorName || asset.authorId}>
              {asset.authorName || asset.authorId.slice(0, 8) + "..."}
            </span>
          </div>
          {asset.authorEmail && (
            <div className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              <span className="truncate" title={asset.authorEmail}>{asset.authorEmail}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Notes input */}
        {showNotes && (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add moderation notes..."
              className="w-full px-2 py-1 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              rows={2}
            />
          </div>
        )}

        {/* Actions */}
        {asset.status === "PENDING" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="success"
              className="flex-1"
              onClick={handleApprove}
              disabled={isLoading}
            >
              <Check className="w-4 h-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={handleReject}
              disabled={isLoading}
            >
              <X className="w-4 h-4" />
              Reject
            </Button>
          </div>
        )}

        {asset.status === "APPROVED" && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setShowNotes(!showNotes)}
            disabled={isLoading}
          >
            <Archive className="w-4 h-4" />
            {showNotes ? "Cancel" : "Archive"}
          </Button>
        )}

        {showNotes && asset.status === "APPROVED" && (
          <Button
            size="sm"
            variant="destructive"
            className="w-full"
            onClick={handleArchive}
            disabled={isLoading}
          >
            Confirm Archive
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
