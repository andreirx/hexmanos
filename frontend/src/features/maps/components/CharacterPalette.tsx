import { useState, useEffect } from "react"
import { Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAssetsByType, getAssetFileUrl } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

interface CharacterPaletteProps {
  selectedCharacter: string | null
  onSelectCharacter: (characterId: string | null) => void
}

export function CharacterPalette({ selectedCharacter, onSelectCharacter }: CharacterPaletteProps) {
  const [characters, setCharacters] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load characters on mount
  useEffect(() => {
    async function loadCharacters() {
      setIsLoading(true)
      try {
        const assets = await getAssetsByType("CHARACTER")
        setCharacters(assets)
      } catch (err) {
        console.error("Failed to load characters:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadCharacters()
  }, [])

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Characters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-4 text-zinc-500 text-sm">Loading characters...</div>
        ) : characters.length === 0 ? (
          <div className="text-center py-4 text-zinc-500 text-sm">
            No characters found.
            <br />
            Create some in the Character Editor!
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {characters.map(character => {
              const thumbnailUrl = getAssetFileUrl(character.storageKeyPrefix, "idle_0.png", true)
              const isSelected = selectedCharacter === character.id

              return (
                <button
                  key={character.id}
                  onClick={() => onSelectCharacter(isSelected ? null : character.id)}
                  className={`flex flex-col items-center p-2 rounded border-2 transition-all ${
                    isSelected
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                  }`}
                  title={character.name}
                >
                  <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
                    <img
                      src={thumbnailUrl}
                      alt={character.name}
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
                    {character.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Clear selection */}
        {selectedCharacter && (
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
