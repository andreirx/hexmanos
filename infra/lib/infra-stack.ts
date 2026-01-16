import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  // Export these for use in other stacks or applications
  public readonly playerUserPool: cognito.UserPool;
  public readonly playerUserPoolClient: cognito.UserPoolClient;
  public readonly adminUserPool: cognito.UserPool;
  public readonly adminUserPoolClient: cognito.UserPoolClient;
  public readonly assetsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================
    // S3 Bucket for Game Assets
    // ============================================
    this.assetsBucket = new s3.Bucket(this, 'HexmanosAssets', {
      bucketName: `hexmanos-assets-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['http://localhost:5173', 'http://localhost:8080'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    // ============================================
    // Player User Pool (Main Users)
    // ============================================
    this.playerUserPool = new cognito.UserPool(this, 'HexmanosPlayerPool', {
      userPoolName: 'hexmanos-players',
      selfSignUpEnabled: true,
      signInAliases: {
        username: true,
        email: true,
      },
      autoVerify: {
        email: true, // Auto-verify email with code
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        displayName: new cognito.StringAttribute({
          minLen: 2,
          maxLen: 50,
          mutable: true,
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Use SES for sending emails
      email: cognito.UserPoolEmail.withSES({
        fromEmail: 'contact@bijuterie.software',
        fromName: 'Hexmanos',
        sesVerifiedDomain: 'bijuterie.software',
        sesRegion: 'eu-central-1',
      }),
    });

    // Player Pool App Client
    this.playerUserPoolClient = this.playerUserPool.addClient('HexmanosPlayerClient', {
      userPoolClientName: 'hexmanos-player-web',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:5173/auth/callback',
          'http://localhost:8080/login/oauth2/code/cognito',
        ],
        logoutUrls: [
          'http://localhost:5173',
        ],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // Player Pool Domain (for hosted UI)
    const playerDomain = this.playerUserPool.addDomain('HexmanosPlayerDomain', {
      cognitoDomain: {
        domainPrefix: `hexmanos-players-${this.account}`,
      },
    });

    // ============================================
    // Admin User Pool (Moderators Only)
    // ============================================
    this.adminUserPool = new cognito.UserPool(this, 'HexmanosAdminPool', {
      userPoolName: 'hexmanos-admins',
      selfSignUpEnabled: false, // Admins are created manually
      signInAliases: {
        username: true,
        email: true,
      },
      autoVerify: {
        email: true, // Admins should verify
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Use SES for sending emails
      email: cognito.UserPoolEmail.withSES({
        fromEmail: 'contact@bijuterie.software',
        fromName: 'Hexmanos Admin',
        sesVerifiedDomain: 'bijuterie.software',
        sesRegion: 'eu-central-1',
      }),
    });

    // Admin Pool App Client
    this.adminUserPoolClient = this.adminUserPool.addClient('HexmanosAdminClient', {
      userPoolClientName: 'hexmanos-admin-web',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:5173/admin/auth/callback',
        ],
        logoutUrls: [
          'http://localhost:5173/admin',
        ],
      },
      accessTokenValidity: cdk.Duration.minutes(30),
      idTokenValidity: cdk.Duration.minutes(30),
      refreshTokenValidity: cdk.Duration.days(7),
      preventUserExistenceErrors: true,
    });

    // Admin Pool Domain
    const adminDomain = this.adminUserPool.addDomain('HexmanosAdminDomain', {
      cognitoDomain: {
        domainPrefix: `hexmanos-admins-${this.account}`,
      },
    });

    // ============================================
    // Stack Outputs
    // ============================================

    // Player Pool Outputs
    new cdk.CfnOutput(this, 'PlayerUserPoolId', {
      value: this.playerUserPool.userPoolId,
      description: 'Player Cognito User Pool ID',
      exportName: 'HexmanosPlayerUserPoolId',
    });

    new cdk.CfnOutput(this, 'PlayerUserPoolClientId', {
      value: this.playerUserPoolClient.userPoolClientId,
      description: 'Player Cognito User Pool Client ID',
      exportName: 'HexmanosPlayerUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'PlayerUserPoolDomain', {
      value: playerDomain.domainName,
      description: 'Player Cognito User Pool Domain',
      exportName: 'HexmanosPlayerUserPoolDomain',
    });

    new cdk.CfnOutput(this, 'PlayerCognitoRegion', {
      value: this.region,
      description: 'AWS Region for Player Cognito',
      exportName: 'HexmanosPlayerCognitoRegion',
    });

    // Admin Pool Outputs
    new cdk.CfnOutput(this, 'AdminUserPoolId', {
      value: this.adminUserPool.userPoolId,
      description: 'Admin Cognito User Pool ID',
      exportName: 'HexmanosAdminUserPoolId',
    });

    new cdk.CfnOutput(this, 'AdminUserPoolClientId', {
      value: this.adminUserPoolClient.userPoolClientId,
      description: 'Admin Cognito User Pool Client ID',
      exportName: 'HexmanosAdminUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'AdminUserPoolDomain', {
      value: adminDomain.domainName,
      description: 'Admin Cognito User Pool Domain',
      exportName: 'HexmanosAdminUserPoolDomain',
    });

    // S3 Bucket Output
    new cdk.CfnOutput(this, 'AssetsBucketName', {
      value: this.assetsBucket.bucketName,
      description: 'S3 Bucket for game assets',
      exportName: 'HexmanosAssetsBucketName',
    });

    new cdk.CfnOutput(this, 'AssetsBucketArn', {
      value: this.assetsBucket.bucketArn,
      description: 'S3 Bucket ARN',
      exportName: 'HexmanosAssetsBucketArn',
    });

    // Issuer URLs (for JWT validation)
    new cdk.CfnOutput(this, 'PlayerIssuerUrl', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.playerUserPool.userPoolId}`,
      description: 'Player Pool JWT Issuer URL',
      exportName: 'HexmanosPlayerIssuerUrl',
    });

    new cdk.CfnOutput(this, 'AdminIssuerUrl', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.adminUserPool.userPoolId}`,
      description: 'Admin Pool JWT Issuer URL',
      exportName: 'HexmanosAdminIssuerUrl',
    });
  }
}
