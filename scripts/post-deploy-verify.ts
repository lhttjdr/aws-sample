#!/usr/bin/env node

/**
 * デプロイ後の検証スクリプト
 * スタックが正常にデプロイされ、ドリフトがないことを確認する
 */

import { DriftDetector } from './drift-detection';

async function postDeployVerify() {
  console.log('🔍 デプロイ後の検証を開始します...\n');
  
  const detector = new DriftDetector();
  
  try {
    // スタックの存在確認
    const stackExists = await detector.checkStackExists();
    
    if (!stackExists) {
      console.log('❌ スタックが存在しません。デプロイが失敗した可能性があります。');
      process.exit(1);
    }
    
    console.log('✅ スタックが存在することを確認しました');
    
    // ドリフト検出を実行（修復は行わない）
    console.log('\n🔍 デプロイ後のドリフト検出を実行しています...');
    
    const detectionId = await detector.startDriftDetection();
    const driftStatus = await detector.waitForDriftDetection(detectionId);
    
    console.log('\n✅ ドリフト検出が完了しました');
    
    // 詳細情報を取得
    const drifts = await detector.getDriftDetails();
    const analysis = detector.analyzeDrifts(drifts);
    
    // レポートを表示
    detector.displayDriftReport(driftStatus, analysis);
    
    // 結果の評価
    if (driftStatus.StackDriftStatus === 'IN_SYNC') {
      console.log('\n🎉 デプロイ後の検証が完了しました。スタックは正常な状態です。');
      console.log('   テストを実行できます: npm test');
    } else {
      console.log('\n⚠️  デプロイ後にドリフトが検出されました。');
      
      if (analysis.deleted.length > 0) {
        console.log('❌ 重要なリソースが不足しています。再デプロイが必要です。');
        console.log('   対処法: npm run deploy:safe');
        process.exit(1);
      } else if (analysis.modified.length > 0) {
        console.log('ℹ️  一部のリソースが期待と異なりますが、テストには影響しません。');
        console.log('   必要に応じて修復してください: npm run drift:detect');
      }
    }
    
  } catch (error: any) {
    console.error('❌ デプロイ後の検証中にエラーが発生しました:', error.message);
    process.exit(1);
  } finally {
    detector.cleanup();
  }
}

// スクリプトが直接実行された場合
if (require.main === module) {
  postDeployVerify().catch(error => {
    console.error('❌ デプロイ後の検証に失敗しました:', error.message);
    process.exit(1);
  });
}

export { postDeployVerify };
