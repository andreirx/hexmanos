import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import Phaser from "phaser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { useAuth } from "@/context/AuthContext"
import { getGame, takeOverCharacter, relinquishCharacter, pauseGame, stopGame } from "@/api/games"
import { getAssetFile, getAssetById, getTileThumbnailUrl, getEntityThumbnailUrl } from "@/api/assets"
import { ArrowLeft, Pause, Square, User, Heart } from "lucide-react"
import type { GameDTO, GameCharacterDTO } from "@/api/types"

const TILE_SIZE = 32

class GameScene extends Phaser.Scene {
  private mapData: any = null
  private characters: GameCharacterDTO[] = []
  private characterSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  private tileImages: Map<string, HTMLImageElement> = new Map()
  private characterImages: Map<string, HTMLImageElement> = new Map()
  private onCharacterClick: ((characterId: string) => void) | null = null

  constructor() {
    super({ key: "GameScene" })
  }

  init(data: {
    mapData: any
    characters: GameCharacterDTO[]
    tileImages: Map<string, HTMLImageElement>
    characterImages: Map<string, HTMLImageElement>
    onCharacterClick: (characterId: string) => void
  }) {
    this.mapData = data.mapData
    this.characters = data.characters
    this.tileImages = data.tileImages
    this.characterImages = data.characterImages
    this.onCharacterClick = data.onCharacterClick
  }

  preload() {
    // Load tile textures
    this.tileImages.forEach((img, assetId) => {
      if (!this.textures.exists(`tile_${assetId}`)) {
        this.textures.addImage(`tile_${assetId}`, img)
      }
    })

    // Load character textures
    this.characterImages.forEach((img, assetId) => {
      if (!this.textures.exists(`char_${assetId}`)) {
        this.textures.addImage(`char_${assetId}`, img)
      }
    })
  }

  create() {
    // Draw terrain layer
    if (this.mapData?.layers?.terrain) {
      const terrain = this.mapData.layers.terrain
      for (let y = 0; y < terrain.length; y++) {
        for (let x = 0; x < terrain[y].length; x++) {
          const tile = terrain[y][x]
          if (tile && tile.tileAssetId) {
            const textureKey = `tile_${tile.tileAssetId}`
            if (this.textures.exists(textureKey)) {
              this.add.image(
                x * TILE_SIZE + TILE_SIZE / 2,
                y * TILE_SIZE + TILE_SIZE / 2,
                textureKey
              )
            }
          }
        }
      }
    }

    // Draw characters
    this.characters.forEach(char => {
      const textureKey = `char_${char.assetId}`
      if (this.textures.exists(textureKey)) {
        const sprite = this.add.sprite(
          char.x * TILE_SIZE + TILE_SIZE / 2,
          char.y * TILE_SIZE + TILE_SIZE / 2,
          textureKey
        )
        sprite.setInteractive({ useHandCursor: true })
        sprite.on("pointerdown", () => {
          if (this.onCharacterClick) {
            this.onCharacterClick(char.id)
          }
        })

        // Highlight controlled characters
        if (char.controlled) {
          sprite.setTint(0x00ff00)
        }

        this.characterSprites.set(char.id, sprite)
      }
    })

    // Set up camera
    const mapWidth = (this.mapData?.width || 20) * TILE_SIZE
    const mapHeight = (this.mapData?.height || 15) * TILE_SIZE
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight)

