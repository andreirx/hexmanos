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
import type {
  CharacterMoveEvent,
  CharacterIdleEvent,
  PathStartEvent,
  AttackStartEvent,
  ProjectileSpawnEvent,
  ProjectileHitEvent,
  DamageEvent,
  CharacterDeathEvent,
  BatchPathStartEvent,
} from "@/hooks/useGameWebSocket"
import { ArrowLeft, Pause, Square, User, Heart, Wifi, WifiOff, Swords, Target } from "lucide-react"
import type { GameDTO, GameCharacterDTO, AttackDefinition } from "@/api/types"
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
// Scale factor to display smaller mipmaps at full tile size
const getMipScale = (level: MipLevel): number => {
  if (level === "full") return 1
  if (level === "mip64") return 2
  return 4  // mip32
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
  // Depth constants for consistent layer ordering
  private static readonly DEPTH_GLOW = -1
  private static readonly DEPTH_SELECTION = 9  // Between terrain and characters
  private static readonly DEPTH_PATH = 1
  private static readonly DEPTH_LANDED_OBJECT = 5
  private static readonly DEPTH_CHARACTER = 10
  private static readonly DEPTH_PROJECTILE = 500
  private static readonly DEPTH_UI = 1000

  private mapData: MapData | null = null
  private characters: GameCharacterDTO[] = []
  private characterSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  private movingCharacters: Set<string> = new Set() // Track characters currently animating
  private onCharacterClick: ((characterId: string, shiftKey: boolean) => void) | null = null
  private onBoxSelect: ((characterIds: string[]) => void) | null = null
  private onTileClick: ((x: number, y: number) => void) | null = null
  private onMoveInput: ((direction: "n" | "s" | "e" | "w") => void) | null = null
  private onPathRequest: ((targetX: number, targetY: number) => void) | null = null
  private onBatchPathRequest: ((characterIds: string[], targetX: number, targetY: number) => void) | null = null

  // Path visualization — per-character graphics for squad path display
  private pathGraphics: Phaser.GameObjects.Graphics | null = null
  private characterPathGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map()
  // Track remaining path points per character (for progressive path visualization)
  private characterPaths: Map<string, number[][]> = new Map()
  // Track which characters have active paths (for deciding whether to auto-idle)
  private charactersWithActivePath: Set<string> = new Set()

  // Asset data
  private assetMap: Map<string, { storageKeyPrefix: string }> = new Map()
  private tileProperties: Map<string, TileProperties> = new Map()
  private entityDefinitions: Map<string, EntityDefinition> = new Map()

  // Player colors (playerId -> colorIndex)
  private playerColors: Map<string, number> = new Map()
  // Character glow graphics (characterId -> glow graphics)
  private characterGlows: Map<string, Phaser.GameObjects.Graphics> = new Map()
  // Current player identity (for selection indicator + box select filtering)
  private currentPlayerId: string = ""
  private currentPlayerColorIndex: number = 0

  // Character control state (multi-select)
  private controlledCharacterIds: Set<string> = new Set()
  private selectionIndicators: Map<string, Phaser.GameObjects.Graphics> = new Map()
  // Box select state
  private boxSelectStart: { x: number; y: number } | null = null
  private boxSelectRect: Phaser.GameObjects.Graphics | null = null
  private boxSelectPreviewRects: Map<string, Phaser.GameObjects.Graphics> = new Map()
  private static readonly BOX_SELECT_THRESHOLD = 5 // pixels minimum to distinguish drag from click
  // Right-click drag pan state
  private rightDragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null
  private rightDragPanning = false
  private static readonly RIGHT_DRAG_THRESHOLD = 8 // pixels to distinguish click from drag
  private moveDebounceTime = 200 // ms between move inputs
  private lastMoveTime = 0
  // Standard animation duration (matches backend BASE_MOVE_DELAY_MS)
  // Used to calculate animation timeScale: timeScale = STANDARD_ANIM_DURATION / actualDuration
  private static readonly STANDARD_ANIM_DURATION = 200 // ms
  private zoomDuration = 300 // ms for zoom transitions

  // Store guaranteed-valid idle texture for each character (fallback)
  private characterIdleTextures: Map<string, string> = new Map()

  // ============================================
  // LOCAL TRUTH MIRROR - Authoritative state from backend
  // This map tracks what the backend last told us, NOT what the sprite is showing.
  // When we switch mip levels, we consult THIS, not the sprite's current animation.
  // ============================================
  private characterStates: Map<string, {
    x: number
    y: number
    state: string      // "idle", "walk_up", "walk_down", "walk_left", "walk_right"
    assetId: string    // For animation key lookup
  }> = new Map()

  // Keyboard controls (initialized in create())
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null
  private wasd: { W: Phaser.Input.Keyboard.Key | null; A: Phaser.Input.Keyboard.Key | null; S: Phaser.Input.Keyboard.Key | null; D: Phaser.Input.Keyboard.Key | null } = { W: null, A: null, S: null, D: null }

  // Mipmap level tracking
  private currentMipLevel: MipLevel = "full"
  private terrainImages: Map<string, { image: Phaser.GameObjects.Image; assetId: string; variation: number }> = new Map()
  private transitionImages: Map<string, { image: Phaser.GameObjects.Image; assetId: string; direction: string }> = new Map()
  private pathImages: Map<string, { image: Phaser.GameObjects.Image; assetId: string; variation: number }> = new Map()

  constructor() {
    super({ key: "GameScene" })
  }

  // Store initial controlled character IDs for setup in create()
  private initialControlledCharacterIds: string[] = []

  init(data: {
    mapData: MapData
    characters: GameCharacterDTO[]
    players: { playerId: string; colorIndex: number }[]
    currentPlayerId: string
    initialControlledCharacterIds: string[]
    assetMap: Map<string, { storageKeyPrefix: string }>
    tileProperties: Map<string, TileProperties>
    entityDefinitions: Map<string, EntityDefinition>
    onCharacterClick: (characterId: string, shiftKey: boolean) => void
    onBoxSelect: (characterIds: string[]) => void
    onTileClick: (x: number, y: number) => void
    onMoveInput: (direction: "n" | "s" | "e" | "w") => void
    onPathRequest: (targetX: number, targetY: number) => void
    onBatchPathRequest: (characterIds: string[], targetX: number, targetY: number) => void
  }) {
    this.mapData = data.mapData
    this.characters = data.characters
    this.assetMap = data.assetMap
    this.tileProperties = data.tileProperties
    this.entityDefinitions = data.entityDefinitions
    this.onCharacterClick = data.onCharacterClick
    this.onBoxSelect = data.onBoxSelect
    this.onTileClick = data.onTileClick
    this.onMoveInput = data.onMoveInput
    this.onPathRequest = data.onPathRequest
    this.onBatchPathRequest = data.onBatchPathRequest

    // Build player colors map
    this.playerColors.clear()
    data.players.forEach(p => {
      this.playerColors.set(p.playerId, p.colorIndex)
    })

    // Store current player identity for selection indicator + box select filtering
    this.currentPlayerId = data.currentPlayerId
    this.currentPlayerColorIndex = this.playerColors.get(data.currentPlayerId) ?? 0

    // Store initial controlled characters for setup in create()
    this.initialControlledCharacterIds = data.initialControlledCharacterIds

    // Initialize Local Truth Mirror from character DTOs
    // This is the authoritative state - what the backend told us
    this.characterStates.clear()
    data.characters.forEach(char => {
      this.characterStates.set(char.id, {
        x: char.x,
        y: char.y,
        state: "idle",  // Characters start idle
        assetId: char.assetId
      })
    })
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

    // Load character/object sprites - idle, walk, and attack frames for animation, with mipmaps
    // Animation states: idle (simple), idle_up/down/left/right, walk_up/down/left/right, attack_up/down/left/right
    characterAssetIds.forEach(assetId => {
      const asset = this.assetMap.get(assetId)
      if (!asset) return

      const def = this.entityDefinitions.get(assetId)
      const visualStatePrefix = def?.visualStates?.[0] ? `${def.visualStates[0]}_` : ""

      // Load simple idle frames (backwards compatible)
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

      // Direction-based states: idle_*, walk_*, attack_*
      const directions = ["down", "up", "left", "right"] as const
      const stateTypes = ["idle", "walk", "attack"] as const

      for (const stateType of stateTypes) {
        for (const dir of directions) {
          const stateName = `${stateType}_${dir}`
          const frameCount = def?.states?.[stateName]?.frames ?? 0
          for (let i = 0; i < frameCount; i++) {
            for (const mip of mipSuffixes) {
              const suffix = getMipSuffix(mip)
              const key = `char_${assetId}_${stateName}_${i}${suffix ? `_${mip}` : ""}`
              const fileName = `${visualStatePrefix}${stateName}_${i}${suffix}.png`
              const url = getAssetFileUrl(asset.storageKeyPrefix, fileName)
              this.load.image(key, url)
            }
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
    const mipScale = getMipScale(this.currentMipLevel)

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
          image.setScale(mipScale)
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
            const transitionImage = this.add.image(
              nx * TILE_SIZE + TILE_SIZE / 2,
              ny * TILE_SIZE + TILE_SIZE / 2,
              key
            )
            transitionImage.setScale(mipScale)
            // Track transition image for mip level switching
            const transitionKey = `${x},${y}_${dir}`
            this.transitionImages.set(transitionKey, { image: transitionImage, assetId: tile.tileAssetId, direction: dir })
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
            image.setScale(mipScale)
            image.setDepth(GameScene.DEPTH_PATH)
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

    // Create box select rectangle graphics
    this.boxSelectRect = this.add.graphics()
    this.boxSelectRect.setDepth(GameScene.DEPTH_UI)
    this.boxSelectRect.setVisible(false)

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

        // Create simple idle animation (backwards compatible)
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

        // Create direction-based animations: idle_*, walk_*, attack_*
        const directions = ["down", "up", "left", "right"] as const
        const stateConfigs = [
          { type: "idle", frameRate: 4 },    // Slow for idle
          { type: "walk", frameRate: 8 },    // Medium for walk
          { type: "attack", frameRate: 10 }  // Fast for attack
        ] as const

        for (const { type, frameRate } of stateConfigs) {
          for (const dir of directions) {
            const stateName = `${type}_${dir}`
            const stateFrameCount = def?.states?.[stateName]?.frames ?? 0
            const stateAnimKey = `anim_${char.assetId}_${stateName}${mipAnimSuffix}`

            if (stateFrameCount > 0 && !this.anims.exists(stateAnimKey)) {
              const frames: Phaser.Types.Animations.AnimationFrame[] = []
              for (let i = 0; i < stateFrameCount; i++) {
                const frameKey = `char_${char.assetId}_${stateName}_${i}${mipTexSuffix}`
                if (this.textures.exists(frameKey)) {
                  frames.push({ key: frameKey })
                }
              }

              if (frames.length > 0) {
                this.anims.create({
                  key: stateAnimKey,
                  frames: frames,
                  frameRate: frameRate,
                  repeat: type === "attack" ? 0 : -1  // Attack plays once, others loop
                })
              }
            }
          }
        }
      }

      // Find a guaranteed-valid idle texture (try mip level first, fall back to full)
      let validIdleTexture = `char_${char.assetId}_idle_0`
      if (this.textures.exists(firstFrameKey)) {
        validIdleTexture = firstFrameKey
      } else if (this.textures.exists(`char_${char.assetId}_idle_0`)) {
        validIdleTexture = `char_${char.assetId}_idle_0`
      }
      this.characterIdleTextures.set(char.id, validIdleTexture)

      // Create sprite with valid idle texture
      const sprite = this.add.sprite(
        char.x * TILE_SIZE + TILE_SIZE / 2,
        char.y * TILE_SIZE + TILE_SIZE / 2,
        validIdleTexture
      )
      sprite.setScale(mipScale)
      sprite.setDepth(GameScene.DEPTH_CHARACTER)
      sprite.setVisible(true) // Ensure visible

      sprite.setInteractive({ useHandCursor: true })
      sprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.onCharacterClick) return
        // Only allow selecting characters the current player can control
        const freshChar = this.characters.find(c => c.id === char.id)
        if (freshChar?.controlled && freshChar.controlledByPlayerId !== this.currentPlayerId) return
        this.onCharacterClick(char.id, pointer.event.shiftKey)
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

    // Background click handler — box select (left drag), tile click, right-click pan/path
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        // Start potential box select — store world coords
        this.boxSelectStart = { x: pointer.worldX, y: pointer.worldY }
      } else if (pointer.button === 2) {
        // Start potential right-drag pan — store screen coords + camera position
        const cam = this.cameras.main
        this.rightDragStart = {
          x: pointer.x, y: pointer.y,
          scrollX: cam.scrollX, scrollY: cam.scrollY
        }
        this.rightDragPanning = false
      }
    })

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // Left-drag: box select
      if (this.boxSelectStart && pointer.leftButtonDown()) {
        const dx = pointer.worldX - this.boxSelectStart.x
        const dy = pointer.worldY - this.boxSelectStart.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < GameScene.BOX_SELECT_THRESHOLD) {
          this.clearBoxSelectPreviews()
          return
        }

        const rx = Math.min(this.boxSelectStart.x, pointer.worldX)
        const ry = Math.min(this.boxSelectStart.y, pointer.worldY)
        const rw = Math.abs(dx)
        const rh = Math.abs(dy)

        if (this.boxSelectRect) {
          this.boxSelectRect.clear()
          this.boxSelectRect.lineStyle(2, 0x44ff44, 0.8)
          this.boxSelectRect.fillStyle(0x44ff44, 0.15)
          this.boxSelectRect.fillRect(rx, ry, rw, rh)
          this.boxSelectRect.strokeRect(rx, ry, rw, rh)
          this.boxSelectRect.setVisible(true)
        }
        this.updateBoxSelectPreviews(rx, ry, rw, rh)
        return
      }

      // Right-drag: pan camera
      if (this.rightDragStart && pointer.rightButtonDown()) {
        const dx = pointer.x - this.rightDragStart.x
        const dy = pointer.y - this.rightDragStart.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist >= GameScene.RIGHT_DRAG_THRESHOLD) {
          this.rightDragPanning = true
          // Stop following any character while panning
          this.cameras.main.stopFollow()
          // Pan camera: move opposite to pointer drag, scaled by zoom
          const cam = this.cameras.main
          cam.scrollX = this.rightDragStart.scrollX - dx / cam.zoom
          cam.scrollY = this.rightDragStart.scrollY - dy / cam.zoom
        }
      }
    })

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      // Left button release — box select or tile click
      if (pointer.button === 0 && this.boxSelectStart) {
        const dx = pointer.worldX - this.boxSelectStart.x
        const dy = pointer.worldY - this.boxSelectStart.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Clear box select graphics and preview rects
        if (this.boxSelectRect) {
          this.boxSelectRect.clear()
          this.boxSelectRect.setVisible(false)
        }
        this.clearBoxSelectPreviews()

        if (dist >= GameScene.BOX_SELECT_THRESHOLD) {
          // Box select — find characters inside the rectangle
          const rx = Math.min(this.boxSelectStart.x, pointer.worldX)
          const ry = Math.min(this.boxSelectStart.y, pointer.worldY)
          const rw = Math.abs(dx)
          const rh = Math.abs(dy)

          const selectedIds = this.getSelectableCharactersInRect(rx, ry, rw, rh)

          if (selectedIds.length > 0 && this.onBoxSelect) {
            this.onBoxSelect(selectedIds)
          }
        } else {
          // Simple click on empty tile
          const tileX = Math.floor(pointer.worldX / TILE_SIZE)
          const tileY = Math.floor(pointer.worldY / TILE_SIZE)
          if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
            this.boxSelectStart = null
            return
          }

          const charAtTile = this.characters.find(c => c.x === tileX && c.y === tileY)
          if (!charAtTile && this.onTileClick) {
            this.onTileClick(tileX, tileY)
          }
        }

        this.boxSelectStart = null
      }

      // Right button release — destination click (only if wasn't panning)
      if (pointer.button === 2 && this.rightDragStart) {
        if (!this.rightDragPanning) {
          // Short right-click — send path/batch-path
          const tileX = Math.floor(pointer.worldX / TILE_SIZE)
          const tileY = Math.floor(pointer.worldY / TILE_SIZE)
          if (tileX >= 0 && tileX < width && tileY >= 0 && tileY < height) {
            if (this.controlledCharacterIds.size > 1 && this.onBatchPathRequest) {
              this.onBatchPathRequest(Array.from(this.controlledCharacterIds), tileX, tileY)
            } else if (this.controlledCharacterIds.size === 1 && this.onPathRequest) {
              this.onPathRequest(tileX, tileY)
            }
          }
        }
        this.rightDragStart = null
        this.rightDragPanning = false
      }
    })

    // Disable context menu on right-click
    this.input.mouse?.disableContextMenu()

    // Create path graphics for visualization (renders above everything)
    this.pathGraphics = this.add.graphics()
    this.pathGraphics.setDepth(GameScene.DEPTH_UI)

    // Set up initial controlled characters if player was already controlling some
    if (this.initialControlledCharacterIds.length > 0) {
      this.time.delayedCall(100, () => {
        this.initialControlledCharacterIds.forEach(id => {
          this.addControlledCharacter(id)
        })
      })
    }
  }

  // Create a selection indicator for a specific character
  private createSelectionIndicator(characterId: string): Phaser.GameObjects.Graphics {
    const indicator = this.add.graphics()
    indicator.setDepth(GameScene.DEPTH_SELECTION)

    const playerColor = PLAYER_COLORS[this.currentPlayerColorIndex]
    const radius = TILE_SIZE * 0.6
    const layers = [
      { alpha: 0.1, r: radius * 1.4 },
      { alpha: 0.15, r: radius * 1.2 },
      { alpha: 0.2, r: radius },
      { alpha: 0.3, r: radius * 0.8 },
    ]
    layers.forEach(({ alpha, r }) => {
      indicator.fillStyle(playerColor, alpha)
      indicator.fillCircle(0, 0, r)
    })

    // Position under the character sprite
    const sprite = this.characterSprites.get(characterId)
    if (sprite) {
      indicator.setPosition(sprite.x, sprite.y)
    }
    indicator.setVisible(true)

    this.selectionIndicators.set(characterId, indicator)
    return indicator
  }

  // Remove a selection indicator for a character
  private removeSelectionIndicator(characterId: string) {
    const indicator = this.selectionIndicators.get(characterId)
    if (indicator) {
      indicator.destroy()
      this.selectionIndicators.delete(characterId)
    }
  }

  // Remove all selection indicators
  private clearAllSelectionIndicators() {
    this.selectionIndicators.forEach(indicator => indicator.destroy())
    this.selectionIndicators.clear()
  }

  // Get selectable character IDs within a world-space rectangle
  private getSelectableCharactersInRect(rx: number, ry: number, rw: number, rh: number): string[] {
    const ids: string[] = []
    this.characterSprites.forEach((sprite, charId) => {
      if (sprite.x >= rx && sprite.x <= rx + rw && sprite.y >= ry && sprite.y <= ry + rh) {
        const char = this.characters.find(c => c.id === charId)
        if (!char) return
        if (char.controlled && char.controlledByPlayerId !== this.currentPlayerId) return
        ids.push(charId)
      }
    })
    return ids
  }

  // Show preview rectangles around characters that would be selected during box drag
  private updateBoxSelectPreviews(rx: number, ry: number, rw: number, rh: number) {
    const selectableIds = new Set(this.getSelectableCharactersInRect(rx, ry, rw, rh))

    // Remove preview rects for characters no longer in the box
    this.boxSelectPreviewRects.forEach((gfx, charId) => {
      if (!selectableIds.has(charId)) {
        gfx.destroy()
        this.boxSelectPreviewRects.delete(charId)
      }
    })

    // Add/update preview rects for characters in the box
    const playerColor = PLAYER_COLORS[this.currentPlayerColorIndex]
    selectableIds.forEach(charId => {
      const sprite = this.characterSprites.get(charId)
      if (!sprite) return

      let gfx = this.boxSelectPreviewRects.get(charId)
      if (!gfx) {
        gfx = this.add.graphics()
        gfx.setDepth(GameScene.DEPTH_UI)
        this.boxSelectPreviewRects.set(charId, gfx)
      }

      gfx.clear()
      const halfSize = TILE_SIZE * 0.5
      gfx.lineStyle(2, playerColor, 0.9)
      gfx.strokeRect(sprite.x - halfSize, sprite.y - halfSize, TILE_SIZE, TILE_SIZE)
      gfx.fillStyle(playerColor, 0.1)
      gfx.fillRect(sprite.x - halfSize, sprite.y - halfSize, TILE_SIZE, TILE_SIZE)
    })
  }

  // Clear all box select preview rectangles
  private clearBoxSelectPreviews() {
    this.boxSelectPreviewRects.forEach(gfx => gfx.destroy())
    this.boxSelectPreviewRects.clear()
  }

  // Switch texture mip levels based on zoom
  private switchMipLevel(newLevel: MipLevel) {
    if (newLevel === this.currentMipLevel) return

    const newSuffix = newLevel === "full" ? "" : `_${newLevel}`
    const newScale = getMipScale(newLevel)

    // Update terrain images
    this.terrainImages.forEach(({ image, assetId, variation }) => {
      const newKey = `terrain_${assetId}_${variation}${newSuffix}`
      if (this.textures.exists(newKey)) {
        image.setTexture(newKey)
        image.setScale(newScale)
      }
    })

    // Update transition images
    this.transitionImages.forEach(({ image, assetId, direction }) => {
      const newKey = `transition_${assetId}_${direction}${newSuffix}`
      if (this.textures.exists(newKey)) {
        image.setTexture(newKey)
        image.setScale(newScale)
      }
    })

    // Update path images
    this.pathImages.forEach(({ image, assetId, variation }) => {
      const newKey = `path_${assetId}_${variation}${newSuffix}`
      if (this.textures.exists(newKey)) {
        image.setTexture(newKey)
        image.setScale(newScale)
      }
    })

    // Update character sprites using LOCAL TRUTH MIRROR (not sprite's current animation!)
    // The sprite might be showing a fallback (idle) even though the character is actually walking.
    // We must consult characterStates to know the REAL state from the backend.
    this.characterStates.forEach((charState, charId) => {
      const sprite = this.characterSprites.get(charId)
      if (!sprite) return

      // Update scale for character sprites
      sprite.setScale(newScale)

      // Use the AUTHORITATIVE state from our Local Truth Mirror, NOT the sprite's animation
      const intendedState = charState.state  // e.g., "walk_down", "idle"
      const assetId = charState.assetId

      // Try to play the animation for the intended state at the new mip level
      const mipAnimSuffix = newLevel === "full" ? "" : `_${newLevel}`
      const animKey = `anim_${assetId}_${intendedState}${mipAnimSuffix}`

      if (this.anims.exists(animKey)) {
        sprite.play(animKey)
      } else {
        // Animation doesn't exist for this state at this mip level
        // Fall back to idle animation
        const idleAnimKey = `anim_${assetId}_idle${mipAnimSuffix}`
        if (this.anims.exists(idleAnimKey)) {
          sprite.play(idleAnimKey)
        } else {
          // No idle animation either - use static idle texture
          sprite.stop()
          this.setCharacterIdleTexture(charId)
        }
      }

      // CRITICAL: Always ensure sprite is visible after mip level switch
      sprite.setVisible(true)
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
    glow.setDepth(GameScene.DEPTH_GLOW)
    glow.setVisible(false)
    this.characterGlows.set(characterId, glow)
    return glow
  }

  // Add a character to the controlled set — shows selection indicator, zooms/follows first character
  addControlledCharacter(characterId: string) {
    const wasEmpty = this.controlledCharacterIds.size === 0
    this.controlledCharacterIds.add(characterId)

    // Create selection indicator for this character
    this.createSelectionIndicator(characterId)

    // If this is the first controlled character, zoom in and follow it
    if (wasEmpty) {
      const char = this.characters.find(c => c.id === characterId)
      if (char) {
        const cam = this.cameras.main
        const sprite = this.characterSprites.get(characterId)

        const targetX = char.x * TILE_SIZE + TILE_SIZE / 2
        const targetY = char.y * TILE_SIZE + TILE_SIZE / 2

        this.tweens.add({
          targets: cam,
          zoom: 1,
          scrollX: targetX - cam.width / 2,
          scrollY: targetY - cam.height / 2,
          duration: this.zoomDuration,
          ease: "Cubic.easeOut",
          onUpdate: () => {
            this.switchMipLevel(getMipLevel(cam.zoom))
          },
          onComplete: () => {
            if (sprite) {
              cam.startFollow(sprite, true, 0.1, 0.1)
            }
            this.switchMipLevel(getMipLevel(1))
          }
        })
      }
    } else if (this.controlledCharacterIds.size > 1) {
      // Multiple characters — stop following any single one
      this.cameras.main.stopFollow()
    }
  }

  // Remove a single character from the controlled set
  removeControlledCharacter(characterId: string) {
    this.controlledCharacterIds.delete(characterId)
    this.removeSelectionIndicator(characterId)

    // If only one remains, start following it
    if (this.controlledCharacterIds.size === 1) {
      const remainingId = Array.from(this.controlledCharacterIds)[0]
      const sprite = this.characterSprites.get(remainingId)
      if (sprite) {
        this.cameras.main.startFollow(sprite, true, 0.1, 0.1)
      }
    }
  }

  // Clear all controlled characters — zooms out to show whole map
  clearAllControlledCharacters() {
    this.controlledCharacterIds.clear()
    this.clearAllSelectionIndicators()

    if (this.mapData) {
      const cam = this.cameras.main
      const mapWidth = this.mapData.width * TILE_SIZE
      const mapHeight = this.mapData.height * TILE_SIZE

      cam.stopFollow()

      this.tweens.add({
        targets: cam,
        zoom: 0.5,
        scrollX: mapWidth / 2 - cam.width / 2,
        scrollY: mapHeight / 2 - cam.height / 2,
        duration: this.zoomDuration,
        ease: "Cubic.easeOut",
        onUpdate: () => {
          this.switchMipLevel(getMipLevel(cam.zoom))
        },
        onComplete: () => {
          this.switchMipLevel(getMipLevel(0.5))
        }
      })
    }
  }

  // Replace the entire controlled set (used when React state changes)
  setControlledCharacters(characterIds: string[]) {
    // Remove indicators for characters no longer controlled
    for (const id of this.controlledCharacterIds) {
      if (!characterIds.includes(id)) {
        this.removeSelectionIndicator(id)
      }
    }

    // Add indicators for newly controlled characters
    for (const id of characterIds) {
      if (!this.controlledCharacterIds.has(id)) {
        this.createSelectionIndicator(id)
      }
    }

    this.controlledCharacterIds = new Set(characterIds)

    if (characterIds.length === 0) {
      this.cameras.main.stopFollow()
    } else if (characterIds.length === 1) {
      const sprite = this.characterSprites.get(characterIds[0])
      if (sprite) {
        this.cameras.main.startFollow(sprite, true, 0.1, 0.1)
      }
    } else {
      this.cameras.main.stopFollow()
    }
  }

  // Phaser's update loop - called every frame
  update(_time: number, _delta: number) {
    const cam = this.cameras.main
    const now = Date.now()

    // When controlling exactly one character: send move input via WebSocket (keyboard)
    if (this.controlledCharacterIds.size === 1 && this.mapData) {
      const charId = Array.from(this.controlledCharacterIds)[0]
      if (!this.movingCharacters.has(charId)) {
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
    } else if (this.controlledCharacterIds.size === 0) {
      // No character controlled: pan camera with WASD/arrows
      const speed = 16
      if (this.cursors?.left?.isDown || this.wasd.A?.isDown) cam.scrollX -= speed
      if (this.cursors?.right?.isDown || this.wasd.D?.isDown) cam.scrollX += speed
      if (this.cursors?.up?.isDown || this.wasd.W?.isDown) cam.scrollY -= speed
      if (this.cursors?.down?.isDown || this.wasd.S?.isDown) cam.scrollY += speed
    }
    // When controlling multiple characters: WASD/arrows do nothing (use right-click batch path)
  }

  /**
   * Set character to a specific animation state (called from backend events).
   * This updates the LOCAL TRUTH MIRROR and then renders the appropriate animation.
   * The visual may fall back to idle if the animation doesn't exist, but the mirror
   * preserves the REAL state so switchMipLevel knows what to try at the new level.
   */
  setCharacterState(characterId: string, state: string) {
    const sprite = this.characterSprites.get(characterId)
    if (!sprite) return

    const char = this.characters.find(c => c.id === characterId)
    if (!char) return

    // UPDATE LOCAL TRUTH MIRROR - preserve the backend's authoritative state
    const existingState = this.characterStates.get(characterId)
    if (existingState) {
      this.characterStates.set(characterId, { ...existingState, state })
    }

    const mipSuffix = this.currentMipLevel === "full" ? "" : `_${this.currentMipLevel}`
    const scale = getMipScale(this.currentMipLevel)

    // Ensure correct scale
    sprite.setScale(scale)

    // Try to play the animation for this state
    // IMPORTANT: Only call play() if not already playing this animation
    // Otherwise, play() restarts from frame 0 on each move event, breaking the loop
    const animKey = `anim_${char.assetId}_${state}${mipSuffix}`
    if (this.anims.exists(animKey)) {
      // Only start if not already playing this animation (prevents restart on each move event)
      if (sprite.anims.currentAnim?.key !== animKey) {
        sprite.play(animKey)
      }
    } else {
      // Animation doesn't exist - VISUAL fallback to idle
      // NOTE: The Local Truth Mirror still knows the REAL state!
      const idleAnimKey = `anim_${char.assetId}_idle${mipSuffix}`
      if (this.anims.exists(idleAnimKey)) {
        if (sprite.anims.currentAnim?.key !== idleAnimKey) {
          sprite.play(idleAnimKey)
        }
      } else {
        // No idle animation - use static texture
        sprite.stop()
        this.setCharacterIdleTexture(characterId)
      }
    }

    // Ensure sprite is always visible
    sprite.setVisible(true)
  }

  /**
   * Set character to idle texture (guaranteed fallback).
   * Tries current mip level first, falls back to full size.
   */
  private setCharacterIdleTexture(characterId: string) {
    const sprite = this.characterSprites.get(characterId)
    if (!sprite) return

    const char = this.characters.find(c => c.id === characterId)
    if (!char) return

    const mipSuffix = this.currentMipLevel === "full" ? "" : `_${this.currentMipLevel}`

    // Try mip-level idle texture
    const idleTextureKey = `char_${char.assetId}_idle_0${mipSuffix}`
    if (this.textures.exists(idleTextureKey)) {
      sprite.setTexture(idleTextureKey)
      sprite.setScale(getMipScale(this.currentMipLevel))
    } else {
      // Fall back to full-size idle
      const fullIdleKey = `char_${char.assetId}_idle_0`
      if (this.textures.exists(fullIdleKey)) {
        sprite.setTexture(fullIdleKey)
        sprite.setScale(1)
      }
    }

    sprite.setVisible(true)
  }

  // Animate character movement with tween (called when receiving WebSocket event)
  // The `state` and `duration` parameters come directly from the backend (Single Source of Truth)
  animateCharacterMove(characterId: string, newX: number, newY: number, state: string, duration: number) {
    const sprite = this.characterSprites.get(characterId)
    if (!sprite) return

    // Get the character's asset ID for animation lookup
    const char = this.characters.find(c => c.id === characterId)
    if (!char) return

    // UPDATE LOCAL TRUTH MIRROR - This is the authoritative state from backend
    // We store this BEFORE any visual fallback logic, so switchMipLevel knows the REAL state
    const existingState = this.characterStates.get(characterId)
    this.characterStates.set(characterId, {
      x: newX,
      y: newY,
      state: state,  // The backend's authoritative animation state
      assetId: existingState?.assetId ?? char.assetId
    })

    // Mark character as moving
    this.movingCharacters.add(characterId)

    // Calculate target pixel position
    const targetX = newX * TILE_SIZE + TILE_SIZE / 2
    const targetY = newY * TILE_SIZE + TILE_SIZE / 2

    // Play the animation state from backend (walk_up, walk_down, etc.)
    // The backend tells us exactly what animation to play - visual fallback happens in setCharacterState
    this.setCharacterState(characterId, state)

    // Calculate animation timeScale based on backend-provided duration
    // timeScale = STANDARD / actual -> slower terrain = lower timeScale = slower animation
    // E.g., duration=600ms (cost 3) -> timeScale = 200/600 = 0.33
    const timeScale = GameScene.STANDARD_ANIM_DURATION / duration
    if (sprite.anims) {
      sprite.anims.timeScale = timeScale
    }

    // Animate the movement using backend-provided duration
    this.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      duration: duration,
      ease: "Linear",
      onComplete: () => {
        // Mark character as done moving
        this.movingCharacters.delete(characterId)

        // Update character data (for sprite position lookups)
        char.x = newX
        char.y = newY

        // Update path visualization (shrink remaining path)
        this.updateCharacterPathAfterMove(characterId, newX, newY)

        // Reset animation time scale to normal
        if (sprite.anims) {
          sprite.anims.timeScale = 1
        }

        // Ensure correct scale (may have changed during movement)
        const currentScale = getMipScale(this.currentMipLevel)
        sprite.setScale(currentScale)

        // For MANUAL moves (no active path), switch to idle after animation completes.
        // For PATH moves, wait for CharacterIdleEvent from backend (sent when path completes).
        // This prevents walk animation from playing forever after a single WASD move.
        if (!this.charactersWithActivePath.has(characterId)) {
          // Update Local Truth Mirror to idle
          const currentState = this.characterStates.get(characterId)
          if (currentState) {
            this.characterStates.set(characterId, { ...currentState, state: "idle" })
          }
          this.setCharacterState(characterId, "idle")
        }

        // Ensure sprite is always visible
        sprite.setVisible(true)
      }
    })

    // Also move selection indicator if this character is in the controlled set
    const selIndicator = this.selectionIndicators.get(characterId)
    if (selIndicator) {
      this.tweens.add({
        targets: selIndicator,
        x: targetX,
        y: targetY,
        duration: duration,
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
        duration: duration,
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

      // Update Local Truth Mirror with new positions
      // Preserve existing state (animation) since this is a position sync, not a state change
      const existingState = this.characterStates.get(char.id)
      this.characterStates.set(char.id, {
        x: char.x,
        y: char.y,
        state: existingState?.state ?? "idle",
        assetId: char.assetId
      })

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

  // Mark a character as having an active path (called when PathStartEvent received)
  setCharacterHasPath(characterId: string) {
    this.charactersWithActivePath.add(characterId)
  }

  // Mark a character as no longer having a path (called when path completes/cancels)
  clearCharacterPath(characterId: string) {
    this.charactersWithActivePath.delete(characterId)
    this.clearCharacterPathGraphics(characterId)
  }

  // Check if a character has an active path
  characterHasPath(characterId: string): boolean {
    return this.charactersWithActivePath.has(characterId)
  }

  // Draw path visualization for a single character
  drawCharacterPath(characterId: string, path: number[][]) {
    if (path.length === 0) {
      this.clearCharacterPathGraphics(characterId)
      return
    }

    // Store the path for progressive updates during movement
    this.characterPaths.set(characterId, path)

    let gfx = this.characterPathGraphics.get(characterId)
    if (!gfx) {
      gfx = this.add.graphics()
      gfx.setDepth(GameScene.DEPTH_UI)
      this.characterPathGraphics.set(characterId, gfx)
    }

    this.renderPathGraphics(gfx, path, PLAYER_COLORS[this.currentPlayerColorIndex])
  }

  // Draw paths for multiple characters (batch/squad)
  drawBatchPaths(paths: Record<string, number[][]>) {
    const color = PLAYER_COLORS[this.currentPlayerColorIndex]
    for (const [characterId, path] of Object.entries(paths)) {
      if (path.length === 0) continue

      this.characterPaths.set(characterId, path)

      let gfx = this.characterPathGraphics.get(characterId)
      if (!gfx) {
        gfx = this.add.graphics()
        gfx.setDepth(GameScene.DEPTH_UI)
        this.characterPathGraphics.set(characterId, gfx)
      }

      this.renderPathGraphics(gfx, path, color)
    }
  }

  // Render path dots/line onto a graphics object
  private renderPathGraphics(gfx: Phaser.GameObjects.Graphics, path: number[][], color: number) {
    gfx.clear()

    if (path.length === 0) return

    // Draw dotted path line
    const dotRadius = TILE_SIZE * 0.08
    gfx.fillStyle(color, 0.5)

    for (const [px, py] of path) {
      const cx = px * TILE_SIZE + TILE_SIZE / 2
      const cy = py * TILE_SIZE + TILE_SIZE / 2
      gfx.fillCircle(cx, cy, dotRadius)
    }

    // Draw destination marker (larger circle at the end)
    const last = path[path.length - 1]
    const destX = last[0] * TILE_SIZE + TILE_SIZE / 2
    const destY = last[1] * TILE_SIZE + TILE_SIZE / 2
    gfx.fillStyle(color, 0.7)
    gfx.fillCircle(destX, destY, dotRadius * 2.5)
    gfx.lineStyle(2, color, 0.8)
    gfx.strokeCircle(destX, destY, dotRadius * 2.5)
  }

  // Clear path graphics for a specific character
  private clearCharacterPathGraphics(characterId: string) {
    const gfx = this.characterPathGraphics.get(characterId)
    if (gfx) {
      gfx.destroy()
      this.characterPathGraphics.delete(characterId)
    }
    this.characterPaths.delete(characterId)
  }

  // Clear all path visualizations
  clearAllPathGraphics() {
    this.characterPathGraphics.forEach(gfx => gfx.destroy())
    this.characterPathGraphics.clear()
    this.characterPaths.clear()
    if (this.pathGraphics) {
      this.pathGraphics.clear()
    }
  }

  // Update path visualization after a character moves one step (shrink remaining path)
  updateCharacterPathAfterMove(characterId: string, newX: number, newY: number) {
    const path = this.characterPaths.get(characterId)
    if (!path || path.length === 0) return

    // Remove steps the character has reached
    while (path.length > 0 && path[0][0] === newX && path[0][1] === newY) {
      path.shift()
    }

    if (path.length === 0) {
      // Path complete — clear visualization
      this.clearCharacterPathGraphics(characterId)
    } else {
      // Redraw remaining path
      const gfx = this.characterPathGraphics.get(characterId)
      if (gfx) {
        this.renderPathGraphics(gfx, path, PLAYER_COLORS[this.currentPlayerColorIndex])
      }
    }
  }

  // ============================================
  // Attack and Projectile Handling
  // ============================================

  // Projectile sprites
  private projectileSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  // Track which asset ID each projectile uses (for landed animation lookup)
  private projectileAssetIds: Map<string, string> = new Map()
  // Track which projectiles have already hit (to prevent late texture loads from overwriting landed animation)
  private projectilesHit: Set<string> = new Set()
  // Cache for loaded projectile textures
  private loadedProjectileTextures: Set<string> = new Set()
  // Landed objects (projectiles that have stopped) - tracked for cleanup
  private landedObjects: Phaser.GameObjects.Sprite[] = []

  // Spawn a projectile (called from ProjectileSpawnEvent)
  spawnProjectile(event: ProjectileSpawnEvent) {
    // Prevent duplicate spawns (React StrictMode causes duplicate WebSocket subscriptions)
    if (this.projectileSprites.has(event.projectileId)) {
      return
    }

    const textureKey = `projectile_${event.projectileAssetId}_idle_0`
    const hasTexture = this.loadedProjectileTextures.has(event.projectileAssetId) &&
                       this.textures.exists(textureKey)

    // Create sprite at start position
    const startX = event.startX * TILE_SIZE + TILE_SIZE / 2
    const startY = event.startY * TILE_SIZE + TILE_SIZE / 2
    const targetX = event.targetX * TILE_SIZE + TILE_SIZE / 2
    const targetY = event.targetY * TILE_SIZE + TILE_SIZE / 2

    let sprite: Phaser.GameObjects.Sprite

    if (hasTexture) {
      // Use loaded projectile sprite
      sprite = this.add.sprite(startX, startY, textureKey)
      sprite.setScale(TILE_SIZE / 128) // Object sprites are 128px, scale to tile size
      // Play the idle animation (flying) if it exists
      const idleAnimKey = `projectile_${event.projectileAssetId}_idle_anim`
      if (this.anims.exists(idleAnimKey)) {
        sprite.play(idleAnimKey)
      }
    } else {
      // Create placeholder while loading
      if (!this.textures.exists("projectile_placeholder")) {
        const graphics = this.add.graphics()
        graphics.fillStyle(0xff6600, 1)
        graphics.fillCircle(8, 8, 6)
        graphics.generateTexture("projectile_placeholder", 16, 16)
        graphics.destroy()
      }
      sprite = this.add.sprite(startX, startY, "projectile_placeholder")

      // Start loading the actual texture
      this.loadProjectileTexture(event.projectileAssetId, event.projectileId)
    }

    sprite.setDepth(GameScene.DEPTH_PROJECTILE)

    // Calculate angle to target and rotate sprite
    const angle = Math.atan2(event.targetY - event.startY, event.targetX - event.startX)
    sprite.setRotation(angle + Math.PI / 2) // +90 degrees because sprites typically face up

    this.projectileSprites.set(event.projectileId, sprite)
    this.projectileAssetIds.set(event.projectileId, event.projectileAssetId)

    // Calculate tween duration based on distance and speed
    const distance = Math.sqrt(
      Math.pow(event.targetX - event.startX, 2) +
      Math.pow(event.targetY - event.startY, 2)
    )
    const durationMs = (distance / event.speed) * 1000

    // Animate projectile flight
    this.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      duration: durationMs,
      ease: "Linear"
    })
  }

  // Dynamically load projectile textures and create animations (idle + landed)
  private async loadProjectileTexture(assetId: string, projectileId: string) {
    try {
      // Get the asset info from our assetMap or construct path
      let storageKeyPrefix = this.assetMap.get(assetId)?.storageKeyPrefix
      if (!storageKeyPrefix) {
        storageKeyPrefix = `objects/${assetId}`
      }

      // First, fetch the definition.json to know how many frames
      const definitionUrl = getAssetFileUrl(storageKeyPrefix, "definition.json")
      const response = await fetch(definitionUrl)
      if (!response.ok) {
        console.warn("Failed to fetch projectile definition:", response.status)
        return
      }
      const definition = await response.json()

      const visualState = definition.visualStates?.[0] ?? "new"

      // Load idle frames (for flying)
      const idleFrameCount = definition.states?.idle?.frames ?? 1
      const idleFrameKeys: string[] = []
      for (let i = 0; i < idleFrameCount; i++) {
        const textureKey = `projectile_${assetId}_idle_${i}`
        const fileName = `${visualState}_idle_${i}.png`
        const url = getAssetFileUrl(storageKeyPrefix, fileName)
        this.load.image(textureKey, url)
        idleFrameKeys.push(textureKey)
      }

      // Load landed frames (for impact) if they exist
      const landedFrameCount = definition.states?.landed?.frames ?? 0
      const landedFrameKeys: string[] = []
      for (let i = 0; i < landedFrameCount; i++) {
        const textureKey = `projectile_${assetId}_landed_${i}`
        const fileName = `${visualState}_landed_${i}.png`
        const url = getAssetFileUrl(storageKeyPrefix, fileName)
        this.load.image(textureKey, url)
        landedFrameKeys.push(textureKey)
      }

      // When all frames loaded, create animations and update sprite
      this.load.once("complete", () => {
        this.loadedProjectileTextures.add(assetId)

        // Create idle animation (looping, for flight)
        const idleAnimKey = `projectile_${assetId}_idle_anim`
        if (!this.anims.exists(idleAnimKey)) {
          const frames = idleFrameKeys
            .filter(key => this.textures.exists(key))
            .map(key => ({ key }))

          if (frames.length > 0) {
            this.anims.create({
              key: idleAnimKey,
              frames: frames,
              frameRate: 10,
              repeat: -1 // Loop forever while flying
            })
          }
        }

        // Create landed animation (plays once, for impact)
        const landedAnimKey = `projectile_${assetId}_landed_anim`
        if (landedFrameKeys.length > 0 && !this.anims.exists(landedAnimKey)) {
          const frames = landedFrameKeys
            .filter(key => this.textures.exists(key))
            .map(key => ({ key }))

          if (frames.length > 0) {
            this.anims.create({
              key: landedAnimKey,
              frames: frames,
              frameRate: 10,
              repeat: 0 // Play once
            })
          }
        }

        // Update the sprite if it still exists in our map (removed on hit)
        // This check is sufficient because we delete from projectileSprites immediately on hit
        const sprite = this.projectileSprites.get(projectileId)
        if (sprite) {
          const firstFrameKey = idleFrameKeys[0]
          if (this.textures.exists(firstFrameKey)) {
            sprite.setTexture(firstFrameKey)
            sprite.setScale(TILE_SIZE / 128)
            if (this.anims.exists(idleAnimKey)) {
              sprite.play(idleAnimKey)
            }
          }
        }
      })
      this.load.start()
    } catch (err) {
      console.warn("Failed to load projectile texture:", err)
    }
  }

  // Handle projectile hit (called from ProjectileHitEvent)
  handleProjectileHit(event: ProjectileHitEvent) {
    const sprite = this.projectileSprites.get(event.projectileId)
    const assetId = this.projectileAssetIds.get(event.projectileId)

    // Mark as hit AND remove from maps immediately to prevent any further updates
    this.projectilesHit.add(event.projectileId)
    this.projectileSprites.delete(event.projectileId)
    this.projectileAssetIds.delete(event.projectileId)

    if (sprite) {
      // Stop any current animation/tween
      sprite.stop()
      this.tweens.killTweensOf(sprite)

      // Move to landed object layer (below characters, above paths)
      sprite.setDepth(GameScene.DEPTH_LANDED_OBJECT)
      sprite.setRotation(0)

      // Check if there's a "landed" animation for this projectile
      const landedAnimKey = assetId ? `projectile_${assetId}_landed_anim` : null
      const hasLandedAnim = landedAnimKey && this.anims.exists(landedAnimKey)

      if (hasLandedAnim) {
        // Play landed animation - stops on last frame (repeat: 0)
        sprite.play(landedAnimKey)
      }
      // else: keep showing last idle frame as static object

      // Track as landed object for cleanup, clear projectile tracking
      this.landedObjects.push(sprite)
      this.projectilesHit.delete(event.projectileId)
    }
  }

  // Handle damage event (called from DamageEvent)
  handleDamage(event: DamageEvent) {
    const char = this.characters.find(c => c.id === event.characterId)
    if (!char) return

    // Update character's local state
    char.health = event.newHealth
    char.visualState = event.newVisualState

    const sprite = this.characterSprites.get(event.characterId)
    if (sprite) {
      // Flash character red
      sprite.setTint(0xff0000)
      this.time.delayedCall(200, () => {
        sprite.clearTint()
      })
    }

    // Show floating damage number
    const worldX = char.x * TILE_SIZE + TILE_SIZE / 2
    const worldY = char.y * TILE_SIZE

    const text = this.add.text(worldX, worldY, `-${event.damage}`, {
      fontSize: "24px",
      color: "#ff4444",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 4
    })
    text.setOrigin(0.5, 0.5)
    text.setDepth(GameScene.DEPTH_UI)

    // Float up and fade out
    this.tweens.add({
      targets: text,
      y: worldY - 50,
      alpha: 0,
      duration: 1000,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy()
    })
  }

  // Handle character death (called from CharacterDeathEvent)
  handleCharacterDeath(event: CharacterDeathEvent) {
    const sprite = this.characterSprites.get(event.characterId)
    if (sprite) {
      // Fade out death animation
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scale: 0.5,
        duration: 500,
        onComplete: () => {
          sprite.setVisible(false)
        }
      })
    }

    // Remove from characters list (they're "dead")
    const index = this.characters.findIndex(c => c.id === event.characterId)
    if (index >= 0) {
      this.characters.splice(index, 1)
    }

    // Clear glow if present
    const glow = this.characterGlows.get(event.characterId)
    if (glow) {
      glow.destroy()
      this.characterGlows.delete(event.characterId)
    }

    // Clear selection indicator and path graphics
    this.removeSelectionIndicator(event.characterId)
    this.clearCharacterPathGraphics(event.characterId)
    this.controlledCharacterIds.delete(event.characterId)
    this.charactersWithActivePath.delete(event.characterId)
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
  const [game, setGame] = useState<GameDTO | null>(null)
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [controlledCharacterIds, setControlledCharacterIds] = useState<Set<string>>(new Set())
  const [attackModeId, setAttackModeId] = useState<string | null>(null) // Currently selected attack ID
  const [characterAttacks, setCharacterAttacks] = useState<AttackDefinition[]>([]) // Attacks for controlled character

  // Refs for cleanup and avoiding stale closures
  const gameIdRef = useRef<string | null>(null)
  const controlledCharacterIdsRef = useRef<Set<string>>(new Set())
  const sendMoveRef = useRef<((direction: "n" | "s" | "e" | "w") => boolean) | null>(null)
  const sendPathRef = useRef<((targetX: number, targetY: number) => boolean) | null>(null)
  const sendBatchPathRef = useRef<((characterIds: string[], targetX: number, targetY: number) => boolean) | null>(null)
  const sendAttackRef = useRef<((attackId: string, targetX: number, targetY: number) => boolean) | null>(null)
  const attackModeIdRef = useRef<string | null>(null)
  const handleBoxSelectRef = useRef<((characterIds: string[]) => void) | null>(null)

  // Keep refs in sync with state
  useEffect(() => {
    gameIdRef.current = gameId ?? null
  }, [gameId])

  useEffect(() => {
    controlledCharacterIdsRef.current = controlledCharacterIds
  }, [controlledCharacterIds])

  useEffect(() => {
    attackModeIdRef.current = attackModeId
  }, [attackModeId])

  // Cleanup: release all controlled characters when leaving the game screen
  useEffect(() => {
    return () => {
      const gId = gameIdRef.current
      const charIds = controlledCharacterIdsRef.current
      if (gId && charIds.size > 0) {
        // Fire and forget - don't await since component is unmounting
        relinquishCharacter(gId).catch(err => {
          console.warn("Failed to release characters on unmount:", err)
        })
      }
    }
  }, [])

  // Handle WebSocket character move events - uses backend-driven animation state and duration
  const handleCharacterMove = useCallback((event: CharacterMoveEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      // Pass backend's animation state and duration directly (backend is Single Source of Truth)
      // Path visualization is progressively updated inside animateCharacterMove's onComplete
      scene.animateCharacterMove(event.characterId, event.x, event.y, event.state, event.duration)
    }
  }, [])

  // Handle WebSocket character idle events - backend tells us when to go idle
  const handleCharacterIdle = useCallback((event: CharacterIdleEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      // Clear path tracking (path completed or cancelled)
      scene.clearCharacterPath(event.characterId)
      scene.setCharacterState(event.characterId, event.state)
    }
  }, [])

  // Handle WebSocket errors
  const handleWebSocketError = useCallback((message: string) => {
    console.error("WebSocket error:", message)
  }, [])

  // Handle path start event
  const handlePathStart = useCallback((event: PathStartEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.setCharacterHasPath(event.characterId)
      scene.drawCharacterPath(event.characterId, event.path)
    }
  }, [])

  // Handle path cancel/complete - clear visualization
  const handlePathCancel = useCallback((event: { characterId: string }) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.clearCharacterPath(event.characterId)
    }
  }, [])

  // Handle batch path start event (squad movement)
  const handleBatchPathStart = useCallback((event: BatchPathStartEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      // Mark each character as having an active path
      for (const characterId of Object.keys(event.paths)) {
        scene.setCharacterHasPath(characterId)
      }
      // Draw all paths at once
      scene.drawBatchPaths(event.paths)
    }
  }, [])

  // Handle attack start event
  const handleAttackStart = useCallback((event: AttackStartEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      // Play attack animation using backend-provided state
      scene.setCharacterState(event.characterId, event.state)

      // Schedule return to idle after animation
      setTimeout(() => {
        const s = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
        if (s) {
          const idleState = "idle_" + event.direction
          s.setCharacterState(event.characterId, idleState)
        }
      }, event.animationDuration)
    }
  }, [])

  // Handle projectile spawn event
  const handleProjectileSpawn = useCallback((event: ProjectileSpawnEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.spawnProjectile(event)
    }
  }, [])

  // Handle projectile hit event
  const handleProjectileHit = useCallback((event: ProjectileHitEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.handleProjectileHit(event)
    }
  }, [])

  // Handle damage event
  const handleDamage = useCallback((event: DamageEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.handleDamage(event)
    }

    // Update local game state
    setGame(prev => {
      if (!prev) return prev
      return {
        ...prev,
        characters: prev.characters.map(c =>
          c.id === event.characterId
            ? { ...c, health: event.newHealth, visualState: event.newVisualState }
            : c
        )
      }
    })
  }, [])

  // Handle character death event
  const handleCharacterDeath = useCallback((event: CharacterDeathEvent) => {
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      scene.handleCharacterDeath(event)
    }
  }, [])

  // WebSocket connection
  const { isConnected, sendMove, sendPath, sendBatchPath, sendAttack } = useGameWebSocket({
    gameId: gameId || "",
    onCharacterMove: handleCharacterMove,
    onCharacterIdle: handleCharacterIdle,
    onPathStart: handlePathStart,
    onPathCancel: handlePathCancel,
    onBatchPathStart: handleBatchPathStart,
    onAttackStart: handleAttackStart,
    onProjectileSpawn: handleProjectileSpawn,
    onProjectileHit: handleProjectileHit,
    onDamage: handleDamage,
    onCharacterDeath: handleCharacterDeath,
    onError: handleWebSocketError,
    onConnected: () => console.log("Game WebSocket connected"),
    onDisconnected: () => console.log("Game WebSocket disconnected"),
  })

  // Keep WebSocket function refs up to date (to avoid stale closures in Phaser callbacks)
  useEffect(() => {
    sendMoveRef.current = sendMove
  }, [sendMove])

  useEffect(() => {
    sendPathRef.current = sendPath
  }, [sendPath])

  useEffect(() => {
    sendBatchPathRef.current = sendBatchPath
  }, [sendBatchPath])

  useEffect(() => {
    sendAttackRef.current = sendAttack
  }, [sendAttack])

  // Load game data
  useEffect(() => {
    if (!gameId) return

    async function loadGame() {
      try {
        setIsLoading(true)
        const gameData = await getGame(gameId!)
        setGame(gameData)
        gameDataRef.current = gameData // Store for Phaser init

        // Find if current user controls characters
        const currentPlayer = gameData.players.find(p =>
          authUser && p.playerId === authUser.userId
        )
        if (currentPlayer?.controlledCharacterIds && currentPlayer.controlledCharacterIds.length > 0) {
          setControlledCharacterIds(new Set(currentPlayer.controlledCharacterIds))
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

    // Prevent double initialization - check if Phaser already exists
    // Also use hasEverInitializedRef for React Strict Mode (where phaserGameRef is destroyed then re-checked)
    if (phaserGameRef.current || hasEverInitializedRef.current) return
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
      const initialControlledCharacterIds = currentPlayer?.controlledCharacterIds ?? []

      phaserGame.scene.start("GameScene", {
        mapData: mapData!,
        characters: initialGameData.characters,
        players: initialGameData.players.map(p => ({
          playerId: p.playerId,
          colorIndex: p.colorIndex
        })),
        currentPlayerId,
        initialControlledCharacterIds,
        assetMap,
        tileProperties,
        entityDefinitions,
        onCharacterClick: (characterId: string, _shiftKey: boolean) => {
          // Single click or shift+click: triggers auto-take-control via selectedCharacter effect
          setSelectedCharacter(characterId)
        },
        onBoxSelect: (characterIds: string[]) => {
          // Box select: batch take-over all characters at once
          handleBoxSelectRef.current?.(characterIds)
        },
        onTileClick: (_x: number, _y: number) => {
          // Clicking empty tile releases all control
          setSelectedCharacter(null)
        },
        onMoveInput: (direction: "n" | "s" | "e" | "w") => {
          // Manual move cancels any active path visualization for the controlled character
          const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
          if (scene) {
            scene.clearAllPathGraphics()
          }
          sendMoveRef.current?.(direction)
        },
        onPathRequest: (targetX: number, targetY: number) => {
          if (attackModeIdRef.current) {
            sendAttackRef.current?.(attackModeIdRef.current, targetX, targetY)
          } else {
            sendPathRef.current?.(targetX, targetY)
          }
        },
        onBatchPathRequest: (characterIds: string[], targetX: number, targetY: number) => {
          sendBatchPathRef.current?.(characterIds, targetX, targetY)
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

  // Auto take control when clicking a character (additive — adds to controlled set)
  useEffect(() => {
    if (!gameId || !game || !selectedCharacter) return

    const char = game.characters.find(c => c.id === selectedCharacter)
    if (!char) return

    // If already controlling this character, do nothing
    if (controlledCharacterIds.has(selectedCharacter)) return

    // If character is controlled by another player, reject
    if (char.controlled) {
      console.log("Character is controlled by another player")
      return
    }

    async function autoTakeControl() {
      try {
        await takeOverCharacter(gameId!, selectedCharacter!)

        const newSet = new Set(controlledCharacterIds)
        newSet.add(selectedCharacter!)
        setControlledCharacterIds(newSet)

        const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
        const updated = await getGame(gameId!)

        if (scene) {
          scene.updatePlayers(updated.players.map(p => ({
            playerId: p.playerId,
            colorIndex: p.colorIndex
          })))
          scene.updateCharacters(updated.characters)
          scene.addControlledCharacter(selectedCharacter!)
        }

        setGame(updated)
      } catch (err) {
        console.error("Failed to take over character:", err)
      }
    }

    autoTakeControl()
  }, [selectedCharacter, gameId, game, controlledCharacterIds])

  // Auto release all control when clicking empty tile (selectedCharacter becomes null)
  useEffect(() => {
    if (!gameId || selectedCharacter !== null) return
    if (controlledCharacterIds.size === 0) return

    async function autoReleaseControl() {
      try {
        await relinquishCharacter(gameId!)
        setControlledCharacterIds(new Set())
        const updated = await getGame(gameId!)
        setGame(updated)
        const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene
        if (scene) {
          scene.updatePlayers(updated.players.map(p => ({
            playerId: p.playerId,
            colorIndex: p.colorIndex
          })))
          scene.updateCharacters(updated.characters)
          scene.clearAllControlledCharacters()
        }
      } catch (err) {
        console.error("Failed to relinquish characters:", err)
      }
    }

    autoReleaseControl()
  }, [selectedCharacter, gameId, controlledCharacterIds])

  // Box select handler: batch take-over all characters at once
  const handleBoxSelect = useCallback(async (characterIds: string[]) => {
    if (!gameId || !game || characterIds.length === 0) return

    // Filter: only take over characters not already controlled by this player
    const alreadyControlled = controlledCharacterIdsRef.current
    const toTakeOver = characterIds.filter(id => !alreadyControlled.has(id))
    const alreadyOurs = characterIds.filter(id => alreadyControlled.has(id))

    // Take over new characters in parallel
    const succeeded = [...alreadyOurs]
    await Promise.all(toTakeOver.map(async (charId) => {
      try {
        await takeOverCharacter(gameId, charId)
        succeeded.push(charId)
      } catch (err) {
        console.warn("Failed to take over character:", charId, err)
      }
    }))

    if (succeeded.length === 0) return

    // Update React state — set selectedCharacter to first succeeded ID
    // to prevent the auto-release effect from firing (it triggers when selectedCharacter is null)
    setSelectedCharacter(succeeded[0])

    const newSet = new Set(succeeded)
    setControlledCharacterIds(newSet)

    // Update the scene with all controlled characters
    const scene = phaserGameRef.current?.scene.getScene("GameScene") as GameScene | undefined
    if (scene) {
      const updated = await getGame(gameId)
      scene.updatePlayers(updated.players.map(p => ({
        playerId: p.playerId,
        colorIndex: p.colorIndex
      })))
      scene.updateCharacters(updated.characters)
      scene.setControlledCharacters(succeeded)
      setGame(updated)
    }
  }, [gameId, game])

  // Keep handleBoxSelect ref in sync
  useEffect(() => {
    handleBoxSelectRef.current = handleBoxSelect
  }, [handleBoxSelect])

  // Load character attacks when controlled characters change (only for single character)
  useEffect(() => {
    if (controlledCharacterIds.size !== 1 || !game) {
      setCharacterAttacks([])
      setAttackModeId(null)
      return
    }

    const charId = Array.from(controlledCharacterIds)[0]
    const char = game.characters.find(c => c.id === charId)
    if (!char) {
      setCharacterAttacks([])
      setAttackModeId(null)
      return
    }

    async function loadCharacterAttacks() {
      try {
        const asset = await getAssetById(char!.assetId)
        const definition = await getAssetFile<{
          name: string
          attacks?: AttackDefinition[]
        }>(asset.storageKeyPrefix, "definition.json")

        if (definition.attacks && definition.attacks.length > 0) {
          setCharacterAttacks(definition.attacks)
        } else {
          setCharacterAttacks([])
        }
      } catch (err) {
        console.warn("Failed to load character attacks:", err)
        setCharacterAttacks([])
      }
      setAttackModeId(null)
    }

    loadCharacterAttacks()
  }, [controlledCharacterIds, game])

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

          {/* Character control - shows currently controlled characters */}
          {controlledCharacterIds.size > 0 && (
            <Card className="bg-zinc-800 border-zinc-700 border-green-500/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm text-green-400">
                  Controlling ({controlledCharacterIds.size})
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3 space-y-2">
                {Array.from(controlledCharacterIds).map(charId => {
                  const char = game.characters.find(c => c.id === charId)
                  return char ? (
                    <div key={charId} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-100">{char.name}</span>
                      <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <Heart className="w-3 h-3 text-red-400" />
                        {char.health}/{char.maxHealth}
                      </div>
                    </div>
                  ) : null
                })}
                <p className="text-xs text-zinc-500">Click empty tile to release all</p>
              </CardContent>
            </Card>
          )}

          {/* Attack mode panel - only show when controlling a single character with attacks */}
          {controlledCharacterIds.size === 1 && characterAttacks.length > 0 && (
            <Card className={`bg-zinc-800 border-zinc-700 ${attackModeId ? "border-red-500/50" : ""}`}>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm text-zinc-100 flex items-center gap-2">
                  <Swords className="w-4 h-4" />
                  Attacks
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3 space-y-2">
                {characterAttacks.map(attack => {
                  const isSelected = attackModeId === attack.id
                  return (
                    <button
                      key={attack.id}
                      onClick={() => setAttackModeId(isSelected ? null : attack.id)}
                      className={`w-full p-2 rounded text-left transition-colors ${
                        isSelected
                          ? "bg-red-600 text-white"
                          : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">{attack.name}</span>
                        <span className="text-xs">
                          {attack.type === "RANGED" ? <Target className="w-3 h-3" /> : <Swords className="w-3 h-3" />}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Range: {attack.range} | Dmg: {attack.damage}
                      </div>
                    </button>
                  )
                })}
                {attackModeId && (
                  <p className="text-xs text-red-400 mt-2">
                    Attack mode active. Right-click to attack.
                  </p>
                )}
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
            {controlledCharacterIds.size === 1 ? (
              <>
                <p className="text-green-400">WASD / Arrows: Move character</p>
                <p className="text-green-400">Right-click: Pathfind to target</p>
                <p>Camera follows character</p>
                <p>Click empty tile: Release all</p>
              </>
            ) : controlledCharacterIds.size > 1 ? (
              <>
                <p className="text-green-400">Right-click: Squad pathfind</p>
                <p>Shift+click: Toggle selection</p>
                <p>Click empty tile: Release all</p>
              </>
            ) : (
              <p>WASD / Arrows: Pan camera</p>
            )}
            <p>Mouse wheel: Zoom</p>
            <p>Click character: Take control</p>
            <p>Drag: Box select</p>
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
