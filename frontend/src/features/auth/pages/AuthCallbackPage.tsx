import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Amplify automatically handles the OAuth callback
    // Just redirect to home after a short delay
    const timer = setTimeout(() => {
      navigate("/")
    }, 1000)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-zinc-400">Completing sign in...</p>
      </div>
    </div>
  )
}