    // Add WASD controls for camera pan
    const cursors = this.input.keyboard?.createCursorKeys()
    if (cursors) {
      this.input.keyboard?.on("keydown", () => {
        const cam = this.cameras.main
        const speed = 8
        if (cursors.left?.isDown || this.input.keyboard?.checkDown(this.input.keyboard.addKey("A"))) {
          cam.scrollX -= speed
        }
        if (cursors.right?.isDown || this.input.keyboard?.checkDown(this.input.keyboard.addKey("D"))) {
          cam.scrollX += speed
        }
        if (cursors.up?.isDown || this.input.keyboard?.checkDown(this.input.keyboard.addKey("W"))) {
          cam.scrollY -= speed
        }
        if (cursors.down?.isDown || this.input.keyboard?.checkDown(this.input.keyboard.addKey("S"))) {
          cam.scrollY += speed
        }
      })
    }
  }

  updateCharacters(characters: GameCharacterDTO[]) {
    characters.forEach(char => {
      const sprite = this.characterSprites.get(char.id)
      if (sprite) {
        // Update position
        sprite.setPosition(
          char.x * TILE_SIZE + TILE_SIZE / 2,
          char.y * TILE_SIZE + TILE_SIZE / 2
        )
        // Update tint based on control status
        if (char.controlled) {
          sprite.setTint(0x00ff00)
        } else {
          sprite.clearTint()
        }
      }
    })
    this.characters = characters
  }
}

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user: authUser } = useAuth()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const phaserGameRef = useRef<Phaser.Game | null>(null)

  const [game, setGame] = useState<GameDTO | null>(null)
  const [mapData, setMapData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [controlledCharacterId, setControlledCharacterId] = useState<string | null>(null)

  // Load game data
  useEffect(() => {
    if (!gameId) return

    async function loadGame() {
      try {
        setIsLoading(true)
        const gameData = await getGame(gameId!)
        setGame(gameData)

        // Find if current user controls a character
        const currentPlayer = gameData.players.find(p =>
          authUser && p.playerId === authUser.userId
        )
        if (currentPlayer?.controlledCharacterId) {
          setControlledCharacterId(currentPlayer.controlledCharacterId)
        }

        // Load map data
        const mapAsset = await getAssetById(gameData.mapAssetId)
        const mapJson = await getAssetFile<any>(mapAsset.storageKeyPrefix, "map.json")
        setMapData(mapJson)
      } catch (err) {
        console.error("Failed to load game:", err)
        setError("Failed to load game")
      } finally {
        setIsLoading(false)
      }
    }

    loadGame()
  }, [gameId, authUser])

  // Initialize Phaser when map data is loaded
  useEffect(() => {
    if (!mapData || !game || !gameContainerRef.current || phaserGameRef.current) return

    async function initPhaser() {
      // Load tile images
      const tileImages = new Map<string, HTMLImageElement>()
      const characterImages = new Map<string, HTMLImageElement>()

      // Get unique tile asset IDs from terrain layer
      const tileAssetIds = new Set<string>()
      if (mapData.layers?.terrain) {
        for (const row of mapData.layers.terrain) {
          for (const tile of row) {
            if (tile?.tileAssetId) {
              tileAssetIds.add(tile.tileAssetId)
            }
          }
        }
      }

      // Load tile images
      for (const assetId of tileAssetIds) {
        try {
          const tileAsset = await getAssetById(assetId)
          const url = getTileThumbnailUrl(tileAsset.storageKeyPrefix)
          const img = new Image()
          img.crossOrigin = "anonymous"
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = reject
            img.src = url
          })
          tileImages.set(assetId, img)
        } catch (err) {
          console.warn(`Failed to load tile ${assetId}:`, err)
        }
      }

      // Get unique character asset IDs (includes both CHARACTER and OBJECT types)
      const charAssetIds = new Set(game!.characters.map(c => c.assetId))
      for (const assetId of charAssetIds) {
        try {
          const charAsset = await getAssetById(assetId)
          const url = await getEntityThumbnailUrl(charAsset.storageKeyPrefix)
          const img = new Image()
          img.crossOrigin = "anonymous"
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = reject
            img.src = url
          })
          characterImages.set(assetId, img)
        } catch (err) {
          console.warn(`Failed to load character ${assetId}:`, err)
        }
      }

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: gameContainerRef.current!,
        width: Math.min((mapData.width || 20) * TILE_SIZE, 800),
        height: Math.min((mapData.height || 15) * TILE_SIZE, 600),
        backgroundColor: "#1a1a1a",
        pixelArt: true,
        scene: GameScene
      }

      const phaserGame = new Phaser.Game(config)
      phaserGameRef.current = phaserGame

      // Start scene with data
      phaserGame.scene.start("GameScene", {
        mapData,
        characters: game!.characters,
        tileImages,
        characterImages,
        onCharacterClick: (characterId: string) => {
          setSelectedCharacter(characterId)
        }
      })
    }

    initPhaser()

    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true)
        phaserGameRef.current = null
      }
    }
  }, [mapData, game])

  async function handleTakeOver() {
    if (!gameId || !selectedCharacter) return

    try {
      await takeOverCharacter(gameId, selectedCharacter)
      setControlledCharacterId(selectedCharacter)
      // Refresh game state
      const updated = await getGame(gameId)
      setGame(updated)
      // Update Phaser scene
      const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
      if (scene) {
        scene.updateCharacters(updated.characters)
      }
    } catch (err) {
      console.error("Failed to take over character:", err)
    }
  }

  async function handleRelinquish() {
    if (!gameId) return

    try {
      await relinquishCharacter(gameId)
      setControlledCharacterId(null)
      // Refresh game state
      const updated = await getGame(gameId)
      setGame(updated)
      // Update Phaser scene
      const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
      if (scene) {
        scene.updateCharacters(updated.characters)
      }
    } catch (err) {
      console.error("Failed to relinquish character:", err)
    }
  }

  async function handlePause() {
    if (!gameId) return
    try {
      const updated = await pauseGame(gameId)
      setGame(updated)
    } catch (err) {
      console.error("Failed to pause game:", err)
    }
  }

  async function handleStop() {
    if (!gameId) return
    try {
      await stopGame(gameId)
      navigate("/lobby")
    } catch (err) {
      console.error("Failed to stop game:", err)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex flex-col bg-zinc-900">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <p className="text-zinc-400 mb-4">Please log in to play</p>
              <Button onClick={() => navigate("/auth/login")}>Log In</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-zinc-900">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-400">Loading game...</p>
        </div>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="h-screen flex flex-col bg-zinc-900">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <p className="text-red-400 mb-4">{error || "Game not found"}</p>
              <Button onClick={() => navigate("/lobby")}>Back to Lobby</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const selectedChar = game.characters.find(c => c.id === selectedCharacter)

  return (
    <div className="h-screen flex flex-col bg-zinc-900">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Game controls */}
        <div className="w-64 bg-zinc-800 border-r border-zinc-700 p-4 flex flex-col gap-4">
          <Button variant="outline" onClick={() => navigate("/lobby")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Lobby
          </Button>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">{game.name}</h2>
            <span className={`px-2 py-0.5 text-xs rounded-full border ${
              game.status === "RUNNING"
                ? "bg-green-500/20 text-green-400 border-green-500/50"
                : game.status === "PAUSED"
                ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                : "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
            }`}>
              {game.status}
            </span>
          </div>

          <div className="flex gap-2">
            {game.status === "RUNNING" && (
              <Button size="sm" onClick={handlePause}>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={handleStop}>
              <Square className="w-4 h-4 mr-1" />
              Stop
            </Button>
          </div>

          {/* Players */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm text-zinc-100">Players ({game.players.length})</CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <ul className="space-y-1 text-sm text-zinc-400">
                {game.players.map(player => (
                  <li key={player.id} className="flex items-center gap-2">
                    <User className="w-3 h-3" />
                    <span className={player.role === "HOST" ? "text-yellow-400" : "text-zinc-300"}>
                      {player.role}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Character control */}
          {controlledCharacterId ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm text-zinc-100">Controlling</CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3">
                {(() => {
                  const char = game.characters.find(c => c.id === controlledCharacterId)
                  return char ? (
                    <div className="space-y-2">
                      <p className="text-zinc-100">{char.name}</p>
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Heart className="w-3 h-3 text-red-400" />
                        {char.health}/{char.maxHealth}
                      </div>
                      <Button size="sm" variant="outline" onClick={handleRelinquish}>
                        Release
                      </Button>
                    </div>
                  ) : null
                })()}
              </CardContent>
            </Card>
          ) : selectedChar && !selectedChar.controlled ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm text-zinc-100">Selected: {selectedChar.name}</CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Heart className="w-3 h-3 text-red-400" />
                    {selectedChar.health}/{selectedChar.maxHealth}
                  </div>
                  <Button size="sm" onClick={handleTakeOver}>
                    Take Control
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Main game area */}
        <div className="flex-1 flex items-center justify-center bg-zinc-950 p-4">
          <div
            ref={gameContainerRef}
            className="border border-zinc-700 rounded-lg overflow-hidden"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Right sidebar - Characters */}
        <div className="w-64 bg-zinc-800 border-l border-zinc-700 p-4">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">
            Characters ({game.characters.length})
          </h3>
          <div className="space-y-2">
            {game.characters.map(char => (
              <div
                key={char.id}
                onClick={() => setSelectedCharacter(char.id)}
                className={`p-2 rounded border cursor-pointer transition-colors ${
                  selectedCharacter === char.id
                    ? "bg-zinc-700 border-blue-500"
                    : "bg-zinc-800 border-zinc-700 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-100">{char.name}</span>
                  {char.controlled && (
                    <span className="text-xs text-green-400">Controlled</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                  <Heart className="w-3 h-3 text-red-400" />
                  {char.health}/{char.maxHealth}
                  <span className="ml-auto">({char.x}, {char.y})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
