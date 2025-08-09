/**
 * Athenaクエリ実行ユーティリティクラス
 * SQLクエリの実行とクエリ結果の管理機能を提供
 */

import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from '@aws-sdk/client-athena';
import { TestConfig } from './test-config';
import { AuthHelper } from './auth-helper';

export interface QueryResult {
  executionId: string;
  state: string;
  resultData?: any[][];
  columnInfo?: any[];
  error?: string;
}

export class AthenaHelper {
  private client: AthenaClient;
  private config: TestConfig;
  private authHelper: AuthHelper;

  constructor(config: TestConfig) {
    this.config = config;
    this.authHelper = new AuthHelper(config);
    // クライアントは初回使用時に初期化されます
    this.client = null as any;
  }

  /**
   * Athenaクライアントを初期化（まだ初期化されていない場合）
   */
  private async ensureClient(): Promise<void> {
    if (!this.client) {
      const clientConfig = await this.authHelper.getAWSClientConfig();
      this.client = new AthenaClient(clientConfig);
      console.log('✅ Athenaクライアント初期化完了');
    }
  }

  /**
   * SQLクエリを実行
   * @param sql SQLクエリ文
   * @param waitForCompletion クエリ完了を待機するかどうか
   * @returns クエリ結果
   */
  async executeQuery(sql: string, waitForCompletion: boolean = true): Promise<QueryResult> {
    try {
      await this.ensureClient();
      console.log(`SQLを実行: ${sql}`);
      
      // クエリ実行を開始
      const startCommand = new StartQueryExecutionCommand({
        QueryString: sql,
        WorkGroup: this.config.athenaWorkGroup,
        ResultConfiguration: {
          OutputLocation: this.config.athenaResultLocation
        }
      });

      const startResult = await this.client.send(startCommand);
      const executionId = startResult.QueryExecutionId!;

      if (!waitForCompletion) {
        return { executionId, state: 'QUEUED' };
      }

      // クエリ完了を待機
      const finalState = await this.waitForQueryCompletion(executionId);
      
      if (finalState === 'SUCCEEDED') {
        // クエリ結果を取得
        const resultData = await this.getQueryResults(executionId);
        return {
          executionId,
          state: finalState,
          resultData: resultData.data,
          columnInfo: resultData.columnInfo
        };
      } else {
        // エラー情報を取得
        const executionDetails = await this.getQueryExecution(executionId);
        console.error(`クエリ失敗 (${executionId}):`, {
          state: finalState,
          reason: executionDetails.Status?.StateChangeReason,
          errorType: executionDetails.Status?.AthenaError?.ErrorType,
          errorMessage: executionDetails.Status?.AthenaError?.ErrorMessage
        });
        return {
          executionId,
          state: finalState,
          error: executionDetails.Status?.StateChangeReason || 'Unknown error'
        };
      }
    } catch (error: any) {
      // より良い診断のためにエラー情報を強化
      if (error && error.__type === 'InvalidRequestException' && 
          error.message?.includes('Entity Not Found')) {
        console.warn('⚠️  データカタログエンティティが見つかりません（テーブルまたはデータベースが存在しない可能性）:', {
          sql: sql,
          errorCode: error.ErrorCode,
          errorType: error.__type,
          message: error.message
        });
      } else {
        console.error('クエリ実行失敗:', error);
      }
      throw error;
    }
  }

  /**
   * クエリ完了を待機
   * @param executionId クエリ実行ID
   * @returns 最終状態
   */
  private async waitForQueryCompletion(executionId: string, maxWaitTimeMs: number = 300000): Promise<string> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTimeMs) {
      const execution = await this.getQueryExecution(executionId);
      const state = execution.Status?.State;
      
      console.log(`クエリ状態: ${state}`);
      
      if (state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED') {
        return state;
      }
      
      // 2秒待機後に再試行
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`クエリタイムアウト、実行ID: ${executionId}`);
  }

  /**
   * クエリ実行詳細を取得
   * @param executionId クエリ実行ID
   * @returns クエリ実行詳細
   */
  private async getQueryExecution(executionId: string) {
    const command = new GetQueryExecutionCommand({ QueryExecutionId: executionId });
    const result = await this.client.send(command);
    return result.QueryExecution!;
  }

  /**
   * クエリ結果を取得
   * @param executionId クエリ実行ID
   * @returns クエリ結果データ
   */
  private async getQueryResults(executionId: string) {
    const command = new GetQueryResultsCommand({ QueryExecutionId: executionId });
    const result = await this.client.send(command);
    
    const columnInfo = result.ResultSet?.ResultSetMetadata?.ColumnInfo;
    const rows = result.ResultSet?.Rows || [];
    
    // 結果をより使いやすい形式に変換
    const data = rows.map((row: any) => 
      row.Data?.map((cell: any) => cell.VarCharValue) || []
    );
    
    return { data, columnInfo };
  }

  /**
   * 複数のSQLステートメントを実行
   * @param sqlStatements SQLステートメント配列
   * @returns すべてのクエリの結果
   */
  async executeMultipleQueries(sqlStatements: string[]): Promise<QueryResult[]> {
    const results: QueryResult[] = [];
    
    for (const sql of sqlStatements) {
      const result = await this.executeQuery(sql);
      results.push(result);
      
      // クエリが失敗した場合、後続のクエリの実行を停止
      if (result.state !== 'SUCCEEDED') {
        console.error(`クエリ失敗: ${sql}`);
        console.error(`エラー: ${result.error}`);
        break;
      }
    }
    
    return results;
  }
}
