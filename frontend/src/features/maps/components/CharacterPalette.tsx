import { useState, useEffect } from "react"
import { Users, Package } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface CharacterPaletteProps {
  selectedCharacter: string | null
  onSelectCharacter: (characterId: string | null) => void
}

export function CharacterPalette({ selectedCharacter, onSelectCharacter }: CharacterPaletteProps) {
  const [characters, setCharacters] = useState<AssetDTO[]>([])
  const [objects, setObjects] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"characters" | "objects">("characters")
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map())

  // Load assets on mount
  useEffect(() => {
    async function loadAssets() {
      setIsLoading(true)
      try {
        const [characterAssets, objectAssets] = await Promise.all([
          getAssetsByType("CHARACTER"),
          getAssetsByType("OBJECT"),
        ])
        // Only show approved assets
        const approvedCharacters = characterAssets.filter(a => a.status === "APPROVED")
        const approvedObjects = objectAssets.filter(a => a.status === "APPROVED")

        setCharacters(approvedCharacters)
        setObjects(approvedObjects)

        // Load definitions and determine thumbnail URLs
        const allAssets = [...approvedCharacters, ...approvedObjects]
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

        // Auto-select the first character if none is selected
        if (!selectedCharacter && approvedCharacters.length > 0) {
          onSelectCharacter(approvedCharacters[0].id)
        }
      } catch (err) {
        console.error("Failed to load assets:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadAssets()
  }, [])

  const currentAssets = activeTab === "characters" ? characters : objects
  const hasSelectedInCurrentTab = selectedCharacter && currentAssets.some(a => a.id === selectedCharacter)

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-zinc-300">
          <div className="flex items-center gap-2">
            {activeTab === "characters" ? (
              <Users className="w-4 h-4" />
            ) : (
              <Package className="w-4 h-4" />
            )}
            Entities
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Tabs */}
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setActiveTab("characters")}
            className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              activeTab === "characters"
                ? "bg-purple-600 text-white"
                : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Users className="w-3 h-3" />
            Characters
            {characters.length > 0 && (
              <span className="opacity-70">({characters.length})</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("objects")}
            className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              activeTab === "objects"
                ? "bg-orange-600 text-white"
                : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Package className="w-3 h-3" />
            Objects
            {objects.length > 0 && (
              <span className="opacity-70">({objects.length})</span>
            )}
          </button>
        </div>

        {/* Asset grid */}
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-4 text-zinc-500 text-sm">Loading...</div>
          ) : currentAssets.length === 0 ? (
            <div className="text-center py-4 text-zinc-500 text-sm">
              No {activeTab} found.
              <br />
              Create some in the Editor!
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {currentAssets.map(asset => {
                const thumbnailUrl = thumbnailUrls.get(asset.id) ||
                  getAssetFileUrl(asset.storageKeyPrefix, "idle_0.png", true)
                const isSelected = selectedCharacter === asset.id

                return (
                  <button
                    key={asset.id}
                    onClick={() => onSelectCharacter(isSelected ? null : asset.id)}
                    className={`flex flex-col items-center p-2 rounded border-2 transition-all ${
                      isSelected
                        ? activeTab === "characters"
                          ? "border-purple-500 bg-purple-500/10"
                          : "border-orange-500 bg-orange-500/10"
                        : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                    }`}
                    title={asset.name}
                  >
                    <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
                      <img
                        src={thumbnailUrl}
                        alt={asset.name}
                        className="w-full h-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = "none"
                          target.parentElement!.innerHTML = '<span class="text-2xl">?</span>'
                        }}
                      />
                    </div>
                    <span className="text-xs text-zinc-300 truncate w-full text-center mt-1">
                      {asset.name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Clear selection */}
        {hasSelectedInCurrentTab && (
          <button
            onClick={() => onSelectCharacter(null)}
            className="w-full py-2 px-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
          >
            Clear Selection
          </button>
        )}
      </CardContent>
    </Card>
  )
}
