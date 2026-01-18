import type { AssetStatus } from "@/api/types"

interface StatusBadgeProps {
  status: AssetStatus
  size?: "sm" | "md"
}

const statusStyles: Record<AssetStatus, string> = {
  PENDING: "bg-amber-500/20 text-amber-400 border-amber-500/50",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/50",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/50",
  ARCHIVED: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50",
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const sizeClasses = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"

  return (
    <span
      className={`inline-flex items-center rounded border font-medium uppercase ${statusStyles[status]} ${sizeClasses}`}
    >
      {status}
    </span>
  )
}
