import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { PixelCanvas, type CanvasTool } from "../components/PixelCanvas"
import { CharacterGallery } from "../components/CharacterGallery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { getPresignedUrl, uploadToPresignedUrl, registerAsset, getAssetFile, loadAssetImage } from "@/api/assets"
import { syncUser } from "@/api/users"
import { useAuth } from "@/context/AuthContext"
import { Save, Trash2, Image, Plus, Copy, ChevronLeft, ChevronRight, Play, Pause, FolderOpen, Pencil, Eraser, Square, Undo2, Redo2, MoveLeft, MoveRight, Minus, User, Package, ArrowRightLeft, CopyPlus, Wand2 } from "lucide-react"
import type { UserDTO, AssetDTO } from "@/api/types"
import { generateStickmanAnimations } from "../utils/stickmanGenerator"

// Entity type for the editor
type EntityType = "CHARACTER" | "OBJECT"

// Character definition structure from JSON (extended with visual states)
interface CharacterDefinition {
  name: string
  spriteSize: number
  entityType?: EntityType
  visualStates?: string[]
  states: Record<string, { frames: number; loop: boolean }>
}

const CANVAS_SIZE = 128
const MAX_HISTORY = 10 // 10 undo levels per frame
const BRUSH_SIZES = [1, 2, 4, 8, 16]

// Visual state presets for each entity type
const CHARACTER_VISUAL_STATES = ["full", "hurt_1", "hurt_2", "critical"]
const OBJECT_VISUAL_STATES = ["new", "worn", "damaged", "broken"]

// Animation state definitions for characters
const CHARACTER_ANIMATION_STATES = [
  { id: "idle", label: "Idle", required: true, loop: true },
  { id: "walk_down", label: "Walk Down", required: true, loop: true },
  { id: "walk_up", label: "Walk Up", required: true, loop: true },
  { id: "walk_left", label: "Walk Left", required: true, loop: true },
  { id: "walk_right", label: "Walk Right", required: true, loop: true },
  { id: "action_build", label: "Build", required: false, loop: true },
  { id: "action_attack", label: "Attack", required: false, loop: false },
] as const

// Animation state definitions for objects (simplified - only idle)
const OBJECT_ANIMATION_STATES = [
  { id: "idle", label: "Idle", required: true, loop: true },
] as const

interface AnimationFrame {
  pixels: Uint8ClampedArray
}

interface AnimationState {
  frames: AnimationFrame[]
}

// Animation data now keyed by visual state, then animation state
// e.g., animationData["full"]["idle"] = { frames: [...] }
type VisualStateAnimationData = Record<string, AnimationState>
type EntityAnimationData = Record<string, VisualStateAnimationData>

function createEmptyFrame(): AnimationFrame {
  return { pixels: new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4) }
}

function createInitialAnimationDataForVisualState(
  animationStates: readonly { id: string; label: string; required: boolean; loop: boolean }[]
): VisualStateAnimationData {
  const data: Record<string, AnimationState> = {}
  for (const state of animationStates) {
    data[state.id] = { frames: [createEmptyFrame()] }
  }
  return data
}

function createInitialEntityAnimationData(
  entityType: EntityType
): EntityAnimationData {
  const visualStates = entityType === "CHARACTER" ? CHARACTER_VISUAL_STATES : OBJECT_VISUAL_STATES
  const animationStates = entityType === "CHARACTER" ? CHARACTER_ANIMATION_STATES : OBJECT_ANIMATION_STATES

  const data: EntityAnimationData = {}
  for (const vs of visualStates) {
    data[vs] = createInitialAnimationDataForVisualState(animationStates)
  }
  return data
}

// History type for undo/redo - keyed by "visualState_animState_frameIndex"
type FrameHistoryKey = string
interface FrameHistory {
  undoStack: Uint8ClampedArray[]
  redoStack: Uint8ClampedArray[]
}

