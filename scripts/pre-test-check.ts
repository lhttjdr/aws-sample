#!/usr/bin/env node

/**
 * テスト実行前の事前チェックスクリプト
 * スタックドリフトを検出し、必要に応じて修復する
 */

import { DriftDetector } from './drift-detection';

async function preTestCheck() {
  console.log('🔍 テスト実行前の事前チェックを開始します...\n');
  
  const detector = new DriftDetector();
  
  try {
    // ドリフト検出と修復を実行
    const result = await detector.detectAndRepair();
    
    if (!result.stackExists) {
      console.log('ℹ️  スタックが存在しません。まず基盤をデプロイしてください:');
      console.log('   npm run deploy');
      process.exit(1);
    }
    
    if (result.needsRepair && !result.repairSuccess) {
      console.log('❌ スタックドリフトの修復に失敗しました。手動で修復してください。');
      process.exit(1);
    }
    
    if (result.analysis && result.analysis.drifted > 0 && !result.needsRepair) {
      console.log('⚠️  ドリフトが検出されましたが、修復を選択しませんでした。');
      console.log('   テストが失敗する可能性があります。');
      
      // ユーザーに確認
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const continueTest = await new Promise<boolean>((resolve) => {
        rl.question('それでもテストを続行しますか？ (y/N): ', (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });
      
      if (!continueTest) {
        console.log('テストをキャンセルしました。');
        process.exit(1);
      }
    }
    
    console.log('\n✅ 事前チェックが完了しました。テストを開始できます。');
    
  } catch (error: any) {
    console.error('❌ 事前チェック中にエラーが発生しました:', error.message);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合
if (require.main === module) {
  preTestCheck().catch(error => {
    console.error('❌ 事前チェックに失敗しました:', error.message);
    process.exit(1);
  });
}

export { preTestCheck };
