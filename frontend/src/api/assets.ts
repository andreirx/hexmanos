import api from "@/lib/api"
import type { AssetDTO, CreateAssetRequest, UploadResponse, PresignedUrlRequest, PresignedUrlResponse } from "./types"

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

/**
 * Get a presigned URL for direct upload to storage.
 * This allows uploading files directly to S3/local storage without proxying.
 */
export async function getPresignedUrl(request: PresignedUrlRequest): Promise<PresignedUrlResponse> {
  const response = await api.post<PresignedUrlResponse>("/assets/presigned-url", request)
  return response.data
}

/**
 * Upload a file directly to the presigned URL.
 * For S3, this uses PUT. For local storage, this uses POST.
 */
export async function uploadToPresignedUrl(
  presignedUrl: PresignedUrlResponse,
  file: Blob,
  contentType: string
): Promise<void> {
  if (presignedUrl.httpMethod === "PUT") {
    // S3 presigned URL - use PUT with raw body
    await fetch(presignedUrl.uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": contentType,
      },
    })
  } else {
    // Local storage - use POST with form data
    const formData = new FormData()
    formData.append("file", file)
    await fetch(presignedUrl.uploadUrl, {
      method: "POST",
      body: formData,
    })
  }
}

/**
 * Verify that a file exists in storage.
 */
export async function verifyFileExists(storageKey: string): Promise<boolean> {
  const response = await api.get<boolean>(`/assets/verify/${encodeURIComponent(storageKey)}`)
  return response.data
}
