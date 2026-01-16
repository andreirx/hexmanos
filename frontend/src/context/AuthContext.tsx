import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react"
import {
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  confirmSignUp,
  type SignInInput,
  type SignUpInput,
} from "aws-amplify/auth"

interface User {
  userId: string
  username: string
  email?: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  accessToken: string | null
  login: (username: string, password: string) => Promise<void>
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<{ isConfirmed: boolean }>
  confirmRegistration: (username: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  // Check for existing session on mount
  useEffect(() => {
    checkAuth()
  }, [])

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
    } catch {
      // No authenticated user
      setUser(null)
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
        isLoading,
        isAuthenticated: !!user,
        accessToken,
        login,
        register,
        confirmRegistration,
        logout,
        refreshSession,
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
