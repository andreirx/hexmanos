import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import type { AssetStatus, AssetType } from "@/api/types"

const statuses: (AssetStatus | "ALL")[] = ["ALL", "PENDING", "APPROVED", "ARCHIVED"]
const types: (AssetType | "ALL")[] = ["ALL", "CHARACTER", "OBJECT", "TILE", "MAP"]

export function AssetFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const currentStatus = searchParams.get("status") || "ALL"
  const currentType = searchParams.get("type") || "ALL"

  function setFilter(key: string, value: string) {
    const newParams = new URLSearchParams(searchParams)
    if (value === "ALL") {
      newParams.delete(key)
    } else {
      newParams.set(key, value)
    }
    setSearchParams(newParams)
  }

  return (
    <div className="flex flex-wrap gap-4 mb-6">
      {/* Status filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">Status:</span>
        <div className="flex gap-1">
          {statuses.map(status => (
            <Button
              key={status}
              size="sm"
              variant={currentStatus === status ? "default" : "ghost"}
              onClick={() => setFilter("status", status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">Type:</span>
        <div className="flex gap-1">
          {types.map(type => (
            <Button
              key={type}
              size="sm"
              variant={currentType === type ? "default" : "ghost"}
              onClick={() => setFilter("type", type)}
            >
              {type}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
