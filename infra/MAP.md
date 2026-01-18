# Infrastructure Map

AWS CDK infrastructure as code for Hexmanos.

## Directory Structure

| Item | Type | Purpose |
|------|------|---------|
| `bin/` | Directory | CDK app entry point |
| `lib/` | Directory | Stack definitions |
| `test/` | Directory | CDK assertion tests |
| `cdk.out/` | Directory | Synthesized CloudFormation (gitignored) |
| `node_modules/` | Directory | NPM dependencies (gitignored) |
| `cdk.json` | File | CDK configuration |
| `package.json` | File | NPM dependencies |
| `tsconfig.json` | File | TypeScript configuration |
| `jest.config.js` | File | Test runner configuration |

## bin/

CDK application entry point.

| File | Purpose |
|------|---------|
| `infra.ts` | Creates CDK App and InfraStack |

### infra.ts
```typescript
const app = new cdk.App()
new InfraStack(app, 'InfraStack', {
  env: { region: 'eu-central-1' }
})
```

## lib/

Stack definitions.

| File | Purpose |
|------|---------|
| `infra-stack.ts` | Main stack with all AWS resources |

### infra-stack.ts

Creates all AWS resources for Hexmanos.

**Resources Created:**

#### S3 Bucket (HexmanosAssets)
- Bucket name: `hexmanos-assets-{accountId}`
- Block all public access
- CORS enabled for localhost origins
- Removal policy: RETAIN

#### Player User Pool (HexmanosPlayerPool)
- Pool name: `hexmanos-players`
- Self-signup: Enabled
- Sign-in: Username + Email
- Password: 8+ chars, lowercase required
- Email verification via AWS SES
- Token validity: Access 1hr, Refresh 30 days

#### Admin User Pool (HexmanosAdminPool)
- Pool name: `hexmanos-admins`
- Self-signup: Disabled (manual creation)
- Sign-in: Username + Email
- Password: 12+ chars, all complexity required
- Email verification via AWS SES
- Token validity: Access 30min, Refresh 7 days

#### App Clients
- Player client: OAuth code + implicit grants
- Admin client: OAuth code grant only
- Callback URLs for localhost development

#### Cognito Domains
- Player: `hexmanos-players-{accountId}.auth.eu-central-1.amazoncognito.com`
- Admin: `hexmanos-admins-{accountId}.auth.eu-central-1.amazoncognito.com`

## test/

CDK assertion tests.

| File | Purpose |
|------|---------|
| `infra.test.ts` | Tests that stack synthesizes correctly |

## Stack Outputs

CloudFormation outputs exported for use:

| Output | Purpose |
|--------|---------|
| `HexmanosPlayerUserPoolId` | Player pool ID for backend config |
| `HexmanosPlayerUserPoolClientId` | Client ID for frontend config |
| `HexmanosPlayerUserPoolDomain` | OAuth domain for hosted UI |
| `HexmanosAdminUserPoolId` | Admin pool ID |
| `HexmanosAdminUserPoolClientId` | Admin client ID |
| `HexmanosAdminUserPoolDomain` | Admin OAuth domain |
| `HexmanosAssetsBucketName` | S3 bucket name |
| `HexmanosAssetsBucketArn` | S3 bucket ARN |
| `HexmanosPlayerIssuerUrl` | JWT issuer for backend validation |
| `HexmanosAdminIssuerUrl` | Admin JWT issuer |

## Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Synthesize CloudFormation
npx cdk synth

# Deploy to AWS
npx cdk deploy

# Compare with deployed
npx cdk diff

# Destroy stack (careful!)
npx cdk destroy

# Run tests
npm test
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `aws-cdk-lib` 2.215.0 | CDK core libraries |
| `aws-cdk` 2.1033.0 | CDK CLI |
| `constructs` 10.0.0 | Construct base classes |
| `typescript` 5.9 | Type safety |
| `jest`, `ts-jest` | Testing |
| `aws-cdk-lib/assertions` | CDK test assertions |

## Deployment Prerequisites

1. AWS CLI configured with credentials
2. CDK bootstrapped in target account/region
3. SES domain verified (bijuterie.software)
4. Sufficient IAM permissions for CDK
