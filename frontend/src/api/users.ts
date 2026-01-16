import api from "@/lib/api"
import type { UserDTO, SyncUserRequest } from "./types"

/**
 * Get the current authenticated user's profile.
 * This also syncs the user from Cognito if they don't exist in the database.
 */
export async function getCurrentUser(): Promise<UserDTO> {
  const response = await api.get<UserDTO>("/users/me")
  return response.data
}

/**
 * Explicitly sync a user from Cognito.
 * Called after successful Cognito authentication.
 */
export async function syncUser(request: SyncUserRequest): Promise<UserDTO> {
  const response = await api.post<UserDTO>("/users/sync", request)
  return response.data
}

/**
 * Get a user by ID.
 */
export async function getUserById(id: string): Promise<UserDTO> {
  const response = await api.get<UserDTO>(`/users/${id}`)
  return response.data
}

/**
 * Get all users (admin only).
 */
export async function getAllUsers(): Promise<UserDTO[]> {
  const response = await api.get<UserDTO[]>("/users")
  return response.data
}
