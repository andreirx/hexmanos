import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, syncBackendUser } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Wait for auth state to settle
    if (isLoading) return

    async function handleCallback() {
      if (isAuthenticated) {
        // Sync user with backend (creates user if needed)
        try {
          await syncBackendUser()
        } catch (err) {
          console.error("Failed to sync user:", err)
          // Continue anyway - user is authenticated
        }
        navigate("/")
      } else {
        // OAuth might still be processing, wait a bit
        const timer = setTimeout(() => {
          if (!isAuthenticated) {
            setError("Sign in failed. Please try again.")
          }
        }, 5000)
        return () => clearTimeout(timer)
      }
    }

    handleCallback()
  }, [isAuthenticated, isLoading, navigate, syncBackendUser])

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate("/auth/login")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-zinc-400">Completing sign in...</p>
      </div>
    </div>
  )
}
