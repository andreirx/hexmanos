import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080/api",
  headers: {
    "Content-Type": "application/json",
  },
})

// Request interceptor for auth token
api.interceptors.request.use(
  (config) => {
    // TODO: Add Cognito token injection when auth is implemented
    // const token = await getAuthToken()
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`
    // }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // TODO: Handle unauthorized - redirect to login
      console.error("Unauthorized - redirect to login")
    }
    return Promise.reject(error)
  }
)

export default api
