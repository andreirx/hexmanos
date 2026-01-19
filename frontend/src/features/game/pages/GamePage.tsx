import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import Phaser from "phaser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { useAuth } from "@/context/AuthContext"
import { getGame, takeOverCharacter, relinquishCharacter, pauseGame, stopGame } from "@/api/games"
import { getAssetFile, getAssetById, getAssetFileUrl } from "@/api/assets"
import { ArrowLeft, Pause, Square, User, Heart } from "lucide-react"
import type { GameDTO, GameCharacterDTO } from "@/api/types"
import {
  getVariationFromSeed,
  getTransitionDirections,
  getNeighborPosition,
  calculatePathVariation,
  ALL_DIRECTIONS,
  getMoveTarget,
  isInBounds
} from "@/features/maps/lib/map-logic"

// Match the editor's tile size (128px)
const TILE_SIZE = 128

// ============================================
// Asset Loading & Caching Types
// ============================================

interface TileProperties {
  name: string
  tileSize: number
  passable: boolean
  variations: number
  tileType?: "TILE" | "PATH"
  terrainType?: "LAND" | "WATER"
}

interface EntityDefinition {
  name: string
  spriteSize: number
  entityType?: "CHARACTER" | "OBJECT"
  visualStates?: string[]
  states: Record<string, { frames: number; loop: boolean }>
}

interface MapTile {
  tileAssetId: string
  seed: number
}

interface MapPath {
  pathAssetId: string
}

interface MapCharacter {
  characterAssetId: string
  x: number
  y: number
}

interface MapData {
  name: string
  width: number
  height: number
  tileSize: number
  layers: {
    terrain: (MapTile | null)[][]
    paths: (MapPath | null)[][]
  }
  characters: MapCharacter[]
}


// ============================================
// Phaser Game Scene
// ============================================

class GameScene extends Phaser.Scene {
  private mapData: MapData | null = null
  private characters: GameCharacterDTO[] = []
  private characterSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  private onCharacterClick: ((characterId: string) => void) | null = null
  private onCharacterMove: ((characterId: string, x: number, y: number) => void) | null = null

  // Asset data
  private assetMap: Map<string, { storageKeyPrefix: string }> = new Map()
  private tileProperties: Map<string, TileProperties> = new Map()
  private entityDefinitions: Map<string, EntityDefinition> = new Map()

  // Character control state
  private controlledCharacterId: string | null = null
  private moveDebounceTime = 150 // ms between moves
  private lastMoveTime = 0

  constructor() {
    super({ key: "GameScene" })
  }

  init(data: {
    mapData: MapData
    characters: GameCharacterDTO[]
    assetMap: Map<string, { storageKeyPrefix: string }>
    tileProperties: Map<string, TileProperties>
    entityDefinitions: Map<string, EntityDefinition>
    onCharacterClick: (characterId: string) => void
    onCharacterMove: (characterId: string, x: number, y: number) => void
  }) {
    this.mapData = data.mapData
    this.characters = data.characters
    this.assetMap = data.assetMap
    this.tileProperties = data.tileProperties
    this.entityDefinitions = data.entityDefinitions
    this.onCharacterClick = data.onCharacterClick
    this.onCharacterMove = data.onCharacterMove
  }

