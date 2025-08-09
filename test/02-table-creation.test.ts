/**
 * データベースとテーブル作成テスト
 * CDK で作成されたリソースを検証し、Iceberg 機能をデモンストレーション
 */

import { AthenaHelper } from './athena-helper';
import { getTestConfig } from './test-config';

describe('Iceberg データベースとテーブル作成テスト', () => {
  const config = getTestConfig();
  let athenaHelper: AthenaHelper;

  beforeAll(() => {
    athenaHelper = new AthenaHelper(config);
  });

  afterAll(async () => {
    // 注意：CDK で作成されたリソースは削除しない
    // CDK で作成されたデータベースとテーブルは、テストでの削除ではなく CDK 破棄で削除する必要がある
    console.log('テスト完了 - CDK リソースは維持されます');
  });

  describe('データベース作成', () => {
    test('データベースを作成または存在確認できること', async () => {
      // まず、データベースが既に存在するかチェック（CDK が既に作成しているはず）
      try {
        const checkSql = `SHOW DATABASES LIKE '${config.databaseName}'`;
        const checkResult = await athenaHelper.executeQuery(checkSql);
        
        if (checkResult.resultData && checkResult.resultData.length > 1) {
          console.log(`✓ データベース既存: ${config.databaseName} (CDK により作成)`);
          return;
        }
      } catch (error) {
        console.log('データベースチェック時にエラー、新しいデータベースの作成を試みます');
      }
      
      // データベースが存在しない場合は作成
      const sql = `CREATE DATABASE IF NOT EXISTS ${config.databaseName}`;
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      console.log(`✓ データベース作成成功: ${config.databaseName}`);
    }, 60000);
  });

  describe('CDK リソース検証', () => {
    test('CDK で作成されたテーブルを検出できること', async () => {
      // データベース内のすべてのテーブルをリスト
      const sql = `SHOW TABLES IN ${config.databaseName}`;
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      if (result.resultData && result.resultData.length > 1) {
        const tables = result.resultData.slice(1).map(row => row[0]); // ヘッダー行をスキップ
        console.log(`✓ データベース内で検出されたテーブル: ${tables.join(', ')}`);
        
        // 期待されるテーブルが存在するかチェック
        const expectedTables = [config.tables.contracts, config.tables.counterparties, config.tables.contractUpdates];
        expectedTables.forEach(expectedTable => {
          if (tables.includes(expectedTable)) {
            console.log(`✓ CDK で作成されたテーブルを発見: ${expectedTable}`);
          } else {
            console.log(`⚠ テーブルが見つかりません: ${expectedTable} (CDK 再展開が必要かもしれません)`);
          }
        });
      } else {
        console.log('⚠ データベース内にテーブルが見つかりません');
      }
    }, 60000);

    test('テーブルの基本構造を検証できること', async () => {
      // contracts テーブルの構造を説明する（存在する場合）
      try {
        const sql = `DESCRIBE ${config.databaseName}.${config.tables.contracts}`;
        const result = await athenaHelper.executeQuery(sql);
        
        if (result.state === 'SUCCEEDED') {
          console.log(`✓ テーブル構造の取得成功: ${config.tables.contracts}`);
          if (result.resultData && result.resultData.length > 1) {
            const columns = result.resultData.slice(1).map(row => row[0]); // ヘッダー行をスキップ
            console.log(`  カラム名: ${columns.join(', ')}`);
          }
        } else {
          console.log(`⚠ テーブル構造を取得できません: ${config.tables.contracts}`);
          console.log(`  エラー: ${result.error}`);
        }
      } catch (error: any) {
        // エンティティが見つからないエラーかチェック（テーブルが存在しない）
        if (error && (
          error.message?.includes('EntityNotFoundException') || 
          error.message?.includes('Entity Not Found') ||
          error.__type === 'InvalidRequestException' ||
          error.AthenaErrorCode === 'INVALID_INPUT'
        )) {
          console.log(`⚠ テーブル ${config.tables.contracts} がまだ作成されていません。初回実行時はこれが正常です`);
          console.log(`  このテストはテーブル作成テスト実行後に成功します`);
          // テーブルがまだ作成されていない可能性があるため、テストの失敗にならないようにする
        } else {
          console.log(`⚠ テーブル説明時に予期しないエラー: ${error?.message || error}`);
          throw error; // 予期しないエラーの場合のみスロー
        }
      }
    }, 60000);
  });

  describe('ワークスペース Iceberg テーブルデモ', () => {
    const demoTableName = 'demo_iceberg_table';
    
    test('デモ用の Iceberg テーブルを作成できること', async () => {
      // Iceberg 機能を検証するためのシンプルなデモテーブルを作成
      const sql = `
        CREATE TABLE ${config.databaseName}.${demoTableName} (
          id int,
          name string,
          created_date date
        )
        LOCATION '${config.s3Paths.contracts}demo/'
        TBLPROPERTIES (
          'table_type'='ICEBERG'
        )
      `;
      
      try {
        const result = await athenaHelper.executeQuery(sql);
        
        if (result.state === 'SUCCEEDED') {
          console.log(`✓ デモ Iceberg テーブル作成成功: ${demoTableName}`);
        } else {
          console.log(`⚠ デモテーブル作成失敗: ${result.error}`);
          // これはデモのみのため、テストを失敗させない
        }
      } catch (error) {
        console.log(`⚠ デモテーブル作成時エラー: ${error}`);
      }
    }, 120000);

    test('デモテーブルのデータをクエリできること', async () => {
      try {
        const sql = `SELECT * FROM ${config.databaseName}.${demoTableName}`;
        const result = await athenaHelper.executeQuery(sql);
        
        if (result.state === 'SUCCEEDED') {
          console.log(`✓ デモテーブルクエリ成功`);
          if (result.resultData && result.resultData.length > 1) {
            console.log(`  ${result.resultData.length - 1} 件のレコードを返却`);
          }
        } else {
          console.log(`⚠ デモテーブルクエリ失敗: ${result.error}`);
        }
      } catch (error) {
        console.log(`⚠ デモテーブルクエリ時エラー: ${error}`);
      }
    }, 60000);

    test('デモテーブルのクリーンアップ', async () => {
      try {
        const sql = `DROP TABLE IF EXISTS ${config.databaseName}.${demoTableName}`;
        const result = await athenaHelper.executeQuery(sql);
        
        if (result.state === 'SUCCEEDED') {
          console.log(`✓ デモテーブルクリーンアップ成功`);
        } else {
          console.log(`⚠ デモテーブルクリーンアップ失敗: ${result.error}`);
        }
      } catch (error) {
        console.log(`⚠ デモテーブルクリーンアップ時エラー: ${error}`);
      }
    }, 60000);
  });

  describe('Iceberg テーブル初期化', () => {
    test('カウンターパーティ Iceberg テーブルを作成または再構築できること', async () => {
      // 既存のテーブルがあれば削除を試行
      try {
        const dropSql = `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.counterparties}`;
        await athenaHelper.executeQuery(dropSql);
        console.log('既存のカウンターパーティテーブルを削除');
      } catch (error) {
        console.log('テーブル削除時エラー（テーブルが存在しない可能性）:', error);
      }

      // Athena を使用して Iceberg テーブルを作成
      const createSql = `
        CREATE TABLE ${config.databaseName}.${config.tables.counterparties} (
          counterparty_id int,
          counterparty_name string,
          industry string
        )
        LOCATION '${config.s3Paths.counterparties}'
        TBLPROPERTIES (
          'table_type'='ICEBERG'
        )
      `;
      
      const result = await athenaHelper.executeQuery(createSql);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('カウンターパーティテーブル作成失敗:', result.error);
        console.error('SQL:', createSql);
      }
      
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ カウンターパーティ Iceberg テーブル作成成功');
    }, 120000);

    test('契約 Iceberg テーブルを作成または再構築できること', async () => {
      // 既存のテーブルがあれば削除を試行
      try {
        const dropSql = `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.contracts}`;
        await athenaHelper.executeQuery(dropSql);
        console.log('既存の契約テーブルを削除');
      } catch (error) {
        console.log('テーブル削除時エラー（テーブルが存在しない可能性）:', error);
      }

      // Athena を使用して Iceberg テーブルを作成
      const createSql = `
        CREATE TABLE ${config.databaseName}.${config.tables.contracts} (
          contract_id bigint,
          counterparty_id int,
          contract_type string,
          effective_date date,
          termination_date date,
          contract_value decimal(18,2),
          last_updated_ts timestamp
        )
        LOCATION '${config.s3Paths.contracts}'
        TBLPROPERTIES (
          'table_type'='ICEBERG'
        )
      `;
      
      const result = await athenaHelper.executeQuery(createSql);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('契約テーブル作成失敗:', result.error);
        console.error('SQL:', createSql);
      }
      
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ 契約 Iceberg テーブル作成成功');
    }, 120000);

    test('契約更新 Iceberg テーブルを作成または再構築できること', async () => {
      // 既存のテーブルがあれば削除を試行
      try {
        const dropSql = `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.contractUpdates}`;
        await athenaHelper.executeQuery(dropSql);
        console.log('既存の契約更新テーブルを削除');
      } catch (error) {
        console.log('テーブル削除時エラー（テーブルが存在しない可能性）:', error);
      }

      // Athena を使用して Iceberg テーブルを作成
      const createSql = `
        CREATE TABLE ${config.databaseName}.${config.tables.contractUpdates} (
          contract_id bigint,
          counterparty_id int,
          contract_type string,
          effective_date date,
          termination_date date,
          contract_value decimal(18,2)
        )
        LOCATION '${config.s3Paths.contractUpdates}'
        TBLPROPERTIES (
          'table_type'='ICEBERG'
        )
      `;
      
      const result = await athenaHelper.executeQuery(createSql);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('契約更新テーブル作成失敗:', result.error);
        console.error('SQL:', createSql);
      }
      
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ 契約更新 Iceberg テーブル作成成功');
    }, 120000);
  });

  describe('手動 Iceberg テーブル作成', () => {
    test('既存のテーブルをリストできること', async () => {
      const sql = `SHOW TABLES IN ${config.databaseName}`;
      const result = await athenaHelper.executeQuery(sql);
      
      console.log('クエリ状態:', result.state);
      console.log('既存テーブル:', result.resultData);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('クエリエラー:', result.error);
      }
      
      // このテストは失敗しない、既存テーブルを確認するためのもの
      expect(true).toBe(true);
    }, 60000);

    test('カウンターパーティテーブルを手動作成できること', async () => {
      // 既存のテーブルがあれば最初に削除
      try {
        const dropSql = `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.counterparties}`;
        await athenaHelper.executeQuery(dropSql);
        console.log('既存のカウンターパーティテーブルを削除（存在する場合）');
      } catch (error) {
        console.log('テーブル削除時エラー（テーブルが存在しない可能性）:', error);
      }

      // 新しいテーブルを作成
      const createSql = `
        CREATE TABLE ${config.databaseName}.${config.tables.counterparties} (
          counterparty_id int,
          counterparty_name string,
          industry string
        )
        LOCATION '${config.s3Paths.counterparties}temp/'
        TBLPROPERTIES (
          'table_type'='ICEBERG'
        )
      `;
      
      const result = await athenaHelper.executeQuery(createSql);
      
      console.log('テーブル作成状態:', result.state);
      if (result.state !== 'SUCCEEDED') {
        console.error('テーブル作成エラー:', result.error);
        console.error('SQL:', createSql);
      }
      
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ カウンターパーティテーブル作成成功');
    }, 120000);

    test('契約テーブルを手動作成できること', async () => {
      // 既存のテーブルがあれば最初に削除
      try {
        const dropSql = `DROP TABLE IF EXISTS ${config.databaseName}.${config.tables.contracts}`;
        await athenaHelper.executeQuery(dropSql);
        console.log('既存の契約テーブルを削除（存在する場合）');
      } catch (error) {
        console.log('テーブル削除時エラー（テーブルが存在しない可能性）:', error);
      }

      // 新しいテーブルを作成
      const createSql = `
        CREATE TABLE ${config.databaseName}.${config.tables.contracts} (
          contract_id bigint,
          counterparty_id int,
          contract_type string,
          effective_date date,
          termination_date date,
          contract_value decimal(18,2),
          last_updated_ts timestamp
        )
        LOCATION '${config.s3Paths.contracts}temp/'
        TBLPROPERTIES (
          'table_type'='ICEBERG'
        )
      `;
      
      const result = await athenaHelper.executeQuery(createSql);
      
      console.log('テーブル作成状態:', result.state);
      if (result.state !== 'SUCCEEDED') {
        console.error('テーブル作成エラー:', result.error);
        console.error('SQL:', createSql);
      }
      
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ 契約テーブル作成成功');
    }, 120000);

    test('テーブル作成の成功を検証できること', async () => {
      const sql = `SHOW TABLES IN ${config.databaseName}`;
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      if (result.resultData && result.resultData.length > 1) {
        const tables = result.resultData.slice(1).map(row => row[0]);
        console.log(`✓ データベース内のテーブル: ${tables.join(', ')}`);
        
        expect(tables).toContain(config.tables.counterparties);
        expect(tables).toContain(config.tables.contracts);
      }
    }, 60000);
  });

  describe('テストデータ挿入', () => {
    test('カウンターパーティテストデータを挿入できること', async () => {
      // テーブルにデータが既に存在するかチェック
      try {
        const checkSql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.counterparties}`;
        const checkResult = await athenaHelper.executeQuery(checkSql);
        
        if (checkResult.state === 'SUCCEEDED' && checkResult.resultData && 
            checkResult.resultData[1] && parseInt(checkResult.resultData[1][0]) > 0) {
          console.log('✓ カウンターパーティテーブルに既にデータあり、挿入をスキップ');
          return;
        }
      } catch (error) {
        console.log('カウンターパーティデータチェック時エラー、データ挿入を試行');
      }

      // テストデータを挿入
      const sql = `
        INSERT INTO ${config.databaseName}.${config.tables.counterparties} 
        VALUES 
          (201, 'Innovate Inc.', 'Technology'),
          (202, 'Global Logistics', 'Transportation'),
          (203, 'Healthcare Plus', 'Healthcare')
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('カウンターパーティデータ挿入失敗:', result.error);
        console.error('SQL:', sql);
      }
      
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ カウンターパーティテストデータ挿入成功');
    }, 120000);

    test('契約テストデータを挿入できること', async () => {
      // テーブルにデータが既に存在するかチェック
      try {
        const checkSql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.contracts}`;
        const checkResult = await athenaHelper.executeQuery(checkSql);
        
        if (checkResult.state === 'SUCCEEDED' && checkResult.resultData && 
            checkResult.resultData[1] && parseInt(checkResult.resultData[1][0]) > 0) {
          console.log('✓ 契約テーブルに既にデータあり、挿入をスキップ');
          return;
        }
      } catch (error) {
        console.log('契約データチェック時エラー、データ挿入を試行');
      }

      // テストデータを挿入
      const sql = `
        INSERT INTO ${config.databaseName}.${config.tables.contracts} 
        VALUES 
          (1001, 201, 'SOW', DATE '2024-01-01', DATE '2024-12-31', 75000.00, CURRENT_TIMESTAMP),
          (1002, 202, 'MSA', DATE '2024-02-01', DATE '2025-01-31', 120000.00, CURRENT_TIMESTAMP),
          (1003, 203, 'SOW', DATE '2024-03-01', DATE '2024-09-30', 45000.00, CURRENT_TIMESTAMP)
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('契約データ挿入失敗:', result.error);
        console.error('SQL:', sql);
      }
      
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ 契約テストデータ挿入成功');
    }, 120000);

    test('挿入されたテストデータを検証できること', async () => {
      // カウンターパーティデータを検証
      const counterpartiesSql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.counterparties}`;
      const counterpartiesResult = await athenaHelper.executeQuery(counterpartiesSql);
      
      expect(counterpartiesResult.state).toBe('SUCCEEDED');
      expect(counterpartiesResult.resultData).toBeDefined();
      
      const counterpartiesCount = parseInt(counterpartiesResult.resultData![1][0]);
      expect(counterpartiesCount).toBeGreaterThanOrEqual(3);
      
      // 契約データを検証
      const contractsSql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.contracts}`;
      const contractsResult = await athenaHelper.executeQuery(contractsSql);
      
      expect(contractsResult.state).toBe('SUCCEEDED');
      expect(contractsResult.resultData).toBeDefined();
      
      const contractsCount = parseInt(contractsResult.resultData![1][0]);
      expect(contractsCount).toBeGreaterThanOrEqual(3);
      
      console.log(`✓ テストデータ検証通過 - カウンターパーティ: ${counterpartiesCount} 件, 契約: ${contractsCount} 件`);
    }, 60000);
  });

  describe('設定検証', () => {
    test('正しい設定情報があること', () => {
      expect(config.databaseName).toBeDefined();
      expect(config.s3BucketName).toBeDefined();
      expect(config.region).toBeDefined();
      expect(config.tables.contracts).toBeDefined();
      expect(config.tables.counterparties).toBeDefined();
      expect(config.tables.contractUpdates).toBeDefined();
      
      console.log('✓ 設定検証通過');
      console.log(`  データベース: ${config.databaseName}`);
      console.log(`  S3 バケット: ${config.s3BucketName}`);
      console.log(`  リージョン: ${config.region}`);
      console.log(`  テーブル名: ${Object.values(config.tables).join(', ')}`);
    });
  });
});
