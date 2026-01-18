import axios from "axios"
import { fetchAuthSession } from "aws-amplify/auth"

const api = axios.create({
  baseURL: "http://localhost:8080",
  headers: {
    "Content-Type": "application/json",
  },
})

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.accessToken?.toString()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Not authenticated, continue without token
  }
  return config
})

export default api
