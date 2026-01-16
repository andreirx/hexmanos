import { Amplify } from "aws-amplify"

// Cognito configuration for Player pool
const playerPoolConfig = {
  userPoolId: "eu-central-1_PKYxYlFq6",
  userPoolClientId: "srg7b3cjtet1nt87grmmtok6a",
  region: "eu-central-1",
  domain: "hexmanos-players-324037297014",
}

// Cognito configuration for Admin pool
export const adminPoolConfig = {
  userPoolId: "eu-central-1_6vEHad3r7",
  userPoolClientId: "56cjg5pg3ao3ssdbfff33sm541",
  region: "eu-central-1",
  domain: "hexmanos-admins-324037297014",
}

// Configure Amplify with Player pool by default
export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: playerPoolConfig.userPoolId,
        userPoolClientId: playerPoolConfig.userPoolClientId,
        loginWith: {
          oauth: {
            domain: `${playerPoolConfig.domain}.auth.${playerPoolConfig.region}.amazoncognito.com`,
            scopes: ["email", "openid", "profile"],
            redirectSignIn: ["http://localhost:5173/auth/callback"],
            redirectSignOut: ["http://localhost:5173"],
            responseType: "code",
          },
        },
      },
    },
  })
}

export { playerPoolConfig }
