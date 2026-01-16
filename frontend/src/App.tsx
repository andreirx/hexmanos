import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom"
import { EditorPage } from "@/features/editor"
import { TileEditorPage } from "@/features/tiles"

function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Hexmanos Engine</h1>
        <p className="text-zinc-400">Pixel Art Game Engine - Asset Workshop</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto mt-8">
          <Link
            to="/editor/character"
            className="block p-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700"
          >
            <div className="text-2xl mb-2">🧙</div>
            <h2 className="font-semibold">Character Editor</h2>
            <p className="text-sm text-zinc-400 mt-1">Create animated sprites</p>
          </Link>

          <Link
            to="/editor/tile"
            className="block p-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700"
          >
            <div className="text-2xl mb-2">🧱</div>
            <h2 className="font-semibold">Tile Editor</h2>
            <p className="text-sm text-zinc-400 mt-1">Create terrain tiles</p>
          </Link>

          <Link
            to="/editor/map"
            className="block p-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700 opacity-50 cursor-not-allowed"
            onClick={(e) => e.preventDefault()}
          >
            <div className="text-2xl mb-2">🗺️</div>
            <h2 className="font-semibold">Map Editor</h2>
            <p className="text-sm text-zinc-400 mt-1">Coming soon...</p>
          </Link>

          <Link
            to="/play"
            className="block p-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700 opacity-50 cursor-not-allowed"
            onClick={(e) => e.preventDefault()}
          >
            <div className="text-2xl mb-2">🎮</div>
            <h2 className="font-semibold">Play</h2>
            <p className="text-sm text-zinc-400 mt-1">Coming soon...</p>
          </Link>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor" element={<Navigate to="/editor/character" replace />} />
        <Route path="/editor/character" element={<EditorPage />} />
        <Route path="/editor/tile" element={<TileEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
