import { useState, useRef, useCallback, useEffect } from "react"
import { PixelCanvas, type CanvasTool } from "@/features/editor/components/PixelCanvas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { getPresignedUrl, uploadToPresignedUrl, registerAsset } from "@/api/assets"
import { syncUser } from "@/api/users"
import { useAuth } from "@/context/AuthContext"
import { Save, Trash2, Image, Check, X, Pencil, Eraser, Square, Undo2, Redo2 } from "lucide-react"
import type { UserDTO } from "@/api/types"

const TILE_SIZE = 128
const MAX_HISTORY = 10
const BRUSH_SIZES = [1, 2, 4, 8, 16]

interface TileHistory {
  undoStack: Uint8ClampedArray[]
  redoStack: Uint8ClampedArray[]
}

export function TileEditorPage() {
  const { isAuthenticated, user: authUser } = useAuth()
  const [pixels, setPixels] = useState<Uint8ClampedArray>(
    () => new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
  )
  const [currentColor, setCurrentColor] = useState("#ffffff")
  const [currentTool, setCurrentTool] = useState<CanvasTool>("pencil")
  const [brushSize, setBrushSize] = useState(1)
  const [tileName, setTileName] = useState("")
  const [passable, setPassable] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [backendUser, setBackendUser] = useState<UserDTO | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Undo/Redo history
  const historyRef = useRef<TileHistory>({ undoStack: [], redoStack: [] })

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

  // Convert hex color to RGBA tuple, accounting for eraser tool
  const getCurrentColor = useCallback((): [number, number, number, number] => {
    if (currentTool === "eraser") {
      return [0, 0, 0, 0] // Transparent for eraser
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

  // Called by PixelCanvas on mouseup - commits the drawn pixels to React state
  const handleCommit = useCallback((newPixels: Uint8ClampedArray) => {
    // Push current state to undo stack before changing
    const history = historyRef.current
    history.undoStack.push(new Uint8ClampedArray(pixels))

    // Limit undo stack to MAX_HISTORY
    if (history.undoStack.length > MAX_HISTORY) {
      history.undoStack.shift()
    }

    // Clear redo stack on new action
    history.redoStack = []

    setPixels(newPixels)
  }, [pixels])

  // Undo last action
  const handleUndo = useCallback(() => {
    const history = historyRef.current
    if (history.undoStack.length === 0) return

    // Push current state to redo stack
    history.redoStack.push(new Uint8ClampedArray(pixels))

    // Limit redo stack
    if (history.redoStack.length > MAX_HISTORY) {
      history.redoStack.shift()
    }

    // Pop from undo stack
    const previousPixels = history.undoStack.pop()!
    setPixels(previousPixels)
  }, [pixels])

  // Redo last undone action
  const handleRedo = useCallback(() => {
    const history = historyRef.current
    if (history.redoStack.length === 0) return

    // Push current state to undo stack
    history.undoStack.push(new Uint8ClampedArray(pixels))

    // Pop from redo stack
    const nextPixels = history.redoStack.pop()!
    setPixels(nextPixels)
  }, [pixels])

  // Check if undo/redo are available
  const canUndo = historyRef.current.undoStack.length > 0
  const canRedo = historyRef.current.redoStack.length > 0

  const handleClear = () => {
    setPixels(new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4))
    historyRef.current = { undoStack: [], redoStack: [] } // Clear history on clear
    setStatusMessage(null)
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
      setPixels(imageData)
      setStatusMessage({ type: "success", text: "Image imported and scaled to 32x32" })
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

  const canvasToBlob = (): Promise<Blob> => {
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
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error("Failed to create blob"))
          }
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

    // Get the author ID from the backend user or auth user
    const authorId = backendUser?.id || authUser?.userId
    if (!authorId) {
      setStatusMessage({ type: "error", text: "Please log in to save tiles" })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      const assetId = crypto.randomUUID()

      // Create tile properties JSON
      const properties = {
        name: tileName,
        tileSize: TILE_SIZE,
        passable: passable,
      }

      // Get presigned URLs for both files
      const [pngPresigned, jsonPresigned] = await Promise.all([
        getPresignedUrl({
          assetType: "tiles",
          assetId,
          fileName: "tile.png",
          contentType: "image/png",
        }),
        getPresignedUrl({
          assetType: "tiles",
          assetId,
          fileName: "properties.json",
          contentType: "application/json",
        }),
      ])

      // Upload files
      const pngBlob = await canvasToBlob()
      const jsonBlob = new Blob([JSON.stringify(properties, null, 2)], {
        type: "application/json",
      })

      await Promise.all([
        uploadToPresignedUrl(pngPresigned, pngBlob, "image/png"),
        uploadToPresignedUrl(jsonPresigned, jsonBlob, "application/json"),
      ])

      // Register asset in database with file validation
      const result = await registerAsset({
        assetId,
        type: "TILE",
        name: tileName,
        authorId,
        files: ["tile.png", "properties.json"],
      })

      if (result.success) {
        setStatusMessage({ type: "success", text: `Tile "${tileName}" saved successfully!` })
      } else {
        const missingInfo = result.missingFiles?.length
          ? ` Missing files: ${result.missingFiles.join(", ")}`
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
      {/* Left Sidebar - Tools */}
      <div className="w-64 border-r border-zinc-700 p-4 flex flex-col gap-4 overflow-y-auto">
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

        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Color</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-2">Current Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0"
                />
                <span className="text-xs text-zinc-400 font-mono">{currentColor}</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-2">Terrain Colors</label>
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
              Import Image
            </Button>
            <p className="text-xs text-zinc-500 mt-2">
              Scales to {TILE_SIZE}x{TILE_SIZE} using nearest-neighbor
            </p>
          </CardContent>
        </Card>

        <Button
          variant="destructive"
          onClick={handleClear}
          className="mt-auto"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Canvas
        </Button>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex items-center justify-center p-8 bg-zinc-950">
        <div className="bg-zinc-900 rounded-lg p-4 shadow-xl">
          <PixelCanvas
            width={TILE_SIZE}
            height={TILE_SIZE}
            pixels={pixels}
            color={getCurrentColor()}
            brushSize={brushSize}
            tool={currentTool}
            onCommit={handleCommit}
            initialZoom={4}
            className="rounded"
          />
          <div className="mt-2 text-center text-xs text-zinc-500">
            Scroll to zoom • Alt+drag to pan • Click to draw
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
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Name</label>
              <input
                type="text"
                value={tileName}
                onChange={(e) => setTileName(e.target.value)}
                placeholder="grass-plain"
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-2">Passable</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPassable(true)}
                  className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    passable
                      ? "bg-green-600 text-white"
                      : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                  }`}
                >
                  <Check className="w-4 h-4" />
                  Yes
                </button>
                <button
                  onClick={() => setPassable(false)}
                  className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    !passable
                      ? "bg-red-600 text-white"
                      : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                  }`}
                >
                  <X className="w-4 h-4" />
                  No
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                {passable ? "Players can walk through" : "Blocks player movement"}
              </p>
            </div>

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
            <p>Format: PNG</p>
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
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Tile
              </>
            )}
          </Button>
          <p className="text-xs text-zinc-500 text-center">
            Uploads tile.png & properties.json
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}
