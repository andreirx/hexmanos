import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import {
  signIn,
  signUp,
  signOut,
  signInWithRedirect,
  getCurrentUser,
  fetchAuthSession,
  confirmSignUp,
  type SignInInput,
  type SignUpInput,
} from "aws-amplify/auth"
import { Hub } from "aws-amplify/utils"
import { getCurrentUser as getBackendUser } from "@/api/users"
import type { UserDTO } from "@/api/types"

interface User {
  userId: string
  username: string
  email?: string
}

interface AuthContextType {
  user: User | null
  backendUser: UserDTO | null
  isLoading: boolean
  isAuthenticated: boolean
  accessToken: string | null
  login: (username: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<{ isConfirmed: boolean }>
  confirmRegistration: (username: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  syncBackendUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [backendUser, setBackendUser] = useState<UserDTO | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  // Sync user with backend (creates user if needed)
  const syncBackendUser = useCallback(async () => {
    try {
      const beUser = await getBackendUser()
      setBackendUser(beUser)
    } catch (err) {
      console.error("Failed to sync backend user:", err)
    }
  }, [])

  // Check for existing session on mount
  useEffect(() => {
    checkAuth()
  }, [])

  // Listen for OAuth events
  useEffect(() => {
    const unsubscribe = Hub.listen("auth", async ({ payload }) => {
      switch (payload.event) {
        case "signInWithRedirect":
          // OAuth sign-in completed, refresh auth state
          await checkAuth()
          await syncBackendUser()
          break
        case "signInWithRedirect_failure":
          console.error("OAuth sign-in failed:", payload.data)
          break
      }
    })
    return () => unsubscribe()
  }, [syncBackendUser])

  async function checkAuth() {
    try {
      setIsLoading(true)
      const currentUser = await getCurrentUser()
      const session = await fetchAuthSession()
      const token = session.tokens?.accessToken?.toString() ?? null

      setUser({
        userId: currentUser.userId,
        username: currentUser.username,
        email: currentUser.signInDetails?.loginId,
      })
      setAccessToken(token)

      // Sync with backend if we have a token
      if (token) {
        try {
          const beUser = await getBackendUser()
          setBackendUser(beUser)
        } catch {
          // Backend sync can fail, but we're still authenticated
        }
      }
    } catch {
      // No authenticated user
      setUser(null)
      setBackendUser(null)
      setAccessToken(null)
    } finally {
      setIsLoading(false)
    }
  }

  async function login(username: string, password: string) {
    const input: SignInInput = { username, password }
    const result = await signIn(input)

    if (result.isSignedIn) {
      await checkAuth()
    } else if (result.nextStep?.signInStep === "CONFIRM_SIGN_UP") {
      throw new Error("CONFIRM_SIGN_UP")
    } else {
      throw new Error("Sign in not completed: " + result.nextStep?.signInStep)
    }
  }

  async function loginWithGoogle() {
    await signInWithRedirect({ provider: "Google" })
  }

  async function register(username: string, email: string, password: string) {
    const input: SignUpInput = {
      username,
      password,
      options: {
        userAttributes: {
          email,
        },
      },
    }
    const result = await signUp(input)
    return { isConfirmed: result.isSignUpComplete }
  }

  async function confirmRegistration(username: string, code: string) {
    await confirmSignUp({ username, confirmationCode: code })
  }

  async function logout() {
    await signOut()
    setUser(null)
    setBackendUser(null)
    setAccessToken(null)
  }

  async function refreshSession() {
    const session = await fetchAuthSession({ forceRefresh: true })
    const token = session.tokens?.accessToken?.toString() ?? null
    setAccessToken(token)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        backendUser,
        isLoading,
        isAuthenticated: !!user,
        accessToken,
        login,
        loginWithGoogle,
        register,
        confirmRegistration,
        logout,
        refreshSession,
        syncBackendUser,
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
