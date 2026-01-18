import { useState, useEffect } from "react"
import { RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AssetCard } from "../components/AssetCard"
import { AssetDetailModal } from "../components/AssetDetailModal"
import { getAssetsByStatus } from "@/api/assets"
import type { AssetDTO } from "@/api/types"

export function PendingAssetsPage() {
  const [assets, setAssets] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<AssetDTO | null>(null)

  async function loadAssets() {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getAssetsByStatus("PENDING")
      // Sort by createdAt ascending (oldest first - FIFO queue)
      data.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setAssets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [])

  function handleAssetUpdated(updatedAsset: AssetDTO) {
    // Remove from pending list when approved
    if (updatedAsset.status !== "PENDING") {
      setAssets(prev => prev.filter(a => a.id !== updatedAsset.id))
    } else {
      setAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a))
    }
  }

  function handleAssetRemoved(assetId: string) {
    setAssets(prev => prev.filter(a => a.id !== assetId))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Pending Review</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {assets.length} asset{assets.length !== 1 ? "s" : ""} waiting for moderation
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAssets} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="mb-6 border-red-800 bg-red-900/20">
          <CardContent className="py-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-zinc-500 mb-4" />
            <p className="text-zinc-500">Loading pending assets...</p>
          </CardContent>
        </Card>
      ) : assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <p className="text-zinc-300 font-medium">All caught up!</p>
            <p className="text-zinc-500 text-sm mt-1">No assets pending review</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onUpdated={handleAssetUpdated}
              onRemoved={() => handleAssetRemoved(asset.id)}
              onViewDetails={() => setSelectedAsset(asset)}
            />
          ))}
        </div>
      )}

      <AssetDetailModal
        asset={selectedAsset}
        isOpen={selectedAsset !== null}
        onClose={() => setSelectedAsset(null)}
      />
    </div>
  )
}
