import { useState } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

export function ConfirmPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { confirmRegistration } = useAuth()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const username = searchParams.get("username") || ""

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      await confirmRegistration(username, code)
      navigate("/auth/login")
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("An unexpected error occurred")
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (!username) {
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">Missing username parameter</p>
          <Link
            to="/auth/register"
            className="text-blue-400 hover:text-blue-300 mt-4 inline-block"
          >
            Back to registration
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Verify Email</h1>
          <p className="text-zinc-400 mt-2">
            Enter the verification code sent to your email
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="code"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Verification Code
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
              placeholder="000000"
              required
              maxLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || code.length !== 6}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            {isLoading ? "Verifying..." : "Verify"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-400">
          Didn't receive the code?{" "}
          <button className="text-blue-400 hover:text-blue-300">
            Resend code
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/auth/login"
            className="text-sm text-zinc-500 hover:text-zinc-400"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
