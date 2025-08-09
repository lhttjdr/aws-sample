/**
 * 基盤環境テスト
 * AWS サービス接続と基本設定を検証
 */

import { AthenaClient, ListWorkGroupsCommand } from '@aws-sdk/client-athena';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { GlueClient, GetDatabasesCommand } from '@aws-sdk/client-glue';
import { getTestConfig } from './test-config';
import { TestDriftHelper } from './drift-helper';

describe('Iceberg 基盤環境テスト', () => {
  const config = getTestConfig();
  let athenaClient: AthenaClient;
  let s3Client: S3Client;
  let glueClient: GlueClient;
  let driftHelper: TestDriftHelper;

  beforeAll(async () => {
    athenaClient = new AthenaClient({ region: config.region });
    s3Client = new S3Client({ region: config.region });
    glueClient = new GlueClient({ region: config.region });
    driftHelper = new TestDriftHelper();
    
    // 栈状态检查
    await driftHelper.verifyStackState();
  }, 120000); // 增加超时时间以适应漂移检测

  afterAll(() => {
    // リソースをクリーンアップ
    if (driftHelper) {
      driftHelper.cleanup();
    }
  });

  describe('AWS サービス接続検証', () => {
    test('Athena サービスに接続できること', async () => {
      const command = new ListWorkGroupsCommand({});
      const result = await athenaClient.send(command);
      
      expect(result.WorkGroups).toBeDefined();
      expect(Array.isArray(result.WorkGroups)).toBe(true);
      
      // 指定されたワークグループが存在するかを確認
      const workGroupExists = result.WorkGroups?.some((wg: any) => wg.Name === config.athenaWorkGroup);
      expect(workGroupExists).toBe(true);
      
      console.log(`✓ Athena 接続成功、ワークグループを発見: ${config.athenaWorkGroup}`);
    }, 30000);

    test('S3 バケットにアクセスできること', async () => {
      // S3 バケットが存在しアクセス可能かをチェック
      const command = new HeadBucketCommand({ Bucket: config.s3BucketName });
      
      try {
        await s3Client.send(command);
        console.log(`✓ S3 バケットアクセス成功: ${config.s3BucketName}`);
      } catch (error: any) {
        if (error.name === 'NotFound') {
          fail(`S3 バケットが存在しません: ${config.s3BucketName}. バケットを作成するか設定を更新してください。`);
        } else if (error.name === 'Forbidden') {
          fail(`S3 バケットへのアクセス権限がありません: ${config.s3BucketName}. IAM 権限を確認してください。`);
        } else {
          throw error;
        }
      }
    }, 30000);

    test('Glue データカタログに接続できること', async () => {
      const command = new GetDatabasesCommand({});
      const result = await glueClient.send(command);
      
      expect(result.DatabaseList).toBeDefined();
      expect(Array.isArray(result.DatabaseList)).toBe(true);
      
      console.log(`✓ Glue データカタログ接続成功、${result.DatabaseList?.length} 個のデータベースを発見`);
    }, 30000);
  });

  describe('テスト設定検証', () => {
    test('有効なテスト設定があること', () => {
      // 必要な設定項目を確認
      expect(config.region).toBeDefined();
      expect(config.s3BucketName).toBeDefined();
      expect(config.s3BucketName).not.toBe('your-iceberg-data-bucket');
      expect(config.athenaWorkGroup).toBeDefined();
      expect(config.athenaResultLocation).toBeDefined();
      expect(config.databaseName).toBeDefined();
      
      // テーブル名設定を確認
      expect(config.tables.contracts).toBeDefined();
      expect(config.tables.counterparties).toBeDefined();
      expect(config.tables.contractUpdates).toBeDefined();
      
      // S3 パス設定を確認
      expect(config.s3Paths.contracts).toBeDefined();
      expect(config.s3Paths.counterparties).toBeDefined();
      expect(config.s3Paths.contractUpdates).toBeDefined();
      expect(config.s3Paths.athenaResults).toBeDefined();
      
      console.log('✓ テスト設定検証通過');
      console.log(`  - リージョン: ${config.region}`);
      console.log(`  - S3 バケット: ${config.s3BucketName}`);
      console.log(`  - Athena ワークグループ: ${config.athenaWorkGroup}`);
      console.log(`  - データベース名: ${config.databaseName}`);
    });

    test('S3 パスの形式が正しいこと', () => {
      const s3PathPattern = /^s3:\/\/[a-z0-9.\-]+\/.*\/$/;
      
      expect(config.s3Paths.contracts).toMatch(s3PathPattern);
      expect(config.s3Paths.counterparties).toMatch(s3PathPattern);
      expect(config.s3Paths.contractUpdates).toMatch(s3PathPattern);
      expect(config.s3Paths.athenaResults).toMatch(s3PathPattern);
      
      console.log('✓ S3 パス形式検証通過');
    });
  });

  describe('環境準備チェック', () => {
    test('環境設定のヒントを提供すること', () => {
      const envVars = [
        'AWS_REGION',
        'ICEBERG_S3_BUCKET',
        'ATHENA_WORKGROUP',
        'ATHENA_RESULT_LOCATION'
      ];

      console.log('📋 環境変数設定のヒント:');
      envVars.forEach(envVar => {
        const value = process.env[envVar];
        if (value) {
          console.log(`  ✓ ${envVar}: ${value}`);
        } else {
          console.log(`  ⚠ ${envVar}: 未設定 (デフォルト値を使用)`);
        }
      });

      console.log('\n📝 テスト実行前に以下を確認してください:');
      console.log('  1. AWS 認証情報が正しく設定されている (AWS CLI または環境変数)');
      console.log('  2. Athena、S3、Glue にアクセスするための十分な IAM 権限がある');
      console.log('  3. S3 バケットが作成されアクセス可能である');
      console.log('  4. Athena ワークグループのクエリ結果の場所が設定されている');
    });
  });
});
