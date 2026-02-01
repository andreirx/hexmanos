import { useState, useRef, useCallback, useEffect } from "react"
import { PixelCanvas, type CanvasTool } from "@/features/editor/components/PixelCanvas"
import { TileGallery } from "../components/TileGallery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { getPresignedUrl, uploadToPresignedUrl, registerAsset, getAssetFile, getAssetsByType, loadAssetImage } from "@/api/assets"
import { syncUser } from "@/api/users"
import { useAuth } from "@/context/AuthContext"
import {
  Save, Trash2, Image, Check, X, Pencil, Eraser, Square, Undo2, Redo2,
  FolderOpen, FilePlus, Plus, Copy, ChevronLeft, ChevronRight, PaintBucket, Shuffle,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from "lucide-react"
import type { UserDTO, AssetDTO } from "@/api/types"

// Tile properties structure from JSON
interface TileProperties {
  name: string
  tileSize: number
  passable: boolean
  variations: number
  tileType?: "TILE" | "PATH" | "BRIDGE"  // PATH tiles have exactly 15 variations, BRIDGE tiles auto-render under paths over water
  terrainType?: "LAND" | "WATER"  // WATER paths are rivers (not passable)
  movementCost?: number  // 1=easy (default), 2=normal, 3+=difficult, 0=impassable (for pathfinding)
  bridgeAssetId?: string  // For LAND PATH tiles: which BRIDGE asset to draw when path crosses water
}

const TILE_SIZE = 128
const MAX_HISTORY = 10
const MAX_VARIATIONS = 8
const BRUSH_SIZES = [1, 2, 4, 8, 16]

// Path constants (56px wide center)
const PATH_CENTER_START = 36  // Center rectangle starts at 36
const PATH_CENTER_END = 92    // Center rectangle ends at 92
const PATH_FADE_PIXELS = 4    // Number of pixels for border fade

// Bridge constants (72px wide center)
const BRIDGE_CENTER_START = 28
const BRIDGE_CENTER_END = 100

// PATH tile type: 15 variations for all direction combinations (excluding 0000)
// Bits: Up=8, Down=4, Left=2, Right=1
type PathDirection = { up: boolean; down: boolean; left: boolean; right: boolean }
const PATH_COMBINATIONS: PathDirection[] = [
  { up: false, down: false, left: false, right: true },  // 0001 - Right
  { up: false, down: false, left: true, right: false },  // 0010 - Left
  { up: false, down: false, left: true, right: true },   // 0011 - Left+Right (horizontal)
  { up: false, down: true, left: false, right: false },  // 0100 - Down
  { up: false, down: true, left: false, right: true },   // 0101 - Down+Right
  { up: false, down: true, left: true, right: false },   // 0110 - Down+Left
  { up: false, down: true, left: true, right: true },    // 0111 - Down+Left+Right (T-bottom)
  { up: true, down: false, left: false, right: false },  // 1000 - Up
  { up: true, down: false, left: false, right: true },   // 1001 - Up+Right
  { up: true, down: false, left: true, right: false },   // 1010 - Up+Left
  { up: true, down: false, left: true, right: true },    // 1011 - Up+Left+Right (T-top)
  { up: true, down: true, left: false, right: false },   // 1100 - Up+Down (vertical)
  { up: true, down: true, left: false, right: true },    // 1101 - Up+Down+Right (T-right)
  { up: true, down: true, left: true, right: false },    // 1110 - Up+Down+Left (T-left)
  { up: true, down: true, left: true, right: true },     // 1111 - All (crossroads)
]

function getPathLabel(dirs: PathDirection): string {
  const parts: string[] = []
  if (dirs.up) parts.push("↑")
  if (dirs.down) parts.push("↓")
  if (dirs.left) parts.push("←")
  if (dirs.right) parts.push("→")
  return parts.join("")
}

interface VariationFrame {
  pixels: Uint8ClampedArray
}

// History per variation
type VariationHistoryKey = number
interface VariationHistory {
  undoStack: Uint8ClampedArray[]
  redoStack: Uint8ClampedArray[]
}

function createEmptyFrame(): VariationFrame {
  return { pixels: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4) }
}

