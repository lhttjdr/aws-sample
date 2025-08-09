/**
 * テスト環境クリーンアップ
 * すべてのテスト完了後に AWS リソースをクリーンアップ
 */

import { AthenaHelper } from './athena-helper';
import { getTestConfig } from './test-config';

describe('テスト環境クリーンアップ', () => {
  const config = getTestConfig();
  let athenaHelper: AthenaHelper;

  beforeAll(() => {
    athenaHelper = new AthenaHelper(config);
  });

  // テストデータのクリーンアップ機能を分離
  // 注意: データベースは CloudFormation で管理されているため削除しない
  async function cleanupTestData() {
    const cleanupSql = [
      `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.contracts}`,
      `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.counterparties}`,
      `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.contractUpdates}`
      // データベース自体は CloudFormation で管理されているため削除しない
      // `DROP DATABASE IF EXISTS ${config.databaseName}`
    ];

    process.stdout.write('テストテーブルを削除中...\n');
    await athenaHelper.executeMultipleQueries(cleanupSql);
  }

  describe('クリーンアップ検証', () => {
    test('クリーンアップ設定を検証すること', () => {
      // クリーンアップに必要な設定を検証
      expect(config.databaseName).toBeDefined();
      expect(config.tables.contracts).toBeDefined();
      expect(config.tables.counterparties).toBeDefined();
      expect(config.tables.contractUpdates).toBeDefined();
      
      console.log('✅ クリーンアップ設定検証通過');
      console.log(`クリーンアップ対象データベース: ${config.databaseName}`);
    });

    test('テスト環境のクリーンアップを実行すること', async () => {
      // クリーンアップ開始の簡単な通知のみ
      process.stdout.write('🧹 テスト環境のクリーンアップを開始...\n');
      
      try {
        // すべてのテストデータをクリーンアップ
        await cleanupTestData();
        process.stdout.write('✅ テスト環境クリーンアップ完了\n');
        
      } catch (error) {
        process.stderr.write(`⚠️ クリーンアップ処理中に警告: ${error}\n`);
        process.stderr.write('AWS リソースの手動確認とクリーンアップをお願いします\n');
      }
      
      // 完了通知
      process.stdout.write('🎉 Apache Iceberg 技術検証テストスイート実行完了！\n');
      process.stdout.write('💡 完全なリソースクリーンアップが必要な場合は: npm run cleanup\n');
    }, 60000); // 60秒のタイムアウトを設定
  });
});
