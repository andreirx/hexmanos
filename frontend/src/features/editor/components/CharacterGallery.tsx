import { useState, useEffect } from "react"
import { X, User, Copy, Edit2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { getAssetsByType, getAssetFileUrl, getAssetFile } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

// Definition structure to check for visual states
interface EntityDefinition {
  name: string
  spriteSize: number
  entityType?: "CHARACTER" | "OBJECT"
  visualStates?: string[]
  states: Record<string, { frames: number; loop: boolean }>
}

// Cache for definitions to avoid repeated fetches
const definitionCache = new Map<string, EntityDefinition>()

interface CharacterGalleryProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (asset: AssetDTO, mode: "edit" | "copy") => void
  currentUserId?: string
}

export function CharacterGallery({ isOpen, onClose, onSelect, currentUserId }: CharacterGalleryProps) {
  const [assets, setAssets] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "CHARACTER" | "OBJECT">("all")
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (isOpen) {
      loadAssets()
    }
  }, [isOpen])

  async function loadAssets() {
    setIsLoading(true)
    setError(null)
    try {
      // Load both characters and objects
      const [characters, objects] = await Promise.all([
        getAssetsByType("CHARACTER"),
        getAssetsByType("OBJECT"),
      ])
      const allAssets = [...characters, ...objects]
      setAssets(allAssets)

      // Load definitions and determine thumbnail URLs
      const urlMap = new Map<string, string>()
      await Promise.all(
        allAssets.map(async (asset) => {
          try {
            let definition = definitionCache.get(asset.id)
            if (!definition) {
              definition = await getAssetFile<EntityDefinition>(
                asset.storageKeyPrefix,
                "definition.json"
              )
              definitionCache.set(asset.id, definition)
            }

            // Determine thumbnail file name based on visual states
            let thumbnailFile: string
            if (definition.visualStates && definition.visualStates.length > 0) {
              // New format: use first visual state
              const firstVs = definition.visualStates[0]
              thumbnailFile = `${firstVs}_idle_0.png`
            } else {
              // Legacy format
              thumbnailFile = "idle_0.png"
            }

            urlMap.set(asset.id, getAssetFileUrl(asset.storageKeyPrefix, thumbnailFile, true))
          } catch {
            // Fallback to legacy format on error
            urlMap.set(asset.id, getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png", true))
          }
        })
      )
      setThumbnailUrls(urlMap)
    } catch (err) {
      console.error("Failed to load assets:", err)
      setError("Failed to load assets. Is the backend running?")
    } finally {
      setIsLoading(false)
    }
  }

  // Filter assets based on current filter
  const filteredAssets = assets.filter((asset) => {
    if (filter === "all") return true
    return asset.type === filter
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-zinc-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-100">Asset Gallery</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="px-4 py-2 border-b border-zinc-700 flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-zinc-600 text-white"
                : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("CHARACTER")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
              filter === "CHARACTER"
                ? "bg-blue-600 text-white"
                : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Characters
          </button>
          <button
            onClick={() => setFilter("OBJECT")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
              filter === "OBJECT"
                ? "bg-orange-600 text-white"
                : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Objects
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-zinc-400">Loading assets...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-400">{error}</div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              {filter === "OBJECT" ? (
                <Package className="w-12 h-12 mb-4 opacity-50" />
              ) : (
                <User className="w-12 h-12 mb-4 opacity-50" />
              )}
              <p>No {filter === "all" ? "assets" : filter === "CHARACTER" ? "characters" : "objects"} found</p>
              <p className="text-sm mt-1">Create your first one to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredAssets.map((asset) => {
                const isOwner = currentUserId && asset.authorId === currentUserId
                const isArchived = asset.status === "ARCHIVED"
                const thumbnailUrl = thumbnailUrls.get(asset.id) ||
                  getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png", true)
                const isObject = asset.type === "OBJECT"

                return (
                  <div
                    key={asset.id}
                    className={`bg-zinc-900 rounded-lg border overflow-hidden transition-colors ${
                      isArchived
                        ? "opacity-50 grayscale cursor-not-allowed border-zinc-700"
                        : isObject
                          ? "border-orange-800/50 group hover:border-orange-600/50"
                          : "border-zinc-700 group hover:border-zinc-500"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-zinc-950 flex items-center justify-center p-2 relative">
                      <img
                        src={thumbnailUrl}
                        alt={asset.name}
                        className="w-full h-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                        onError={(e) => {
                          // Fallback if image fails to load
                          const target = e.target as HTMLImageElement
                          target.style.display = "none"
                          target.parentElement!.innerHTML = '<div class="text-zinc-600 text-4xl">?</div>'
                        }}
                      />
                      {/* Status badge */}
                      <div className="absolute top-1 right-1">
                        <StatusBadge status={asset.status} />
                      </div>
                      {/* Type indicator */}
                      <div className={`absolute top-1 left-1 p-1 rounded ${
                        isObject ? "bg-orange-600/80" : "bg-blue-600/80"
                      }`}>
                        {isObject ? (
                          <Package className="w-3 h-3 text-white" />
                        ) : (
                          <User className="w-3 h-3 text-white" />
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-zinc-200 truncate" title={asset.name}>
                        {asset.name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        {isOwner ? `Your ${isObject ? "object" : "character"}` : "By another user"}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        {isArchived ? (
                          <div className="flex-1 text-center text-xs text-zinc-500 py-2">
                            Archived
                          </div>
                        ) : isOwner ? (
                          <Button
                            size="sm"
                            className={`flex-1 ${
                              isObject
                                ? "bg-orange-600 hover:bg-orange-700"
                                : "bg-blue-600 hover:bg-blue-700"
                            }`}
                            onClick={() => onSelect(asset, "edit")}
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-zinc-600 hover:bg-zinc-700"
                            onClick={() => onSelect(asset, "copy")}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-700 text-xs text-zinc-500">
          {filteredAssets.length} {filter === "all" ? "asset" : filter === "CHARACTER" ? "character" : "object"}{filteredAssets.length !== 1 ? "s" : ""} available
          {currentUserId && (
            <span className="ml-2">
              • {filteredAssets.filter(a => a.authorId === currentUserId).length} owned by you
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
