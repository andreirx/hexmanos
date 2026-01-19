import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { useAuth } from "@/context/AuthContext"
import { syncUser } from "@/api/users"
import { getMyGames, createGame, startGame, stopGame } from "@/api/games"
import { getAssetsByType } from "@/api/assets"
import { Plus, Play, Square, Clock } from "lucide-react"
import type { UserDTO, GameDTO, AssetDTO } from "@/api/types"

export function LobbyPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user: authUser } = useAuth()
  const [backendUser, setBackendUser] = useState<UserDTO | null>(null)
  const [games, setGames] = useState<GameDTO[]>([])
  const [maps, setMaps] = useState<AssetDTO[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Create game dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newGameName, setNewGameName] = useState("")
  const [newGameMapId, setNewGameMapId] = useState("")
  const [newGamePassword, setNewGamePassword] = useState("")


  // Sync user on auth
  useEffect(() => {
    if (isAuthenticated && authUser) {
      syncUser({
        cognitoSub: authUser.userId,
        pool: "PLAYER",
        displayName: authUser.username,
        email: authUser.email
      })
        .then(setBackendUser)
        .catch(err => console.error("Failed to sync user:", err))
    }
  }, [isAuthenticated, authUser])

  // Load games and maps
  useEffect(() => {
    if (backendUser) {
      loadGames()
      loadMaps()
    }
  }, [backendUser])

  async function loadGames() {
    try {
      setIsLoading(true)
      const myGames = await getMyGames()
      setGames(myGames)
    } catch (err) {
      console.error("Failed to load games:", err)
      setStatusMessage({ type: "error", text: "Failed to load games" })
    } finally {
      setIsLoading(false)
    }
  }

  async function loadMaps() {
    try {
      const allMaps = await getAssetsByType("MAP")
      // Show all maps for now (dev mode - later filter to APPROVED only)
      setMaps(allMaps)
    } catch (err) {
      console.error("Failed to load maps:", err)
    }
  }

  async function handleCreateGame() {
    if (!newGameName.trim() || !newGameMapId) {
      setStatusMessage({ type: "error", text: "Please enter a name and select a map" })
      return
    }

    try {
      const game = await createGame({
        mapAssetId: newGameMapId,
        name: newGameName.trim(),
        password: newGamePassword || undefined
      })
      setGames([...games, game])
      setShowCreateDialog(false)
      setNewGameName("")
      setNewGameMapId("")
      setNewGamePassword("")
      setStatusMessage({ type: "success", text: `Game "${game.name}" created! Join code: ${game.joinCode}` })
    } catch (err) {
      console.error("Failed to create game:", err)
      setStatusMessage({ type: "error", text: "Failed to create game" })
    }
  }

  async function handleStartGame(gameId: string) {
    try {
      const updated = await startGame(gameId)
      setGames(games.map(g => g.id === gameId ? updated : g))
      // Navigate to game view
      navigate(`/game/${gameId}`)
    } catch (err) {
      console.error("Failed to start game:", err)
      setStatusMessage({ type: "error", text: "Failed to start game" })
    }
  }

  async function handleStopGame(gameId: string) {
    try {
      await stopGame(gameId)
      setGames(games.filter(g => g.id !== gameId))
      setStatusMessage({ type: "success", text: "Game stopped" })
    } catch (err) {
      console.error("Failed to stop game:", err)
      setStatusMessage({ type: "error", text: "Failed to stop game" })
    }
  }

  function handleEnterGame(gameId: string) {
    navigate(`/game/${gameId}`)
  }

  const statusColors: Record<string, string> = {
    WAITING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
    RUNNING: "bg-green-500/20 text-green-400 border-green-500/50",
    PAUSED: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    FINISHED: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50"
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex flex-col bg-zinc-900">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <p className="text-zinc-400 mb-4">Please log in to access the game lobby</p>
              <Button onClick={() => navigate("/auth/login")}>
                Log In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-900">
      <Header />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Status message */}
          {statusMessage && (
            <div className={`p-3 rounded text-sm ${
              statusMessage.type === "success"
                ? "bg-green-900/50 text-green-300 border border-green-700"
                : "bg-red-900/50 text-red-300 border border-red-700"
            }`}>
              {statusMessage.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Game
            </Button>
            {/* Join Game - hidden for now, single player only */}
          </div>

          {/* My Games */}
          <Card>
            <CardHeader>
              <CardTitle className="text-zinc-100">My Games</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-zinc-500">Loading...</p>
              ) : games.length === 0 ? (
                <p className="text-zinc-500">No games yet. Create one to get started!</p>
              ) : (
                <div className="space-y-3">
                  {games.map(game => (
                    <div
                      key={game.id}
                      className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg border border-zinc-700"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-zinc-100">{game.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[game.status]}`}>
                            {game.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(game.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {game.status === "WAITING" && (
                          <Button size="sm" onClick={() => handleStartGame(game.id)}>
                            <Play className="w-4 h-4 mr-1" />
                            Start
                          </Button>
                        )}
                        {(game.status === "RUNNING" || game.status === "PAUSED") && (
                          <Button size="sm" onClick={() => handleEnterGame(game.id)}>
                            <Play className="w-4 h-4 mr-1" />
                            Enter
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => handleStopGame(game.id)}>
                          <Square className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Game Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-zinc-100">Create New Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Game Name</label>
                <input
                  type="text"
                  value={newGameName}
                  onChange={e => setNewGameName(e.target.value)}
                  placeholder="My Awesome Game"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Select Map</label>
                <select
                  value={newGameMapId}
                  onChange={e => setNewGameMapId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Choose a map...</option>
                  {maps.map(map => (
                    <option key={map.id} value={map.id}>{map.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Password (optional)</label>
                <input
                  type="password"
                  value={newGamePassword}
                  onChange={e => setNewGamePassword(e.target.value)}
                  placeholder="Leave empty for no password"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleCreateGame} className="flex-1">
                  Create Game
                </Button>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Join Game Dialog - hidden for now, single player only */}
    </div>
  )
}
