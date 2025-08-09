/**
 * データ更新（Merge）検証テスト
 * Iceberg テーブルの MERGE INTO 操作と増分データ処理を検証
 */

import { AthenaHelper } from './athena-helper';
import { getTestConfig } from './test-config';

describe('Iceberg データ更新（Merge）検証テスト', () => {
  const config = getTestConfig();
  let athenaHelper: AthenaHelper;
  let initialContractData: any[] = [];

  beforeAll(async () => {
    athenaHelper = new AthenaHelper(config);
    
    // 初期データのスナップショットを取得
    console.log('初期データスナップショットを取得中...');
    
    try {
      const sql = `SELECT * FROM ${config.databaseName}.${config.tables.contracts} ORDER BY contract_id`;
      const result = await athenaHelper.executeQuery(sql);
      
      if (result.state !== 'SUCCEEDED' || !result.resultData || result.resultData.length <= 1) {
        throw new Error('初期データが存在しません。先にテーブル作成テストを実行してください');
      }
      
      initialContractData = result.resultData.slice(1); // ヘッダー行をスキップ
      console.log(`✓ 初期データスナップショット取得完了、${initialContractData.length} 件のレコード`);
    } catch (error) {
      console.error('初期データ検証失敗:', error);
      throw new Error('先に 02-table-creation.test.ts を実行してテストデータを作成してください');
    }
  });

  describe('増分データ準備', () => {
    test('増分テーブルにテストデータを挿入できること', async () => {
      // 増分テーブルをクリア（データがある場合）
      const clearSql = `DELETE FROM ${config.databaseName}.${config.tables.contractUpdates}`;
      await athenaHelper.executeQuery(clearSql);
      
      // 増分変更データを挿入
      const sql = `
        INSERT INTO ${config.databaseName}.${config.tables.contractUpdates} VALUES
        (1002, 202, 'SOW', CAST('2023-03-01' AS DATE), CAST('2024-02-28' AS DATE), 85000.00),
        (1003, 201, 'SOW', CAST('2023-05-20' AS DATE), CAST('2024-05-20' AS DATE), 42000.00),
        (1004, 203, 'NDA', CAST('2023-08-01' AS DATE), NULL, 0.00)
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('❌ 増分データ挿入失敗');
        console.error('エラー情報:', result.error);
        console.error('SQL:', sql);
      }
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ 増分データ挿入成功');
      
      // 挿入されたデータを検証
      const verifySql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.contractUpdates}`;
      const verifyResult = await athenaHelper.executeQuery(verifySql);
      
      expect(verifyResult.state).toBe('SUCCEEDED');
      expect(verifyResult.resultData![1][0]).toBe('3');
      
      console.log('✓ 増分データ検証完了、3件のレコード');
    }, 120000);
  });

  describe('MERGE INTO 操作検証', () => {
    test('MERGE INTO 操作を実行できること', async () => {
      const sql = `
        MERGE INTO ${config.databaseName}.${config.tables.contracts} t
        USING ${config.databaseName}.${config.tables.contractUpdates} s
        ON (t.contract_id = s.contract_id)
        WHEN MATCHED THEN
          UPDATE SET
            termination_date = s.termination_date,
            contract_value = s.contract_value,
            last_updated_ts = now()
        WHEN NOT MATCHED THEN
          INSERT (contract_id, counterparty_id, contract_type, effective_date, termination_date, contract_value, last_updated_ts)
          VALUES (s.contract_id, s.counterparty_id, s.contract_type, s.effective_date, s.termination_date, s.contract_value, now())
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      if (result.state !== 'SUCCEEDED') {
        console.error('❌ MERGE INTO 操作失敗');
        console.error('エラー情報:', result.error);
        console.error('SQL:', sql);
      }
      expect(result.state).toBe('SUCCEEDED');
      console.log('✓ MERGE INTO 操作実行成功');
    }, 180000); // MERGE 操作はより長い時間が必要な場合がある
  });

  describe('MERGE 結果検証', () => {
    test('既存レコードが正しく更新されること', async () => {
      // 契約 1002 の更新を検証
      const sql1002 = `
        SELECT contract_id, contract_value, termination_date 
        FROM ${config.databaseName}.${config.tables.contracts} 
        WHERE contract_id = 1002
      `;
      
      const result1002 = await athenaHelper.executeQuery(sql1002);
      
      expect(result1002.state).toBe('SUCCEEDED');
      expect(result1002.resultData).toBeDefined();
      
      const data1002 = result1002.resultData![1]; // ヘッダー行をスキップ
      expect(data1002[0]).toBe('1002'); // contract_id
      expect(data1002[1]).toBe('85000.00'); // contract_value は 75000 から 85000 に更新されるはず
      expect(data1002[2]).toBe('2024-02-28'); // termination_date は変更なし
      
      console.log('✓ 契約 1002 更新検証通過 - 金額が 75000 から 85000 に更新');
      
      // 契約 1003 の更新を検証
      const sql1003 = `
        SELECT contract_id, contract_value, termination_date 
        FROM ${config.databaseName}.${config.tables.contracts} 
        WHERE contract_id = 1003
      `;
      
      const result1003 = await athenaHelper.executeQuery(sql1003);
      
      expect(result1003.state).toBe('SUCCEEDED');
      
      const data1003 = result1003.resultData![1];
      expect(data1003[0]).toBe('1003'); // contract_id
      expect(data1003[1]).toBe('42000.00'); // contract_value は変更なし
      expect(data1003[2]).toBe('2024-05-20'); // termination_date は 2023-11-20 から 2024-05-20 に更新
      
      console.log('✓ 契約 1003 更新検証通過 - 終了日が 2023-11-20 から 2024-05-20 に更新');
    }, 60000);

    test('新レコードが正しく挿入されること', async () => {
      // 新しく挿入された契約 1004 を検証
      const sql = `
        SELECT contract_id, counterparty_id, contract_type, contract_value 
        FROM ${config.databaseName}.${config.tables.contracts} 
        WHERE contract_id = 1004
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      expect(result.resultData!.length).toBe(2); // 1 ヘッダー行 + 1 データ行
      
      const data = result.resultData![1]; // ヘッダー行をスキップ
      expect(data[0]).toBe('1004'); // contract_id
      expect(data[1]).toBe('203'); // counterparty_id
      expect(data[2]).toBe('NDA'); // contract_type
      expect(data[3]).toBe('0.00'); // contract_value
      
      console.log('✓ 新契約 1004 挿入検証通過');
    }, 60000);

    test('総レコード数が正しいことを検証できること', async () => {
      const sql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.contracts}`;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData![1][0]).toBe('4'); // 実際に存在するレコード数（以前のテストで追加されたレコードを含む）
      
      console.log('✓ 総レコード数検証通過、現在 4 件の契約レコード');
    }, 60000);

    test('last_updated_ts フィールドの更新を検証できること', async () => {
      // 更新後のタイムスタンプを取得
      const sql = `
        SELECT contract_id, last_updated_ts 
        FROM ${config.databaseName}.${config.tables.contracts} 
        WHERE contract_id IN (1002, 1003, 1004)
        ORDER BY contract_id
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBe(3);
      
      // タイムスタンプが空でなく、最近の時間であることを検証
      const now = new Date();
      dataRows.forEach(row => {
        const contractId = row[0];
        const lastUpdated = new Date(row[1]);
        
        expect(lastUpdated).toBeDefined();
        
        // タイムスタンプが最近のもの（過去24時間以内）であることを検証
        const timeDiff = now.getTime() - lastUpdated.getTime();
        expect(timeDiff).toBeLessThan(86400000); // 24時間 = 86400000ミリ秒
        
        console.log(`  契約 ${contractId} の last_updated_ts: ${row[1]}`);
      });
      
      console.log('✓ last_updated_ts フィールド更新検証通過');
    }, 60000);
  });

  describe('増分処理パフォーマンス検証', () => {
    test('バッチ MERGE 操作を処理できること', async () => {
      // より多くの増分データを準備
      const prepareSql = `
        INSERT INTO ${config.databaseName}.${config.tables.contractUpdates} VALUES
        (1001, 201, 'MSA', CAST('2023-01-15' AS DATE), CAST('2025-12-31' AS DATE), 550000.00),
        (1005, 203, 'MSA', CAST('2023-09-01' AS DATE), CAST('2024-08-31' AS DATE), 125000.00)
      `;
      
      await athenaHelper.executeQuery(prepareSql);
      
      // バッチ MERGE を実行
      const startTime = Date.now();
      
      const mergeSql = `
        MERGE INTO ${config.databaseName}.${config.tables.contracts} t
        USING ${config.databaseName}.${config.tables.contractUpdates} s
        ON (t.contract_id = s.contract_id)
        WHEN MATCHED THEN
          UPDATE SET
            termination_date = s.termination_date,
            contract_value = s.contract_value,
            last_updated_ts = now()
        WHEN NOT MATCHED THEN
          INSERT (contract_id, counterparty_id, contract_type, effective_date, termination_date, contract_value, last_updated_ts)
          VALUES (s.contract_id, s.counterparty_id, s.contract_type, s.effective_date, s.termination_date, s.contract_value, now())
      `;
      
      const result = await athenaHelper.executeQuery(mergeSql);
      const executionTime = Date.now() - startTime;
      
      expect(result.state).toBe('SUCCEEDED');
      
      // 最終レコード数を検証
      const countSql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.contracts}`;
      const countResult = await athenaHelper.executeQuery(countSql);
      
      expect(countResult.resultData![1][0]).toBe('5'); // 5件のレコードがあるはず
      
      console.log(`✓ バッチ MERGE 操作完了、実行時間: ${executionTime}ms`);
      console.log(`  最終レコード数: 5 件`);
    }, 300000); // バッチ操作はより長い時間が必要な場合がある
  });

  describe('データ一貫性検証', () => {
    test('MERGE 操作のトランザクション性を検証できること', async () => {
      // すべての期待されるデータ変更が有効になっていることを検証
      const sql = `
        SELECT 
          contract_id,
          contract_value,
          termination_date,
          CASE 
            WHEN last_updated_ts > CURRENT_TIMESTAMP - INTERVAL '1' HOUR THEN 'Recently Updated'
            ELSE 'Old Record'
          END as update_status
        FROM ${config.databaseName}.${config.tables.contracts}
        ORDER BY contract_id
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBe(5);
      
      // 特定のレコードの値を検証
      const contract1001 = dataRows.find(row => row[0] === '1001');
      const contract1002 = dataRows.find(row => row[0] === '1002');
      const contract1004 = dataRows.find(row => row[0] === '1004');
      const contract1005 = dataRows.find(row => row[0] === '1005');
      
      expect(contract1001![1]).toBe('550000.00'); // 更新後の値
      expect(contract1002![1]).toBe('85000.00');  // 更新後の値
      expect(contract1004![0]).toBe('1004');     // 新規挿入レコード
      expect(contract1005![0]).toBe('1005');     // 新規挿入レコード
      
      console.log('✓ MERGE 操作トランザクション性検証通過、すべての変更が正しく適用されました');
    }, 60000);

    test('パーティションデータの正確性を検証できること', async () => {
      // パーティション別統計データの正確性を検証
      const sql = `
        SELECT 
          contract_type,
          COUNT(*) as count,
          SUM(contract_value) as total_value
        FROM ${config.databaseName}.${config.tables.contracts}
        GROUP BY contract_type
        ORDER BY contract_type
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      
      // 各パーティションのデータを検証
      const msaPartition = dataRows.find(row => row[0] === 'MSA');
      const sowPartition = dataRows.find(row => row[0] === 'SOW');
      const ndaPartition = dataRows.find(row => row[0] === 'NDA');
      
      expect(msaPartition![1]).toBe('2'); // 2つの MSA 契約
      expect(sowPartition![1]).toBe('2');  // 2つの SOW 契約
      expect(ndaPartition![1]).toBe('1');  // 1つの NDA 契約
      
      console.log('✓ パーティションデータ一貫性検証通過');
      console.log(`  MSA: ${msaPartition![1]} 件のレコード`);
      console.log(`  SOW: ${sowPartition![1]} 件のレコード`);
      console.log(`  NDA: ${ndaPartition![1]} 件のレコード`);
    }, 60000);
  });

  describe('エラーハンドリングと境界条件', () => {
    test('空の増分データを正しく処理できること', async () => {
      // 増分テーブルをクリア
      const clearSql = `DELETE FROM ${config.databaseName}.${config.tables.contractUpdates}`;
      await athenaHelper.executeQuery(clearSql);
      
      // 空のテーブルに対して MERGE を実行
      const mergeSql = `
        MERGE INTO ${config.databaseName}.${config.tables.contracts} t
        USING ${config.databaseName}.${config.tables.contractUpdates} s
        ON (t.contract_id = s.contract_id)
        WHEN MATCHED THEN
          UPDATE SET contract_value = s.contract_value
        WHEN NOT MATCHED THEN
          INSERT (contract_id, counterparty_id, contract_type, effective_date, termination_date, contract_value, last_updated_ts)
          VALUES (s.contract_id, s.counterparty_id, s.contract_type, s.effective_date, s.termination_date, s.contract_value, now())
      `;
      
      const result = await athenaHelper.executeQuery(mergeSql);
      
      expect(result.state).toBe('SUCCEEDED');
      
      // メインテーブルのデータが変更されていないことを検証
      const countSql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.contracts}`;
      const countResult = await athenaHelper.executeQuery(countSql);
      
      expect(countResult.resultData![1][0]).toBe('5'); // レコード数は変更されないはず
      
      console.log('✓ 空の増分データ MERGE 処理正常');
    }, 120000);
  });
});
