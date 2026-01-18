import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Header } from "@/components/layout/Header"
import { useAuth } from "@/context/AuthContext"
import { LoginPage } from "@/features/auth/pages/LoginPage"
import { AssetListPage } from "@/features/assets/pages/AssetListPage"
import { PendingAssetsPage } from "@/features/assets/pages/PendingAssetsPage"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main>{children}</main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/assets/pending" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets"
          element={
            <ProtectedRoute>
              <AppLayout>
                <AssetListPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets/pending"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PendingAssetsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
