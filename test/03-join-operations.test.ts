/**
 * データ結合（Join）検証テスト
 * Iceberg テーブルのクロステーブルクエリと結合操作を検証
 */

import { AthenaHelper } from './athena-helper';
import { getTestConfig } from './test-config';

describe('Iceberg データ結合（Join）検証テスト', () => {
  const config = getTestConfig();
  let athenaHelper: AthenaHelper;

  beforeAll(async () => {
    athenaHelper = new AthenaHelper(config);
    
    // テストデータが存在することを確認
    console.log('テストデータの存在を検証中...');
    
    try {
      const checkSql = `SELECT COUNT(*) FROM ${config.databaseName}.${config.tables.contracts}`;
      const result = await athenaHelper.executeQuery(checkSql);
      
      console.log('クエリ状態:', result.state);
      console.log('クエリ結果:', result.resultData);
      console.log('クエリエラー:', result.error);
      
      if (result.state !== 'SUCCEEDED' || !result.resultData || result.resultData[1][0] === '0') {
        throw new Error(`テストデータが存在しません - 状態: ${result.state}, エラー: ${result.error}`);
      }
      
      console.log('✓ テストデータ検証通過');
    } catch (error) {
      console.error('テストデータ検証失敗:', error);
      throw new Error('先に 02-table-creation.test.ts を実行してテストデータを作成してください');
    }
  });

  describe('基本結合クエリ', () => {
    test('内部結合（INNER JOIN）を実行できること', async () => {
      const sql = `
        SELECT
          c.contract_id,
          c.contract_type,
          c.contract_value,
          p.counterparty_name,
          p.industry
        FROM
          ${config.databaseName}.${config.tables.contracts} c
        INNER JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON c.counterparty_id = p.counterparty_id
        ORDER BY
          c.contract_id
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      expect(result.resultData!.length).toBe(4); // 3 データ行 + 1 ヘッダー行
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBe(3);
      
      // 結合結果を検証
      // 第1レコード：contract_id=1001, counterparty_id=201 -> 'Innovate Inc.', 'Technology'
      expect(dataRows[0][0]).toBe('1001'); // contract_id
      expect(dataRows[0][3]).toBe('Innovate Inc.'); // counterparty_name
      expect(dataRows[0][4]).toBe('Technology'); // industry
      
      // 第2レコード：contract_id=1002, counterparty_id=202 -> 'Global Logistics', 'Transportation'
      expect(dataRows[1][0]).toBe('1002');
      expect(dataRows[1][3]).toBe('Global Logistics');
      expect(dataRows[1][4]).toBe('Transportation');
      
      console.log(`✓ 内部結合クエリ成功、${dataRows.length} 件の結合レコードを返却`);
      console.log('  クエリ結果検証通過、カウンターパーティ情報が正しく結合されました');
    }, 60000);

    test('左結合（LEFT JOIN）を実行できること', async () => {
      const sql = `
        SELECT
          c.contract_id,
          c.contract_type,
          p.counterparty_name,
          CASE 
            WHEN p.counterparty_name IS NULL THEN 'Unknown'
            ELSE p.counterparty_name
          END as counterparty_display
        FROM
          ${config.databaseName}.${config.tables.contracts} c
        LEFT JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON c.counterparty_id = p.counterparty_id
        ORDER BY
          c.contract_id
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBe(3);
      
      // 現在のテストデータでは、すべての契約に対応するカウンターパーティがあるため、NULL値はないはず
      dataRows.forEach(row => {
        expect(row[2]).not.toBe(''); // counterparty_name は空でないはず
        expect(row[3]).not.toBe('Unknown'); // Unknown でないはず
      });
      
      console.log(`✓ 左結合クエリ成功、${dataRows.length} 件のレコードを返却`);
    }, 60000);
  });

  describe('複雑結合クエリ', () => {
    test('集計を含む結合クエリを実行できること', async () => {
      const sql = `
        SELECT
          p.industry,
          COUNT(c.contract_id) as contract_count,
          SUM(c.contract_value) as total_value,
          AVG(c.contract_value) as avg_value
        FROM
          ${config.databaseName}.${config.tables.contracts} c
        INNER JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON c.counterparty_id = p.counterparty_id
        GROUP BY
          p.industry
        ORDER BY
          total_value DESC
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBeGreaterThan(0);
      
      // 集計結果を検証
      let totalContracts = 0;
      dataRows.forEach(row => {
        const contractCount = parseInt(row[1]);
        const totalValue = parseFloat(row[2]);
        const avgValue = parseFloat(row[3]);
        
        expect(contractCount).toBeGreaterThan(0);
        expect(totalValue).toBeGreaterThan(0);
        expect(avgValue).toBeGreaterThan(0);
        
        totalContracts += contractCount;
      });
      
      expect(totalContracts).toBe(3); // 合計で3つの契約があるはず
      
      console.log(`✓ 集計結合クエリ成功、業界別グループ統計 ${dataRows.length} 業界`);
    }, 60000);

    test('複数条件結合クエリを実行できること', async () => {
      const sql = `
        SELECT
          c.contract_id,
          c.contract_type,
          c.contract_value,
          p.counterparty_name,
          p.industry,
          CASE 
            WHEN c.contract_value > 100000 THEN 'High Value'
            WHEN c.contract_value > 50000 THEN 'Medium Value'
            ELSE 'Low Value'
          END as value_category
        FROM
          ${config.databaseName}.${config.tables.contracts} c
        INNER JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON c.counterparty_id = p.counterparty_id
        WHERE
          c.contract_value > 40000
          AND p.industry IN ('Technology', 'Transportation')
        ORDER BY
          c.contract_value DESC
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBeGreaterThan(0);
      
      // フィルタ条件を検証
      dataRows.forEach(row => {
        const contractValue = parseFloat(row[2]);
        const industry = row[4];
        
        expect(contractValue).toBeGreaterThan(40000);
        expect(['Technology', 'Transportation']).toContain(industry);
      });
      
      console.log(`✓ 複数条件結合クエリ成功、条件に合致する ${dataRows.length} 件のレコードを返却`);
    }, 60000);
  });

  describe('サブクエリ結合', () => {
    test('サブクエリを含む結合を実行できること', async () => {
      const sql = `
        WITH high_value_contracts AS (
          SELECT 
            contract_id, 
            counterparty_id, 
            contract_value
          FROM ${config.databaseName}.${config.tables.contracts}
          WHERE contract_value > 50000
        )
        SELECT
          hvc.contract_id,
          hvc.contract_value,
          p.counterparty_name,
          p.industry
        FROM
          high_value_contracts hvc
        INNER JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON hvc.counterparty_id = p.counterparty_id
        ORDER BY
          hvc.contract_value DESC
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBeGreaterThan(0);
      
      // 返却されたすべての契約価値が50000を超えることを検証
      dataRows.forEach(row => {
        const contractValue = parseFloat(row[1]);
        expect(contractValue).toBeGreaterThan(50000);
      });
      
      console.log(`✓ サブクエリ結合成功、${dataRows.length} 件の高価値契約レコードを返却`);
    }, 60000);
  });

  describe('パフォーマンスと最適化検証', () => {
    test('パーティションフィルタ付き結合クエリを実行できること', async () => {
      const sql = `
        SELECT
          c.contract_id,
          c.contract_type,
          c.contract_value,
          p.counterparty_name
        FROM
          ${config.databaseName}.${config.tables.contracts} c
        INNER JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON c.counterparty_id = p.counterparty_id
        WHERE
          c.contract_type = 'SOW'  -- パーティションフィールドでのフィルタ利用
        ORDER BY
          c.contract_id
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      
      // 返却されたすべてのレコードが SOW タイプであることを検証
      dataRows.forEach(row => {
        expect(row[1]).toBe('SOW'); // contract_type
      });
      
      console.log(`✓ パーティションフィルタ結合クエリ成功、${dataRows.length} 件の SOW タイプ契約を返却`);
    }, 60000);

    test('複数テーブル結合パフォーマンステストを実行できること', async () => {
      // より複雑なクエリシナリオをシミュレート
      const sql = `
        SELECT
          COUNT(*) as total_joins,
          COUNT(DISTINCT c.contract_type) as contract_types,
          COUNT(DISTINCT p.industry) as industries,
          AVG(c.contract_value) as avg_contract_value
        FROM
          ${config.databaseName}.${config.tables.contracts} c
        INNER JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON c.counterparty_id = p.counterparty_id
      `;
      
      const startTime = Date.now();
      const result = await athenaHelper.executeQuery(sql);
      const executionTime = Date.now() - startTime;
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRow = result.resultData![1]; // ヘッダー行をスキップ
      const totalJoins = parseInt(dataRow[0]);
      
      expect(totalJoins).toBe(3); // 3件の結合レコードがあるはず
      
      console.log(`✓ 結合パフォーマンステスト完了、実行時間: ${executionTime}ms`);
      console.log(`  総結合レコード数: ${totalJoins}`);
    }, 60000);
  });

  describe('エラーハンドリング検証', () => {
    test('結合フィールドが一致しない場合を正しく処理できること', async () => {
      // 存在しない counterparty_id との結合をテスト
      const sql = `
        SELECT
          c.contract_id,
          p.counterparty_name
        FROM
          ${config.databaseName}.${config.tables.contracts} c
        LEFT JOIN
          ${config.databaseName}.${config.tables.counterparties} p 
          ON c.counterparty_id = p.counterparty_id
        WHERE
          c.counterparty_id = 999  -- 存在しない ID
      `;
      
      const result = await athenaHelper.executeQuery(sql);
      
      expect(result.state).toBe('SUCCEEDED');
      expect(result.resultData).toBeDefined();
      
      const dataRows = result.resultData!.slice(1);
      expect(dataRows.length).toBe(0); // 一致するレコードはないはず
      
      console.log('✓ 不一致結合処理正常、空の結果セットを返却');
    }, 60000);

    test('結合クエリの結果一貫性を検証できること', async () => {
      // 異なるクエリ方式で同じ結果を検証
      const sql1 = `
        SELECT COUNT(*) as count1
        FROM ${config.databaseName}.${config.tables.contracts} c
        INNER JOIN ${config.databaseName}.${config.tables.counterparties} p 
        ON c.counterparty_id = p.counterparty_id
      `;
      
      const sql2 = `
        SELECT COUNT(*) as count2
        FROM ${config.databaseName}.${config.tables.contracts} c
        WHERE c.counterparty_id IN (
          SELECT counterparty_id 
          FROM ${config.databaseName}.${config.tables.counterparties}
        )
      `;
      
      const results = await athenaHelper.executeMultipleQueries([sql1, sql2]);
      
      expect(results).toHaveLength(2);
      expect(results[0].state).toBe('SUCCEEDED');
      expect(results[1].state).toBe('SUCCEEDED');
      
      const count1 = results[0].resultData![1][0];
      const count2 = results[1].resultData![1][0];
      
      expect(count1).toBe(count2);
      
      console.log(`✓ 結合クエリ結果一貫性検証通過、2つのクエリ方式の結果が一致: ${count1}`);
    }, 120000);
  });
});
