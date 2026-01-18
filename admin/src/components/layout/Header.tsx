import { Link } from "react-router-dom"
import { Shield, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"

export function Header() {
  const { user, isAuthenticated, logout } = useAuth()

  return (
    <header className="bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-zinc-100">
            <Shield className="w-6 h-6 text-amber-500" />
            <span>Hexmanos Admin</span>
          </Link>

          {/* Navigation */}
          {isAuthenticated && (
            <nav className="flex items-center gap-6">
              <Link
                to="/assets"
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Assets
              </Link>
              <Link
                to="/assets/pending"
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Pending Review
              </Link>
            </nav>
          )}

          {/* Auth */}
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-zinc-400">
                  {user?.username}
                </span>
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </>
            ) : (
              <Link to="/login">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
