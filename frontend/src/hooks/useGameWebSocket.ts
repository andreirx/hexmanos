import { useEffect, useRef, useCallback, useState } from "react"
import { Client } from "@stomp/stompjs"
import type { IMessage, StompSubscription } from "@stomp/stompjs"
import SockJS from "sockjs-client"
import { fetchAuthSession } from "aws-amplify/auth"
import type {
  AttackStartEvent,
  ProjectileSpawnEvent,
  ProjectileUpdateEvent,
  ProjectileHitEvent,
  DamageEvent,
  CharacterDeathEvent,
} from "@/api/types"

// Re-export types for convenience
export type {
  AttackStartEvent,
  ProjectileSpawnEvent,
  ProjectileUpdateEvent,
  ProjectileHitEvent,
  DamageEvent,
  CharacterDeathEvent,
}

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:8080/ws/game"

export interface CharacterMoveEvent {
  characterId: string
  x: number
  y: number
  direction: string
  state: string  // Animation state from backend (walk_up, walk_down, walk_left, walk_right, idle)
  duration: number  // Duration in milliseconds for this move animation (backend-dictated based on terrain cost)
}

export interface CharacterIdleEvent {
  characterId: string
  state: string  // Always "idle"
}

export interface PathStartEvent {
  characterId: string
  path: [number, number][]  // Array of [x, y] coordinates
}

export interface PathCancelEvent {
  characterId: string
}

