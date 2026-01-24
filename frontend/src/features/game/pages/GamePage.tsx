import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import Phaser from "phaser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { useAuth } from "@/context/AuthContext"
import { getGame, takeOverCharacter, relinquishCharacter, pauseGame, stopGame } from "@/api/games"
import { getAssetFile, getAssetById, getAssetFileUrl } from "@/api/assets"
import { useGameWebSocket } from "@/hooks/useGameWebSocket"
import type { CharacterMoveEvent, PathStartEvent } from "@/hooks/useGameWebSocket"
import { ArrowLeft, Pause, Square, User, Heart, Wifi, WifiOff } from "lucide-react"
import type { GameDTO, GameCharacterDTO } from "@/api/types"
import {
  getVariationFromSeed,
  getTransitionDirections,
  getNeighborPosition,
  calculatePathVariation,
  ALL_DIRECTIONS
} from "@/features/maps/lib/map-logic"

// Match the editor's tile size (128px)
const TILE_SIZE = 128

// Mipmap levels for different zoom ranges
type MipLevel = "full" | "mip64" | "mip32"
const getMipLevel = (zoom: number): MipLevel => {
  if (zoom >= 0.6) return "full"
  if (zoom >= 0.3) return "mip64"
  return "mip32"
}
const getMipSuffix = (level: MipLevel): string => {
  if (level === "full") return ""
  return `-${level}`
}

// 8 player colors (index 0-7)
const PLAYER_COLORS = [
  0xff4444, // Red
  0x44ff44, // Green
  0x4444ff, // Blue
  0xffff44, // Yellow
  0xff44ff, // Magenta
  0x44ffff, // Cyan
  0xff8844, // Orange
  0x8844ff, // Purple
]

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
  movementCost?: number  // 1=easy (default), 2=normal, 3+=difficult, 0=impassable
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
    waterPaths?: (MapPath | null)[][]  // Rivers, moats, lava - renders above terrain
    groundPaths?: (MapPath | null)[][] // Roads, bridges - renders above water paths
    paths?: (MapPath | null)[][]       // Legacy field for backwards compatibility
  }
  characters: MapCharacter[]
}

/**
 * Normalize map data to ensure both waterPaths and groundPaths exist.
 * Handles legacy maps that only have the single "paths" field.
 */
function normalizeMapData(data: MapData): MapData {
  const { width, height, layers } = data

  // If already has new format, return as-is
  if (layers.waterPaths && layers.groundPaths) {
    return data
  }

  // Create empty layers if missing
  const createEmptyLayer = () =>
    Array.from({ length: height }, () =>
      Array.from({ length: width }, () => null)
    )

  const waterPaths = layers.waterPaths ?? createEmptyLayer()
  const groundPaths = layers.groundPaths ?? (layers.paths ? [...layers.paths.map(row => [...row])] : createEmptyLayer())

  return {
    ...data,
    layers: {
      terrain: layers.terrain,
      waterPaths,
      groundPaths
    }
  }
}


// ============================================
// Phaser Game Scene
// ============================================

class GameScene extends Phaser.Scene {
  private mapData: MapData | null = null
  private characters: GameCharacterDTO[] = []
  private characterSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  private movingCharacters: Set<string> = new Set() // Track characters currently animating
  private onCharacterClick: ((characterId: string) => void) | null = null
  private onTileClick: ((x: number, y: number) => void) | null = null
  private onMoveInput: ((direction: "n" | "s" | "e" | "w") => void) | null = null
  private onPathRequest: ((targetX: number, targetY: number) => void) | null = null

  // Path visualization
  private pathGraphics: Phaser.GameObjects.Graphics | null = null

  // Asset data
  private assetMap: Map<string, { storageKeyPrefix: string }> = new Map()
  private tileProperties: Map<string, TileProperties> = new Map()
  private entityDefinitions: Map<string, EntityDefinition> = new Map()

  // Player colors (playerId -> colorIndex)
  private playerColors: Map<string, number> = new Map()
  // Character glow graphics (characterId -> glow graphics)
  private characterGlows: Map<string, Phaser.GameObjects.Graphics> = new Map()
  // Current player's color index (for selection indicator)
  private currentPlayerColorIndex: number = 0

  // Character control state
  private controlledCharacterId: string | null = null
  private selectionIndicator: Phaser.GameObjects.Graphics | null = null
  private moveDebounceTime = 200 // ms between move inputs
  private lastMoveTime = 0
  private moveDuration = 150 // ms for movement animation
  private zoomDuration = 300 // ms for zoom transitions

  // Keyboard controls (initialized in create())
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null
  private wasd: { W: Phaser.Input.Keyboard.Key | null; A: Phaser.Input.Keyboard.Key | null; S: Phaser.Input.Keyboard.Key | null; D: Phaser.Input.Keyboard.Key | null } = { W: null, A: null, S: null, D: null }

  // Mipmap level tracking
  private currentMipLevel: MipLevel = "full"
  private terrainImages: Map<string, { image: Phaser.GameObjects.Image; assetId: string; variation: number }> = new Map()
  private pathImages: Map<string, { image: Phaser.GameObjects.Image; assetId: string; variation: number }> = new Map()

  constructor() {
    super({ key: "GameScene" })
  }

  // Store initial controlled character ID for setup in create()
  private initialControlledCharacterId: string | null = null

