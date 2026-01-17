import { useState, useRef, useCallback, useEffect } from "react"
import { PixelCanvas, type CanvasTool } from "../components/PixelCanvas"
import { CharacterGallery } from "../components/CharacterGallery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { getPresignedUrl, uploadToPresignedUrl, registerAsset, getAssetFile, loadAssetImage } from "@/api/assets"
import { syncUser } from "@/api/users"
import { useAuth } from "@/context/AuthContext"
import { Save, Trash2, Image, Plus, Copy, ChevronLeft, ChevronRight, Play, Pause, FolderOpen, FilePlus, Pencil, Eraser, Square, Undo2, Redo2, MoveLeft, MoveRight } from "lucide-react"
import type { UserDTO, AssetDTO } from "@/api/types"

// Character definition structure from JSON
interface CharacterDefinition {
  name: string
  spriteSize: number
  states: Record<string, { frames: number; loop: boolean }>
}

const CANVAS_SIZE = 128
const MAX_HISTORY = 10 // 10 undo levels per frame
const BRUSH_SIZES = [1, 2, 4, 8, 16]

// Animation state definitions
const ANIMATION_STATES = [
  { id: "idle", label: "Idle", required: true, loop: true },
  { id: "walk_down", label: "Walk Down", required: true, loop: true },
  { id: "walk_up", label: "Walk Up", required: true, loop: true },
  { id: "walk_left", label: "Walk Left", required: true, loop: true },
  { id: "walk_right", label: "Walk Right", required: true, loop: true },
  { id: "action_build", label: "Build", required: false, loop: true },
  { id: "action_attack", label: "Attack", required: false, loop: false },
] as const

type AnimationStateId = typeof ANIMATION_STATES[number]["id"]

interface AnimationFrame {
  pixels: Uint8ClampedArray
}

interface AnimationState {
  frames: AnimationFrame[]
}

type AnimationData = Record<AnimationStateId, AnimationState>

function createEmptyFrame(): AnimationFrame {
  return { pixels: new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4) }
}

function createInitialAnimationData(): AnimationData {
  const data: Partial<AnimationData> = {}
  for (const state of ANIMATION_STATES) {
    data[state.id] = { frames: [createEmptyFrame()] }
  }
  return data as AnimationData
}

// History type for undo/redo - keyed by "stateId_frameIndex"
type FrameHistoryKey = string
interface FrameHistory {
  undoStack: Uint8ClampedArray[]
  redoStack: Uint8ClampedArray[]
}

