import { useState, useRef, useCallback } from "react"
import { PixelCanvas } from "../components/PixelCanvas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { uploadAsset, createAsset } from "@/api/assets"
import type { AssetType } from "@/api/types"
import { Save, Trash2, Image } from "lucide-react"

const CANVAS_SIZE = 32
const DEFAULT_COLOR = "#ffffff"

export function EditorPage() {
  const [pixels, setPixels] = useState<Uint8ClampedArray>(
    () => new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)
  )
  const [currentColor, setCurrentColor] = useState(DEFAULT_COLOR)
  const [assetName, setAssetName] = useState("")
  const [assetType, setAssetType] = useState<AssetType>("CHARACTER")
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hexToRgba = (hex: string): [number, number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        255,
      ]
    }
    return [255, 255, 255, 255]
  }

  const handlePixelDraw = useCallback(
    (x: number, y: number) => {
      setPixels((prev) => {
        const newPixels = new Uint8ClampedArray(prev)
        const i = (y * CANVAS_SIZE + x) * 4
        const [r, g, b, a] = hexToRgba(currentColor)
        newPixels[i] = r
        newPixels[i + 1] = g
        newPixels[i + 2] = b
        newPixels[i + 3] = a
        return newPixels
      })
    },
    [currentColor]
  )

  const handleClear = () => {
    setPixels(new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4))
    setStatusMessage(null)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
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

    // Reset file input
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

        // Create offscreen canvas for scaling
        const canvas = document.createElement("canvas")
        canvas.width = CANVAS_SIZE
        canvas.height = CANVAS_SIZE
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          reject(new Error("Could not get canvas context"))
          return
        }

        // Nearest-neighbor scaling (no smoothing)
        ctx.imageSmoothingEnabled = false

        // Draw scaled image
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)

        // Extract pixel data
        const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
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
      canvas.width = CANVAS_SIZE
      canvas.height = CANVAS_SIZE
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        reject(new Error("Could not get canvas context"))
        return
      }

      // Draw pixels to canvas
      const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE)
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
    if (!assetName.trim()) {
      setStatusMessage({ type: "error", text: "Please enter an asset name" })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      // Convert canvas to PNG blob
      const blob = await canvasToBlob()
      const file = new File([blob], `${assetName}.png`, { type: "image/png" })

      // Upload file
      const uploadResult = await uploadAsset(file)

      // Create asset metadata
      await createAsset({
        type: assetType,
        name: assetName,
        authorId: "anonymous", // TODO: Get from auth context
        storageKeyPrefix: uploadResult.storageKey,
      })

      setStatusMessage({ type: "success", text: `Asset "${assetName}" saved successfully!` })
    } catch (err) {
      console.error("Failed to save asset:", err)
      setStatusMessage({ type: "error", text: "Failed to save asset. Is the backend running?" })
    } finally {
      setIsSaving(false)
    }
  }

  const colorPresets = [
    "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff",
    "#ffff00", "#ff00ff", "#00ffff", "#ff8800", "#8800ff",
    "#00ff88", "#ff0088", "#888888", "#444444", "#cc8844",
    "#44aa44",
  ]

  return (
    <div className="h-screen flex bg-zinc-900 text-zinc-100">
      {/* Left Sidebar - Tools */}
      <div className="w-64 border-r border-zinc-700 p-4 flex flex-col gap-4">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Color Picker */}
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

            {/* Color Presets */}
            <div>
              <label className="text-xs text-zinc-400 block mb-2">Presets</label>
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
              className="w-full border-zinc-600 hover:bg-zinc-700"
              onClick={handleImportClick}
            >
              <Image className="w-4 h-4 mr-2" />
              Import Image
            </Button>
            <p className="text-xs text-zinc-500 mt-2">
              Scales to 32x32 using nearest-neighbor
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
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            pixels={pixels}
            onPixelDraw={handlePixelDraw}
            initialZoom={12}
            className="rounded"
          />
          <div className="mt-2 text-center text-xs text-zinc-500">
            Scroll to zoom • Alt+drag to pan • Click to draw
          </div>
        </div>
      </div>

      {/* Right Sidebar - Metadata */}
      <div className="w-72 border-l border-zinc-700 p-4 flex flex-col gap-4">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Asset Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Asset Name */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Name</label>
              <input
                type="text"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="my-character"
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Asset Type */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Type</label>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              >
                <option value="CHARACTER">Character</option>
                <option value="TILE">Tile</option>
                <option value="MAP">Map</option>
              </select>
            </div>

            {/* Status Message */}
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
            <CardTitle className="text-sm text-zinc-300">Canvas Info</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-400 space-y-1">
            <p>Size: {CANVAS_SIZE}x{CANVAS_SIZE} pixels</p>
            <p>Format: PNG (RGBA)</p>
            <p>Status: {assetName ? "Ready to save" : "Enter a name"}</p>
          </CardContent>
        </Card>

        <div className="mt-auto space-y-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !assetName.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Asset
              </>
            )}
          </Button>
          <p className="text-xs text-zinc-500 text-center">
            Uploads to storage & creates metadata
          </p>
        </div>
      </div>
    </div>
  )
}
