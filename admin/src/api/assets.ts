import api from "@/lib/api"
import type { AssetDTO, AssetStatus, AssetType, ModerationRequest } from "./types"

const API_BASE = "http://localhost:8080"

export async function getAssets(): Promise<AssetDTO[]> {
  const response = await api.get<AssetDTO[]>("/api/assets")
  return response.data
}

export async function getAssetsByStatus(status: AssetStatus): Promise<AssetDTO[]> {
  const response = await api.get<AssetDTO[]>(`/api/assets/status/${status}`)
  return response.data
}

export async function getAssetsByType(type: AssetType): Promise<AssetDTO[]> {
  const response = await api.get<AssetDTO[]>(`/api/assets/type/${type}`)
  return response.data
}

export async function getAssetById(id: string): Promise<AssetDTO> {
  const response = await api.get<AssetDTO>(`/api/assets/${id}`)
  return response.data
}

export async function approveAsset(id: string, request?: ModerationRequest): Promise<AssetDTO> {
  const response = await api.post<AssetDTO>(`/api/assets/${id}/approve`, request || {})
  return response.data
}

export async function rejectAsset(id: string, request?: ModerationRequest): Promise<AssetDTO> {
  const response = await api.post<AssetDTO>(`/api/assets/${id}/reject`, request || {})
  return response.data
}

export async function archiveAsset(id: string, request?: ModerationRequest): Promise<AssetDTO> {
  const response = await api.post<AssetDTO>(`/api/assets/${id}/archive`, request || {})
  return response.data
}

export function getAssetFileUrl(storageKeyPrefix: string, fileName: string, cacheBust = false): string {
  const base = `${API_BASE}/api/assets/files/${storageKeyPrefix}/${fileName}`
  return cacheBust ? `${base}?t=${Date.now()}` : base
}

export async function getAssetFile<T>(storageKeyPrefix: string, fileName: string): Promise<T> {
  const url = `/api/assets/files/${storageKeyPrefix}/${fileName}`
  const response = await api.get<T>(url, {
    params: { t: Date.now() }, // Cache bust
  })
  return response.data
}
