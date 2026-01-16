import api from "@/lib/api"
import type {
  AssetDTO,
  CreateAssetRequest,
  UploadResponse,
  PresignedUrlRequest,
  PresignedUrlResponse,
  RegisterAssetRequest,
  RegisterAssetResponse
} from "./types"

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

/**
 * Register an asset after files have been uploaded to storage.
 * This validates that all required files exist and creates the database record.
 *
 * @param request Contains assetId, type, name, authorId, and list of files to validate
 * @returns RegisterAssetResponse with success status and asset or error details
 */
export async function registerAsset(request: RegisterAssetRequest): Promise<RegisterAssetResponse> {
  const response = await api.post<RegisterAssetResponse>("/assets/register", request)
  return response.data
}

/**
 * Get assets filtered by type.
 */
export async function getAssetsByType(type: "CHARACTER" | "TILE" | "MAP"): Promise<AssetDTO[]> {
  const response = await api.get<AssetDTO[]>(`/assets/type/${type}`)
  return response.data
}

/**
 * Get a file from an asset's storage.
 * Returns the URL to fetch the file from.
 */
export function getAssetFileUrl(storageKeyPrefix: string, fileName: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8080/api"
  return `${baseUrl}/assets/files/${storageKeyPrefix}/${fileName}`
}

/**
 * Fetch an asset file as JSON.
 */
export async function getAssetFile<T>(storageKeyPrefix: string, fileName: string): Promise<T> {
  const url = getAssetFileUrl(storageKeyPrefix, fileName)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Load an image from asset storage and return as ImageData.
 */
export async function loadAssetImage(storageKeyPrefix: string, fileName: string): Promise<Uint8ClampedArray> {
  const url = getAssetFileUrl(storageKeyPrefix, fileName)

  return new Promise((resolve, reject) => {
    const img = document.createElement("img")
    img.crossOrigin = "anonymous"

    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        reject(new Error("Could not get canvas context"))
        return
      }

      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      resolve(imageData.data)
    }

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${fileName}`))
    }

    img.src = url
  })
}
