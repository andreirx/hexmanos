import { useState, useEffect } from "react"
import { ChevronDown, ChevronUp, Grid3X3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAssetsByType, getAssetFileUrl, getAssetFile } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

interface TileProperties {
  name: string
  tileSize: number
  passable: boolean
  variations: number
  tileType?: "TILE" | "PATH"
}

interface TilePaletteProps {
  selectedTile: { assetId: string; variation: number } | null
  onSelectTile: (tile: { assetId: string; variation: number } | null) => void
  tileType: "TILE" | "PATH"
}

// Path direction labels
const PATH_LABELS = [
  "→",      // 0001 - Right
  "←",      // 0010 - Left
  "←→",     // 0011 - Left+Right
  "↓",      // 0100 - Down
  "↓→",     // 0101 - Down+Right
  "↓←",     // 0110 - Down+Left
  "↓←→",    // 0111 - Down+Left+Right
  "↑",      // 1000 - Up
  "↑→",     // 1001 - Up+Right
  "↑←",     // 1010 - Up+Left
  "↑←→",    // 1011 - Up+Left+Right
  "↑↓",     // 1100 - Up+Down
  "↑↓→",    // 1101 - Up+Down+Right
  "↑↓←",    // 1110 - Up+Down+Left
  "↑↓←→",   // 1111 - All
]

export function TilePalette({ selectedTile, onSelectTile, tileType }: TilePaletteProps) {
  const [tiles, setTiles] = useState<AssetDTO[]>([])
  const [tileProperties, setTileProperties] = useState<Map<string, TileProperties>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [expandedTiles, setExpandedTiles] = useState<Set<string>>(new Set())

  // Load tiles on mount and when tileType changes
  useEffect(() => {
    async function loadTiles() {
      setIsLoading(true)
      try {
        const assets = await getAssetsByType("TILE")

        // Load properties for each tile to filter by type
        const propsPromises = assets.map(async (asset) => {
          try {
            const props = await getAssetFile<TileProperties>(asset.storageKeyPrefix, "properties.json")
            return { assetId: asset.id, props }
          } catch {
            return { assetId: asset.id, props: null }
          }
        })

        const propsResults = await Promise.all(propsPromises)
        const propsMap = new Map<string, TileProperties>()
        propsResults.forEach(({ assetId, props }) => {
          if (props) {
            propsMap.set(assetId, props)
          }
        })
        setTileProperties(propsMap)

        // Filter tiles by type
        const filteredTiles = assets.filter(asset => {
          const props = propsMap.get(asset.id)
          if (!props) return false
          const propType = props.tileType || "TILE"
          return propType === tileType
        })

        setTiles(filteredTiles)
      } catch (err) {
        console.error("Failed to load tiles:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadTiles()
  }, [tileType])

  const toggleExpanded = (assetId: string) => {
    setExpandedTiles(prev => {
      const next = new Set(prev)
      if (next.has(assetId)) {
        next.delete(assetId)
      } else {
        next.add(assetId)
      }
      return next
    })
  }

  const isSelected = (assetId: string, variation: number) => {
    return selectedTile?.assetId === assetId && selectedTile?.variation === variation
  }

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
          <Grid3X3 className="w-4 h-4" />
          {tileType === "PATH" ? "Path Tiles" : "Terrain Tiles"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-4 text-zinc-500 text-sm">Loading tiles...</div>
        ) : tiles.length === 0 ? (
          <div className="text-center py-4 text-zinc-500 text-sm">
            No {tileType.toLowerCase()} tiles found.
            <br />
            Create some in the Tile Editor!
          </div>
        ) : (
          tiles.map(tile => {
            const props = tileProperties.get(tile.id)
            const variations = props?.variations || 1
            const isExpanded = expandedTiles.has(tile.id)
            const thumbnailUrl = getAssetFileUrl(tile.storageKeyPrefix, "tile_0.png", true)

            return (
              <div key={tile.id} className="bg-zinc-900 rounded border border-zinc-700">
                {/* Tile header with first variation */}
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-zinc-800 transition-colors"
                  onClick={() => {
                    if (variations > 1) {
                      toggleExpanded(tile.id)
                    } else {
                      onSelectTile({ assetId: tile.id, variation: 0 })
                    }
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className={`w-12 h-12 flex-shrink-0 rounded border-2 overflow-hidden ${
                      isSelected(tile.id, 0) ? "border-blue-500" : "border-zinc-700"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectTile({ assetId: tile.id, variation: 0 })
                    }}
                  >
                    <img
                      src={thumbnailUrl}
                      alt={tile.name}
                      className="w-full h-full object-contain"
                      style={{ imageRendering: "pixelated" }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = "none"
                      }}
                    />
                  </div>

                  {/* Name and info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate" title={tile.name}>
                      {tile.name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {variations} variation{variations !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Expand button */}
                  {variations > 1 && (
                    <div className="text-zinc-500">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded variations */}
                {isExpanded && variations > 1 && (
                  <div className="border-t border-zinc-700 p-2">
                    <div className="grid grid-cols-4 gap-1">
                      {Array.from({ length: variations }).map((_, idx) => {
                        const varUrl = getAssetFileUrl(tile.storageKeyPrefix, `tile_${idx}.png`, true)
                        const label = tileType === "PATH" && idx < PATH_LABELS.length ? PATH_LABELS[idx] : null

                        return (
                          <button
                            key={idx}
                            onClick={() => onSelectTile({ assetId: tile.id, variation: idx })}
                            className={`relative aspect-square rounded border-2 overflow-hidden transition-all ${
                              isSelected(tile.id, idx)
                                ? "border-blue-500 scale-105"
                                : "border-zinc-700 hover:border-zinc-500"
                            }`}
                            title={label ? `Variation ${idx + 1}: ${label}` : `Variation ${idx + 1}`}
                          >
                            <img
                              src={varUrl}
                              alt={`Variation ${idx + 1}`}
                              className="w-full h-full object-contain"
                              style={{ imageRendering: "pixelated" }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.style.opacity = "0.3"
                              }}
                            />
                            {label && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs text-white/80 font-bold drop-shadow-lg bg-black/30 px-1 rounded">
                                  {label}
                                </span>
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* Clear selection */}
        {selectedTile && (
          <button
            onClick={() => onSelectTile(null)}
            className="w-full py-2 px-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
          >
            Clear Selection
          </button>
        )}
      </CardContent>
    </Card>
  )
}
