/**
 * 認証検証テスト
 * AWS 認証が正しく設定されているかを検証
 */

import { AuthHelper } from './auth-helper';
import { getTestConfig } from './test-config';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

describe('認証検証', () => {
  const config = getTestConfig();
  const authHelper = new AuthHelper(config);

  test('有効な AWS 認証情報を取得できること', async () => {
    const clientConfig = await authHelper.getAWSClientConfig();
    
    expect(clientConfig).toBeDefined();
    expect(clientConfig.region).toBeDefined();
    expect(clientConfig.credentials).toBeDefined();
    
    console.log(`✅ AWS リージョン: ${clientConfig.region}`);
  }, 30000);

  test('身元情報を検証できること', async () => {
    const clientConfig = await authHelper.getAWSClientConfig();
    const stsClient = new STSClient(clientConfig);
    
    const result = await stsClient.send(new GetCallerIdentityCommand({}));
    
    expect(result.UserId).toBeDefined();
    expect(result.Account).toBeDefined();
    expect(result.Arn).toBeDefined();
    
    console.log('✅ 身元検証成功:');
    console.log(`   ユーザーID: ${result.UserId}`);
    console.log(`   アカウントID: ${result.Account}`);
    console.log(`   ARN: ${result.Arn}`);
  }, 30000);

  test('有効な設定があること', () => {
    expect(config.region).toBeDefined();
    expect(config.s3BucketName).toBeDefined();
    expect(config.databaseName).toBeDefined();
    
    console.log(`✅ S3 バケット: ${config.s3BucketName}`);
    console.log(`✅ データベース: ${config.databaseName}`);
  });
});
