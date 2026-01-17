import { useState, useEffect, useCallback } from "react"
import { MapCanvas } from "../components/MapCanvas"
import { TilePalette } from "../components/TilePalette"
import { CharacterPalette } from "../components/CharacterPalette"
import { MapGallery } from "../components/MapGallery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout"
import { getPresignedUrl, uploadToPresignedUrl, registerAsset, getAssetFile } from "@/api/assets"
import { syncUser } from "@/api/users"
import { useAuth } from "@/context/AuthContext"
import {
  Save, FolderOpen, FilePlus, Grid3X3, Users, Layers, Trash2, Eye, EyeOff,
  ZoomIn, ZoomOut, Move, MousePointer2, Route
} from "lucide-react"
import type { UserDTO, AssetDTO } from "@/api/types"

// Map data structures - simplified for auto-variation selection
export interface MapTile {
  tileAssetId: string
  // Note: variation is NOT stored - it's picked randomly at render time
  // We store a seed per cell for consistent random variation
  seed: number
}

export interface MapPath {
  pathAssetId: string
  // variation is calculated automatically based on neighbors (0-14)
}

export interface MapCharacter {
  characterAssetId: string
  x: number
  y: number
}

export interface MapData {
  name: string
  width: number
  height: number
  tileSize: number
  layers: {
    terrain: (MapTile | null)[][]  // 2D array [y][x]
    paths: (MapPath | null)[][]     // 2D array [y][x] - variation calculated at render
  }
  characters: MapCharacter[]
}

// Tool types
type MapTool = "select" | "paint" | "erase" | "pan"
type ActiveLayer = "terrain" | "paths" | "characters"

const DEFAULT_MAP_WIDTH = 16
const DEFAULT_MAP_HEIGHT = 16
const TILE_SIZE = 128

function createEmptyMap(width: number, height: number): MapData {
  const terrain: (MapTile | null)[][] = []
  const paths: (MapPath | null)[][] = []

  for (let y = 0; y < height; y++) {
    terrain[y] = []
    paths[y] = []
    for (let x = 0; x < width; x++) {
      terrain[y][x] = null
      paths[y][x] = null
    }
  }

  return {
    name: "",
    width,
    height,
    tileSize: TILE_SIZE,
    layers: { terrain, paths },
    characters: []
  }
}

// Generate a random seed for consistent variation selection
function generateSeed(): number {
  return Math.floor(Math.random() * 1000000)
}

