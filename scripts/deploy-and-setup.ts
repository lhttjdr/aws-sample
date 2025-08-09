#!/usr/bin/env node

/**
 * 拡張デプロイスクリプト
 * CDK スタックをデプロイし、テスト環境を自動設定
 */

import { execSync } from 'child_process';
import * as path from 'path';

async function main(): Promise<void> {
  console.log('🚀 Iceberg CDK デプロイ開始...\n');

  try {
    // 1. プロジェクトをビルド
    console.log('🔨 TypeScript プロジェクトをビルド中...');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ ビルド完了\n');

    // 2. CDK スタックをデプロイ
    console.log('☁️  CDK スタックをデプロイ中...');
    execSync('cdk deploy --require-approval never', { stdio: 'inherit' });
    console.log('✅ CDK デプロイ完了\n');

    // 3. テスト環境を自動設定
    console.log('⚙️  テスト環境を自動設定中...');
    const setupScript = path.join(__dirname, '..', 'test', 'setup.js');
    const { main: setupMain } = require(setupScript);
    await setupMain();
    console.log('✅ テスト環境設定完了\n');

    // 4. 設定を検証
    console.log('🔍 環境設定を検証中...');
    const validateScript = path.join(__dirname, '..', 'test', 'validate-setup.js');
    const { main: validateMain } = require(validateScript);
    await validateMain();
    
    console.log('\n🎉 デプロイと設定が全て完了しました！');
    console.log('\n🚀 次のステップ：');
    console.log('   pnpm run test              # テストを実行');
    console.log('   pnpm run demo              # デモを実行');
    console.log('   pnpm run destroy           # リソースをクリーンアップ');

  } catch (error: any) {
    console.error('\n❌ デプロイ処理中にエラーが発生しました:', error.message);
    console.error('\n🔧 トラブルシューティングの提案:');
    console.error('   1. AWS 認証情報を確認: aws sts get-caller-identity');
    console.error('   2. CDK ブートストラップを確認: cdk bootstrap');
    console.error('   3. エラー詳細を確認してデプロイを再試行');
    
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main };
