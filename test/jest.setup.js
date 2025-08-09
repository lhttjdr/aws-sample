/**
 * Jest セットアップファイル
 * 各テストファイル実行前に実行される
 */

// 環境変数を読み込み
require('dotenv').config({ path: './test/.env' });

// テストタイムアウトを設定
jest.setTimeout(300000); // 5分間

// グローバルテスト設定
global.console = {
  ...console,
  // テスト中は一部のログを無音化、ただしエラー情報は保持
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error,
};

// AWS SDK接続の適切な終了処理
afterAll(async () => {
  // AWS SDKクライアントのクリーンアップを促進
  if (global.gc) {
    global.gc();
  }
  
  // ノードプロセスの即座終了を防ぐために少し待機
  await new Promise(resolve => setTimeout(resolve, 1000));
});

// 各テスト後のクリーンアップ
afterEach(async () => {
  // AWS SDKの未解決のプロミスを解決するため少し待機
  await new Promise(resolve => setTimeout(resolve, 100));
});