export function MapEditorPage() {
  const { isAuthenticated, user: authUser } = useAuth()

  // Map state
  const [mapData, setMapData] = useState<MapData>(() => createEmptyMap(DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT))
  const [mapName, setMapName] = useState("")

  // Tool state
  const [currentTool, setCurrentTool] = useState<MapTool>("paint")
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("terrain")
  const [showGrid, setShowGrid] = useState(true)
  const [showPaths, setShowPaths] = useState(true)
  const [showCharacters, setShowCharacters] = useState(true)
  const [showTransitions, setShowTransitions] = useState(true)

  // Selection state - only asset ID, no variation needed
  const [selectedTileAsset, setSelectedTileAsset] = useState<string | null>(null)
  const [selectedPathAsset, setSelectedPathAsset] = useState<string | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)

  // UI state
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [backendUser, setBackendUser] = useState<UserDTO | null>(null)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [loadedAsset, setLoadedAsset] = useState<AssetDTO | null>(null)
  const [isLoadingMap, setIsLoadingMap] = useState(false)

  // Canvas state
  const [zoom, setZoom] = useState(0.5)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  // Sync user with backend
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

  // Handle map selection from gallery
  const handleMapSelect = async (asset: AssetDTO, mode: "edit" | "copy") => {
    setIsGalleryOpen(false)
    setIsLoadingMap(true)
    setStatusMessage(null)

    try {
      const data = await getAssetFile<MapData>(asset.storageKeyPrefix, "map.json")
      setMapData(data)

      if (mode === "edit") {
        setLoadedAsset(asset)
        setMapName(data.name)
        setStatusMessage({ type: "success", text: `Loaded "${data.name}" for editing` })
      } else {
        setLoadedAsset(null)
        setMapName(`${data.name} (Copy)`)
        setStatusMessage({ type: "success", text: `Copied "${data.name}" - save as your own!` })
      }
    } catch (err) {
      console.error("Failed to load map:", err)
      setStatusMessage({ type: "error", text: "Failed to load map. Please try again." })
    } finally {
      setIsLoadingMap(false)
    }
  }

  // Create a new map
  const handleNewMap = () => {
    setMapData(createEmptyMap(DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT))
    setMapName("")
    setLoadedAsset(null)
    setStatusMessage(null)
  }

  // Handle canvas cell click for terrain
  const handleTerrainClick = useCallback((x: number, y: number) => {
    if (currentTool === "pan" || currentTool === "select") return

    setMapData(prev => {
      const newTerrain = prev.layers.terrain.map((row, rowY) =>
        row.map((cell, cellX) => {
          if (cellX === x && rowY === y) {
            if (currentTool === "erase") return null
            if (currentTool === "paint" && selectedTileAsset) {
              return { tileAssetId: selectedTileAsset, seed: generateSeed() }
            }
          }
          return cell
        })
      )

      return {
        ...prev,
        layers: { ...prev.layers, terrain: newTerrain }
      }
    })
  }, [currentTool, selectedTileAsset])

  // Handle canvas cell click for paths - auto-calculates connections
  const handlePathClick = useCallback((x: number, y: number) => {
    if (currentTool === "pan" || currentTool === "select") return

    setMapData(prev => {
      const newPaths = prev.layers.paths.map(row => [...row])

      if (currentTool === "erase") {
        // Remove path at this position
        newPaths[y][x] = null
      } else if (currentTool === "paint" && selectedPathAsset) {
        // Add or update path at this position
        // Variation will be calculated at render time based on neighbors
        newPaths[y][x] = { pathAssetId: selectedPathAsset }
      }

      return {
        ...prev,
        layers: { ...prev.layers, paths: newPaths }
      }
    })
  }, [currentTool, selectedPathAsset])

  // Handle canvas cell click for characters
  const handleCharacterClick = useCallback((x: number, y: number) => {
    if (currentTool === "pan" || currentTool === "select") return

    setMapData(prev => {
      if (currentTool === "erase") {
        return {
          ...prev,
          characters: prev.characters.filter(c => c.x !== x || c.y !== y)
        }
      } else if (currentTool === "paint" && selectedCharacter) {
        const existingIndex = prev.characters.findIndex(c => c.x === x && c.y === y)
        if (existingIndex >= 0) {
          const newChars = [...prev.characters]
          newChars[existingIndex] = { characterAssetId: selectedCharacter, x, y }
          return { ...prev, characters: newChars }
        } else {
          return {
            ...prev,
            characters: [...prev.characters, { characterAssetId: selectedCharacter, x, y }]
          }
        }
      }
      return prev
    })
  }, [currentTool, selectedCharacter])

  // Main cell click handler that delegates based on active layer
  const handleCellClick = useCallback((x: number, y: number) => {
    if (activeLayer === "terrain") {
      handleTerrainClick(x, y)
    } else if (activeLayer === "paths") {
      handlePathClick(x, y)
    } else if (activeLayer === "characters") {
      handleCharacterClick(x, y)
    }
  }, [activeLayer, handleTerrainClick, handlePathClick, handleCharacterClick])

  // Handle saving the map
  const handleSave = async () => {
    if (!mapName.trim()) {
      setStatusMessage({ type: "error", text: "Please enter a map name" })
      return
    }

    const authorId = backendUser?.id || authUser?.userId
    if (!authorId) {
      setStatusMessage({ type: "error", text: "Please log in to save maps" })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      const assetId = loadedAsset?.id || crypto.randomUUID()

      const saveData: MapData = {
        ...mapData,
        name: mapName
      }

      // Upload map.json
      const presigned = await getPresignedUrl({
        assetType: "maps",
        assetId,
        fileName: "map.json",
        contentType: "application/json"
      })

      const mapBlob = new Blob([JSON.stringify(saveData, null, 2)], { type: "application/json" })
      await uploadToPresignedUrl(presigned, mapBlob, "application/json")

      // Register the asset
      const result = await registerAsset({
        assetId,
        type: "MAP",
        name: mapName,
        authorId,
        files: ["map.json"]
      })

      if (result.success) {
        const action = loadedAsset ? "updated" : "saved"
        setStatusMessage({ type: "success", text: `Map "${mapName}" ${action}!` })
        if (!loadedAsset) {
          setLoadedAsset({
            id: assetId,
            name: mapName,
            type: "MAP",
            authorId,
            storageKeyPrefix: `maps/${assetId}`,
            status: "PENDING",
            createdAt: new Date().toISOString()
          })
        }
      } else {
        setStatusMessage({ type: "error", text: `Save failed: ${result.message}` })
      }
    } catch (err) {
      console.error("Failed to save map:", err)
      setStatusMessage({ type: "error", text: "Failed to save map. Is the backend running?" })
    } finally {
      setIsSaving(false)
    }
  }

  // Resize map
  const handleResizeMap = (newWidth: number, newHeight: number) => {
    setMapData(prev => {
      const newTerrain: (MapTile | null)[][] = []
      const newPaths: (MapPath | null)[][] = []

      for (let y = 0; y < newHeight; y++) {
        newTerrain[y] = []
        newPaths[y] = []
        for (let x = 0; x < newWidth; x++) {
          newTerrain[y][x] = prev.layers.terrain[y]?.[x] ?? null
          newPaths[y][x] = prev.layers.paths[y]?.[x] ?? null
        }
      }

      const newCharacters = prev.characters.filter(c => c.x < newWidth && c.y < newHeight)

      return {
        ...prev,
        width: newWidth,
        height: newHeight,
        layers: { terrain: newTerrain, paths: newPaths },
        characters: newCharacters
      }
    })
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Map Gallery */}
        <MapGallery
          isOpen={isGalleryOpen}
          onClose={() => setIsGalleryOpen(false)}
          onSelect={handleMapSelect}
          currentUserId={backendUser?.id}
        />

        {/* Loading overlay */}
        {isLoadingMap && (
          <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center">
            <div className="bg-zinc-800 rounded-lg px-6 py-4 text-zinc-100">
              Loading map...
            </div>
          </div>
        )}

        {/* Left Sidebar - Tools & Layers */}
        <div className="w-72 border-r border-zinc-700 p-4 flex flex-col gap-4 overflow-y-auto">
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
                Load Map
              </Button>
              <Button
                variant="outline"
                className="w-full bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                onClick={handleNewMap}
              >
                <FilePlus className="w-4 h-4 mr-2" />
                New Map
              </Button>
            </CardContent>
          </Card>

          {/* Tools */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCurrentTool("select")}
                  className={`py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    currentTool === "select"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  <MousePointer2 className="w-4 h-4" />
                  Select
                </button>
                <button
                  onClick={() => setCurrentTool("paint")}
                  className={`py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    currentTool === "paint"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                  Paint
                </button>
                <button
                  onClick={() => setCurrentTool("erase")}
                  className={`py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    currentTool === "erase"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  Erase
                </button>
                <button
                  onClick={() => setCurrentTool("pan")}
                  className={`py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors ${
                    currentTool === "pan"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  <Move className="w-4 h-4" />
                  Pan
                </button>
              </div>

              {/* Zoom controls */}
              <div>
                <label className="text-xs text-zinc-400 block mb-2">Zoom: {Math.round(zoom * 100)}%</label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                    onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 bg-zinc-700 border-zinc-600 text-zinc-100 hover:bg-zinc-600"
                    onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Layers */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Layers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveLayer("terrain")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      activeLayer === "terrain"
                        ? "bg-green-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    <Layers className="w-4 h-4 inline mr-2" />
                    Terrain
                  </button>
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`p-2 rounded ${showGrid ? "bg-zinc-600" : "bg-zinc-700"}`}
                    title="Toggle grid"
                  >
                    {showGrid ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveLayer("paths")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      activeLayer === "paths"
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    <Route className="w-4 h-4 inline mr-2" />
                    Paths
                  </button>
                  <button
                    onClick={() => setShowPaths(!showPaths)}
                    className={`p-2 rounded ${showPaths ? "bg-zinc-600" : "bg-zinc-700"}`}
                    title="Toggle paths visibility"
                  >
                    {showPaths ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveLayer("characters")}
                    className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                      activeLayer === "characters"
                        ? "bg-purple-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    <Users className="w-4 h-4 inline mr-2" />
                    Characters
                  </button>
                  <button
                    onClick={() => setShowCharacters(!showCharacters)}
                    className={`p-2 rounded ${showCharacters ? "bg-zinc-600" : "bg-zinc-700"}`}
                    title="Toggle characters visibility"
                  >
                    {showCharacters ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Transitions toggle */}
              <div className="pt-2 border-t border-zinc-700">
                <button
                  onClick={() => setShowTransitions(!showTransitions)}
                  className={`w-full py-2 px-3 rounded text-sm flex items-center justify-center gap-2 transition-colors ${
                    showTransitions ? "bg-zinc-600 text-white" : "bg-zinc-700 text-zinc-400"
                  }`}
                >
                  {showTransitions ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  Auto-Transitions
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Map Size */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Map Size</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-zinc-400 block mb-1">Width</label>
                  <input
                    type="number"
                    min={4}
                    max={64}
                    value={mapData.width}
                    onChange={(e) => handleResizeMap(Math.max(4, Math.min(64, parseInt(e.target.value) || 4)), mapData.height)}
                    className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-zinc-400 block mb-1">Height</label>
                  <input
                    type="number"
                    min={4}
                    max={64}
                    value={mapData.height}
                    onChange={(e) => handleResizeMap(mapData.width, Math.max(4, Math.min(64, parseInt(e.target.value) || 4)))}
                    className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                {mapData.width} x {mapData.height} = {mapData.width * mapData.height} cells
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
          <MapCanvas
            mapData={mapData}
            zoom={zoom}
            panOffset={panOffset}
            onPanChange={setPanOffset}
            showGrid={showGrid}
            showPaths={showPaths}
            showCharacters={showCharacters}
            showTransitions={showTransitions}
            activeLayer={activeLayer}
            currentTool={currentTool}
            onCellClick={handleCellClick}
          />
        </div>

        {/* Right Sidebar - Palettes */}
        <div className="w-80 border-l border-zinc-700 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Tile/Path/Character Palette based on active layer */}
          {activeLayer === "terrain" && (
            <TilePalette
              selectedAssetId={selectedTileAsset}
              onSelectAsset={setSelectedTileAsset}
              tileType="TILE"
            />
          )}

          {activeLayer === "paths" && (
            <TilePalette
              selectedAssetId={selectedPathAsset}
              onSelectAsset={setSelectedPathAsset}
              tileType="PATH"
            />
          )}

          {activeLayer === "characters" && (
            <CharacterPalette
              selectedCharacter={selectedCharacter}
              onSelectCharacter={setSelectedCharacter}
            />
          )}

          {/* Layer hints */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardContent className="pt-4">
              {activeLayer === "terrain" && (
                <p className="text-xs text-zinc-400">
                  Select a tile type and paint. Variations are picked randomly.
                  Transitions blend automatically at boundaries.
                </p>
              )}
              {activeLayer === "paths" && (
                <p className="text-xs text-zinc-400">
                  Select a path type and paint. The correct directional variation
                  is calculated automatically based on adjacent paths.
                </p>
              )}
              {activeLayer === "characters" && (
                <p className="text-xs text-zinc-400">
                  Select a character and click to place. Only one character per cell.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Map Properties */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Map Properties</CardTitle>
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
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                  placeholder="my-dungeon"
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
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

          {/* Map Stats */}
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">Map Info</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-400 space-y-1">
              <p>Size: {mapData.width} x {mapData.height}</p>
              <p>Tile size: {TILE_SIZE}px</p>
              <p>Characters: {mapData.characters.length}</p>
              <p>
                Terrain tiles: {mapData.layers.terrain.flat().filter(t => t !== null).length}
              </p>
              <p>
                Path tiles: {mapData.layers.paths.flat().filter(t => t !== null).length}
              </p>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="mt-auto space-y-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !mapName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Map
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
