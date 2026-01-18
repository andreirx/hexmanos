import { useState, useEffect } from "react"
import { X, Map as MapIcon, Copy, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { MapPreview } from "./MapPreview"
import { getAssetsByType, getAssetFile } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

interface MapInfoData {
  name: string
  width: number
  height: number
  tileSize: number
}

interface MapGalleryProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (asset: AssetDTO, mode: "edit" | "copy") => void
  currentUserId?: string
}

export function MapGallery({ isOpen, onClose, onSelect, currentUserId }: MapGalleryProps) {
  const [maps, setMaps] = useState<AssetDTO[]>([])
  const [mapInfo, setMapInfo] = useState<Map<string, MapInfoData>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadMaps()
    }
  }, [isOpen])

  async function loadMaps() {
    setIsLoading(true)
    setError(null)
    try {
      const assets = await getAssetsByType("MAP")
      setMaps(assets)

      // Load map info for each asset
      const infoPromises = assets.map(async (asset) => {
        try {
          const data = await getAssetFile<MapInfoData>(asset.storageKeyPrefix, "map.json")
          return { assetId: asset.id, data }
        } catch {
          return { assetId: asset.id, data: null }
        }
      })

      const infoResults = await Promise.all(infoPromises)
      const infoMap = new Map<string, MapInfoData>()
      infoResults.forEach(({ assetId, data }) => {
        if (data) {
          infoMap.set(assetId, data)
        }
      })
      setMapInfo(infoMap)
    } catch (err) {
      console.error("Failed to load maps:", err)
      setError("Failed to load maps. Is the backend running?")
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
          <h2 className="text-lg font-semibold text-zinc-100">Map Gallery</h2>
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
              <div className="text-zinc-400">Loading maps...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-400">{error}</div>
            </div>
          ) : maps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <MapIcon className="w-12 h-12 mb-4 opacity-50" />
              <p>No maps found</p>
              <p className="text-sm mt-1">Create your first map to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {maps.map((map) => {
                const isOwner = currentUserId && map.authorId === currentUserId
                const isArchived = map.status === "ARCHIVED"
                const info = mapInfo.get(map.id)

                return (
                  <div
                    key={map.id}
                    className={`bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden transition-colors ${
                      isArchived
                        ? "opacity-50 grayscale cursor-not-allowed"
                        : "group hover:border-zinc-500"
                    }`}
                  >
                    {/* Map preview */}
                    <div className="aspect-video relative">
                      <MapPreview
                        storageKeyPrefix={map.storageKeyPrefix}
                        className="w-full h-full"
                      />
                      {/* Status badge */}
                      <div className="absolute top-1 right-1">
                        <StatusBadge status={map.status} />
                      </div>
                      {/* Dimensions overlay */}
                      {info && (
                        <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[10px] text-zinc-400">
                          {info.width} x {info.height}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-zinc-200 text-sm truncate" title={map.name}>
                        {map.name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {isOwner ? "Yours" : "Other"}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-1 mt-2">
                        {isArchived ? (
                          <div className="flex-1 text-center text-xs text-zinc-500 py-1.5">
                            Archived
                          </div>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              className={`flex-1 h-7 text-xs ${
                                isOwner
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                              }`}
                              onClick={() => isOwner && onSelect(map, "edit")}
                              disabled={!isOwner}
                              title={isOwner ? "Edit this map" : "You can only edit your own maps"}
                            >
                              <Edit2 className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-xs border-zinc-600 text-zinc-200 hover:bg-zinc-700"
                              onClick={() => onSelect(map, "copy")}
                              title="Copy this map to edit as your own"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copy
                            </Button>
                          </>
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
          {maps.length} map{maps.length !== 1 ? "s" : ""} available
          {currentUserId && (
            <span className="ml-2">
              • {maps.filter(m => m.authorId === currentUserId).length} owned by you
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
