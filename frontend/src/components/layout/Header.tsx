import { Link } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

interface HeaderProps {
  title?: string
}

export function Header({ title = "Hexmanos" }: HeaderProps) {
  const { user, backendUser, isLoading, logout } = useAuth()

  // Prefer backend user's display name, fall back to Cognito username
  const displayName = backendUser?.displayName || user?.username || "User"

  return (
    <header className="flex justify-between items-center px-4 py-3 border-b border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-xl font-bold text-zinc-100 hover:text-zinc-300 transition-colors">
          {title}
        </Link>
      </div>
      <div>
        {isLoading ? (
          <span className="text-zinc-500 text-sm">Loading...</span>
        ) : user ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">
              Welcome, <span className="text-zinc-200">{displayName}</span>
            </span>
            <button
              onClick={() => logout()}
              className="text-sm px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 text-zinc-100 transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link
              to="/auth/login"
              className="text-sm px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 text-zinc-100 transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/auth/register"
              className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
