import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  type AuthUser,
} from "aws-amplify/auth"

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  accessToken: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      const session = await fetchAuthSession()
      setAccessToken(session.tokens?.accessToken?.toString() || null)
    } catch {
      setUser(null)
      setAccessToken(null)
    } finally {
      setIsLoading(false)
    }
  }

  async function login(username: string, password: string) {
    const result = await signIn({ username, password })
    if (result.isSignedIn) {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      const session = await fetchAuthSession()
      setAccessToken(session.tokens?.accessToken?.toString() || null)
    }
  }

  async function logout() {
    await signOut()
    setUser(null)
    setAccessToken(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        accessToken,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
