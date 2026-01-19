import { useEffect, useRef, useCallback, useState } from "react"
import { Client } from "@stomp/stompjs"
import type { IMessage, StompSubscription } from "@stomp/stompjs"
import SockJS from "sockjs-client"
import { fetchAuthSession } from "aws-amplify/auth"

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:8080/ws/game"

export interface CharacterMoveEvent {
  characterId: string
  x: number
  y: number
  direction: string
}

export interface GameWebSocketOptions {
  gameId: string
  onCharacterMove?: (event: CharacterMoveEvent) => void
  onError?: (message: string) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

export function useGameWebSocket(options: GameWebSocketOptions) {
  const { gameId, onCharacterMove, onError, onConnected, onDisconnected } = options

  const clientRef = useRef<Client | null>(null)
  const subscriptionRef = useRef<StompSubscription | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const isConnectingRef = useRef(false)
  const currentGameIdRef = useRef<string | null>(null)

  // Store callbacks in refs to avoid dependency changes
  const callbacksRef = useRef({ onCharacterMove, onError, onConnected, onDisconnected })
  callbacksRef.current = { onCharacterMove, onError, onConnected, onDisconnected }

  // Send move command - stable reference
  const sendMove = useCallback((direction: "n" | "s" | "e" | "w") => {
    if (!clientRef.current?.active || !currentGameIdRef.current) {
      console.warn("Cannot send move: WebSocket not connected")
      return false
    }

    console.log("[WebSocket] Publishing move:", direction, "to game:", currentGameIdRef.current)
    clientRef.current.publish({
      destination: `/app/game/${currentGameIdRef.current}/move`,
      body: JSON.stringify({ direction }),
    })
    return true
  }, [])

  // Send idle command - stable reference
  const sendIdle = useCallback(() => {
    if (!clientRef.current?.active || !currentGameIdRef.current) {
      return false
    }

    clientRef.current.publish({
      destination: `/app/game/${currentGameIdRef.current}/idle`,
      body: "{}",
    })
    return true
  }, [])

  // Connect/disconnect effect - only depends on gameId
  useEffect(() => {
    // Skip if no gameId or empty string
    if (!gameId) {
      return
    }

    // Skip if already connected to this game
    if (currentGameIdRef.current === gameId && clientRef.current?.active) {
      return
    }

    // Prevent concurrent connection attempts
    if (isConnectingRef.current) {
      return
    }

    const connectToGame = async () => {
      isConnectingRef.current = true

      // Disconnect existing connection if any
      if (clientRef.current?.active) {
        try {
          clientRef.current.deactivate()
        } catch {
          // Ignore deactivation errors
        }
        clientRef.current = null
      }

      // Get auth token
      let token: string | null = null
      try {
        const session = await fetchAuthSession()
        token = session.tokens?.accessToken?.toString() || null
      } catch {
        token = null
      }

      if (!token) {
        console.error("No auth token available for WebSocket")
        callbacksRef.current.onError?.("Not authenticated")
        isConnectingRef.current = false
        return
      }

      const client = new Client({
        webSocketFactory: () => new SockJS(WS_URL),
        connectHeaders: {
          Authorization: `Bearer ${token}`,
        },
        debug: () => {
          // Disable debug logging to reduce noise
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
      })

      client.onConnect = () => {
        console.log("WebSocket connected to game:", gameId)
        currentGameIdRef.current = gameId
        setIsConnected(true)
        isConnectingRef.current = false
        callbacksRef.current.onConnected?.()

        // Subscribe to game events
        subscriptionRef.current = client.subscribe(
          `/topic/game/${gameId}`,
          (message: IMessage) => {
            try {
              const event = JSON.parse(message.body) as CharacterMoveEvent
              console.log("[WebSocket] Received move event:", event)
              callbacksRef.current.onCharacterMove?.(event)
            } catch (e) {
              console.error("Failed to parse WebSocket message:", e)
            }
          }
        )

        // Subscribe to user-specific errors
        client.subscribe("/user/queue/errors", (message: IMessage) => {
          try {
            const error = JSON.parse(message.body)
            callbacksRef.current.onError?.(error.message)
          } catch (e) {
            console.error("Failed to parse error message:", e)
          }
        })
      }

      client.onDisconnect = () => {
        console.log("WebSocket disconnected")
        setIsConnected(false)
        callbacksRef.current.onDisconnected?.()
      }

      client.onStompError = (frame) => {
        console.error("STOMP error:", frame.headers["message"])
        callbacksRef.current.onError?.(frame.headers["message"] || "WebSocket error")
        isConnectingRef.current = false
      }

      client.onWebSocketClose = () => {
        setIsConnected(false)
        isConnectingRef.current = false
      }

      clientRef.current = client
      client.activate()
    }

    connectToGame()

    // Cleanup function
    return () => {
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe()
        } catch {
          // Ignore
        }
        subscriptionRef.current = null
      }

      if (clientRef.current) {
        try {
          clientRef.current.deactivate()
        } catch {
          // Ignore
        }
        clientRef.current = null
      }

      currentGameIdRef.current = null
      isConnectingRef.current = false
      setIsConnected(false)
    }
  }, [gameId])

  return {
    isConnected,
    sendMove,
    sendIdle,
  }
}
