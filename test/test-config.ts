/**
 * テスト設定ファイル
 * 環境変数または CDK 出力から設定を自動取得
 */

export interface TestConfig {
  // AWS 設定
  region: string;
  s3BucketName: string;
  athenaWorkGroup: string;
  athenaResultLocation: string;
  
  // 認証設定（自動検出）
  authMethod: 'profile' | 'role' | 'oidc' | 'env' | 'auto';
  profile?: string;
  roleArn?: string;
  oidcConfig?: {
    roleArn: string;
    audience: string;
    subject: string;
    issuer: string;
  };
  
  // データベース設定
  databaseName: string;
  
  // テーブル名設定
  tables: {
    contracts: string;
    counterparties: string;
    contractUpdates: string;
  };
  
  // S3 パス設定
  s3Paths: {
    contracts: string;
    counterparties: string;
    contractUpdates: string;
    athenaResults: string;
  };
}

// テスト設定を取得（簡素版）
export function getTestConfig(): TestConfig {
  const s3BucketName = process.env.ICEBERG_S3_BUCKET || 'your-iceberg-data-bucket';
  const region = process.env.AWS_REGION || 'us-east-1';
  
  return {
    region,
    s3BucketName,
    athenaWorkGroup: process.env.ATHENA_WORKGROUP || 'primary',
    athenaResultLocation: process.env.ATHENA_RESULT_LOCATION || `s3://${s3BucketName}/athena-query-results/`,
    
    // 認証設定を簡素化 - 自動検出
    authMethod: 'auto',
    profile: process.env.AWS_PROFILE,
    roleArn: process.env.AWS_ROLE_ARN,
    oidcConfig: process.env.AWS_ROLE_ARN ? {
      roleArn: process.env.AWS_ROLE_ARN,
      audience: 'sts.amazonaws.com',
      subject: process.env.GITHUB_ACTOR || 'test-user',
      issuer: 'https://token.actions.githubusercontent.com'
    } : undefined,
    
    databaseName: process.env.TEST_DATABASE_NAME || 'contract_lakehouse',
    
    tables: {
      contracts: 'contracts',
      counterparties: 'counterparties',
      contractUpdates: 'contract_updates'
    },
    
    s3Paths: {
      contracts: `s3://${s3BucketName}/contracts/`,
      counterparties: `s3://${s3BucketName}/counterparties/`,
      contractUpdates: `s3://${s3BucketName}/contract_updates/`,
      athenaResults: `s3://${s3BucketName}/athena-query-results/`
    }
  };
}
