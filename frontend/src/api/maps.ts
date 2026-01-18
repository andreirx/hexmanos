import api from "@/lib/api"
import type { MapValidationRequest, MapValidationResponse } from "./types"

/**
 * Validate a map for game readiness.
 * Checks that the map has terrain, characters, and characters are on terrain.
 */
export async function validateMap(mapData: MapValidationRequest): Promise<MapValidationResponse> {
  const response = await api.post<MapValidationResponse>("/maps/validate", mapData)
  return response.data
}
