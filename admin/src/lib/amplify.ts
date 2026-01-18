import { Amplify } from "aws-amplify"

// Cognito configuration for Admin pool
const adminPoolConfig = {
  userPoolId: "eu-central-1_6vEHad3r7",
  userPoolClientId: "56cjg5pg3ao3ssdbfff33sm541",
  region: "eu-central-1",
  domain: "hexmanos-admins-324037297014",
}

// Configure Amplify with Admin pool
export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: adminPoolConfig.userPoolId,
        userPoolClientId: adminPoolConfig.userPoolClientId,
        loginWith: {
          oauth: {
            domain: `${adminPoolConfig.domain}.auth.${adminPoolConfig.region}.amazoncognito.com`,
            scopes: ["email", "openid", "profile"],
            redirectSignIn: ["http://localhost:5174/auth/callback"],
            redirectSignOut: ["http://localhost:5174"],
            responseType: "code",
          },
        },
      },
    },
  })
}

export { adminPoolConfig }
