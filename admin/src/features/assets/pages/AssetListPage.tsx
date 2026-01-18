import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AssetCard } from "../components/AssetCard"
import { AssetFilters } from "../components/AssetFilters"
import { getAssets, getAssetsByStatus } from "@/api/assets"
import type { AssetDTO, AssetStatus, AssetType } from "@/api/types"

export function AssetListPage() {
  const [searchParams] = useSearchParams()
  const [assets, setAssets] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const statusFilter = (searchParams.get("status") as AssetStatus) || null
  const typeFilter = (searchParams.get("type") as AssetType) || null

  async function loadAssets() {
    setIsLoading(true)
    setError(null)
    try {
      let data: AssetDTO[]
      if (statusFilter) {
        data = await getAssetsByStatus(statusFilter)
      } else {
        data = await getAssets()
      }

      // Apply type filter client-side
      if (typeFilter) {
        data = data.filter(a => a.type === typeFilter)
      }

      // Sort by createdAt descending (newest first)
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setAssets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [statusFilter, typeFilter])

  function handleAssetUpdated(updatedAsset: AssetDTO) {
    setAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a))
  }

  function handleAssetRemoved(assetId: string) {
    setAssets(prev => prev.filter(a => a.id !== assetId))
  }

  const title = statusFilter
    ? `${statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()} Assets`
    : "All Assets"

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">{title}</h1>
        <Button variant="outline" size="sm" onClick={loadAssets} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <AssetFilters />

      {error && (
        <Card className="mb-6 border-red-800 bg-red-900/20">
          <CardContent className="py-4">
            <p className="text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-zinc-500 mb-4" />
            <p className="text-zinc-500">Loading assets...</p>
          </CardContent>
        </Card>
      ) : assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500">No assets found</p>
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
            />
          ))}
        </div>
      )}

      {/* Stats */}
      {!isLoading && assets.length > 0 && (
        <div className="mt-6 text-sm text-zinc-500 text-center">
          Showing {assets.length} asset{assets.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  )
}