  init(data: {
    mapData: MapData
    characters: GameCharacterDTO[]
    players: { playerId: string; colorIndex: number }[]
    currentPlayerId: string
    initialControlledCharacterId: string | null
    assetMap: Map<string, { storageKeyPrefix: string }>
    tileProperties: Map<string, TileProperties>
    entityDefinitions: Map<string, EntityDefinition>
    onCharacterClick: (characterId: string) => void
    onTileClick: (x: number, y: number) => void
    onMoveInput: (direction: "n" | "s" | "e" | "w") => void
    onPathRequest: (targetX: number, targetY: number) => void
  }) {
    this.mapData = data.mapData
    this.characters = data.characters
    this.assetMap = data.assetMap
    this.tileProperties = data.tileProperties
    this.entityDefinitions = data.entityDefinitions
    this.onCharacterClick = data.onCharacterClick
    this.onTileClick = data.onTileClick
    this.onMoveInput = data.onMoveInput
    this.onPathRequest = data.onPathRequest

    // Build player colors map
    this.playerColors.clear()
    data.players.forEach(p => {
      this.playerColors.set(p.playerId, p.colorIndex)
    })

    // Store current player's color index for selection indicator
    this.currentPlayerColorIndex = this.playerColors.get(data.currentPlayerId) ?? 0

    // Store initial controlled character for setup in create()
    this.initialControlledCharacterId = data.initialControlledCharacterId
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
        // Scan water paths
        const waterPath = layers.waterPaths?.[y]?.[x]
        if (waterPath?.pathAssetId) {
          pathAssetIds.add(waterPath.pathAssetId)
        }
        // Scan ground paths
        const groundPath = layers.groundPaths?.[y]?.[x]
        if (groundPath?.pathAssetId) {
          pathAssetIds.add(groundPath.pathAssetId)
        }
      }
    }

    // Collect character asset IDs
    this.characters.forEach(c => characterAssetIds.add(c.assetId))

    // Load terrain tiles: base + 8 transitions for each, plus mipmaps
    const mipSuffixes: MipLevel[] = ["full", "mip64", "mip32"]
    terrainAssetIds.forEach(assetId => {
      const asset = this.assetMap.get(assetId)
      if (!asset) return

      const props = this.tileProperties.get(assetId)
      const variations = props?.variations ?? 1

      // Load all variations of base tile with mipmaps
      for (let v = 0; v < variations; v++) {
        for (const mip of mipSuffixes) {
          const suffix = getMipSuffix(mip)
          const key = `terrain_${assetId}_${v}${suffix ? `_${mip}` : ""}`
          const fileName = `tile_${v}${suffix}.png`
          const url = getAssetFileUrl(asset.storageKeyPrefix, fileName)
          this.load.image(key, url)
        }
      }

      // Load all 8 transition images (always from tile_0) with mipmaps
      ALL_DIRECTIONS.forEach(dir => {
        for (const mip of mipSuffixes) {
          const suffix = getMipSuffix(mip)
          const key = `transition_${assetId}_${dir}${suffix ? `_${mip}` : ""}`
          const fileName = `tile_0_transition_${dir}${suffix}.png`
          const url = getAssetFileUrl(asset.storageKeyPrefix, fileName)
          this.load.image(key, url)
        }
      })
    })

    // Load path tiles: all 15 variations (0-14) for each, with mipmaps
    pathAssetIds.forEach(assetId => {
      const asset = this.assetMap.get(assetId)
      if (!asset) return

      for (let v = 0; v < 15; v++) {
        for (const mip of mipSuffixes) {
          const suffix = getMipSuffix(mip)
          const key = `path_${assetId}_${v}${suffix ? `_${mip}` : ""}`
          const fileName = `tile_${v}${suffix}.png`
          const url = getAssetFileUrl(asset.storageKeyPrefix, fileName)
          this.load.image(key, url)
        }
      }
    })

    // Load character/object sprites - idle and walk frames for animation, with mipmaps
    characterAssetIds.forEach(assetId => {
      const asset = this.assetMap.get(assetId)
      if (!asset) return

      const def = this.entityDefinitions.get(assetId)
      const visualStatePrefix = def?.visualStates?.[0] ? `${def.visualStates[0]}_` : ""

      // Load all idle frames with mipmaps
      const idleFrameCount = def?.states?.idle?.frames ?? 1
      for (let i = 0; i < idleFrameCount; i++) {
        for (const mip of mipSuffixes) {
          const suffix = getMipSuffix(mip)
          const key = `char_${assetId}_idle_${i}${suffix ? `_${mip}` : ""}`
          const fileName = `${visualStatePrefix}idle_${i}${suffix}.png`
          const url = getAssetFileUrl(asset.storageKeyPrefix, fileName)
          this.load.image(key, url)
        }
      }

      // Load walk frames for all directions with mipmaps
      const walkDirections = ["down", "up", "left", "right"] as const
      for (const dir of walkDirections) {
        const walkState = `walk_${dir}`
        const walkFrameCount = def?.states?.[walkState]?.frames ?? 0
        for (let i = 0; i < walkFrameCount; i++) {
          for (const mip of mipSuffixes) {
            const suffix = getMipSuffix(mip)
            const key = `char_${assetId}_${walkState}_${i}${suffix ? `_${mip}` : ""}`
            const fileName = `${visualStatePrefix}${walkState}_${i}${suffix}.png`
            const url = getAssetFileUrl(asset.storageKeyPrefix, fileName)
            this.load.image(key, url)
          }
        }
      }
    })
  }

  create() {
    if (!this.mapData) return

    const { width, height, layers } = this.mapData

    // Determine initial mip level based on starting zoom (0.5)
    this.currentMipLevel = getMipLevel(0.5)
    const mipSuffix = this.currentMipLevel === "full" ? "" : `_${this.currentMipLevel}`

    // PASS 1: Draw base terrain tiles
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = layers.terrain[y]?.[x]
        if (!tile) continue

        const props = this.tileProperties.get(tile.tileAssetId)
        const variations = props?.variations ?? 1
        const variation = getVariationFromSeed(tile.seed, variations)
        const key = `terrain_${tile.tileAssetId}_${variation}${mipSuffix}`

        if (this.textures.exists(key)) {
          const image = this.add.image(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            key
          )
          // Track terrain image for mip level switching
          this.terrainImages.set(`${x},${y}`, { image, assetId: tile.tileAssetId, variation })
        }
      }
    }

    // PASS 2: Draw transitions (Stacking Algorithm) - these don't need tracking
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
          const key = `transition_${tile.tileAssetId}_${dir}${mipSuffix}`

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

    // PASS 3: Draw paths (waterPaths first, then groundPaths for bridges)
    const drawPathLayer = (pathLayer: (MapPath | null)[][] | undefined, layerPrefix: string) => {
      if (!pathLayer) return
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const path = pathLayer[y]?.[x]
          if (!path) continue

          const variation = calculatePathVariation(
            x, y, width, height, pathLayer, path.pathAssetId
          )
          const key = `path_${path.pathAssetId}_${variation}${mipSuffix}`

          if (this.textures.exists(key)) {
            const image = this.add.image(
              x * TILE_SIZE + TILE_SIZE / 2,
              y * TILE_SIZE + TILE_SIZE / 2,
              key
            )
            // Track path image for mip level switching
            this.pathImages.set(`${layerPrefix}_${x},${y}`, { image, assetId: path.pathAssetId, variation })
          }
        }
      }
    }

    // Draw water paths first (rivers, moats, lava)
    drawPathLayer(layers.waterPaths, "water")
    // Draw ground paths on top (roads, bridges)
    drawPathLayer(layers.groundPaths, "ground")

    // Create selection indicator (glowing disc under controlled character)
    this.selectionIndicator = this.add.graphics()
    this.selectionIndicator.setVisible(false)
    this.drawSelectionIndicator()

    // PASS 4: Draw characters with animations
    // Create animations for all mip levels
    const mipLevels: MipLevel[] = ["full", "mip64", "mip32"]

    this.characters.forEach(char => {
      const def = this.entityDefinitions.get(char.assetId)
      const idleFrameCount = def?.states?.idle?.frames ?? 1
      const firstFrameKey = `char_${char.assetId}_idle_0${mipSuffix}`

      // Check if at least the full-size texture exists
      if (!this.textures.exists(`char_${char.assetId}_idle_0`)) return

      // Create idle and walk animations for each mip level
      for (const mipLevel of mipLevels) {
        const mipAnimSuffix = mipLevel === "full" ? "" : `_${mipLevel}`
        const mipTexSuffix = mipLevel === "full" ? "" : `_${mipLevel}`

        // Create idle animation if it doesn't exist and has multiple frames
        const idleAnimKey = `anim_${char.assetId}_idle${mipAnimSuffix}`
        if (idleFrameCount > 1 && !this.anims.exists(idleAnimKey)) {
          const frames: Phaser.Types.Animations.AnimationFrame[] = []
          for (let i = 0; i < idleFrameCount; i++) {
            const frameKey = `char_${char.assetId}_idle_${i}${mipTexSuffix}`
            if (this.textures.exists(frameKey)) {
              frames.push({ key: frameKey })
            }
          }

          if (frames.length > 0) {
            this.anims.create({
              key: idleAnimKey,
              frames: frames,
              frameRate: 4, // 4 FPS for idle animation
              repeat: -1 // Loop forever
            })
          }
        }

        // Create walk animations for all directions
        const walkDirections = ["down", "up", "left", "right"] as const
        for (const dir of walkDirections) {
          const walkState = `walk_${dir}`
          const walkFrameCount = def?.states?.[walkState]?.frames ?? 0
          const walkAnimKey = `anim_${char.assetId}_${walkState}${mipAnimSuffix}`

          if (walkFrameCount > 0 && !this.anims.exists(walkAnimKey)) {
            const frames: Phaser.Types.Animations.AnimationFrame[] = []
            for (let i = 0; i < walkFrameCount; i++) {
              const frameKey = `char_${char.assetId}_${walkState}_${i}${mipTexSuffix}`
              if (this.textures.exists(frameKey)) {
                frames.push({ key: frameKey })
              }
            }

            if (frames.length > 0) {
              this.anims.create({
                key: walkAnimKey,
                frames: frames,
                frameRate: 8, // 8 FPS for walk animation (faster than idle)
                repeat: -1 // Loop while walking
              })
            }
          }
        }
      }

      // Create sprite with first frame using current mip level
      const sprite = this.add.sprite(
        char.x * TILE_SIZE + TILE_SIZE / 2,
        char.y * TILE_SIZE + TILE_SIZE / 2,
        firstFrameKey
      )

      sprite.setInteractive({ useHandCursor: true })
      sprite.on("pointerdown", () => {
        if (this.onCharacterClick) {
          this.onCharacterClick(char.id)
        }
      })

      // Play idle animation if it exists (using current mip level)
      const currentMipAnimSuffix = this.currentMipLevel === "full" ? "" : `_${this.currentMipLevel}`
      const currentIdleAnimKey = `anim_${char.assetId}_idle${currentMipAnimSuffix}`
      if (this.anims.exists(currentIdleAnimKey)) {
        sprite.play(currentIdleAnimKey)
      }

      this.characterSprites.set(char.id, sprite)

      // Create glow graphics for this character
      this.createCharacterGlow(char.id)

      // Initialize glow if character is controlled
      if (char.controlled && char.controlledByPlayerId) {
        this.updateCharacterGlow(char.id, char.controlledByPlayerId)
      }
    })

    // Set up camera
    const mapWidth = width * TILE_SIZE
    const mapHeight = height * TILE_SIZE
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight)

    // Start zoomed out to fit the map, center on map
    this.cameras.main.setZoom(0.5)
    this.cameras.main.centerOn(mapWidth / 2, mapHeight / 2)

    // Initialize keyboard controls as class properties
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null
    this.wasd = {
      W: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W) ?? null,
      A: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A) ?? null,
      S: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S) ?? null,
      D: this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D) ?? null,
    }

    // Mouse wheel zoom
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      const cam = this.cameras.main
      const zoomFactor = 1.1
      if (deltaY < 0) {
        cam.zoom = Math.min(2, cam.zoom * zoomFactor)
      } else {
        cam.zoom = Math.max(0.1, cam.zoom / zoomFactor)
      }

      // Switch mip level based on new zoom
      const newMipLevel = getMipLevel(cam.zoom)
      this.switchMipLevel(newMipLevel)
    })

    // Background click handler (for clicking on empty tiles)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Calculate tile coordinates from world position
      const tileX = Math.floor(pointer.worldX / TILE_SIZE)
      const tileY = Math.floor(pointer.worldY / TILE_SIZE)

      // Check if within map bounds
      if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) return

      // Handle left click (button 0)
      if (pointer.button === 0) {
        // Check if there's a character at this position
        const charAtTile = this.characters.find(c => c.x === tileX && c.y === tileY)
        if (charAtTile) {
          // Character click is handled by sprite click handler - don't double handle
          return
        }

        // Empty tile clicked - notify React (releases control)
        if (this.onTileClick) {
          this.onTileClick(tileX, tileY)
        }
      }
      // Handle right click (button 2) - path request
      else if (pointer.button === 2) {
        // Only request path if we have a controlled character
        if (this.controlledCharacterId && this.onPathRequest) {
          this.onPathRequest(tileX, tileY)
        }
      }
    })

    // Disable context menu on right-click
    this.input.mouse?.disableContextMenu()

    // Create path graphics for visualization (renders above everything)
    this.pathGraphics = this.add.graphics()
    this.pathGraphics.setDepth(1000) // High depth to render above characters

    // Set up initial controlled character if player was already controlling one
    if (this.initialControlledCharacterId) {
      // Use a small delay to ensure everything is fully initialized
      this.time.delayedCall(100, () => {
        if (this.initialControlledCharacterId) {
          this.setControlledCharacter(this.initialControlledCharacterId)
        }
      })
    }
  }

  // Draw the selection indicator (soft glowing disc) using current player's color
  private drawSelectionIndicator() {
    if (!this.selectionIndicator) return

    this.selectionIndicator.clear()

    // Use current player's color
    const playerColor = PLAYER_COLORS[this.currentPlayerColorIndex]

    // Draw multiple concentric circles for a soft glow effect
    const radius = TILE_SIZE * 0.6
    const layers = [
      { alpha: 0.1, r: radius * 1.4 },
      { alpha: 0.15, r: radius * 1.2 },
      { alpha: 0.2, r: radius },
      { alpha: 0.3, r: radius * 0.8 },
    ]

    layers.forEach(({ alpha, r }) => {
      this.selectionIndicator!.fillStyle(playerColor, alpha)
      this.selectionIndicator!.fillCircle(0, 0, r)
    })
  }

  // Position the selection indicator under a character
  private positionSelectionIndicator(x: number, y: number) {
    if (this.selectionIndicator) {
      this.selectionIndicator.setPosition(x, y)
      this.selectionIndicator.setVisible(true)
    }
  }

  // Switch texture mip levels based on zoom
  private switchMipLevel(newLevel: MipLevel) {
    if (newLevel === this.currentMipLevel) return

    const oldSuffix = this.currentMipLevel === "full" ? "" : `_${this.currentMipLevel}`
    const newSuffix = newLevel === "full" ? "" : `_${newLevel}`

    // Update terrain images
    this.terrainImages.forEach(({ image, assetId, variation }) => {
      const newKey = `terrain_${assetId}_${variation}${newSuffix}`
      if (this.textures.exists(newKey)) {
        image.setTexture(newKey)
      }
    })

    // Update path images
    this.pathImages.forEach(({ image, assetId, variation }) => {
      const newKey = `path_${assetId}_${variation}${newSuffix}`
      if (this.textures.exists(newKey)) {
        image.setTexture(newKey)
      }
    })

    // Update character sprites (animations need special handling)
    this.characters.forEach(char => {
      const sprite = this.characterSprites.get(char.id)
      if (!sprite) return

      // Get current animation key
      const currentAnimKey = sprite.anims.currentAnim?.key
      if (currentAnimKey) {
        // Parse the animation key to find the base (e.g., "anim_assetId_idle")
        // And switch to the mip version
        const newAnimKey = currentAnimKey.replace(oldSuffix, newSuffix)
        if (this.anims.exists(newAnimKey)) {
          sprite.play(newAnimKey)
        }
      } else {
        // No animation playing - just update texture
        const currentTexture = sprite.texture.key
        const newTexture = currentTexture.replace(oldSuffix, newSuffix)
        if (this.textures.exists(newTexture)) {
          sprite.setTexture(newTexture)
        }
      }
    })

    this.currentMipLevel = newLevel
  }

  // Update character glow based on control status
  private updateCharacterGlow(characterId: string, controlledByPlayerId: string | null) {
    const char = this.characters.find(c => c.id === characterId)
    if (!char) return

    const glow = this.characterGlows.get(characterId)
    if (!glow) return

    const x = char.x * TILE_SIZE + TILE_SIZE / 2
    const y = char.y * TILE_SIZE + TILE_SIZE / 2

    glow.clear()
    glow.setPosition(x, y)

    if (controlledByPlayerId) {
      // Get player's color
      const colorIndex = this.playerColors.get(controlledByPlayerId) ?? 0
      const color = PLAYER_COLORS[colorIndex]

      // Draw glowing ring effect
      const radius = TILE_SIZE * 0.5
      const glowLayers = [
        { alpha: 0.08, r: radius * 1.6 },
        { alpha: 0.12, r: radius * 1.4 },
        { alpha: 0.18, r: radius * 1.2 },
        { alpha: 0.25, r: radius },
      ]

      glowLayers.forEach(({ alpha, r }) => {
        glow.fillStyle(color, alpha)
        glow.fillCircle(0, 0, r)
      })

      glow.setVisible(true)
    } else {
      glow.setVisible(false)
    }
  }

  // Create glow graphics for a character
  private createCharacterGlow(characterId: string): Phaser.GameObjects.Graphics {
    const glow = this.add.graphics()
    glow.setDepth(-1) // Render below characters
    glow.setVisible(false)
    this.characterGlows.set(characterId, glow)
    return glow
  }

  // Set controlled character - centers camera on character and zooms in with animation
  setControlledCharacter(characterId: string) {
    this.controlledCharacterId = characterId

    // Find character and center camera on them
    const char = this.characters.find(c => c.id === characterId)
    if (char) {
      const cam = this.cameras.main
      const sprite = this.characterSprites.get(characterId)

      const targetX = char.x * TILE_SIZE + TILE_SIZE / 2
      const targetY = char.y * TILE_SIZE + TILE_SIZE / 2

      // Show selection indicator under character
      this.positionSelectionIndicator(targetX, targetY)

      // Animated zoom in and pan to character
      this.tweens.add({
        targets: cam,
        zoom: 1,
        scrollX: targetX - cam.width / 2,
        scrollY: targetY - cam.height / 2,
        duration: this.zoomDuration,
        ease: "Cubic.easeOut",
        onComplete: () => {
          // Start following the character sprite after zoom completes
          if (sprite) {
            cam.startFollow(sprite, true, 0.1, 0.1)
          }
        }
      })
    }
  }

  // Clear controlled character - zooms out to show whole map with animation
  clearControlledCharacter() {
    this.controlledCharacterId = null

    // Hide selection indicator
    if (this.selectionIndicator) {
      this.selectionIndicator.setVisible(false)
    }

    if (this.mapData) {
      const cam = this.cameras.main
      const mapWidth = this.mapData.width * TILE_SIZE
      const mapHeight = this.mapData.height * TILE_SIZE

      // Stop following any sprite
      cam.stopFollow()

      // Animated zoom out and center on map
      this.tweens.add({
        targets: cam,
        zoom: 0.5,
        scrollX: mapWidth / 2 - cam.width / 2,
        scrollY: mapHeight / 2 - cam.height / 2,
        duration: this.zoomDuration,
        ease: "Cubic.easeOut"
      })
    }
  }

  // Phaser's update loop - called every frame
  update(_time: number, _delta: number) {
    const cam = this.cameras.main
    const now = Date.now()

    // When controlling a character: send move input via WebSocket
    if (this.controlledCharacterId && this.mapData) {
      // Check if character is currently animating - don't send new moves
      if (!this.movingCharacters.has(this.controlledCharacterId)) {
        if (now - this.lastMoveTime > this.moveDebounceTime) {
          let direction: "n" | "s" | "e" | "w" | null = null

          if (this.cursors?.up?.isDown || this.wasd.W?.isDown) direction = "n"
          else if (this.cursors?.down?.isDown || this.wasd.S?.isDown) direction = "s"
          else if (this.cursors?.left?.isDown || this.wasd.A?.isDown) direction = "w"
          else if (this.cursors?.right?.isDown || this.wasd.D?.isDown) direction = "e"

          if (direction && this.onMoveInput) {
            this.lastMoveTime = now
            this.onMoveInput(direction)
          }
        }
      }
    } else {
      // No character controlled: pan camera with WASD/arrows
      const speed = 16
      if (this.cursors?.left?.isDown || this.wasd.A?.isDown) cam.scrollX -= speed
      if (this.cursors?.right?.isDown || this.wasd.D?.isDown) cam.scrollX += speed
      if (this.cursors?.up?.isDown || this.wasd.W?.isDown) cam.scrollY -= speed
      if (this.cursors?.down?.isDown || this.wasd.S?.isDown) cam.scrollY += speed
    }
  }

  // Animate character movement with tween (called when receiving WebSocket event)
  animateCharacterMove(characterId: string, newX: number, newY: number, direction?: string) {
    const sprite = this.characterSprites.get(characterId)
    if (!sprite) return

    // Get the character's asset ID for animation lookup
    const char = this.characters.find(c => c.id === characterId)
    if (!char) return

    // Mark character as moving
    this.movingCharacters.add(characterId)

    // Calculate target pixel position
    const targetX = newX * TILE_SIZE + TILE_SIZE / 2
    const targetY = newY * TILE_SIZE + TILE_SIZE / 2

    // Play walk animation if it exists, otherwise keep showing idle
    const mipAnimSuffix = this.currentMipLevel === "full" ? "" : `_${this.currentMipLevel}`
    if (direction) {
      const directionMap: Record<string, string> = {
        "n": "walk_up",
        "s": "walk_down",
        "e": "walk_right",
        "w": "walk_left",
        "up": "walk_up",
        "down": "walk_down",
        "right": "walk_right",
        "left": "walk_left",
      }
      const walkState = directionMap[direction.toLowerCase()] || "walk_down"
      const walkAnimKey = `anim_${char.assetId}_${walkState}${mipAnimSuffix}`

      // Only play walk animation if it exists (otherwise keep current frame)
      if (this.anims.exists(walkAnimKey)) {
        sprite.play(walkAnimKey)
      }
    }

    // Animate the movement using a tween
    this.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      duration: this.moveDuration,
      ease: "Linear",
      onComplete: () => {
        // Mark character as done moving
        this.movingCharacters.delete(characterId)

        // Update character data
        char.x = newX
        char.y = newY

        // Return to idle: try animation first, fall back to static texture
        const currentMipSuffix = this.currentMipLevel === "full" ? "" : `_${this.currentMipLevel}`
        const idleAnimKey = `anim_${char.assetId}_idle${currentMipSuffix}`
        if (this.anims.exists(idleAnimKey)) {
          sprite.play(idleAnimKey)
        } else {
          // No idle animation (single frame) - stop any animation and show static idle frame
          sprite.stop()
          const idleTextureKey = `char_${char.assetId}_idle_0${currentMipSuffix}`
          if (this.textures.exists(idleTextureKey)) {
            sprite.setTexture(idleTextureKey)
          }
        }
      }
    })

    // Also move selection indicator if this is the controlled character
    if (characterId === this.controlledCharacterId && this.selectionIndicator) {
      this.tweens.add({
        targets: this.selectionIndicator,
        x: targetX,
        y: targetY,
        duration: this.moveDuration,
        ease: "Linear"
      })
    }

    // Move glow along with character
    const glow = this.characterGlows.get(characterId)
    if (glow && glow.visible) {
      this.tweens.add({
        targets: glow,
        x: targetX,
        y: targetY,
        duration: this.moveDuration,
        ease: "Linear"
      })
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
      }

      // Update glow based on control status
      this.updateCharacterGlow(char.id, char.controlledByPlayerId ?? null)
    })
    this.characters = characters
  }

  // Update players (when new players join, update color map)
  updatePlayers(players: { playerId: string; colorIndex: number }[]) {
    this.playerColors.clear()
    players.forEach(p => {
      this.playerColors.set(p.playerId, p.colorIndex)
    })

    // Re-update all character glows with new colors
    this.characters.forEach(char => {
      this.updateCharacterGlow(char.id, char.controlledByPlayerId ?? null)
    })
  }

  // Draw path visualization (disabled for now - will be used for squad movement later)
  drawPath(_path: [number, number][]) {
    // TODO: Re-enable when implementing path re-computation and squad movement
    // Path visualization is disabled - keeping the method signature for future use
  }

  // Clear path visualization
  clearPath() {
    if (this.pathGraphics) {
      this.pathGraphics.clear()
    }
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
  const hasEverInitializedRef = useRef(false) // NEVER reset - prevents Strict Mode double init
  const gameDataRef = useRef<GameDTO | null>(null) // Store game data for Phaser init
  const currentPathRef = useRef<[number, number][] | null>(null) // Track current path for visualization

  const [game, setGame] = useState<GameDTO | null>(null)
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [controlledCharacterId, setControlledCharacterId] = useState<string | null>(null)

  // Refs for cleanup (to avoid stale closures)
  const gameIdRef = useRef<string | null>(null)
  const controlledCharacterIdRef = useRef<string | null>(null)

  // Keep refs in sync with state
  useEffect(() => {
    gameIdRef.current = gameId ?? null
  }, [gameId])

  useEffect(() => {
    controlledCharacterIdRef.current = controlledCharacterId
  }, [controlledCharacterId])

  // Cleanup: release controlled character when leaving the game screen
  useEffect(() => {
    return () => {
      const gId = gameIdRef.current
      const charId = controlledCharacterIdRef.current
      if (gId && charId) {
        // Fire and forget - don't await since component is unmounting
        relinquishCharacter(gId).catch(err => {
          console.warn("Failed to release character on unmount:", err)
        })
      }
    }
  }, [])

  // Handle WebSocket character move events
  const handleCharacterMove = useCallback((event: CharacterMoveEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.animateCharacterMove(event.characterId, event.x, event.y, event.direction)

      // Update path visualization if this is a path step
      if (currentPathRef.current && currentPathRef.current.length > 0) {
        const path = currentPathRef.current

        // Remove the first point if it matches the current position (character reached it)
        if (path[0] && path[0][0] === event.x && path[0][1] === event.y) {
          currentPathRef.current = path.slice(1)
        }

        // Redraw remaining path or clear if done
        if (currentPathRef.current.length > 0) {
          scene.drawPath(currentPathRef.current)
        } else {
          scene.clearPath()
          currentPathRef.current = null
        }
      }
    }
  }, [])

  // Handle WebSocket errors
  const handleWebSocketError = useCallback((message: string) => {
    console.error("WebSocket error:", message)
  }, [])

  // Handle path start event
  const handlePathStart = useCallback((event: PathStartEvent) => {
    // Store the path for progressive updates
    currentPathRef.current = event.path

    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.drawPath(event.path)
    }
  }, [])

  // Handle path cancel/complete - clear visualization
  const handlePathCancel = useCallback(() => {
    currentPathRef.current = null

    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.clearPath()
    }
  }, [])

  // WebSocket connection
  const { isConnected, sendMove, sendPath } = useGameWebSocket({
    gameId: gameId || "",
    onCharacterMove: handleCharacterMove,
    onPathStart: handlePathStart,
    onPathCancel: handlePathCancel,
    onError: handleWebSocketError,
    onConnected: () => console.log("Game WebSocket connected"),
    onDisconnected: () => console.log("Game WebSocket disconnected"),
  })

  // Load game data
  useEffect(() => {
    if (!gameId) return

    async function loadGame() {
      try {
        setIsLoading(true)
        const gameData = await getGame(gameId!)
        setGame(gameData)
        gameDataRef.current = gameData // Store for Phaser init

        // Find if current user controls a character
        const currentPlayer = gameData.players.find(p =>
          authUser && p.playerId === authUser.userId
        )
        if (currentPlayer?.controlledCharacterId) {
          setControlledCharacterId(currentPlayer.controlledCharacterId)
        }

        // Load map data (normalize handles legacy format with single "paths" layer)
        const mapAsset = await getAssetById(gameData.mapAssetId)
        const mapJson = await getAssetFile<MapData>(mapAsset.storageKeyPrefix, "map.json")
        setMapData(normalizeMapData(mapJson))
      } catch (err) {
        console.error("Failed to load game:", err)
        setError("Failed to load game")
      } finally {
        setIsLoading(false)
      }
    }

    loadGame()
  }, [gameId, authUser])

  // Initialize Phaser when map data is loaded (only once)
  useEffect(() => {
    // Wait for both mapData and gameDataRef to be ready
    if (!mapData || !gameDataRef.current || !gameContainerRef.current) return

    // Prevent double initialization - this ref is NEVER reset
    if (hasEverInitializedRef.current) return
    hasEverInitializedRef.current = true

    // Capture game data at init time from ref
    const initialGameData = gameDataRef.current

    async function initPhaser() {
      // Collect all unique asset IDs
      const allAssetIds = new Set<string>()

      // From terrain
      for (const row of mapData!.layers.terrain) {
        for (const tile of row) {
          if (tile?.tileAssetId) allAssetIds.add(tile.tileAssetId)
        }
      }

      // From water paths
      if (mapData!.layers.waterPaths) {
        for (const row of mapData!.layers.waterPaths) {
          for (const path of row) {
            if (path?.pathAssetId) allAssetIds.add(path.pathAssetId)
          }
        }
      }

      // From ground paths
      if (mapData!.layers.groundPaths) {
        for (const row of mapData!.layers.groundPaths) {
          for (const path of row) {
            if (path?.pathAssetId) allAssetIds.add(path.pathAssetId)
          }
        }
      }

      // From characters (use captured initialGameData)
      initialGameData.characters.forEach(c => allAssetIds.add(c.assetId))

      // Load asset metadata and properties
      const assetMap = new Map<string, { storageKeyPrefix: string }>()
      const tileProperties = new Map<string, TileProperties>()
      const entityDefinitions = new Map<string, EntityDefinition>()

      await Promise.all(
        Array.from(allAssetIds).map(async (assetId) => {
          try {
            const asset = await getAssetById(assetId)
            assetMap.set(assetId, { storageKeyPrefix: asset.storageKeyPrefix })

            // Load the appropriate metadata file based on asset type
            if (asset.type === "TILE") {
              // Tiles have properties.json
              try {
                const props = await getAssetFile<TileProperties>(asset.storageKeyPrefix, "properties.json")
                tileProperties.set(assetId, props)
              } catch {
                // Missing properties.json - use defaults
              }
            } else if (asset.type === "CHARACTER" || asset.type === "OBJECT") {
              // Characters and Objects have definition.json
              try {
                const def = await getAssetFile<EntityDefinition>(asset.storageKeyPrefix, "definition.json")
                entityDefinitions.set(assetId, def)
              } catch {
                // Missing definition.json - use defaults
              }
            }
            // MAP type doesn't need additional files loaded here
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
        scene: GameScene,
        input: {
          keyboard: true
        }
      }

      const phaserGame = new Phaser.Game(config)
      phaserGameRef.current = phaserGame

      // Start scene with data (use initialGameData captured at effect start)
      // Find current player's ID and their controlled character from auth context
      const currentPlayerId = authUser?.userId ?? ""
      const currentPlayer = initialGameData.players.find(p => p.playerId === currentPlayerId)
      const initialControlledCharacterId = currentPlayer?.controlledCharacterId ?? null

      phaserGame.scene.start("GameScene", {
        mapData: mapData!,
        characters: initialGameData.characters,
        players: initialGameData.players.map(p => ({
          playerId: p.playerId,
          colorIndex: p.colorIndex
        })),
        currentPlayerId,
        initialControlledCharacterId,
        assetMap,
        tileProperties,
        entityDefinitions,
        onCharacterClick: (characterId: string) => {
          // Auto take/switch control when clicking a character
          setSelectedCharacter(characterId)
        },
        onTileClick: (_x: number, _y: number) => {
          // Clicking empty tile releases control (handled in React callback below)
          setSelectedCharacter(null)
        },
        onMoveInput: (direction: "n" | "s" | "e" | "w") => {
          // Manual move cancels any active path
          if (currentPathRef.current) {
            currentPathRef.current = null
            const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
            scene?.clearPath()
          }
          // Send move command via WebSocket
          sendMove(direction)
        },
        onPathRequest: (targetX: number, targetY: number) => {
          // Send path request via WebSocket (right-click)
          sendPath(targetX, targetY)
        }
      })
    }

    initPhaser()

    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true)
        phaserGameRef.current = null
      }
      // NOTE: Do NOT reset hasEverInitializedRef - it prevents Strict Mode double init
    }
  // Only depend on mapData - game state updates are handled via scene.updateCharacters()
  // sendMove is a stable reference (no dependencies)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData])

  // Auto take control when clicking a character
  useEffect(() => {
    if (!gameId || !game || !selectedCharacter) return

    // Find the selected character
    const char = game.characters.find(c => c.id === selectedCharacter)
    if (!char) return

    // If already controlling this character, do nothing
    if (controlledCharacterId === selectedCharacter) return

    // If character is controlled by another player, show feedback and deselect
    if (char.controlled) {
      console.log("Character is controlled by another player")
      return
    }

    // Auto take control
    async function autoTakeControl() {
      try {
        // First release current control if any
        if (controlledCharacterId) {
          await relinquishCharacter(gameId!)
        }

        await takeOverCharacter(gameId!, selectedCharacter!)
        setControlledCharacterId(selectedCharacter)

        const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
        const updated = await getGame(gameId!)

        if (scene) {
          scene.updatePlayers(updated.players.map(p => ({
            playerId: p.playerId,
            colorIndex: p.colorIndex
          })))
          scene.updateCharacters(updated.characters)
          scene.setControlledCharacter(selectedCharacter!)
        }

        setGame(updated)
      } catch (err) {
        console.error("Failed to take over character:", err)
      }
    }

    autoTakeControl()
  }, [selectedCharacter, gameId, game, controlledCharacterId])

  // Auto release control when clicking empty tile (selectedCharacter becomes null)
  useEffect(() => {
    if (!gameId || selectedCharacter !== null) return
    if (!controlledCharacterId) return

    async function autoReleaseControl() {
      try {
        await relinquishCharacter(gameId!)
        setControlledCharacterId(null)
        const updated = await getGame(gameId!)
        setGame(updated)
        const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
        if (scene) {
          scene.updatePlayers(updated.players.map(p => ({
            playerId: p.playerId,
            colorIndex: p.colorIndex
          })))
          scene.updateCharacters(updated.characters)
          scene.clearControlledCharacter()
        }
      } catch (err) {
        console.error("Failed to relinquish character:", err)
      }
    }

    autoReleaseControl()
  }, [selectedCharacter, gameId, controlledCharacterId])

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
                    {/* Player color indicator */}
                    <div
                      className="w-3 h-3 rounded-full border border-zinc-600"
                      style={{ backgroundColor: `#${PLAYER_COLORS[player.colorIndex].toString(16).padStart(6, '0')}` }}
                    />
                    <User className="w-3 h-3" />
                    <span className={player.role === "HOST" ? "text-yellow-400" : "text-zinc-300"}>
                      {player.role}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Character control - shows currently controlled character */}
          {controlledCharacterId && (
            <Card className="bg-zinc-800 border-zinc-700 border-green-500/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm text-green-400">Controlling</CardTitle>
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
                      <p className="text-xs text-zinc-500">Click empty tile to release</p>
                    </div>
                  ) : null
                })()}
              </CardContent>
            </Card>
          )}

          {/* Controls hint */}
          <div className="mt-auto text-xs text-zinc-500">
            {/* WebSocket status */}
            <div className="flex items-center gap-1 mb-2">
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-green-400" />
                  <span className="text-green-400">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-red-400" />
                  <span className="text-red-400">Disconnected</span>
                </>
              )}
            </div>
            {controlledCharacterId ? (
              <>
                <p className="text-green-400">WASD / Arrows: Move character</p>
                <p className="text-green-400">Right-click: Pathfind to target</p>
                <p>Camera follows character</p>
                <p>Click empty tile: Release</p>
              </>
            ) : (
              <p>WASD / Arrows: Pan camera</p>
            )}
            <p>Mouse wheel: Zoom</p>
            <p>Click character: Take control</p>
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
