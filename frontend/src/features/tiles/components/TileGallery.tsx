import { useState, useEffect } from "react"
import { X, Grid3X3, Copy, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAssetsByType, getAssetFileUrl } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

interface TileGalleryProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (asset: AssetDTO, mode: "edit" | "copy") => void
  currentUserId?: string
}

export function TileGallery({ isOpen, onClose, onSelect, currentUserId }: TileGalleryProps) {
  const [tiles, setTiles] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadTiles()
    }
  }, [isOpen])

  async function loadTiles() {
    setIsLoading(true)
    setError(null)
    try {
      const assets = await getAssetsByType("TILE")
      setTiles(assets)
    } catch (err) {
      console.error("Failed to load tiles:", err)
      setError("Failed to load tiles. Is the backend running?")
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-zinc-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-100">Tile Gallery</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-zinc-400">Loading tiles...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-400">{error}</div>
            </div>
          ) : tiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Grid3X3 className="w-12 h-12 mb-4 opacity-50" />
              <p>No tiles found</p>
              <p className="text-sm mt-1">Create your first tile to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {tiles.map((tile) => {
                const isOwner = currentUserId && tile.authorId === currentUserId
                const thumbnailUrl = getAssetFileUrl(tile.storageKeyPrefix, "tile_0.png")

                return (
                  <div
                    key={tile.id}
                    className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden group hover:border-zinc-500 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-zinc-950 flex items-center justify-center p-1">
                      <img
                        src={thumbnailUrl}
                        alt={tile.name}
                        className="w-full h-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = "none"
                          target.parentElement!.innerHTML = '<div class="text-zinc-600 text-2xl">?</div>'
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="p-2">
                      <h3 className="font-medium text-zinc-200 text-xs truncate" title={tile.name}>
                        {tile.name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {isOwner ? "Yours" : "Other"}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-1 mt-2">
                        <Button
                          size="sm"
                          className={`flex-1 h-7 text-xs ${
                            isOwner
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                          }`}
                          onClick={() => isOwner && onSelect(tile, "edit")}
                          disabled={!isOwner}
                          title={isOwner ? "Edit this tile" : "You can only edit your own tiles"}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs border-zinc-600 text-zinc-200 hover:bg-zinc-700"
                          onClick={() => onSelect(tile, "copy")}
                          title="Copy this tile to edit as your own"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
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
          {tiles.length} tile{tiles.length !== 1 ? "s" : ""} available
          {currentUserId && (
            <span className="ml-2">
              • {tiles.filter(t => t.authorId === currentUserId).length} owned by you
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
