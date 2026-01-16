import { useState, useEffect } from "react"
import { X, User, Copy, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAssetsByType, getAssetFileUrl } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

interface CharacterGalleryProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (asset: AssetDTO, mode: "edit" | "copy") => void
  currentUserId?: string
}

export function CharacterGallery({ isOpen, onClose, onSelect, currentUserId }: CharacterGalleryProps) {
  const [characters, setCharacters] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadCharacters()
    }
  }, [isOpen])

  async function loadCharacters() {
    setIsLoading(true)
    setError(null)
    try {
      const assets = await getAssetsByType("CHARACTER")
      setCharacters(assets)
    } catch (err) {
      console.error("Failed to load characters:", err)
      setError("Failed to load characters. Is the backend running?")
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
          <h2 className="text-lg font-semibold text-zinc-100">Character Gallery</h2>
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
              <div className="text-zinc-400">Loading characters...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-400">{error}</div>
            </div>
          ) : characters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <User className="w-12 h-12 mb-4 opacity-50" />
              <p>No characters found</p>
              <p className="text-sm mt-1">Create your first character to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {characters.map((character) => {
                const isOwner = currentUserId && character.authorId === currentUserId
                const thumbnailUrl = getAssetFileUrl(character.storageKeyPrefix, "idle_0.png")

                return (
                  <div
                    key={character.id}
                    className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden group hover:border-zinc-500 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-zinc-950 flex items-center justify-center p-2">
                      <img
                        src={thumbnailUrl}
                        alt={character.name}
                        className="w-full h-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                        onError={(e) => {
                          // Fallback if image fails to load
                          const target = e.target as HTMLImageElement
                          target.style.display = "none"
                          target.parentElement!.innerHTML = '<div class="text-zinc-600 text-4xl">?</div>'
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-zinc-200 truncate" title={character.name}>
                        {character.name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        {isOwner ? "Your character" : "By another user"}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        {isOwner ? (
                          <Button
                            size="sm"
                            className="flex-1 bg-blue-600 hover:bg-blue-700"
                            onClick={() => onSelect(character, "edit")}
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-zinc-600 hover:bg-zinc-700"
                            onClick={() => onSelect(character, "copy")}
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
          {characters.length} character{characters.length !== 1 ? "s" : ""} available
          {currentUserId && (
            <span className="ml-2">
              • {characters.filter(c => c.authorId === currentUserId).length} owned by you
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