export function TileEditorPage() {
  const { isAuthenticated, user: authUser } = useAuth()

  // Variation frames
  const [variations, setVariations] = useState<VariationFrame[]>([createEmptyFrame()])
  const [currentVariationIndex, setCurrentVariationIndex] = useState(0)

  const [currentColor, setCurrentColor] = useState("#ffffff")
  const [currentTool, setCurrentTool] = useState<CanvasTool>("pencil")
  const [brushSize, setBrushSize] = useState(1)
  const [tileName, setTileName] = useState("")
  const [passable, setPassable] = useState(true)
  const [movementCost, setMovementCost] = useState(1) // 1=easy (default), 2=normal, 3+=difficult
  const [tileType, setTileType] = useState<"TILE" | "PATH" | "BRIDGE">("TILE")
  const [terrainType, setTerrainType] = useState<"LAND" | "WATER">("LAND")
  const [bridgeAssetId, setBridgeAssetId] = useState<string | null>(null)
  const [availableBridges, setAvailableBridges] = useState<AssetDTO[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [backendUser, setBackendUser] = useState<UserDTO | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fill tool state - 3 dedicated colors for random fill (background)
  const [fillColor1, setFillColor1] = useState("#228b22")
  const [fillColor2, setFillColor2] = useState("#2e8b57")
  const [fillColor3, setFillColor3] = useState("#32cd32")

  // Path tool state - 3 dedicated colors for path drawing
  const [pathColor1, setPathColor1] = useState("#8b7355")
  const [pathColor2, setPathColor2] = useState("#a0826d")
  const [pathColor3, setPathColor3] = useState("#c4a882")
  const [useRandomPath, setUseRandomPath] = useState(true)

  // Undo/Redo history per variation
  const historyRef = useRef<Map<VariationHistoryKey, VariationHistory>>(new Map())

  // Gallery and loading state
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [loadedAsset, setLoadedAsset] = useState<AssetDTO | null>(null)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [isLoadingTile, setIsLoadingTile] = useState(false)

  // Current variation
  const currentVariation = variations[currentVariationIndex] || variations[0]

  // Load available bridge assets for bridgeAssetId selector (when editing LAND PATH tiles)
  useEffect(() => {
    if (tileType !== "PATH" || terrainType !== "LAND") {
      setAvailableBridges([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const allTiles = await getAssetsByType("TILE")
        const bridges: AssetDTO[] = []
        for (const asset of allTiles) {
          try {
            const props = await getAssetFile<TileProperties>(asset.storageKeyPrefix, "properties.json")
            if (props.tileType === "BRIDGE") {
              bridges.push(asset)
            }
          } catch { /* skip assets without properties */ }
        }
        if (!cancelled) setAvailableBridges(bridges)
      } catch (err) {
        console.error("Failed to load bridge assets:", err)
      }
    })()
    return () => { cancelled = true }
  }, [tileType, terrainType])

  // Sync user with backend when authenticated
  useEffect(() => {
    if (isAuthenticated && authUser) {
      syncUser({
        cognitoSub: authUser.userId,
        pool: "PLAYER",
        displayName: authUser.username,
        email: authUser.email,
      })
        .then(setBackendUser)
        .catch((err) => console.error("Failed to sync user:", err))
    }
  }, [isAuthenticated, authUser])

  // Handle tile selection from gallery
  const handleTileSelect = async (asset: AssetDTO, mode: "edit" | "copy") => {
    setIsGalleryOpen(false)
    setIsLoadingTile(true)
    setStatusMessage(null)

    try {
      // Load the properties.json
      const properties = await getAssetFile<TileProperties>(
        asset.storageKeyPrefix,
        "properties.json"
      )

      // Load all variation frames
      const variationCount = properties.variations || 1
      const newVariations: VariationFrame[] = []

      for (let i = 0; i < variationCount; i++) {
        try {
          const pixels = await loadAssetImage(asset.storageKeyPrefix, `tile_${i}.png`)
          newVariations.push({ pixels })
        } catch (err) {
          console.warn(`Failed to load tile_${i}.png, using empty frame`)
          newVariations.push(createEmptyFrame())
        }
      }

      setVariations(newVariations)
      setCurrentVariationIndex(0)
      setPassable(properties.passable)
      setMovementCost(properties.movementCost ?? 1) // Default to 1 if not set
      setTileType(properties.tileType || "TILE")
      setTerrainType(properties.terrainType || "LAND")
      setBridgeAssetId(properties.bridgeAssetId || null)
      clearAllHistory()

      if (mode === "edit") {
        setLoadedAsset(asset)
        setTileName(properties.name)
        setIsReadOnly(false)
        setStatusMessage({ type: "success", text: `Loaded "${properties.name}" for editing` })
      } else {
        setLoadedAsset(null)
        setTileName(`${properties.name} (Copy)`)
        setIsReadOnly(false)
        setStatusMessage({ type: "success", text: `Copied "${properties.name}" - save as your own!` })
      }
    } catch (err) {
      console.error("Failed to load tile:", err)
      setStatusMessage({ type: "error", text: "Failed to load tile. Please try again." })
    } finally {
      setIsLoadingTile(false)
    }
  }

  // Start a new tile
  const handleNewTile = () => {
    setVariations([createEmptyFrame()])
    setCurrentVariationIndex(0)
    setTileName("")
    setPassable(true)
    setMovementCost(1)
    setTileType("TILE")
    setTerrainType("LAND")
    setLoadedAsset(null)
    setIsReadOnly(false)
    setStatusMessage(null)
    clearAllHistory()
  }

  // Convert hex color to RGBA tuple, accounting for eraser tool
  const getCurrentColor = useCallback((): [number, number, number, number] => {
    if (currentTool === "eraser") {
      return [0, 0, 0, 0]
    }
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(currentColor)
    if (result) {
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        255,
      ]
    }
    return [255, 255, 255, 255]
  }, [currentColor, currentTool])

  // Get or create history for current variation
  const getVariationHistory = useCallback((): VariationHistory => {
    if (!historyRef.current.has(currentVariationIndex)) {
      historyRef.current.set(currentVariationIndex, { undoStack: [], redoStack: [] })
    }
    return historyRef.current.get(currentVariationIndex)!
  }, [currentVariationIndex])

  // Called by PixelCanvas on mouseup
  const handleCommit = useCallback((newPixels: Uint8ClampedArray) => {
    const history = getVariationHistory()
    const currentPixels = variations[currentVariationIndex].pixels
    history.undoStack.push(new Uint8ClampedArray(currentPixels))

    if (history.undoStack.length > MAX_HISTORY) {
      history.undoStack.shift()
    }
    history.redoStack = []

    setVariations(prev => {
      const newVariations = [...prev]
      newVariations[currentVariationIndex] = { pixels: newPixels }
      return newVariations
    })
  }, [currentVariationIndex, variations, getVariationHistory])

  // Undo
  const handleUndo = useCallback(() => {
    const history = getVariationHistory()
    if (history.undoStack.length === 0) return

    const currentPixels = variations[currentVariationIndex].pixels
    history.redoStack.push(new Uint8ClampedArray(currentPixels))

    if (history.redoStack.length > MAX_HISTORY) {
      history.redoStack.shift()
    }

    const previousPixels = history.undoStack.pop()!
    setVariations(prev => {
      const newVariations = [...prev]
      newVariations[currentVariationIndex] = { pixels: previousPixels }
      return newVariations
    })
  }, [currentVariationIndex, variations, getVariationHistory])

  // Redo
  const handleRedo = useCallback(() => {
    const history = getVariationHistory()
    if (history.redoStack.length === 0) return

    const currentPixels = variations[currentVariationIndex].pixels
    history.undoStack.push(new Uint8ClampedArray(currentPixels))

    const nextPixels = history.redoStack.pop()!
    setVariations(prev => {
      const newVariations = [...prev]
      newVariations[currentVariationIndex] = { pixels: nextPixels }
      return newVariations
    })
  }, [currentVariationIndex, variations, getVariationHistory])

  const clearAllHistory = useCallback(() => {
    historyRef.current.clear()
  }, [])

  const currentHistory = getVariationHistory()
  const canUndo = currentHistory.undoStack.length > 0
  const canRedo = currentHistory.redoStack.length > 0

  // Fill functions
  const hexToRgba = (hex: string): [number, number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16), 255]
    }
    return [255, 255, 255, 255]
  }

  const handleFillSolid = () => {
    const color = hexToRgba(currentColor)
    const newPixels = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
    for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
      newPixels[i * 4] = color[0]
      newPixels[i * 4 + 1] = color[1]
      newPixels[i * 4 + 2] = color[2]
      newPixels[i * 4 + 3] = color[3]
    }
    handleCommit(newPixels)
  }

  const handleFillRandom = () => {
    const colors = [
      hexToRgba(fillColor1),
      hexToRgba(fillColor2),
      hexToRgba(fillColor3),
    ]
    const newPixels = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
    for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)]
      newPixels[i * 4] = color[0]
      newPixels[i * 4 + 1] = color[1]
      newPixels[i * 4 + 2] = color[2]
      newPixels[i * 4 + 3] = color[3]
    }
    handleCommit(newPixels)
  }

  // Path drawing functions
  const getPathColor = (): [number, number, number, number] => {
    if (useRandomPath) {
      const colors = [hexToRgba(pathColor1), hexToRgba(pathColor2), hexToRgba(pathColor3)]
      return colors[Math.floor(Math.random() * colors.length)]
    }
    return hexToRgba(pathColor1)
  }

  // Blend a path color with the background pixel based on fade factor (0 = full path, 1 = full background)
  const blendPixel = (
    pixels: Uint8ClampedArray,
    index: number,
    pathColor: [number, number, number, number],
    fadeFactor: number
  ) => {
    const bgR = pixels[index]
    const bgG = pixels[index + 1]
    const bgB = pixels[index + 2]
    const bgA = pixels[index + 3]

    pixels[index] = Math.round(pathColor[0] * (1 - fadeFactor) + bgR * fadeFactor)
    pixels[index + 1] = Math.round(pathColor[1] * (1 - fadeFactor) + bgG * fadeFactor)
    pixels[index + 2] = Math.round(pathColor[2] * (1 - fadeFactor) + bgB * fadeFactor)
    pixels[index + 3] = Math.max(pathColor[3], bgA) // Keep max alpha
  }

  // Draw path in a direction with fading borders
  const handleDrawPath = (direction: "up" | "down" | "left" | "right") => {
    const newPixels = new Uint8ClampedArray(currentVariation.pixels)

    // Use bridge or path center based on tile type
    const cStart = tileType === "BRIDGE" ? BRIDGE_CENTER_START : PATH_CENTER_START
    const cEnd = tileType === "BRIDGE" ? BRIDGE_CENTER_END : PATH_CENTER_END

    // Define rectangle bounds based on direction
    let xStart: number, xEnd: number, yStart: number, yEnd: number
    // Define which edges should fade (not at image edges)
    let fadeLeft = false, fadeRight = false, fadeTop = false, fadeBottom = false

    switch (direction) {
      case "up":
        xStart = cStart
        xEnd = cEnd
        yStart = 0
        yEnd = cEnd
        fadeLeft = true
        fadeRight = true
        fadeBottom = true
        break
      case "down":
        xStart = cStart
        xEnd = cEnd
        yStart = cStart
        yEnd = TILE_SIZE
        fadeLeft = true
        fadeRight = true
        fadeTop = true
        break
      case "left":
        xStart = 0
        xEnd = cEnd
        yStart = cStart
        yEnd = cEnd
        fadeTop = true
        fadeBottom = true
        fadeRight = true
        break
      case "right":
        xStart = cStart
        xEnd = TILE_SIZE
        yStart = cStart
        yEnd = cEnd
        fadeTop = true
        fadeBottom = true
        fadeLeft = true
        break
    }

    // Draw the path rectangle with fading borders
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const index = (y * TILE_SIZE + x) * 4
        const pathColor = getPathColor()

        // Calculate fade factors for each edge
        let fadeFactor = 0

        // Left edge fade (only if fadeLeft and not at image edge)
        if (fadeLeft && x >= xStart && x < xStart + PATH_FADE_PIXELS) {
          const edgeDist = x - xStart
          fadeFactor = Math.max(fadeFactor, 1 - (edgeDist + 1) / PATH_FADE_PIXELS)
        }

        // Right edge fade (only if fadeRight and not at image edge)
        if (fadeRight && x >= xEnd - PATH_FADE_PIXELS && x < xEnd) {
          const edgeDist = xEnd - 1 - x
          fadeFactor = Math.max(fadeFactor, 1 - (edgeDist + 1) / PATH_FADE_PIXELS)
        }

        // Top edge fade (only if fadeTop and not at image edge)
        if (fadeTop && y >= yStart && y < yStart + PATH_FADE_PIXELS) {
          const edgeDist = y - yStart
          fadeFactor = Math.max(fadeFactor, 1 - (edgeDist + 1) / PATH_FADE_PIXELS)
        }

        // Bottom edge fade (only if fadeBottom and not at image edge)
        if (fadeBottom && y >= yEnd - PATH_FADE_PIXELS && y < yEnd) {
          const edgeDist = yEnd - 1 - y
          fadeFactor = Math.max(fadeFactor, 1 - (edgeDist + 1) / PATH_FADE_PIXELS)
        }

        if (fadeFactor > 0) {
          blendPixel(newPixels, index, pathColor, fadeFactor)
        } else {
          // Full path color
          newPixels[index] = pathColor[0]
          newPixels[index + 1] = pathColor[1]
          newPixels[index + 2] = pathColor[2]
          newPixels[index + 3] = pathColor[3]
        }
      }
    }

    handleCommit(newPixels)
  }

  // Draw paths on a pixel array based on directions (for bulk generation)
  const drawPathsOnPixels = (
    pixels: Uint8ClampedArray,
    directions: PathDirection,
    centerStart: number = PATH_CENTER_START,
    centerEnd: number = PATH_CENTER_END,
  ): Uint8ClampedArray => {
    const newPixels = new Uint8ClampedArray(pixels)

    const drawDirection = (direction: "up" | "down" | "left" | "right") => {
      let xStart: number, xEnd: number, yStart: number, yEnd: number
      let fadeLeft = false, fadeRight = false, fadeTop = false, fadeBottom = false

      switch (direction) {
        case "up":
          xStart = centerStart; xEnd = centerEnd
          yStart = 0; yEnd = centerEnd
          fadeLeft = true; fadeRight = true; fadeBottom = true
          break
        case "down":
          xStart = centerStart; xEnd = centerEnd
          yStart = centerStart; yEnd = TILE_SIZE
          fadeLeft = true; fadeRight = true; fadeTop = true
          break
        case "left":
          xStart = 0; xEnd = centerEnd
          yStart = centerStart; yEnd = centerEnd
          fadeTop = true; fadeBottom = true; fadeRight = true
          break
        case "right":
          xStart = centerStart; xEnd = TILE_SIZE
          yStart = centerStart; yEnd = centerEnd
          fadeTop = true; fadeBottom = true; fadeLeft = true
          break
      }

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const index = (y * TILE_SIZE + x) * 4
          const pathColor = getPathColor()

          let fadeFactor = 0
          if (fadeLeft && x >= xStart && x < xStart + PATH_FADE_PIXELS) {
            fadeFactor = Math.max(fadeFactor, 1 - (x - xStart + 1) / PATH_FADE_PIXELS)
          }
          if (fadeRight && x >= xEnd - PATH_FADE_PIXELS && x < xEnd) {
            fadeFactor = Math.max(fadeFactor, 1 - (xEnd - 1 - x + 1) / PATH_FADE_PIXELS)
          }
          if (fadeTop && y >= yStart && y < yStart + PATH_FADE_PIXELS) {
            fadeFactor = Math.max(fadeFactor, 1 - (y - yStart + 1) / PATH_FADE_PIXELS)
          }
          if (fadeBottom && y >= yEnd - PATH_FADE_PIXELS && y < yEnd) {
            fadeFactor = Math.max(fadeFactor, 1 - (yEnd - 1 - y + 1) / PATH_FADE_PIXELS)
          }

          if (fadeFactor > 0) {
            blendPixel(newPixels, index, pathColor, fadeFactor)
          } else {
            newPixels[index] = pathColor[0]
            newPixels[index + 1] = pathColor[1]
            newPixels[index + 2] = pathColor[2]
            newPixels[index + 3] = pathColor[3]
          }
        }
      }
    }

    if (directions.up) drawDirection("up")
    if (directions.down) drawDirection("down")
    if (directions.left) drawDirection("left")
    if (directions.right) drawDirection("right")

    return newPixels
  }

  // Switch tile type
  const handleSwitchTileType = (newType: "TILE" | "PATH" | "BRIDGE") => {
    if (newType === tileType) return

    if (newType === "PATH" || newType === "BRIDGE") {
      // Create exactly 15 variations for PATH/BRIDGE tile
      const newVariations: VariationFrame[] = PATH_COMBINATIONS.map(() => createEmptyFrame())
      setVariations(newVariations)
      setCurrentVariationIndex(0)
      if (newType === "BRIDGE") {
        // Bridges are always LAND and passable
        setTerrainType("LAND")
        setPassable(true)
      } else {
        // PATH passability depends on terrain type: LAND=passable, WATER=not passable (rivers)
        setPassable(terrainType === "LAND")
      }
      clearAllHistory()
    } else {
      // Switch back to regular TILE with single variation
      setVariations([createEmptyFrame()])
      setCurrentVariationIndex(0)
      clearAllHistory()
    }
    setTileType(newType)
  }

  // Switch terrain type
  const handleSwitchTerrainType = (newTerrainType: "LAND" | "WATER") => {
    if (newTerrainType === terrainType) return
    setTerrainType(newTerrainType)

    // For PATH tiles, update passability based on terrain type
    if (tileType === "PATH" || tileType === "BRIDGE") {
      setPassable(newTerrainType === "LAND") // LAND paths passable, WATER paths (rivers) not passable
    }
  }

  // Fill all PATH/BRIDGE variations with background colors
  const handleFillAllBackgrounds = () => {
    if (tileType !== "PATH" && tileType !== "BRIDGE") return

    const colors = [hexToRgba(fillColor1), hexToRgba(fillColor2), hexToRgba(fillColor3)]

    setVariations(prev => prev.map(() => {
      const newPixels = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
      for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)]
        newPixels[i * 4] = color[0]
        newPixels[i * 4 + 1] = color[1]
        newPixels[i * 4 + 2] = color[2]
        newPixels[i * 4 + 3] = color[3]
      }
      return { pixels: newPixels }
    }))

    clearAllHistory()
    setStatusMessage({ type: "success", text: "Filled all 15 variations with background" })
  }

  // Generate all paths/bridges on all variations
  const handleGenerateAllPaths = () => {
    if (tileType !== "PATH" && tileType !== "BRIDGE") return

    const cStart = tileType === "BRIDGE" ? BRIDGE_CENTER_START : PATH_CENTER_START
    const cEnd = tileType === "BRIDGE" ? BRIDGE_CENTER_END : PATH_CENTER_END

    setVariations(prev => prev.map((variation, index) => {
      const directions = PATH_COMBINATIONS[index]
      const newPixels = drawPathsOnPixels(variation.pixels, directions, cStart, cEnd)
      return { pixels: newPixels }
    }))

    clearAllHistory()
    const label = tileType === "BRIDGE" ? "bridges" : "paths"
    setStatusMessage({ type: "success", text: `Generated ${label} on all 15 variations` })
  }

  // Variation management
  const handleAddVariation = () => {
    if (variations.length >= MAX_VARIATIONS) {
      setStatusMessage({ type: "error", text: `Maximum ${MAX_VARIATIONS} variations allowed` })
      return
    }
    setVariations(prev => [...prev, createEmptyFrame()])
    setCurrentVariationIndex(variations.length)
  }

  const handleDuplicateVariation = () => {
    if (variations.length >= MAX_VARIATIONS) {
      setStatusMessage({ type: "error", text: `Maximum ${MAX_VARIATIONS} variations allowed` })
      return
    }
    const duplicated = { pixels: new Uint8ClampedArray(currentVariation.pixels) }
    setVariations(prev => {
      const newVariations = [...prev]
      newVariations.splice(currentVariationIndex + 1, 0, duplicated)
      return newVariations
    })
    setCurrentVariationIndex(currentVariationIndex + 1)
  }

  const handleDeleteVariation = () => {
    if (variations.length <= 1) {
      setStatusMessage({ type: "error", text: "Must have at least 1 variation" })
      return
    }

    const hasContent = currentVariation.pixels.some((v, i) => i % 4 === 3 && v > 0)
    if (hasContent) {
      const confirmed = window.confirm("This variation contains pixel data. Delete it?")
      if (!confirmed) return
    }

    setVariations(prev => {
      const newVariations = [...prev]
      newVariations.splice(currentVariationIndex, 1)
      return newVariations
    })
    setCurrentVariationIndex(Math.min(currentVariationIndex, variations.length - 2))
  }

  const handlePrevVariation = () => {
    setCurrentVariationIndex(prev => (prev > 0 ? prev - 1 : variations.length - 1))
  }

  const handleNextVariation = () => {
    setCurrentVariationIndex(prev => (prev < variations.length - 1 ? prev + 1 : 0))
  }

  const handleClearVariation = () => {
    setVariations(prev => {
      const newVariations = [...prev]
      newVariations[currentVariationIndex] = createEmptyFrame()
      return newVariations
    })
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setStatusMessage({ type: "error", text: "Please select an image file" })
      return
    }

    try {
      const imageData = await loadAndScaleImage(file)
      setVariations(prev => {
        const newVariations = [...prev]
        newVariations[currentVariationIndex] = { pixels: imageData }
        return newVariations
      })
      setStatusMessage({ type: "success", text: `Image imported to variation ${currentVariationIndex + 1}` })
    } catch (err) {
      console.error("Failed to import image:", err)
      setStatusMessage({ type: "error", text: "Failed to import image" })
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const loadAndScaleImage = (file: File): Promise<Uint8ClampedArray> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img")
      const url = URL.createObjectURL(file)

      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement("canvas")
        canvas.width = TILE_SIZE
        canvas.height = TILE_SIZE
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          reject(new Error("Could not get canvas context"))
          return
        }

        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE)
        const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE)
        resolve(imageData.data)
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error("Failed to load image"))
      }

      img.src = url
    })
  }

  const pixelsToBlob = (pixels: Uint8ClampedArray): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas")
      canvas.width = TILE_SIZE
      canvas.height = TILE_SIZE
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        reject(new Error("Could not get canvas context"))
        return
      }

      const imageData = ctx.createImageData(TILE_SIZE, TILE_SIZE)
      imageData.data.set(pixels)
      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error("Failed to create blob"))
        },
        "image/png"
      )
    })
  }

  const handleSave = async () => {
    if (!tileName.trim()) {
      setStatusMessage({ type: "error", text: "Please enter a tile name" })
      return
    }

    const authorId = backendUser?.id || authUser?.userId
    if (!authorId) {
      setStatusMessage({ type: "error", text: "Please log in to save tiles" })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      // Use existing asset ID when editing, or create new one
      const assetId = loadedAsset?.id || crypto.randomUUID()

      // PATH/BRIDGE passability depends on terrain type: LAND=passable, WATER=not passable
      const effectivePassable = (tileType === "PATH" || tileType === "BRIDGE")
        ? terrainType === "LAND"  // LAND paths passable, WATER paths (rivers) not
        : passable

      // Movement cost: 0 means impassable, 1+ is the cost
      // If not passable, movementCost should be 0
      const effectiveMovementCost = effectivePassable ? movementCost : 0

      const properties: TileProperties = {
        name: tileName,
        tileSize: TILE_SIZE,
        passable: effectivePassable,
        variations: variations.length,
        tileType: tileType,
        terrainType: terrainType,
        movementCost: effectiveMovementCost,
        ...(bridgeAssetId ? { bridgeAssetId } : {}),
      }

      const fileNames: string[] = ["properties.json"]
      const uploads: Promise<void>[] = []

      // Upload properties.json
      const propsPresigned = await getPresignedUrl({
        assetType: "tiles",
        assetId,
        fileName: "properties.json",
        contentType: "application/json",
      })
      const propsBlob = new Blob([JSON.stringify(properties, null, 2)], { type: "application/json" })
      uploads.push(uploadToPresignedUrl(propsPresigned, propsBlob, "application/json"))

      // Upload each variation
      for (let i = 0; i < variations.length; i++) {
        const fileName = `tile_${i}.png`
        fileNames.push(fileName)

        const presigned = await getPresignedUrl({
          assetType: "tiles",
          assetId,
          fileName,
          contentType: "image/png",
        })
        const blob = await pixelsToBlob(variations[i].pixels)
        uploads.push(uploadToPresignedUrl(presigned, blob, "image/png"))
      }

      await Promise.all(uploads)

      const result = await registerAsset({
        assetId,
        type: "TILE",
        name: tileName,
        authorId,
        files: fileNames,
      })

      if (result.success) {
        const action = loadedAsset ? "updated" : "saved"
        setStatusMessage({ type: "success", text: `Tile "${tileName}" ${action} with ${variations.length} variation(s)!` })
        // Update loadedAsset with server response so subsequent saves work correctly
        if (result.asset) {
          setLoadedAsset(result.asset)
        }
      } else {
        const missingInfo = result.missingFiles?.length
          ? ` Missing: ${result.missingFiles.join(", ")}`
          : ""
        setStatusMessage({ type: "error", text: `Registration failed: ${result.message}${missingInfo}` })
      }
    } catch (err) {
      console.error("Failed to save tile:", err)
      setStatusMessage({ type: "error", text: "Failed to save tile. Is the backend running?" })
    } finally {
      setIsSaving(false)
    }
  }

  const colorPresets = [
    "#000000", "#ffffff", "#8b4513", "#228b22", "#4169e1",
    "#808080", "#a0a0a0", "#c0c0c0", "#654321", "#2e8b57",
    "#1e90ff", "#696969", "#daa520", "#cd853f", "#32cd32",
    "#87ceeb",
  ]

  return (
    <div className="h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Tile Gallery */}
        <TileGallery
          isOpen={isGalleryOpen}
          onClose={() => setIsGalleryOpen(false)}
          onSelect={handleTileSelect}
          currentUserId={backendUser?.id}
        />

        {/* Loading overlay */}
        {isLoadingTile && (
          <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center">
            <div className="bg-zinc-800 rounded-lg px-6 py-4 text-zinc-100">
              Loading tile...
            </div>
          </div>
        )}

        {/* Left Sidebar - Tools */}
        <div className="w-80 border-r border-zinc-700 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* File Operations */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">File</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                onClick={() => setIsGalleryOpen(true)}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Load Tile
              </Button>
              <Button
                variant="outline"
                className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                onClick={handleNewTile}
              >
                <FilePlus className="w-4 h-4 mr-2" />
                New Tile
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentTool("pencil")}
                  className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    currentTool === "pencil"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  <Pencil className="w-4 h-4" />
                  Pencil
                </button>
                <button
                  onClick={() => setCurrentTool("eraser")}
                  className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    currentTool === "eraser"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  <Eraser className="w-4 h-4" />
                  Eraser
                </button>
              </div>
              <button
                onClick={() => setCurrentTool("select")}
                className={`w-full py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                  currentTool === "select"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                <Square className="w-4 h-4" />
                Select
              </button>
              <div>
                <label className="text-xs text-zinc-400 block mb-2">Brush Size</label>
                <div className="flex gap-1">
                  {BRUSH_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => setBrushSize(size)}
                      className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                        brushSize === size
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title="Redo"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Fill Tool */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Fill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                  onClick={handleFillSolid}
                  title="Fill with current color"
                >
                  <PaintBucket className="w-4 h-4 mr-1" />
                  Solid
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                  onClick={handleFillRandom}
                  title="Fill randomly with 3 colors"
                >
                  <Shuffle className="w-4 h-4 mr-1" />
                  Random
                </Button>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-2">Random Fill Colors</label>
                <div className="space-y-2">
                  {/* Color 1 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-3">1:</span>
                    <div
                      className="w-8 h-8 rounded border-2 border-zinc-600 cursor-pointer overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: fillColor1 }}
                      onClick={() => document.getElementById("fillColor1Input")?.click()}
                    >
                      <input
                        id="fillColor1Input"
                        type="color"
                        value={fillColor1}
                        onChange={(e) => setFillColor1(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <input
                      type="text"
                      value={fillColor1}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setFillColor1(val)
                      }}
                      onBlur={(e) => {
                        if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setFillColor1("#228b22")
                      }}
                      className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-100 font-mono min-w-0"
                      placeholder="#228b22"
                    />
                  </div>
                  {/* Color 2 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-3">2:</span>
                    <div
                      className="w-8 h-8 rounded border-2 border-zinc-600 cursor-pointer overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: fillColor2 }}
                      onClick={() => document.getElementById("fillColor2Input")?.click()}
                    >
                      <input
                        id="fillColor2Input"
                        type="color"
                        value={fillColor2}
                        onChange={(e) => setFillColor2(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <input
                      type="text"
                      value={fillColor2}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setFillColor2(val)
                      }}
                      onBlur={(e) => {
                        if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setFillColor2("#2e8b57")
                      }}
                      className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-100 font-mono min-w-0"
                      placeholder="#2e8b57"
                    />
                  </div>
                  {/* Color 3 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-3">3:</span>
                    <div
                      className="w-8 h-8 rounded border-2 border-zinc-600 cursor-pointer overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: fillColor3 }}
                      onClick={() => document.getElementById("fillColor3Input")?.click()}
                    >
                      <input
                        id="fillColor3Input"
                        type="color"
                        value={fillColor3}
                        onChange={(e) => setFillColor3(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <input
                      type="text"
                      value={fillColor3}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setFillColor3(val)
                      }}
                      onBlur={(e) => {
                        if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setFillColor3("#32cd32")
                      }}
                      className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-100 font-mono min-w-0"
                      placeholder="#32cd32"
                    />
                  </div>
                </div>
              </div>
              {/* Bulk fill button for PATH/BRIDGE mode */}
              {(tileType === "PATH" || tileType === "BRIDGE") && (
                <Button
                  variant="outline"
                  className="w-full bg-green-700 border-green-600 text-white hover:bg-green-600"
                  onClick={handleFillAllBackgrounds}
                  title="Fill all 15 variations with random background colors"
                >
                  <PaintBucket className="w-4 h-4 mr-2" />
                  Fill All 15 Backgrounds
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Path Tool */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Path</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-1">
                <div />
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                  onClick={() => handleDrawPath("up")}
                  title="Draw path upward"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <div />
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                  onClick={() => handleDrawPath("left")}
                  title="Draw path left"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center justify-center text-xs text-zinc-500">
                  ●
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                  onClick={() => handleDrawPath("right")}
                  title="Draw path right"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <div />
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                  onClick={() => handleDrawPath("down")}
                  title="Draw path downward"
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <div />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setUseRandomPath(false)}
                  className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                    !useRandomPath
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  Solid
                </button>
                <button
                  onClick={() => setUseRandomPath(true)}
                  className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                    useRandomPath
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  Random
                </button>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-2">Path Colors</label>
                <div className="space-y-2">
                  {/* Path Color 1 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-3">1:</span>
                    <div
                      className="w-8 h-8 rounded border-2 border-zinc-600 cursor-pointer overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: pathColor1 }}
                      onClick={() => document.getElementById("pathColor1Input")?.click()}
                    >
                      <input
                        id="pathColor1Input"
                        type="color"
                        value={pathColor1}
                        onChange={(e) => setPathColor1(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <input
                      type="text"
                      value={pathColor1}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setPathColor1(val)
                      }}
                      onBlur={(e) => {
                        if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setPathColor1("#8b7355")
                      }}
                      className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-100 font-mono min-w-0"
                      placeholder="#8b7355"
                    />
                  </div>
                  {/* Path Color 2 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-3">2:</span>
                    <div
                      className="w-8 h-8 rounded border-2 border-zinc-600 cursor-pointer overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: pathColor2 }}
                      onClick={() => document.getElementById("pathColor2Input")?.click()}
                    >
                      <input
                        id="pathColor2Input"
                        type="color"
                        value={pathColor2}
                        onChange={(e) => setPathColor2(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <input
                      type="text"
                      value={pathColor2}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setPathColor2(val)
                      }}
                      onBlur={(e) => {
                        if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setPathColor2("#a0826d")
                      }}
                      className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-100 font-mono min-w-0"
                      placeholder="#a0826d"
                    />
                  </div>
                  {/* Path Color 3 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-3">3:</span>
                    <div
                      className="w-8 h-8 rounded border-2 border-zinc-600 cursor-pointer overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: pathColor3 }}
                      onClick={() => document.getElementById("pathColor3Input")?.click()}
                    >
                      <input
                        id="pathColor3Input"
                        type="color"
                        value={pathColor3}
                        onChange={(e) => setPathColor3(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <input
                      type="text"
                      value={pathColor3}
                      onChange={(e) => {
                        const val = e.target.value
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setPathColor3(val)
                      }}
                      onBlur={(e) => {
                        if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setPathColor3("#c4a882")
                      }}
                      className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-100 font-mono min-w-0"
                      placeholder="#c4a882"
                    />
                  </div>
                </div>
              </div>
              {/* Bulk generate paths/bridges button for PATH/BRIDGE mode */}
              {(tileType === "PATH" || tileType === "BRIDGE") && (
                <Button
                  variant="outline"
                  className={`w-full text-white hover:opacity-90 ${tileType === "BRIDGE" ? "bg-yellow-700 border-yellow-600 hover:bg-yellow-600" : "bg-amber-700 border-amber-600 hover:bg-amber-600"}`}
                  onClick={handleGenerateAllPaths}
                  title={`Generate all ${tileType === "BRIDGE" ? "bridge" : "path"} combinations on all 15 variations`}
                >
                  <Shuffle className="w-4 h-4 mr-2" />
                  Generate All 15 {tileType === "BRIDGE" ? "Bridges" : "Paths"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Color</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0"
                />
                <span className="text-xs text-zinc-400 font-mono">{currentColor}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {colorPresets.map((color) => (
                  <button
                    key={color}
                    onClick={() => setCurrentColor(color)}
                    className={`w-8 h-8 rounded border-2 transition-all ${
                      currentColor === color ? "border-white scale-110" : "border-zinc-600"
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Import</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                onClick={handleImportClick}
              >
                <Image className="w-4 h-4 mr-2" />
                Import to Variation
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col bg-zinc-950">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-zinc-900 rounded-lg p-4 shadow-xl">
              <PixelCanvas
                width={TILE_SIZE}
                height={TILE_SIZE}
                pixels={currentVariation.pixels}
                color={getCurrentColor()}
                brushSize={brushSize}
                tool={currentTool}
                onCommit={handleCommit}
                className="rounded"
              />
            </div>
          </div>

          {/* Variation Timeline */}
          <div className="border-t border-zinc-700 p-4 bg-zinc-900">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-zinc-400">
                {(tileType === "PATH" || tileType === "BRIDGE") ? (
                  <>
                    {tileType === "BRIDGE" ? "Bridge" : "Path"} {currentVariationIndex + 1}/15: {getPathLabel(PATH_COMBINATIONS[currentVariationIndex])}
                  </>
                ) : (
                  <>Variation {currentVariationIndex + 1}/{variations.length}</>
                )}
              </div>
              {/* Hide add/delete for PATH/BRIDGE mode */}
              {tileType !== "PATH" && tileType !== "BRIDGE" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleAddVariation} title="Add Variation">
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleDuplicateVariation} title="Duplicate">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleDeleteVariation} title="Delete Variation">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleClearVariation} title="Clear Variation">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {(tileType === "PATH" || tileType === "BRIDGE") && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleClearVariation} title="Clear This Variation">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handlePrevVariation}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleNextVariation}>
                <ChevronRight className="w-4 h-4" />
              </Button>

              <div className="flex-1 flex gap-1 ml-4 overflow-x-auto">
                {variations.map((variation, index) => {
                  const isPath = tileType === "PATH" || tileType === "BRIDGE"
                  const pathDirs = isPath ? PATH_COMBINATIONS[index] : null
                  return (
                    <button
                      key={index}
                      onClick={() => setCurrentVariationIndex(index)}
                      className={`relative flex-shrink-0 rounded border-2 ${
                        index === currentVariationIndex
                          ? "border-blue-500"
                          : "border-zinc-600 hover:border-zinc-500"
                      }`}
                      style={{ background: "#1a1a1a", width: isPath ? "48px" : "64px", height: isPath ? "48px" : "64px" }}
                      title={isPath && pathDirs ? getPathLabel(pathDirs) : `Variation ${index + 1}`}
                    >
                      <VariationThumbnail pixels={variation.pixels} size={TILE_SIZE} />
                      {isPath && pathDirs && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-xs text-white/70 font-bold drop-shadow-lg">
                            {getPathLabel(pathDirs)}
                          </span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Tile Properties */}
        <div className="w-72 border-l border-zinc-700 p-4 flex flex-col gap-4">
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Tile Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadedAsset && (
                <div className="text-xs text-zinc-500 bg-zinc-900 rounded px-2 py-1">
                  Editing: {loadedAsset.name}
                </div>
              )}

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Name</label>
                <input
                  type="text"
                  value={tileName}
                  onChange={(e) => setTileName(e.target.value)}
                  placeholder="grass-plain"
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-2">Tile Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSwitchTileType("TILE")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      tileType === "TILE"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    }`}
                  >
                    TILE
                  </button>
                  <button
                    onClick={() => handleSwitchTileType("PATH")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      tileType === "PATH"
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    }`}
                  >
                    PATH
                  </button>
                  <button
                    onClick={() => handleSwitchTileType("BRIDGE")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      tileType === "BRIDGE"
                        ? "bg-yellow-700 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    }`}
                  >
                    BRIDGE
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {tileType === "PATH" ? "15 variations for all path directions"
                    : tileType === "BRIDGE" ? "15 variations for bridge directions (wider)"
                    : "Custom variations (1-8)"}
                </p>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-2">Terrain Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSwitchTerrainType("LAND")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      terrainType === "LAND"
                        ? "bg-green-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    }`}
                  >
                    LAND
                  </button>
                  <button
                    onClick={() => handleSwitchTerrainType("WATER")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      terrainType === "WATER"
                        ? "bg-blue-500 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    }`}
                  >
                    WATER
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {(tileType === "PATH" || tileType === "BRIDGE")
                    ? terrainType === "LAND"
                      ? tileType === "BRIDGE" ? "Bridge surface (always passable)" : "Land paths are passable (walkways)"
                      : "Water paths are rivers (not passable)"
                    : terrainType === "LAND"
                      ? "Land terrain (grass, dirt, etc.)"
                      : "Water terrain (ocean, lake, etc.)"}
                </p>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-2">Passable</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => tileType !== "PATH" && tileType !== "BRIDGE" && setPassable(true)}
                    disabled={tileType === "PATH" || tileType === "BRIDGE"}
                    className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                      passable
                        ? "bg-green-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    } ${(tileType === "PATH" || tileType === "BRIDGE") ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <Check className="w-4 h-4" />
                    Yes
                  </button>
                  <button
                    onClick={() => tileType !== "PATH" && tileType !== "BRIDGE" && setPassable(false)}
                    disabled={tileType === "PATH" || tileType === "BRIDGE"}
                    className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                      !passable
                        ? "bg-red-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    } ${(tileType === "PATH" || tileType === "BRIDGE") ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <X className="w-4 h-4" />
                    No
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {(tileType === "PATH" || tileType === "BRIDGE")
                    ? terrainType === "LAND"
                      ? tileType === "BRIDGE" ? "Bridges are always passable" : "Land paths are always passable"
                      : "Water paths (rivers) are never passable"
                    : passable
                      ? "Players can walk through"
                      : "Blocks player movement"}
                </p>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-2">
                  Movement Cost {!passable && "(disabled when impassable)"}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={movementCost}
                    onChange={(e) => setMovementCost(parseInt(e.target.value))}
                    disabled={!passable}
                    className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                  <span className={`text-sm font-mono w-6 text-center ${!passable ? "text-zinc-600" : "text-zinc-100"}`}>
                    {passable ? movementCost : 0}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {!passable
                    ? "Impassable tiles have cost 0"
                    : movementCost === 1
                      ? "Easy terrain (roads, plains)"
                      : movementCost <= 3
                        ? "Normal terrain (grass, dirt)"
                        : movementCost <= 6
                          ? "Difficult terrain (forest, hills)"
                          : "Very difficult terrain (swamp, mountains)"}
                </p>
              </div>

              {/* Bridge asset selector for LAND PATH tiles */}
              {tileType === "PATH" && terrainType === "LAND" && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-2">Bridge Asset</label>
                  <select
                    value={bridgeAssetId || ""}
                    onChange={(e) => setBridgeAssetId(e.target.value || null)}
                    className="w-full px-2 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100"
                  >
                    <option value="">None (no bridge over water)</option>
                    {availableBridges.map((bridge) => (
                      <option key={bridge.id} value={bridge.id}>
                        {bridge.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-500 mt-2">
                    {bridgeAssetId
                      ? "Bridge will auto-render when this path crosses water"
                      : "Select a BRIDGE asset to render under this path over water"}
                  </p>
                </div>
              )}

              {statusMessage && (
                <div
                  className={`p-2 rounded text-xs ${
                    statusMessage.type === "success"
                      ? "bg-green-900/50 text-green-300 border border-green-700"
                      : "bg-red-900/50 text-red-300 border border-red-700"
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Tile Info</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-400 space-y-1">
              <p>Size: {TILE_SIZE}x{TILE_SIZE} pixels</p>
              <p>Variations: {variations.length}</p>
              <p>Collision: {passable ? "None" : "Solid"}</p>
              <p>Status: {tileName ? "Ready to save" : "Enter a name"}</p>
            </CardContent>
          </Card>

          <div className="mt-auto space-y-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !tileName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Tile
                </>
              )}
            </Button>
            <p className="text-xs text-zinc-500 text-center">
              Saves {variations.length} variation{variations.length !== 1 ? "s" : ""} + properties
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Thumbnail component for variation preview
function VariationThumbnail({ pixels, size }: { pixels: Uint8ClampedArray; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const imageData = ctx.createImageData(size, size)
    imageData.data.set(pixels)
    ctx.putImageData(imageData, 0, 0)
  }, [pixels, size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="w-full h-full"
      style={{ imageRendering: "pixelated" }}
    />
  )
}