  preload() {
    if (!this.mapData) return

    const { width, height, layers } = this.mapData

    // Collect all unique asset IDs
    const terrainAssetIds = new Set<string>()
    const pathAssetIds = new Set<string>()
    const characterAssetIds = new Set<string>()

    // Scan terrain layer
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = layers.terrain[y]?.[x]
        if (tile?.tileAssetId) {
          terrainAssetIds.add(tile.tileAssetId)
        }
        const path = layers.paths[y]?.[x]
        if (path?.pathAssetId) {
          pathAssetIds.add(path.pathAssetId)
        }
      }
    }

    // Collect character asset IDs
    this.characters.forEach(c => characterAssetIds.add(c.assetId))

    // Load terrain tiles: base + 8 transitions for each
    terrainAssetIds.forEach(assetId => {
      const asset = this.assetMap.get(assetId)
      if (!asset) return

      const props = this.tileProperties.get(assetId)
      const variations = props?.variations ?? 1

      // Load all variations of base tile
      for (let v = 0; v < variations; v++) {
        const key = `terrain_${assetId}_${v}`
        const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${v}.png`)
        this.load.image(key, url)
      }

      // Load all 8 transition images (always from tile_0)
      ALL_DIRECTIONS.forEach(dir => {
        const key = `transition_${assetId}_${dir}`
        const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_0_transition_${dir}.png`)
        this.load.image(key, url)
      })
    })

    // Load path tiles: all 15 variations (0-14) for each
    pathAssetIds.forEach(assetId => {
      const asset = this.assetMap.get(assetId)
      if (!asset) return

      for (let v = 0; v < 15; v++) {
        const key = `path_${assetId}_${v}`
        const url = getAssetFileUrl(asset.storageKeyPrefix, `tile_${v}.png`)
        this.load.image(key, url)
      }
    })

    // Load character/object sprites
    characterAssetIds.forEach(assetId => {
      const asset = this.assetMap.get(assetId)
      if (!asset) return

      const def = this.entityDefinitions.get(assetId)
      let fileName: string
      if (def?.visualStates && def.visualStates.length > 0) {
        const firstVs = def.visualStates[0]
        fileName = `${firstVs}_idle_0.png`
      } else {
        fileName = "idle_0.png"
      }

      const key = `char_${assetId}`
      const url = getAssetFileUrl(asset.storageKeyPrefix, fileName)
      this.load.image(key, url)
    })
  }

  create() {
    if (!this.mapData) return

    const { width, height, layers } = this.mapData

    // PASS 1: Draw base terrain tiles
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = layers.terrain[y]?.[x]
        if (!tile) continue

        const props = this.tileProperties.get(tile.tileAssetId)
        const variations = props?.variations ?? 1
        const variation = getVariationFromSeed(tile.seed, variations)
        const key = `terrain_${tile.tileAssetId}_${variation}`

        if (this.textures.exists(key)) {
          this.add.image(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            key
          )
        }
      }
    }

    // PASS 2: Draw transitions (Stacking Algorithm)
    // Uses shared getTransitionDirections() to determine where to project transitions
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = layers.terrain[y]?.[x]
        if (!tile) continue

        // Get directions where this tile should project transitions
        const directions = getTransitionDirections(x, y, width, height, layers.terrain)

        // Draw transition for each direction
        for (const dir of directions) {
          const { nx, ny } = getNeighborPosition(x, y, dir)
          const key = `transition_${tile.tileAssetId}_${dir}`

          if (this.textures.exists(key)) {
            this.add.image(
              nx * TILE_SIZE + TILE_SIZE / 2,
              ny * TILE_SIZE + TILE_SIZE / 2,
              key
            )
          }
        }
      }
    }

    // PASS 3: Draw paths (WATER first, then LAND for bridges)
    const drawPathsOfTerrainType = (targetTerrainType: "LAND" | "WATER" | undefined) => {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const path = layers.paths[y]?.[x]
          if (!path) continue

          const pathProps = this.tileProperties.get(path.pathAssetId)
          const pathTerrainType = pathProps?.terrainType || "LAND"

          // Skip if not the terrain type we're drawing
          if (targetTerrainType === "WATER" && pathTerrainType !== "WATER") continue
          if (targetTerrainType === "LAND" && pathTerrainType === "WATER") continue

          const variation = calculatePathVariation(
            x, y, width, height, layers.paths, path.pathAssetId
          )
          const key = `path_${path.pathAssetId}_${variation}`

          if (this.textures.exists(key)) {
            this.add.image(
              x * TILE_SIZE + TILE_SIZE / 2,
              y * TILE_SIZE + TILE_SIZE / 2,
              key
            )
          }
        }
      }
    }

    drawPathsOfTerrainType("WATER")
    drawPathsOfTerrainType("LAND")

    // PASS 4: Draw characters
    this.characters.forEach(char => {
      const key = `char_${char.assetId}`
      if (this.textures.exists(key)) {
        const sprite = this.add.sprite(
          char.x * TILE_SIZE + TILE_SIZE / 2,
          char.y * TILE_SIZE + TILE_SIZE / 2,
          key
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
    const mapWidth = width * TILE_SIZE
    const mapHeight = height * TILE_SIZE
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight)

    // Start zoomed out to fit the map, center on map
    this.cameras.main.setZoom(0.25)
    this.cameras.main.centerOn(mapWidth / 2, mapHeight / 2)

    // Add keyboard controls
    const cursors = this.input.keyboard?.createCursorKeys()
    const wasd = {
      W: this.input.keyboard?.addKey("W"),
      A: this.input.keyboard?.addKey("A"),
      S: this.input.keyboard?.addKey("S"),
      D: this.input.keyboard?.addKey("D"),
    }

    // Movement/camera control in update loop
    this.events.on("update", () => {
      const cam = this.cameras.main
      const now = Date.now()

      // When controlling a character: move character with WASD/arrows
      if (this.controlledCharacterId && this.mapData) {
        const char = this.characters.find(c => c.id === this.controlledCharacterId)
        if (char && now - this.lastMoveTime > this.moveDebounceTime) {
          let direction: "n" | "s" | "e" | "w" | null = null

          if (cursors?.up?.isDown || wasd.W?.isDown) direction = "n"
          else if (cursors?.down?.isDown || wasd.S?.isDown) direction = "s"
          else if (cursors?.left?.isDown || wasd.A?.isDown) direction = "w"
          else if (cursors?.right?.isDown || wasd.D?.isDown) direction = "e"

          if (direction) {
            const target = getMoveTarget(char.x, char.y, direction)
            if (isInBounds(target.x, target.y, this.mapData.width, this.mapData.height)) {
              // Update local position
              char.x = target.x
              char.y = target.y
              this.lastMoveTime = now

              // Update sprite position
              const sprite = this.characterSprites.get(char.id)
              if (sprite) {
                sprite.setPosition(
                  target.x * TILE_SIZE + TILE_SIZE / 2,
                  target.y * TILE_SIZE + TILE_SIZE / 2
                )
              }

              // Notify parent component
              if (this.onCharacterMove) {
                this.onCharacterMove(char.id, target.x, target.y)
              }
            }
          }
        }
      } else {
        // No character controlled: pan camera with WASD/arrows
        const speed = 16
        if (cursors?.left?.isDown || wasd.A?.isDown) cam.scrollX -= speed
        if (cursors?.right?.isDown || wasd.D?.isDown) cam.scrollX += speed
        if (cursors?.up?.isDown || wasd.W?.isDown) cam.scrollY -= speed
        if (cursors?.down?.isDown || wasd.S?.isDown) cam.scrollY += speed
      }
    })

    // Mouse wheel zoom
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      const cam = this.cameras.main
      const zoomFactor = 1.1
      if (deltaY < 0) {
        cam.zoom = Math.min(2, cam.zoom * zoomFactor)
      } else {
        cam.zoom = Math.max(0.1, cam.zoom / zoomFactor)
      }
    })
  }

  // Set controlled character - centers camera on character and zooms in
  setControlledCharacter(characterId: string) {
    this.controlledCharacterId = characterId

    // Find character and center camera on them
    const char = this.characters.find(c => c.id === characterId)
    if (char) {
      const cam = this.cameras.main
      const sprite = this.characterSprites.get(characterId)

      // Zoom in and center on character
      cam.setZoom(1)
      cam.centerOn(
        char.x * TILE_SIZE + TILE_SIZE / 2,
        char.y * TILE_SIZE + TILE_SIZE / 2
      )

      // Start following the character sprite
      if (sprite) {
        cam.startFollow(sprite, true, 0.1, 0.1)
      }
    }
  }

  // Clear controlled character - zooms out to show whole map
  clearControlledCharacter() {
    this.controlledCharacterId = null

    if (this.mapData) {
      const cam = this.cameras.main
      const mapWidth = this.mapData.width * TILE_SIZE
      const mapHeight = this.mapData.height * TILE_SIZE

      // Stop following any sprite
      cam.stopFollow()

      // Zoom out and center on map
      cam.setZoom(0.25)
      cam.centerOn(mapWidth / 2, mapHeight / 2)
    }
  }

  updateCharacters(characters: GameCharacterDTO[]) {
    characters.forEach(char => {
      const sprite = this.characterSprites.get(char.id)
      if (sprite) {
        sprite.setPosition(
          char.x * TILE_SIZE + TILE_SIZE / 2,
          char.y * TILE_SIZE + TILE_SIZE / 2
        )
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

// ============================================
// React Component
// ============================================

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user: authUser } = useAuth()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const phaserGameRef = useRef<Phaser.Game | null>(null)
  const initializingRef = useRef(false) // Prevent double init from Strict Mode

  const [game, setGame] = useState<GameDTO | null>(null)
  const [mapData, setMapData] = useState<MapData | null>(null)
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
        const mapJson = await getAssetFile<MapData>(mapAsset.storageKeyPrefix, "map.json")
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
    if (!mapData || !game || !gameContainerRef.current) return

    // Prevent double initialization from React Strict Mode
    if (phaserGameRef.current || initializingRef.current) return
    initializingRef.current = true

    async function initPhaser() {
      // Collect all unique asset IDs
      const allAssetIds = new Set<string>()

      // From terrain
      for (const row of mapData!.layers.terrain) {
        for (const tile of row) {
          if (tile?.tileAssetId) allAssetIds.add(tile.tileAssetId)
        }
      }

      // From paths
      for (const row of mapData!.layers.paths) {
        for (const path of row) {
          if (path?.pathAssetId) allAssetIds.add(path.pathAssetId)
        }
      }

      // From characters
      game!.characters.forEach(c => allAssetIds.add(c.assetId))

      // Load asset metadata and properties
      const assetMap = new Map<string, { storageKeyPrefix: string }>()
      const tileProperties = new Map<string, TileProperties>()
      const entityDefinitions = new Map<string, EntityDefinition>()

      await Promise.all(
        Array.from(allAssetIds).map(async (assetId) => {
          try {
            const asset = await getAssetById(assetId)
            assetMap.set(assetId, { storageKeyPrefix: asset.storageKeyPrefix })

            // Try to load properties (for tiles/paths)
            try {
              const props = await getAssetFile<TileProperties>(asset.storageKeyPrefix, "properties.json")
              tileProperties.set(assetId, props)
            } catch {
              // Not a tile asset, try definition.json for characters/objects
              try {
                const def = await getAssetFile<EntityDefinition>(asset.storageKeyPrefix, "definition.json")
                entityDefinitions.set(assetId, def)
              } catch {
                // Neither - that's ok
              }
            }
          } catch (err) {
            console.warn(`Failed to load asset ${assetId}:`, err)
          }
        })
      )

      // Create Phaser game
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: gameContainerRef.current!,
        width: gameContainerRef.current!.clientWidth,
        height: gameContainerRef.current!.clientHeight,
        backgroundColor: "#1a1a2e",
        pixelArt: true,
        scene: GameScene
      }

      const phaserGame = new Phaser.Game(config)
      phaserGameRef.current = phaserGame

      // Start scene with data
      phaserGame.scene.start("GameScene", {
        mapData: mapData!,
        characters: game!.characters,
        assetMap,
        tileProperties,
        entityDefinitions,
        onCharacterClick: (characterId: string) => {
          setSelectedCharacter(characterId)
        },
        onCharacterMove: (characterId: string, x: number, y: number) => {
          // TODO: Send movement to backend via WebSocket or API
          console.log(`Character ${characterId} moved to (${x}, ${y})`)
        }
      })
    }

    initPhaser()

    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true)
        phaserGameRef.current = null
      }
      initializingRef.current = false
    }
  }, [mapData, game])

  async function handleTakeOver() {
    if (!gameId || !selectedCharacter) return

    try {
      await takeOverCharacter(gameId, selectedCharacter)
      setControlledCharacterId(selectedCharacter)
      const updated = await getGame(gameId)
      setGame(updated)
      const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
      if (scene) {
        scene.updateCharacters(updated.characters)
        scene.setControlledCharacter(selectedCharacter)
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
      const updated = await getGame(gameId)
      setGame(updated)
      const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
      if (scene) {
        scene.updateCharacters(updated.characters)
        scene.clearControlledCharacter()
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
          <Card className="max-w-md bg-zinc-800 border-zinc-700">
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
          <Card className="max-w-md bg-zinc-800 border-zinc-700">
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

          {/* Controls hint */}
          <div className="mt-auto text-xs text-zinc-500">
            {controlledCharacterId ? (
              <>
                <p className="text-green-400">WASD / Arrows: Move character</p>
                <p>Camera follows character</p>
              </>
            ) : (
              <p>WASD / Arrows: Pan camera</p>
            )}
            <p>Mouse wheel: Zoom</p>
            <p>Click character: Select</p>
          </div>
        </div>

        {/* Main game area */}
        <div className="flex-1 flex items-center justify-center bg-zinc-950 p-0">
          <div
            ref={gameContainerRef}
            className="w-full h-full"
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
