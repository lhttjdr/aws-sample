/**
 * ドリフト検出テストヘルパー
 * テスト用の簡単なスタック状態検証機能を提供
 */

import { DriftDetector } from '../scripts/drift-detection';

export class TestDriftHelper {
  private detector: DriftDetector;

  constructor(stackName: string = 'IcebergCdkStack') {
    this.detector = new DriftDetector(stackName);
  }

  /**
   * リソースをクリーンアップ
   */
  cleanup(): void {
    if (this.detector && typeof (this.detector as any).cleanup === 'function') {
      (this.detector as any).cleanup();
    }
  }

  /**
   * テスト開始前にスタック状態を簡単にチェック
   * スタックが存在しない場合のみエラーを投げる
   */
  async verifyStackState(): Promise<void> {
    try {
      const stackExists = await this.detector.checkStackExists();
      
      if (!stackExists) {
        throw new Error(
          'スタックが存在しません。\n' +
          'まずデプロイを実行してください: npm run deploy:safe'
        );
      }

      console.log('✅ スタックの存在を確認しました');

    } catch (error: any) {
      // 既にメッセージが設定されたエラーの場合はそのまま再スロー
      if (error.message.includes('スタックが存在しません')) {
        throw error;
      }
      
      console.error('❌ スタック状態チェックに失敗しました:', error.message);
      throw new Error(
        'スタック状態の確認に失敗しました。\n' +
        'ネットワーク接続やAWS認証情報を確認してください。'
      );
    }
  }

  /**
   * スタック存在チェック
   */
  async ensureStackExists(): Promise<boolean> {
    try {
      return await this.detector.checkStackExists();
    } catch (error: any) {
      console.error('❌ スタック状態チェックに失敗しました:', error.message);
      return false;
    }
  }
}