export function EditorPage() {
  const { isAuthenticated, user: authUser } = useAuth()

  // Entity type state
  const [entityType, setEntityType] = useState<EntityType>("CHARACTER")

  // Visual state (e.g., "full", "hurt_1", etc. for characters)
  const [currentVisualState, setCurrentVisualState] = useState<string>("full")

  // Animation data structure
  const [animationData, setAnimationData] = useState<EntityAnimationData>(() =>
    createInitialEntityAnimationData("CHARACTER")
  )

  const [currentAnimState, setCurrentAnimState] = useState<string>("idle")
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

  // Copy from state dialog
  const [showCopyFromDialog, setShowCopyFromDialog] = useState(false)
  const [pendingVisualState, setPendingVisualState] = useState<string | null>(null)

  // Get the appropriate animation states based on entity type
  const animationStates = useMemo(() =>
    entityType === "CHARACTER" ? CHARACTER_ANIMATION_STATES : OBJECT_ANIMATION_STATES,
    [entityType]
  )

  // Get the appropriate visual states based on entity type
  const visualStates = useMemo(() =>
    entityType === "CHARACTER" ? CHARACTER_VISUAL_STATES : OBJECT_VISUAL_STATES,
    [entityType]
  )

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

      // Determine entity type and visual states from definition
      const loadedEntityType: EntityType = definition.entityType || "CHARACTER"
      const loadedVisualStates = definition.visualStates || ["default"]
      const isLegacy = !definition.visualStates

      // Set entity type
      setEntityType(loadedEntityType)

      // Get animation states for this entity type
      const loadedAnimStates = loadedEntityType === "CHARACTER"
        ? CHARACTER_ANIMATION_STATES
        : OBJECT_ANIMATION_STATES

      // Create new animation data structure
      const newAnimationData: EntityAnimationData = {}

      // Initialize with visual states from definition
      for (const vs of loadedVisualStates) {
        newAnimationData[vs] = {}
        for (const animState of loadedAnimStates) {
          newAnimationData[vs][animState.id] = { frames: [createEmptyFrame()] }
        }
      }

      // Load all frames for each visual state and animation state
      for (const vs of loadedVisualStates) {
        for (const [stateId, stateInfo] of Object.entries(definition.states)) {
          if (stateId in newAnimationData[vs]) {
            const frames: AnimationFrame[] = []
            for (let i = 0; i < stateInfo.frames; i++) {
              try {
                // Determine file name based on legacy vs new format
                let fileName: string
                if (isLegacy && vs === "default") {
                  // Legacy format: stateId_frameIndex.png
                  fileName = `${stateId}_${i}.png`
                } else {
                  // New format: visualState_stateId_frameIndex.png
                  fileName = `${vs}_${stateId}_${i}.png`
                }
                const pixels = await loadAssetImage(asset.storageKeyPrefix, fileName)
                frames.push({ pixels })
              } catch (err) {
                console.warn(`Failed to load frame, using empty frame`)
                frames.push(createEmptyFrame())
              }
            }
            newAnimationData[vs][stateId] = { frames }
          }
        }
      }

      setAnimationData(newAnimationData)
      setCurrentVisualState(loadedVisualStates[0])
      setCurrentAnimState("idle")
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
    setEntityType("CHARACTER")
    setAnimationData(createInitialEntityAnimationData("CHARACTER"))
    setCharacterName("")
    setLoadedAsset(null)
    setIsReadOnly(false)
    setCurrentVisualState("full")
    setCurrentAnimState("idle")
    setCurrentFrameIndex(0)
    setStatusMessage(null)
    clearAllHistory()
  }

  // Start a new object
  const handleNewObject = () => {
    setEntityType("OBJECT")
    setAnimationData(createInitialEntityAnimationData("OBJECT"))
    setCharacterName("")
    setLoadedAsset(null)
    setIsReadOnly(false)
    setCurrentVisualState("new")
    setCurrentAnimState("idle")
    setCurrentFrameIndex(0)
    setStatusMessage(null)
    clearAllHistory()
  }

  // Check if a visual state has any content (non-empty frames)
  const visualStateHasContent = useCallback((vs: string): boolean => {
    const vsData = animationData[vs]
    if (!vsData) return false
    for (const animState of Object.values(vsData)) {
      for (const frame of animState.frames) {
        if (frame.pixels.some((v, i) => i % 4 === 3 && v > 0)) {
          return true
        }
      }
    }
    return false
  }, [animationData])

  // Get list of visual states that have content
  const visualStatesWithContent = useMemo(() => {
    return Object.keys(animationData).filter(visualStateHasContent)
  }, [animationData, visualStateHasContent])

  // Convert Character to Object (keeps only idle frames)
  const handleConvertToObject = () => {
    // Check if there's content in non-idle animation states
    const hasNonIdleContent = Object.entries(animationData).some(([_vs, vsData]) => {
      return Object.entries(vsData).some(([stateId, state]) => {
        if (stateId === "idle") return false
        return state.frames.some(f => f.pixels.some((v, i) => i % 4 === 3 && v > 0))
      })
    })

    if (hasNonIdleContent) {
      const confirmed = window.confirm(
        "Converting to Object will LOSE all animation states except Idle (walk, attack, build, etc.).\n\n" +
        "Only the Idle frames will be kept for each visual state.\n\n" +
        "Are you sure you want to continue?"
      )
      if (!confirmed) return
    }

    // Convert animation data: keep only idle for each visual state, map to object visual states
    const newAnimationData: EntityAnimationData = {}
    const currentVsKeys = Object.keys(animationData)

    // Map character visual states to object visual states
    const vsMapping: Record<string, string> = {
      "full": "new",
      "hurt_1": "worn",
      "hurt_2": "damaged",
      "critical": "broken",
      "default": "new", // Legacy support
    }

    for (const oldVs of currentVsKeys) {
      const newVs = vsMapping[oldVs] || "new"
      const idleData = animationData[oldVs]?.idle
      newAnimationData[newVs] = {
        idle: idleData ? { frames: [...idleData.frames] } : { frames: [createEmptyFrame()] }
      }
    }

    // Ensure all object visual states exist
    for (const vs of OBJECT_VISUAL_STATES) {
      if (!newAnimationData[vs]) {
        newAnimationData[vs] = { idle: { frames: [createEmptyFrame()] } }
      }
    }

    setEntityType("OBJECT")
    setAnimationData(newAnimationData)
    setCurrentVisualState("new")
    setCurrentAnimState("idle")
    setCurrentFrameIndex(0)
    // Clear loadedAsset so it saves as a new asset in the objects folder
    setLoadedAsset(null)
    clearAllHistory()
    setStatusMessage({ type: "success", text: "Converted to Object. Only Idle frames were kept. Save to create new object." })
  }

  // Convert Object to Character (keeps idle frames, creates empty frames for other states)
  const handleConvertToCharacter = () => {
    // Convert animation data: keep idle, create empty for other states
    const newAnimationData: EntityAnimationData = {}
    const currentVsKeys = Object.keys(animationData)

    // Map object visual states to character visual states
    const vsMapping: Record<string, string> = {
      "new": "full",
      "worn": "hurt_1",
      "damaged": "hurt_2",
      "broken": "critical",
    }

    for (const oldVs of currentVsKeys) {
      const newVs = vsMapping[oldVs] || "full"
      const idleData = animationData[oldVs]?.idle

      // Create all character animation states
      newAnimationData[newVs] = {}
      for (const state of CHARACTER_ANIMATION_STATES) {
        if (state.id === "idle" && idleData) {
          newAnimationData[newVs][state.id] = { frames: [...idleData.frames] }
        } else {
          newAnimationData[newVs][state.id] = { frames: [createEmptyFrame()] }
        }
      }
    }

    // Ensure all character visual states exist
    for (const vs of CHARACTER_VISUAL_STATES) {
      if (!newAnimationData[vs]) {
        newAnimationData[vs] = createInitialAnimationDataForVisualState(CHARACTER_ANIMATION_STATES)
      }
    }

    setEntityType("CHARACTER")
    setAnimationData(newAnimationData)
    setCurrentVisualState("full")
    setCurrentAnimState("idle")
    setCurrentFrameIndex(0)
    // Clear loadedAsset so it saves as a new asset in the characters folder
    setLoadedAsset(null)
    clearAllHistory()
    setStatusMessage({ type: "success", text: "Converted to Character. Idle frames kept, other states are empty. Save to create new character." })
  }

  // Handle visual state change with copy-from option for empty states
  const handleVisualStateChange = (newVs: string) => {
    if (isPlaying) togglePlayback()

    // Check if the target state is empty and we have other states with content
    const targetHasContent = visualStateHasContent(newVs)
    const hasOtherContent = visualStatesWithContent.length > 0 &&
      (visualStatesWithContent.length > 1 || !visualStatesWithContent.includes(newVs))

    if (!targetHasContent && hasOtherContent) {
      // Show copy-from dialog
      setPendingVisualState(newVs)
      setShowCopyFromDialog(true)
    } else {
      // Just switch to the state
      setCurrentVisualState(newVs)
      setCurrentFrameIndex(0)
    }
  }

  // Copy frames from one visual state to another
  const handleCopyFromState = (sourceVs: string) => {
    if (!pendingVisualState) return

    const sourceData = animationData[sourceVs]
    if (!sourceData) return

    setAnimationData(prev => {
      const newData = { ...prev }
      // Deep copy all animation states from source to target
      const targetVsData: VisualStateAnimationData = {}
      for (const [stateId, stateData] of Object.entries(sourceData)) {
        targetVsData[stateId] = {
          frames: stateData.frames.map(f => ({ pixels: new Uint8ClampedArray(f.pixels) }))
        }
      }
      newData[pendingVisualState!] = targetVsData
      return newData
    })

    setCurrentVisualState(pendingVisualState)
    setCurrentFrameIndex(0)
    setShowCopyFromDialog(false)
    setPendingVisualState(null)
    clearAllHistory()
    setStatusMessage({ type: "success", text: `Copied frames from "${sourceVs}" to "${pendingVisualState}"` })
  }

  // Skip copying, just switch to empty state
  const handleSkipCopy = () => {
    if (pendingVisualState) {
      setCurrentVisualState(pendingVisualState)
      setCurrentFrameIndex(0)
    }
    setShowCopyFromDialog(false)
    setPendingVisualState(null)
  }

  // Get current animation data for the selected visual state
  const currentVisualStateData = animationData[currentVisualState] || {}
  const currentAnimStateData = currentVisualStateData[currentAnimState] || { frames: [createEmptyFrame()] }
  const currentFrames = currentAnimStateData.frames
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
    (): FrameHistoryKey => `${currentVisualState}_${currentAnimState}_${currentFrameIndex}`,
    [currentVisualState, currentAnimState, currentFrameIndex]
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
      const currentPixels = animationData[currentVisualState]?.[currentAnimState]?.frames[currentFrameIndex]?.pixels
      if (currentPixels) {
        history.undoStack.push(new Uint8ClampedArray(currentPixels))

        // Limit undo stack to MAX_HISTORY
        if (history.undoStack.length > MAX_HISTORY) {
          history.undoStack.shift()
        }

        // Clear redo stack on new action
        history.redoStack = []
      }

      setAnimationData((prev) => {
        const newData = { ...prev }
        const vsData = { ...newData[currentVisualState] }
        const animData = { ...vsData[currentAnimState] }
        const newFrames = [...animData.frames]
        newFrames[currentFrameIndex] = { pixels: newPixels }
        animData.frames = newFrames
        vsData[currentAnimState] = animData
        newData[currentVisualState] = vsData
        return newData
      })
    },
    [currentVisualState, currentAnimState, currentFrameIndex, animationData, getFrameHistory]
  )

  // Undo last action
  const handleUndo = useCallback(() => {
    const history = getFrameHistory()
    if (history.undoStack.length === 0) return

    // Push current state to redo stack
    const currentPixels = animationData[currentVisualState]?.[currentAnimState]?.frames[currentFrameIndex]?.pixels
    if (currentPixels) {
      history.redoStack.push(new Uint8ClampedArray(currentPixels))

      // Limit redo stack
      if (history.redoStack.length > MAX_HISTORY) {
        history.redoStack.shift()
      }
    }

    // Pop from undo stack
    const previousPixels = history.undoStack.pop()!

    setAnimationData((prev) => {
      const newData = { ...prev }
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames]
      newFrames[currentFrameIndex] = { pixels: previousPixels }
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
      return newData
    })
  }, [currentVisualState, currentAnimState, currentFrameIndex, animationData, getFrameHistory])

  // Redo last undone action
  const handleRedo = useCallback(() => {
    const history = getFrameHistory()
    if (history.redoStack.length === 0) return

    // Push current state to undo stack
    const currentPixels = animationData[currentVisualState]?.[currentAnimState]?.frames[currentFrameIndex]?.pixels
    if (currentPixels) {
      history.undoStack.push(new Uint8ClampedArray(currentPixels))
    }

    // Pop from redo stack
    const nextPixels = history.redoStack.pop()!

    setAnimationData((prev) => {
      const newData = { ...prev }
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames]
      newFrames[currentFrameIndex] = { pixels: nextPixels }
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
      return newData
    })
  }, [currentVisualState, currentAnimState, currentFrameIndex, animationData, getFrameHistory])

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
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames]
      newFrames[currentFrameIndex] = createEmptyFrame()
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
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
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames, createEmptyFrame()]
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
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
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames]
      const duplicated = { pixels: new Uint8ClampedArray(currentFrame.pixels) }
      newFrames.splice(currentFrameIndex + 1, 0, duplicated)
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
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
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames]
      newFrames.splice(currentFrameIndex, 1)
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
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
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames]
      // Swap current frame with the one to its left
      const temp = newFrames[currentFrameIndex - 1]
      newFrames[currentFrameIndex - 1] = newFrames[currentFrameIndex]
      newFrames[currentFrameIndex] = temp
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
      return newData
    })
    setCurrentFrameIndex(currentFrameIndex - 1)
  }

  const handleMoveFrameRight = () => {
    if (currentFrameIndex >= currentFrames.length - 1) return
    setAnimationData((prev) => {
      const newData = { ...prev }
      const vsData = { ...newData[currentVisualState] }
      const animData = { ...vsData[currentAnimState] }
      const newFrames = [...animData.frames]
      // Swap current frame with the one to its right
      const temp = newFrames[currentFrameIndex + 1]
      newFrames[currentFrameIndex + 1] = newFrames[currentFrameIndex]
      newFrames[currentFrameIndex] = temp
      animData.frames = newFrames
      vsData[currentAnimState] = animData
      newData[currentVisualState] = vsData
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
        const vsData = { ...newData[currentVisualState] }
        const animData = { ...vsData[currentAnimState] }
        const newFrames = [...animData.frames]
        newFrames[currentFrameIndex] = { pixels: imageData }
        animData.frames = newFrames
        vsData[currentAnimState] = animData
        newData[currentVisualState] = vsData
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

  // Generate stickman animations for the current visual state
  const handleGenerateStickman = () => {
    if (entityType !== "CHARACTER") {
      setStatusMessage({ type: "error", text: "Stickman generator only works for characters" })
      return
    }

    const stickmanData = generateStickmanAnimations(currentColor)

    setAnimationData((prev) => {
      const newData = { ...prev }
      const vsData = { ...newData[currentVisualState] }

      // Update each animation state with generated frames
      for (const [stateId, frames] of Object.entries(stickmanData)) {
        if (vsData[stateId]) {
          vsData[stateId] = {
            frames: frames.map((pixels: Uint8ClampedArray) => ({ pixels })),
          }
        }
      }

      newData[currentVisualState] = vsData
      return newData
    })

    // Clear undo history for all frames in this visual state
    historyRef.current.clear()

    setStatusMessage({
      type: "success",
      text: `Stickman generated for "${currentVisualState}" visual state with color ${currentColor}`,
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
    const activeVisualStates = Object.keys(animationData)

    // Collect all animation states with content
    for (const animState of animationStates) {
      // Check if any visual state has content for this animation state
      let maxFrameCount = 0
      let hasAnyContent = false

      for (const vs of activeVisualStates) {
        const vsData = animationData[vs]?.[animState.id]
        if (vsData) {
          const frameCount = vsData.frames.length
          maxFrameCount = Math.max(maxFrameCount, frameCount)
          const hasContent = vsData.frames.some((f) =>
            f.pixels.some((v, i) => i % 4 === 3 && v > 0)
          )
          if (hasContent) hasAnyContent = true
        }
      }

      if (hasAnyContent || animState.required) {
        states[animState.id] = { frames: maxFrameCount || 1, loop: animState.loop }
      }
    }

    return {
      name: characterName,
      spriteSize: CANVAS_SIZE,
      entityType: entityType,
      visualStates: activeVisualStates,
      states,
    }
  }

  const handleSave = async () => {
    if (!characterName.trim()) {
      setStatusMessage({ type: "error", text: `Please enter a ${entityType === "CHARACTER" ? "character" : "object"} name` })
      return
    }

    // Get the author ID from the backend user or auth user
    const authorId = backendUser?.id || authUser?.userId
    if (!authorId) {
      setStatusMessage({ type: "error", text: "Please log in to save" })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      // Use existing asset ID when editing, or generate new one for new assets
      const assetId = loadedAsset?.id ?? crypto.randomUUID()
      const isUpdate = loadedAsset !== null

      // Generate definition JSON
      const definition = generateDefinitionJson()
      const activeVisualStates = definition.visualStates

      // Collect all file names for registration
      const fileNames: string[] = ["definition.json"]

      // Collect all presigned URL requests and uploads
      const uploads: Promise<void>[] = []
      const presignedRequests: Array<{
        visualState: string
        stateId: string
        frameIndex: number
        fileName: string
      }> = []

      // Determine asset type folder
      const assetTypeFolder = entityType === "CHARACTER" ? "characters" : "objects"

      // Prepare file list - new format: visualState_stateId_frameIndex.png
      for (const vs of activeVisualStates) {
        for (const animState of animationStates) {
          const vsData = animationData[vs]?.[animState.id]
          if (vsData) {
            for (let i = 0; i < vsData.frames.length; i++) {
              const fileName = `${vs}_${animState.id}_${i}.png`
              presignedRequests.push({
                visualState: vs,
                stateId: animState.id,
                frameIndex: i,
                fileName,
              })
              fileNames.push(fileName)
            }
          }
        }
      }

      // Get presigned URL for definition.json
      const definitionPresigned = await getPresignedUrl({
        assetType: assetTypeFolder,
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
          assetType: assetTypeFolder,
          assetId,
          fileName: req.fileName,
          contentType: "image/png",
        })

        const framePixels = animationData[req.visualState]?.[req.stateId]?.frames[req.frameIndex]?.pixels
        if (framePixels) {
          const blob = await pixelsToBlob(framePixels)
          uploads.push(uploadToPresignedUrl(presigned, blob, "image/png"))
        }
      }

      // Wait for all uploads
      await Promise.all(uploads)

      // Register asset in database with file validation
      const result = await registerAsset({
        assetId,
        type: entityType,
        name: characterName,
        authorId,
        files: fileNames,
      })

      if (result.success) {
        // Update loadedAsset with the new/updated asset so subsequent saves work correctly
        if (result.asset) {
          setLoadedAsset(result.asset)
        }
        const action = isUpdate ? "updated" : "saved"
        const entityLabel = entityType === "CHARACTER" ? "Character" : "Object"
        setStatusMessage({ type: "success", text: `${entityLabel} "${characterName}" ${action} successfully!` })
      } else {
        const missingInfo = result.missingFiles?.length
          ? ` Missing files: ${result.missingFiles.join(", ")}`
          : ""
        setStatusMessage({ type: "error", text: `Registration failed: ${result.message}${missingInfo}` })
      }
    } catch (err) {
      console.error("Failed to save:", err)
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

  const stateInfo = animationStates.find((s) => s.id === currentAnimState)
  const entityLabel = entityType === "CHARACTER" ? "Character" : "Object"

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
            Loading...
          </div>
        </div>
      )}

      {/* Copy From State Dialog */}
      {showCopyFromDialog && pendingVisualState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={handleSkipCopy} />
          <div className="relative bg-zinc-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">
              Copy Frames to "{pendingVisualState}"?
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              This state is empty. Would you like to copy frames from another state as a starting point?
            </p>
            <div className="space-y-2 mb-4">
              {visualStatesWithContent
                .filter(vs => vs !== pendingVisualState)
                .map(vs => (
                  <button
                    key={vs}
                    onClick={() => handleCopyFromState(vs)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                  >
                    <span className="text-zinc-100 font-medium">Copy from "{vs}"</span>
                    <CopyPlus className="w-4 h-4 text-zinc-400" />
                  </button>
                ))
              }
            </div>
            <button
              onClick={handleSkipCopy}
              className="w-full py-2 px-4 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
            >
              Start with empty frames
            </button>
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
              Load
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className={`flex-1 border-zinc-600 text-zinc-100 hover:bg-zinc-600 ${entityType === "CHARACTER" ? "bg-blue-600 hover:bg-blue-700" : "bg-zinc-700"}`}
                onClick={handleNewCharacter}
              >
                <User className="w-4 h-4 mr-1" />
                Character
              </Button>
              <Button
                variant="outline"
                className={`flex-1 border-zinc-600 text-zinc-100 hover:bg-zinc-600 ${entityType === "OBJECT" ? "bg-orange-600 hover:bg-orange-700" : "bg-zinc-700"}`}
                onClick={handleNewObject}
              >
                <Package className="w-4 h-4 mr-1" />
                Object
              </Button>
            </div>
            {/* Convert button */}
            <Button
              variant="outline"
              className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
              onClick={entityType === "CHARACTER" ? handleConvertToObject : handleConvertToCharacter}
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Convert to {entityType === "CHARACTER" ? "Object" : "Character"}
            </Button>
          </CardContent>
        </Card>

        {/* Visual State Selector */}
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">
              {entityType === "CHARACTER" ? "Health State" : "Condition"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {visualStates.map((vs) => {
                const hasContent = visualStateHasContent(vs)
                return (
                  <button
                    key={vs}
                    onClick={() => handleVisualStateChange(vs)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors relative ${
                      currentVisualState === vs
                        ? entityType === "CHARACTER"
                          ? "bg-blue-600 text-white"
                          : "bg-orange-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    {vs}
                    {!hasContent && currentVisualState !== vs && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-zinc-500 rounded-full" title="Empty" />
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Animation State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {animationStates.map((state) => {
              const vsData = animationData[currentVisualState]?.[state.id]
              const frameCount = vsData?.frames.length ?? 1
              return (
                <button
                  key={state.id}
                  onClick={() => {
                    setCurrentAnimState(state.id)
                    setCurrentFrameIndex(0)
                    if (isPlaying) togglePlayback()
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
                    currentAnimState === state.id
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  <span>{state.label}</span>
                  <span className="text-xs opacity-70">
                    {frameCount}f
                  </span>
                </button>
              )
            })}
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
                title="Pencil - freehand drawing"
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
                title="Eraser - erase pixels"
              >
                <Eraser className="w-4 h-4" />
                Eraser
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentTool("line")}
                className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                  currentTool === "line"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
                title="Line - click start, click end"
              >
                <Minus className="w-4 h-4 -rotate-45" />
                Line
              </button>
              <button
                onClick={() => setCurrentTool("select")}
                className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                  currentTool === "select"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
                title="Select - select and transform region"
              >
                <Square className="w-4 h-4" />
                Select
              </button>
            </div>
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

        {entityType === "CHARACTER" && (
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Auto-Generate</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                onClick={handleGenerateStickman}
                title={`Generate stickman with current color (${currentColor}) for ${currentVisualState} visual state`}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Stickman
              </Button>
              <p className="text-xs text-zinc-500 mt-2">
                Generates all animation frames for the current visual state ({currentVisualState}) using the selected color.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col bg-zinc-950">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-zinc-900 rounded-lg p-4 shadow-xl">
            <PixelCanvas
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              pixels={currentFrame.pixels}
              color={getCurrentColor()}
              brushSize={brushSize}
              tool={currentTool}
              onCommit={handleCommit}
              className="rounded"
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="border-t border-zinc-700 p-4 bg-zinc-900">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-zinc-400">
              <span className="text-zinc-500">[{currentVisualState}]</span>{" "}
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
            <CardTitle className="text-sm text-zinc-300">{entityLabel}</CardTitle>
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
                placeholder={entityType === "CHARACTER" ? "blue-knight" : "wooden-barrel"}
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
            <p>Type: {entityType}</p>
            <p>Sprite: {CANVAS_SIZE}x{CANVAS_SIZE}px</p>
            <p>Visual States: {visualStates.length}</p>
            <p>Animation States: {animationStates.length}</p>
            <p>Total Frames: {
              Object.values(animationData).reduce((acc, vsData) =>
                acc + Object.values(vsData).reduce((a, s) => a + s.frames.length, 0), 0
              )
            }</p>
          </CardContent>
        </Card>

        <div className="mt-auto space-y-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !characterName.trim()}
            className={`w-full disabled:opacity-50 ${
              entityType === "CHARACTER"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-orange-600 hover:bg-orange-700"
            }`}
          >
            {isSaving ? "Saving..." : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save {entityLabel}
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
