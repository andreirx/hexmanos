import api from "@/lib/api"
import type { GameDTO, GamePlayerDTO, CreateGameRequest, JoinGameRequest } from "./types"

/**
 * Create a new game.
 */
export async function createGame(request: CreateGameRequest): Promise<GameDTO> {
  const response = await api.post<GameDTO>("/games", request)
  return response.data
}

/**
 * Get games hosted by the current user.
 */
export async function getMyGames(): Promise<GameDTO[]> {
  const response = await api.get<GameDTO[]>("/games")
  return response.data
}

/**
 * Get a game by ID with full details.
 */
export async function getGame(gameId: string): Promise<GameDTO> {
  const response = await api.get<GameDTO>(`/games/${gameId}`)
  return response.data
}

/**
 * Start a game.
 */
export async function startGame(gameId: string): Promise<GameDTO> {
  const response = await api.post<GameDTO>(`/games/${gameId}/start`)
  return response.data
}

/**
 * Pause a game.
 */
export async function pauseGame(gameId: string): Promise<GameDTO> {
  const response = await api.post<GameDTO>(`/games/${gameId}/pause`)
  return response.data
}

/**
 * Stop a game completely.
 */
export async function stopGame(gameId: string): Promise<void> {
  await api.post(`/games/${gameId}/stop`)
}

/**
 * Join a game.
 */
export async function joinGame(gameId: string, request: JoinGameRequest): Promise<GamePlayerDTO> {
  const response = await api.post<GamePlayerDTO>(`/games/${gameId}/join`, request)
  return response.data
}

/**
 * Leave a game.
 */
export async function leaveGame(gameId: string): Promise<void> {
  await api.post(`/games/${gameId}/leave`)
}

/**
 * Take control of a character.
 */
export async function takeOverCharacter(gameId: string, characterId: string): Promise<void> {
  await api.post(`/games/${gameId}/characters/${characterId}/take-over`)
}

/**
 * Release control of a character.
 */
export async function relinquishCharacter(gameId: string): Promise<void> {
  await api.post(`/games/${gameId}/characters/relinquish`)
}
