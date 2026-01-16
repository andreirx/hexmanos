import axios from "axios"
import { fetchAuthSession } from "aws-amplify/auth"

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

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login on 401
      window.location.href = "/auth/login"
    }
    return Promise.reject(error)
  }
)

export default api
