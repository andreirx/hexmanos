# Infrastructure & Deployment

## Hosting (Hybrid)
- **Compute:** M1 Max Server running Spring Boot API + WebSockets
- **Ingress:** Cloudflare Tunnel exposing localhost to public internet
- **Database:** Native Postgres 17 on M1 Max (db: `hexmanos`). NO DOCKER.
- **Asset Storage:** AWS S3 (production, `m1max` profile) / Local disk (dev, `local` profile)
  - Local path: `${user.home}/hexmanos_uploads`

## External Services (AWS)
- **Auth:** AWS Cognito (two pools: `hexmanos-admins`, `hexmanos-players`)
  - Backend validates JWT via OAuth2 Resource Server
- **Storage:** AWS S3
- **Email:** AWS SES (transactional)

## Commerce
- **Provider:** PADDLE (strictly NO Stripe)
- **Logic:** Player paid/free status in local Postgres `users` table
- **Enforcement:** Backend checks DB flag before allowing Game Session creation

## Game Runtime
- Spring Boot single JVM with logical rooms
- In-memory state + scheduled DB snapshotting (every 5 min)
- 2-day inactivity timeout for game cleanup
