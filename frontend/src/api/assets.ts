import api from "@/lib/api"
import type { AssetDTO, CreateAssetRequest, UploadResponse } from "./types"

export async function uploadAsset(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await api.post<UploadResponse>("/assets/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  })

  return response.data
}

export async function createAsset(request: CreateAssetRequest): Promise<AssetDTO> {
  const response = await api.post<AssetDTO>("/assets", request)
  return response.data
}

export async function getAllAssets(): Promise<AssetDTO[]> {
  const response = await api.get<AssetDTO[]>("/assets")
  return response.data
}

export async function getAssetById(id: string): Promise<AssetDTO> {
  const response = await api.get<AssetDTO>(`/assets/${id}`)
  return response.data
}

export async function getAssetsByStatus(status: string): Promise<AssetDTO[]> {
  const response = await api.get<AssetDTO[]>(`/assets/status/${status}`)
  return response.data
}

export async function approveAsset(id: string): Promise<AssetDTO> {
  const response = await api.post<AssetDTO>(`/assets/${id}/approve`)
  return response.data
}
