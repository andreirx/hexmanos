import axios from "axios"
import { fetchAuthSession, signOut } from "aws-amplify/auth"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080/api",
  headers: {
    "Content-Type": "application/json",
  },
})

// Request interceptor for auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const session = await fetchAuthSession()
      const token = session.tokens?.accessToken?.toString()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // No authenticated session, continue without token
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Track if we're currently refreshing to prevent loops
let isRefreshing = false

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // If already refreshing, just reject
      if (isRefreshing) {
        return Promise.reject(error)
      }

      isRefreshing = true

      try {
        // Try to refresh the session
        const session = await fetchAuthSession({ forceRefresh: true })
        const token = session.tokens?.accessToken?.toString()

        if (token) {
          // Update the Authorization header and retry
          originalRequest.headers.Authorization = `Bearer ${token}`
          isRefreshing = false
          return api(originalRequest)
        }
      } catch {
        // Refresh failed - user session is truly invalid
      }

      isRefreshing = false

      // Only redirect if we're NOT on an auth page already
      const isAuthPage = window.location.pathname.startsWith("/auth/")
      if (!isAuthPage) {
        // Sign out to clear invalid session state
        try {
          await signOut()
        } catch {
          // Ignore sign out errors
        }
        window.location.href = "/auth/login"
      }
    }

    return Promise.reject(error)
  }
)

export default api
