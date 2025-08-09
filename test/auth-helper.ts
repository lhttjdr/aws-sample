/**
 * AWS認証設定ユーティリティ
 * 複数の認証方式をサポート：Profile、IAM Role、OIDC など
 */

import { STSClient, AssumeRoleWithWebIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { fromIni, fromEnv, fromTokenFile } from '@aws-sdk/credential-providers';
import { TestConfig } from './test-config';
import { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import * as fs from 'fs';
import * as path from 'path';

export interface AWSClientConfig {
  region: string;
  credentials: AwsCredentialIdentity | AwsCredentialIdentityProvider;
}

export class AuthHelper {
  private config: TestConfig;

  constructor(config: TestConfig) {
    this.config = config;
  }

  /**
   * AWSクライアント設定を取得
   * 設定された認証方式に基づいて適切な認証プロバイダーを自動選択
   */
  async getAWSClientConfig(): Promise<AWSClientConfig> {
    const credentials = await this.getCredentialProvider();
    
    return {
      region: this.config.region,
      credentials
    };
  }

  /**
   * 設定に基づいて認証プロバイダーを取得
   */
  private async getCredentialProvider(): Promise<AwsCredentialIdentity | AwsCredentialIdentityProvider> {
    console.log(`🔐 認証方式を使用: ${this.config.authMethod}`);

    switch (this.config.authMethod) {
      case 'profile':
        return this.getProfileCredentials();
      
      case 'role':
        return this.getAssumeRoleCredentials();
      
      case 'oidc':
        return this.getOIDCCredentials();
      
      case 'env':
        return fromEnv();
      
      case 'auto':
      default:
        return this.getAutoCredentials();
    }
  }

  /**
   * AWS CLI Profile認証を使用
   */
  private getProfileCredentials(): AwsCredentialIdentityProvider {
    const profile = this.config.profile || process.env.AWS_PROFILE || 'default';
    console.log(`📋 AWSプロファイルを使用: ${profile}`);
    
    return fromIni({
      profile,
      filepath: process.env.AWS_SHARED_CREDENTIALS_FILE
    });
  }

  /**
   * IAM Role認証を使用（EC2、Lambdaなどに適用）
   */
  private async getAssumeRoleCredentials(): Promise<AwsCredentialIdentity> {
    if (!this.config.roleArn) {
      throw new Error('Role ARN is required for role-based authentication');
    }

    console.log(`🎭 IAMロールを引き受け: ${this.config.roleArn}`);

    const stsClient = new STSClient({ region: this.config.region });
    
    const command = new AssumeRoleCommand({
      RoleArn: this.config.roleArn,
      RoleSessionName: `iceberg-test-${Date.now()}`,
      DurationSeconds: 3600 // 1 hour
    });

    const result = await stsClient.send(command);
    
    if (!result.Credentials) {
      throw new Error('Failed to assume role');
    }

    return {
      accessKeyId: result.Credentials.AccessKeyId!,
      secretAccessKey: result.Credentials.SecretAccessKey!,
      sessionToken: result.Credentials.SessionToken!,
      expiration: result.Credentials.Expiration
    };
  }

  /**
   * OIDC (OpenID Connect) 認証を使用
   * GitHub Actions、GitLab CI、Azure DevOpsなどに適用
   */
  private async getOIDCCredentials(): Promise<AwsCredentialIdentity> {
    if (!this.config.oidcConfig) {
      throw new Error('OIDC configuration is required for OIDC authentication');
    }

    const { roleArn, audience, subject, issuer } = this.config.oidcConfig;
    
    console.log(`🌐 OIDC認証を使用:`);
    console.log(`  Role ARN: ${roleArn}`);
    console.log(`  発行者: ${issuer}`);
    console.log(`  サブジェクト: ${subject}`);

    // OIDCトークンを取得
    const webIdentityToken = await this.getOIDCToken();
    
    const stsClient = new STSClient({ region: this.config.region });
    
    const command = new AssumeRoleWithWebIdentityCommand({
      RoleArn: roleArn,
      RoleSessionName: `iceberg-oidc-${Date.now()}`,
      WebIdentityToken: webIdentityToken,
      DurationSeconds: 3600
    });

    const result = await stsClient.send(command);
    
    if (!result.Credentials) {
      throw new Error('Failed to assume role with OIDC');
    }

    return {
      accessKeyId: result.Credentials.AccessKeyId!,
      secretAccessKey: result.Credentials.SecretAccessKey!,
      sessionToken: result.Credentials.SessionToken!,
      expiration: result.Credentials.Expiration
    };
  }

  /**
   * OIDCトークンを取得
   * GitHub Actions、ファイルシステムなどのソースをサポート
   */
  private async getOIDCToken(): Promise<string> {
    // GitHub Actions環境
    if (process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN && process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
      return this.getGitHubActionsToken();
    }

    // ファイルからトークンを読み取り
    const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    if (tokenFile && fs.existsSync(tokenFile)) {
      console.log(`📄 ファイルからOIDCトークンを読み取り: ${tokenFile}`);
      return fs.readFileSync(tokenFile, 'utf8').trim();
    }

    // 環境変数から読み取り
    if (process.env.AWS_WEB_IDENTITY_TOKEN) {
      console.log('🔤 環境変数からOIDCトークンを読み取り');
      return process.env.AWS_WEB_IDENTITY_TOKEN;
    }

    throw new Error('No OIDC token source found');
  }

  /**
   * GitHub Actions OIDCトークンを取得
   */
  private async getGitHubActionsToken(): Promise<string> {
    const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN!;
    const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL!;
    const audience = this.config.oidcConfig?.audience || 'sts.amazonaws.com';

    console.log('🐙 GitHub ActionsからOIDCトークンを取得');

    const response = await fetch(`${requestUrl}&audience=${audience}`, {
      headers: {
        'Authorization': `Bearer ${requestToken}`,
        'Accept': 'application/json; api-version=2.0',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get GitHub Actions token: ${response.statusText}`);
    }

    const data = await response.json() as { value: string };
    return data.value;
  }

  /**
   * 認証方式を自動選択
   * 優先順位に従って異なる認証方法を試行
   */
  private getAutoCredentials(): AwsCredentialIdentityProvider {
    console.log('🔍 認証方式を自動検出...');

    // 1. GitHub Actions環境かチェック
    if (process.env.GITHUB_ACTIONS && process.env.AWS_ROLE_ARN) {
      console.log('✅ GitHub Actions環境を検出、OIDCを使用');
      this.config.authMethod = 'oidc';
      return this.getOIDCCredentials() as any;
    }

    // 2. Role ARN環境変数があるかチェック
    if (process.env.AWS_ROLE_ARN && process.env.AWS_WEB_IDENTITY_TOKEN_FILE) {
      console.log('✅ Web Identity Tokenを検出、OIDCを使用');
      this.config.authMethod = 'oidc';
      return this.getOIDCCredentials() as any;
    }

    // 3. AWSプロファイルがあるかチェック
    if (process.env.AWS_PROFILE || fs.existsSync(path.join(process.env.HOME || process.env.USERPROFILE || '', '.aws', 'credentials'))) {
      console.log('✅ AWSプロファイル設定を検出');
      return this.getProfileCredentials();
    }

    // 4. 環境変数を使用
    console.log('✅ 環境変数認証を使用');
    return fromEnv();
  }

  /**
   * 認証設定を検証
   */
  async validateAuthentication(): Promise<boolean> {
    try {
      const clientConfig = await this.getAWSClientConfig();
      const stsClient = new STSClient(clientConfig);
      
      // 呼び出し元IDの取得を試行
      const { GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
      const result = await stsClient.send(new GetCallerIdentityCommand({}));
      
      console.log('✅ 認証検証成功:');
      console.log(`  ユーザーARN: ${result.Arn}`);
      console.log(`  アカウントID: ${result.Account}`);
      console.log(`  ユーザーID: ${result.UserId}`);
      
      return true;
    } catch (error) {
      console.error('❌ 認証検証失敗:', error);
      return false;
    }
  }
}