export function EditorPage() {
  const { isAuthenticated, user: authUser } = useAuth()
  const [animationData, setAnimationData] = useState<AnimationData>(createInitialAnimationData)
  const [currentState, setCurrentState] = useState<AnimationStateId>("idle")
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [currentColor, setCurrentColor] = useState("#ffffff")
  const [currentTool, setCurrentTool] = useState<CanvasTool>("pencil")
  const [brushSize, setBrushSize] = useState(1)
  const [characterName, setCharacterName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [backendUser, setBackendUser] = useState<UserDTO | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const playIntervalRef = useRef<number | null>(null)

  // Undo/Redo history per frame
  const historyRef = useRef<Map<FrameHistoryKey, FrameHistory>>(new Map())

  // Gallery and loading state
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [loadedAsset, setLoadedAsset] = useState<AssetDTO | null>(null)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false)

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

  // Handle character selection from gallery
  const handleCharacterSelect = async (asset: AssetDTO, mode: "edit" | "copy") => {
    setIsGalleryOpen(false)
    setIsLoadingCharacter(true)
    setStatusMessage(null)

    try {
      // Load the definition.json
      const definition = await getAssetFile<CharacterDefinition>(
        asset.storageKeyPrefix,
        "definition.json"
      )

      // Create new animation data structure
      const newAnimationData = createInitialAnimationData()

      // Load all frames for each state
      for (const [stateId, stateInfo] of Object.entries(definition.states)) {
        if (stateId in newAnimationData) {
          const frames: AnimationFrame[] = []
          for (let i = 0; i < stateInfo.frames; i++) {
            try {
              const pixels = await loadAssetImage(asset.storageKeyPrefix, `${stateId}_${i}.png`)
              frames.push({ pixels })
            } catch (err) {
              console.warn(`Failed to load frame ${stateId}_${i}.png, using empty frame`)
              frames.push(createEmptyFrame())
            }
          }
          newAnimationData[stateId as AnimationStateId] = { frames }
        }
      }

      setAnimationData(newAnimationData)
      setCurrentState("idle")
      setCurrentFrameIndex(0)
      clearAllHistory() // Clear undo/redo when loading new character

      if (mode === "edit") {
        // Editing own character
        setLoadedAsset(asset)
        setCharacterName(definition.name)
        setIsReadOnly(false)
        setStatusMessage({ type: "success", text: `Loaded "${definition.name}" for editing` })
      } else {
        // Copying another user's character
        setLoadedAsset(null) // Clear loaded asset so it saves as new
        setCharacterName(`${definition.name} (Copy)`)
        setIsReadOnly(false)
        setStatusMessage({ type: "success", text: `Copied "${definition.name}" - save as your own!` })
      }
    } catch (err) {
      console.error("Failed to load character:", err)
      setStatusMessage({ type: "error", text: "Failed to load character. Please try again." })
    } finally {
      setIsLoadingCharacter(false)
    }
  }

  // Start a new character
  const handleNewCharacter = () => {
    setAnimationData(createInitialAnimationData())
    setCharacterName("")
    setLoadedAsset(null)
    setIsReadOnly(false)
    setCurrentState("idle")
    setCurrentFrameIndex(0)
    setStatusMessage(null)
    clearAllHistory() // Clear undo/redo when creating new character
  }

  const currentFrames = animationData[currentState].frames
  const currentFrame = currentFrames[currentFrameIndex] || currentFrames[0]

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

  // Get history key for current frame
  const getHistoryKey = useCallback(
    (): FrameHistoryKey => `${currentState}_${currentFrameIndex}`,
    [currentState, currentFrameIndex]
  )

  // Get or create history for current frame
  const getFrameHistory = useCallback((): FrameHistory => {
    const key = getHistoryKey()
    if (!historyRef.current.has(key)) {
      historyRef.current.set(key, { undoStack: [], redoStack: [] })
    }
    return historyRef.current.get(key)!
  }, [getHistoryKey])

  // Called by PixelCanvas on mouseup - commits the drawn pixels to React state
  const handleCommit = useCallback(
    (newPixels: Uint8ClampedArray) => {
      // Push current state to undo stack before changing
      const history = getFrameHistory()
      const currentPixels = animationData[currentState].frames[currentFrameIndex].pixels
      history.undoStack.push(new Uint8ClampedArray(currentPixels))

      // Limit undo stack to MAX_HISTORY
      if (history.undoStack.length > MAX_HISTORY) {
        history.undoStack.shift()
      }

      // Clear redo stack on new action
      history.redoStack = []

      setAnimationData((prev) => {
        const newData = { ...prev }
        const newFrames = [...newData[currentState].frames]
        newFrames[currentFrameIndex] = { pixels: newPixels }
        newData[currentState] = { frames: newFrames }
        return newData
      })
    },
    [currentState, currentFrameIndex, animationData, getFrameHistory]
  )

  // Undo last action
  const handleUndo = useCallback(() => {
    const history = getFrameHistory()
    if (history.undoStack.length === 0) return

    // Push current state to redo stack
    const currentPixels = animationData[currentState].frames[currentFrameIndex].pixels
    history.redoStack.push(new Uint8ClampedArray(currentPixels))

    // Limit redo stack
    if (history.redoStack.length > MAX_HISTORY) {
      history.redoStack.shift()
    }

    // Pop from undo stack
    const previousPixels = history.undoStack.pop()!

    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames]
      newFrames[currentFrameIndex] = { pixels: previousPixels }
      newData[currentState] = { frames: newFrames }
      return newData
    })
  }, [currentState, currentFrameIndex, animationData, getFrameHistory])

  // Redo last undone action
  const handleRedo = useCallback(() => {
    const history = getFrameHistory()
    if (history.redoStack.length === 0) return

    // Push current state to undo stack
    const currentPixels = animationData[currentState].frames[currentFrameIndex].pixels
    history.undoStack.push(new Uint8ClampedArray(currentPixels))

    // Pop from redo stack
    const nextPixels = history.redoStack.pop()!

    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames]
      newFrames[currentFrameIndex] = { pixels: nextPixels }
      newData[currentState] = { frames: newFrames }
      return newData
    })
  }, [currentState, currentFrameIndex, animationData, getFrameHistory])

  // Clear all history (called when loading new character)
  const clearAllHistory = useCallback(() => {
    historyRef.current.clear()
  }, [])

  // Get current history state for UI
  const currentHistory = getFrameHistory()
  const canUndo = currentHistory.undoStack.length > 0
  const canRedo = currentHistory.redoStack.length > 0

  const handleClearFrame = () => {
    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames]
      newFrames[currentFrameIndex] = createEmptyFrame()
      newData[currentState] = { frames: newFrames }
      return newData
    })
    setStatusMessage(null)
  }

  const handleAddFrame = () => {
    if (currentFrames.length >= 8) {
      setStatusMessage({ type: "error", text: "Maximum 8 frames per animation" })
      return
    }
    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames, createEmptyFrame()]
      newData[currentState] = { frames: newFrames }
      return newData
    })
    setCurrentFrameIndex(currentFrames.length)
  }

  const handleDuplicateFrame = () => {
    if (currentFrames.length >= 8) {
      setStatusMessage({ type: "error", text: "Maximum 8 frames per animation" })
      return
    }
    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames]
      const duplicated = { pixels: new Uint8ClampedArray(currentFrame.pixels) }
      newFrames.splice(currentFrameIndex + 1, 0, duplicated)
      newData[currentState] = { frames: newFrames }
      return newData
    })
    setCurrentFrameIndex(currentFrameIndex + 1)
  }

  const handleDeleteFrame = () => {
    if (currentFrames.length <= 1) {
      setStatusMessage({ type: "error", text: "Must have at least 1 frame" })
      return
    }

    // Check if frame has any non-transparent pixels
    const hasContent = currentFrame.pixels.some((v, i) => i % 4 === 3 && v > 0)
    if (hasContent) {
      const confirmed = window.confirm(
        "This frame contains pixel data. Are you sure you want to delete it?"
      )
      if (!confirmed) return
    }

    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames]
      newFrames.splice(currentFrameIndex, 1)
      newData[currentState] = { frames: newFrames }
      return newData
    })
    setCurrentFrameIndex(Math.min(currentFrameIndex, currentFrames.length - 2))
  }

  const handlePrevFrame = () => {
    setCurrentFrameIndex((prev) => (prev > 0 ? prev - 1 : currentFrames.length - 1))
  }

  const handleNextFrame = () => {
    setCurrentFrameIndex((prev) => (prev < currentFrames.length - 1 ? prev + 1 : 0))
  }

  const handleMoveFrameLeft = () => {
    if (currentFrameIndex <= 0) return
    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames]
      // Swap current frame with the one to its left
      const temp = newFrames[currentFrameIndex - 1]
      newFrames[currentFrameIndex - 1] = newFrames[currentFrameIndex]
      newFrames[currentFrameIndex] = temp
      newData[currentState] = { frames: newFrames }
      return newData
    })
    setCurrentFrameIndex(currentFrameIndex - 1)
  }

  const handleMoveFrameRight = () => {
    if (currentFrameIndex >= currentFrames.length - 1) return
    setAnimationData((prev) => {
      const newData = { ...prev }
      const newFrames = [...newData[currentState].frames]
      // Swap current frame with the one to its right
      const temp = newFrames[currentFrameIndex + 1]
      newFrames[currentFrameIndex + 1] = newFrames[currentFrameIndex]
      newFrames[currentFrameIndex] = temp
      newData[currentState] = { frames: newFrames }
      return newData
    })
    setCurrentFrameIndex(currentFrameIndex + 1)
  }

  const togglePlayback = () => {
    if (isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
      setIsPlaying(false)
    } else {
      setIsPlaying(true)
      playIntervalRef.current = window.setInterval(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % currentFrames.length)
      }, 200)
    }
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
      setAnimationData((prev) => {
        const newData = { ...prev }
        const newFrames = [...newData[currentState].frames]
        newFrames[currentFrameIndex] = { pixels: imageData }
        newData[currentState] = { frames: newFrames }
        return newData
      })
      setStatusMessage({ type: "success", text: "Image imported to current frame" })
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
        canvas.width = CANVAS_SIZE
        canvas.height = CANVAS_SIZE
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          reject(new Error("Could not get canvas context"))
          return
        }

        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
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

  const pixelsToBlob = (pixels: Uint8ClampedArray): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas")
      canvas.width = CANVAS_SIZE
      canvas.height = CANVAS_SIZE
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        reject(new Error("Could not get canvas context"))
        return
      }

      const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE)
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

  const generateDefinitionJson = () => {
    const states: Record<string, { frames: number; loop: boolean }> = {}

    for (const state of ANIMATION_STATES) {
      const frameCount = animationData[state.id].frames.length
      // Only include states that have content (non-empty frames)
      const hasContent = animationData[state.id].frames.some((f) =>
        f.pixels.some((v, i) => i % 4 === 3 && v > 0) // Check alpha channel
      )
      if (hasContent || state.required) {
        states[state.id] = { frames: frameCount, loop: state.loop }
      }
    }

    return {
      name: characterName,
      spriteSize: CANVAS_SIZE,
      states,
    }
  }

  const handleSave = async () => {
    if (!characterName.trim()) {
      setStatusMessage({ type: "error", text: "Please enter a character name" })
      return
    }

    // Get the author ID from the backend user or auth user
    const authorId = backendUser?.id || authUser?.userId
    if (!authorId) {
      setStatusMessage({ type: "error", text: "Please log in to save characters" })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      const assetId = crypto.randomUUID()

      // Generate definition JSON
      const definition = generateDefinitionJson()

      // Collect all file names for registration
      const fileNames: string[] = ["definition.json"]

      // Collect all presigned URL requests and uploads
      const uploads: Promise<void>[] = []
      const presignedRequests: Array<{
        stateId: string
        frameIndex: number
        fileName: string
      }> = []

      // Prepare file list
      for (const state of ANIMATION_STATES) {
        const frames = animationData[state.id].frames
        for (let i = 0; i < frames.length; i++) {
          const fileName = `${state.id}_${i}.png`
          presignedRequests.push({
            stateId: state.id,
            frameIndex: i,
            fileName,
          })
          fileNames.push(fileName)
        }
      }

      // Get presigned URL for definition.json
      const definitionPresigned = await getPresignedUrl({
        assetType: "characters",
        assetId,
        fileName: "definition.json",
        contentType: "application/json",
      })

      // Upload definition.json
      const definitionBlob = new Blob([JSON.stringify(definition, null, 2)], {
        type: "application/json",
      })
      uploads.push(uploadToPresignedUrl(definitionPresigned, definitionBlob, "application/json"))

      // Get presigned URLs and upload frames
      for (const req of presignedRequests) {
        const presigned = await getPresignedUrl({
          assetType: "characters",
          assetId,
          fileName: req.fileName,
          contentType: "image/png",
        })

        const framePixels = animationData[req.stateId as AnimationStateId].frames[req.frameIndex].pixels
        const blob = await pixelsToBlob(framePixels)
        uploads.push(uploadToPresignedUrl(presigned, blob, "image/png"))
      }

      // Wait for all uploads
      await Promise.all(uploads)

      // Register asset in database with file validation
      const result = await registerAsset({
        assetId,
        type: "CHARACTER",
        name: characterName,
        authorId,
        files: fileNames,
      })

      if (result.success) {
        setStatusMessage({ type: "success", text: `Character "${characterName}" saved successfully!` })
      } else {
        const missingInfo = result.missingFiles?.length
          ? ` Missing files: ${result.missingFiles.join(", ")}`
          : ""
        setStatusMessage({ type: "error", text: `Registration failed: ${result.message}${missingInfo}` })
      }
    } catch (err) {
      console.error("Failed to save character:", err)
      setStatusMessage({ type: "error", text: "Failed to save. Is the backend running?" })
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

  const stateInfo = ANIMATION_STATES.find((s) => s.id === currentState)

  return (
    <div className="h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <Header />
      <div className="flex-1 flex overflow-hidden">
      {/* Character Gallery */}
      <CharacterGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onSelect={handleCharacterSelect}
        currentUserId={backendUser?.id}
      />

      {/* Loading overlay */}
      {isLoadingCharacter && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center">
          <div className="bg-zinc-800 rounded-lg px-6 py-4 text-zinc-100">
            Loading character...
          </div>
        </div>
      )}

      {/* Left Sidebar - Tools */}
      <div className="w-64 border-r border-zinc-700 p-4 flex flex-col gap-4 overflow-y-auto">
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
              Load Character
            </Button>
            <Button
              variant="outline"
              className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
              onClick={handleNewCharacter}
            >
              <FilePlus className="w-4 h-4 mr-2" />
              New Character
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Animation State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ANIMATION_STATES.map((state) => (
              <button
                key={state.id}
                onClick={() => {
                  setCurrentState(state.id)
                  setCurrentFrameIndex(0)
                  if (isPlaying) togglePlayback()
                }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
                  currentState === state.id
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                <span>{state.label}</span>
                <span className="text-xs opacity-70">
                  {animationData[state.id].frames.length}f
                </span>
              </button>
            ))}
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
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
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
              Import to Frame
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col bg-zinc-950">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-zinc-900 rounded-lg p-4 shadow-xl">
            <PixelCanvas
              key={`${currentState}_${currentFrameIndex}`}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              pixels={currentFrame.pixels}
              color={getCurrentColor()}
              brushSize={brushSize}
              tool={currentTool}
              onCommit={handleCommit}
              initialZoom={4}
              className="rounded"
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="border-t border-zinc-700 p-4 bg-zinc-900">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-zinc-400">
              {stateInfo?.label} - Frame {currentFrameIndex + 1}/{currentFrames.length}
              {stateInfo?.loop && " (Loop)"}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleAddFrame} title="Add Frame">
                <Plus className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleDuplicateFrame} title="Duplicate">
                <Copy className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleDeleteFrame} title="Delete Frame">
                <Trash2 className="w-4 h-4" />
              </Button>
              <div className="w-px bg-zinc-600" />
              <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40" onClick={handleMoveFrameLeft} disabled={currentFrameIndex <= 0} title="Move Frame Left">
                <MoveLeft className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40" onClick={handleMoveFrameRight} disabled={currentFrameIndex >= currentFrames.length - 1} title="Move Frame Right">
                <MoveRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handlePrevFrame}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={togglePlayback}>
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="outline" className="bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600" onClick={handleNextFrame}>
              <ChevronRight className="w-4 h-4" />
            </Button>

            <div className="flex-1 flex gap-1 ml-4 overflow-x-auto">
              {currentFrames.map((frame, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentFrameIndex(index)}
                  className={`w-12 h-12 rounded border-2 flex-shrink-0 ${
                    index === currentFrameIndex
                      ? "border-blue-500"
                      : "border-zinc-600 hover:border-zinc-500"
                  }`}
                  style={{
                    background: "#1a1a1a",
                  }}
                >
                  <FrameThumbnail pixels={frame.pixels} size={CANVAS_SIZE} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Metadata */}
      <div className="w-72 border-l border-zinc-700 p-4 flex flex-col gap-4">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Character</CardTitle>
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
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="blue-knight"
                disabled={isReadOnly}
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
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
            <CardTitle className="text-sm text-zinc-300">Frame Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
              onClick={handleClearFrame}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Frame
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Info</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-400 space-y-1">
            <p>Sprite: {CANVAS_SIZE}x{CANVAS_SIZE}px</p>
            <p>States: {ANIMATION_STATES.length}</p>
            <p>Total Frames: {Object.values(animationData).reduce((a, s) => a + s.frames.length, 0)}</p>
          </CardContent>
        </Card>

        <div className="mt-auto space-y-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !characterName.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Character
              </>
            )}
          </Button>
          <p className="text-xs text-zinc-500 text-center">
            Exports definition.json + all frames
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}

// Thumbnail component for frame preview
function FrameThumbnail({ pixels, size }: { pixels: Uint8ClampedArray; size: number }) {
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
