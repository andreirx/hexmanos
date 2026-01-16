import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { EditorPage } from "@/features/editor"

function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Hexmanos Engine</h1>
        <p className="text-zinc-400">Pixel Art Game Engine</p>
        <div className="space-x-4">
          <a
            href="/editor"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Open Editor
          </a>
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
        <Route path="/editor" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