export interface GameWebSocketOptions {
  gameId: string
  onCharacterMove?: (event: CharacterMoveEvent) => void
  onCharacterIdle?: (event: CharacterIdleEvent) => void
  onPathStart?: (event: PathStartEvent) => void
  onPathCancel?: (event: PathCancelEvent) => void
  // Attack/projectile events
  onAttackStart?: (event: AttackStartEvent) => void
  onProjectileSpawn?: (event: ProjectileSpawnEvent) => void
  onProjectileUpdate?: (event: ProjectileUpdateEvent) => void
  onProjectileHit?: (event: ProjectileHitEvent) => void
  onDamage?: (event: DamageEvent) => void
  onCharacterDeath?: (event: CharacterDeathEvent) => void
  onError?: (message: string) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

export function useGameWebSocket(options: GameWebSocketOptions) {
  const {
    gameId,
    onCharacterMove,
    onCharacterIdle,
    onPathStart,
    onPathCancel,
    onAttackStart,
    onProjectileSpawn,
    onProjectileUpdate,
    onProjectileHit,
    onDamage,
    onCharacterDeath,
    onError,
    onConnected,
    onDisconnected,
  } = options

  const clientRef = useRef<Client | null>(null)
  const subscriptionRef = useRef<StompSubscription | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const isConnectingRef = useRef(false)
  const currentGameIdRef = useRef<string | null>(null)

  // Store callbacks in refs to avoid dependency changes
  const callbacksRef = useRef({
    onCharacterMove,
    onCharacterIdle,
    onPathStart,
    onPathCancel,
    onAttackStart,
    onProjectileSpawn,
    onProjectileUpdate,
    onProjectileHit,
    onDamage,
    onCharacterDeath,
    onError,
    onConnected,
    onDisconnected,
  })
  callbacksRef.current = {
    onCharacterMove,
    onCharacterIdle,
    onPathStart,
    onPathCancel,
    onAttackStart,
    onProjectileSpawn,
    onProjectileUpdate,
    onProjectileHit,
    onDamage,
    onCharacterDeath,
    onError,
    onConnected,
    onDisconnected,
  }

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

  // Send path request - stable reference
  const sendPath = useCallback((targetX: number, targetY: number) => {
    if (!clientRef.current?.active || !currentGameIdRef.current) {
      console.warn("Cannot send path: WebSocket not connected")
      return false
    }

    console.log("[WebSocket] Publishing path request to:", targetX, targetY)
    clientRef.current.publish({
      destination: `/app/game/${currentGameIdRef.current}/path`,
      body: JSON.stringify({ targetX, targetY }),
    })
    return true
  }, [])

  // Send cancel path - stable reference
  const sendCancelPath = useCallback(() => {
    if (!clientRef.current?.active || !currentGameIdRef.current) {
      return false
    }

    clientRef.current.publish({
      destination: `/app/game/${currentGameIdRef.current}/cancelPath`,
      body: "{}",
    })
    return true
  }, [])

  // Send attack command - stable reference
  const sendAttack = useCallback((attackId: string, targetX: number, targetY: number) => {
    if (!clientRef.current?.active || !currentGameIdRef.current) {
      console.warn("Cannot send attack: WebSocket not connected")
      return false
    }

    console.log("[WebSocket] Publishing attack:", attackId, "to target:", targetX, targetY)
    clientRef.current.publish({
      destination: `/app/game/${currentGameIdRef.current}/attack`,
      body: JSON.stringify({ attackId, targetX, targetY }),
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
              const event = JSON.parse(message.body)

              // Detect event type by checking for specific fields
              if ("path" in event && Array.isArray(event.path)) {
                // PathStartEvent has a 'path' array
                console.log("[WebSocket] Received path start event:", event)
                callbacksRef.current.onPathStart?.(event as PathStartEvent)
              } else if ("attackId" in event && "animationDuration" in event) {
                // AttackStartEvent has 'attackId' and 'animationDuration'
                console.log("[WebSocket] Received attack start event:", event)
                callbacksRef.current.onAttackStart?.(event as AttackStartEvent)
              } else if ("projectileId" in event && "projectileAssetId" in event) {
                // ProjectileSpawnEvent has 'projectileId' and 'projectileAssetId'
                console.log("[WebSocket] Received projectile spawn event:", event)
                callbacksRef.current.onProjectileSpawn?.(event as ProjectileSpawnEvent)
              } else if ("projectileId" in event && "preciseX" in event) {
                // ProjectileUpdateEvent has 'projectileId' and 'preciseX'
                callbacksRef.current.onProjectileUpdate?.(event as ProjectileUpdateEvent)
              } else if ("projectileId" in event && "damage" in event) {
                // ProjectileHitEvent has 'projectileId' and 'damage'
                console.log("[WebSocket] Received projectile hit event:", event)
                callbacksRef.current.onProjectileHit?.(event as ProjectileHitEvent)
              } else if ("newHealth" in event && "damage" in event) {
                // DamageEvent has 'newHealth' and 'damage'
                console.log("[WebSocket] Received damage event:", event)
                callbacksRef.current.onDamage?.(event as DamageEvent)
              } else if ("killedByCharacterId" in event) {
                // CharacterDeathEvent has 'killedByCharacterId'
                console.log("[WebSocket] Received character death event:", event)
                callbacksRef.current.onCharacterDeath?.(event as CharacterDeathEvent)
              } else if ("direction" in event && "x" in event && "y" in event) {
                // CharacterMoveEvent has 'direction', 'x', 'y', and 'state'
                console.log("[WebSocket] Received move event:", event)
                callbacksRef.current.onCharacterMove?.(event as CharacterMoveEvent)
              } else if ("state" in event && !("x" in event) && !("damage" in event)) {
                // CharacterIdleEvent has 'characterId' and 'state' but no position or damage
                console.log("[WebSocket] Received idle event:", event)
                callbacksRef.current.onCharacterIdle?.(event as CharacterIdleEvent)
              } else if ("characterId" in event && Object.keys(event).length === 1) {
                // PathCancelEvent only has 'characterId'
                console.log("[WebSocket] Received path cancel event:", event)
                callbacksRef.current.onPathCancel?.(event as PathCancelEvent)
              } else {
                console.log("[WebSocket] Unknown event type:", event)
              }
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
    sendPath,
    sendCancelPath,
    sendAttack,
  }
}
