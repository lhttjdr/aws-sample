/**
 * CloudFormation スタックドリフト検出と修復ツール (TypeScript 版)
 */

import { execSync } from 'child_process';
import * as readline from 'readline';

interface DriftDetectionResult {
  StackDriftDetectionId: string;
}

interface DriftStatus {
  StackDriftStatus: 'IN_SYNC' | 'DRIFTED' | 'UNKNOWN' | 'NOT_CHECKED';
  DetectionStatus: 'DETECTION_IN_PROGRESS' | 'DETECTION_COMPLETE' | 'DETECTION_FAILED';
  DriftedStackResourceCount?: number;
  Timestamp: string;
  StatusReason?: string;
}

interface ResourceDrift {
  LogicalResourceId: string;
  PhysicalResourceId: string;
  ResourceType: string;
  StackResourceDriftStatus: 'IN_SYNC' | 'MODIFIED' | 'DELETED' | 'NOT_CHECKED';
  PropertyDifferences?: Array<{
    PropertyPath: string;
    DifferenceType: string;
    ActualValue?: any;
    ExpectedValue?: any;
  }>;
  Timestamp: string;
}

interface DriftAnalysis {
  total: number;
  drifted: number;
  deleted: ResourceDrift[];
  modified: ResourceDrift[];
  inSync: number;
}

export class DriftDetector {
  private stackName: string;
  private rl?: readline.Interface;

  constructor(stackName: string = 'IcebergCdkStack') {
    this.stackName = stackName;
    // readline インターフェースは必要な時に作成する
  }

  // readline インターフェースを作成
  private createReadlineInterface(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    }
    return this.rl;
  }

  // リソースをクリーンアップ
  cleanup(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
  }

  // スタックが存在するかチェック
  async checkStackExists(): Promise<boolean> {
    try {
      const result = execSync(`aws cloudformation describe-stacks --stack-name ${this.stackName}`, { encoding: 'utf8' });
      return JSON.parse(result).Stacks.length > 0;
    } catch (error: any) {
      if (error.message.includes('does not exist')) {
        return false;
      }
      throw error;
    }
  }

  // ドリフト検出を開始
  async startDriftDetection(): Promise<string> {
    console.log(`🔍 ${this.stackName} スタックのドリフト検出を開始しています...`);
    
    try {
      const result = execSync(`aws cloudformation detect-stack-drift --stack-name ${this.stackName}`, { encoding: 'utf8' });
      const detection: DriftDetectionResult = JSON.parse(result);
      return detection.StackDriftDetectionId;
    } catch (error: any) {
      console.error('❌ ドリフト検出の開始に失敗しました:', error.message);
      throw error;
    }
  }

  // ドリフト検出の完了を待機
  async waitForDriftDetection(detectionId: string): Promise<DriftStatus> {
    console.log('⏳ ドリフト検出の完了を待機しています...');
    
    let attempts = 0;
    const maxAttempts = 30; // 最大 5 分待機 (30 * 10 秒)
    
    while (attempts < maxAttempts) {
      try {
        const result = execSync(`aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id ${detectionId}`, { encoding: 'utf8' });
        const status: DriftStatus = JSON.parse(result);
        
        if (status.DetectionStatus === 'DETECTION_COMPLETE') {
          return status;
        } else if (status.DetectionStatus === 'DETECTION_FAILED') {
          throw new Error(`ドリフト検出が失敗しました: ${status.StatusReason || '不明な理由'}`);
        }
        
        // 10秒待機後にリトライ
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempts++;
        process.stdout.write('.');
        
      } catch (error: any) {
        console.error('\n❌ ドリフト検出ステータスの確認に失敗しました:', error.message);
        throw error;
      }
    }
    
    throw new Error('ドリフト検出がタイムアウトしました');
  }

  // ドリフト詳細を取得
  async getDriftDetails(): Promise<ResourceDrift[]> {
    try {
      const result = execSync(`aws cloudformation describe-stack-resource-drifts --stack-name ${this.stackName}`, { encoding: 'utf8' });
      return JSON.parse(result).StackResourceDrifts;
    } catch (error: any) {
      console.error('❌ ドリフト詳細の取得に失敗しました:', error.message);
      throw error;
    }
  }

  // ドリフト結果を分析
  analyzeDrifts(drifts: ResourceDrift[]): DriftAnalysis {
    const analysis: DriftAnalysis = {
      total: drifts.length,
      drifted: drifts.filter(d => d.StackResourceDriftStatus === 'MODIFIED' || d.StackResourceDriftStatus === 'DELETED').length,
      deleted: drifts.filter(d => d.StackResourceDriftStatus === 'DELETED'),
      modified: drifts.filter(d => d.StackResourceDriftStatus === 'MODIFIED'),
      inSync: drifts.filter(d => d.StackResourceDriftStatus === 'IN_SYNC').length
    };
    
    return analysis;
  }

  // ドリフトレポートを表示
  displayDriftReport(driftStatus: DriftStatus, analysis: DriftAnalysis): void {
    console.log('\n📊 ドリフト検出レポート');
    console.log('================');
    console.log(`スタック状態: ${driftStatus.StackDriftStatus}`);
    console.log(`検出時刻: ${new Date(driftStatus.Timestamp).toLocaleString()}`);
    console.log(`総リソース数: ${analysis.total}`);
    console.log(`同期済みリソース: ${analysis.inSync}`);
    console.log(`ドリフトしたリソース: ${analysis.drifted}`);
    
    if (analysis.deleted.length > 0) {
      console.log('\n🗑️  削除されたリソース:');
      analysis.deleted.forEach(resource => {
        console.log(`  - ${resource.LogicalResourceId} (${resource.ResourceType})`);
        console.log(`    物理ID: ${resource.PhysicalResourceId}`);
      });
    }
    
    if (analysis.modified.length > 0) {
      console.log('\n🔧 変更されたリソース:');
      analysis.modified.forEach(resource => {
        console.log(`  - ${resource.LogicalResourceId} (${resource.ResourceType})`);
        console.log(`    物理ID: ${resource.PhysicalResourceId}`);
        if (resource.PropertyDifferences && resource.PropertyDifferences.length > 0) {
          console.log('    プロパティの差分:');
          resource.PropertyDifferences.forEach(diff => {
            console.log(`      ${diff.PropertyPath}: ${diff.DifferenceType}`);
          });
        }
      });
    }
  }

  // ユーザーに修復するかどうか尋ねる
  async askForRepair(analysis: DriftAnalysis): Promise<boolean> {
    if (analysis.drifted === 0) {
      console.log('✅ スタック状態は正常です。修復は必要ありません');
      return false;
    }
    
    console.log('\n⚠️  スタックドリフトが検出されました！');
    
    return new Promise((resolve) => {
      const rl = this.createReadlineInterface();
      rl.question('スタックドリフトを修復しますか？これによりスタックが再デプロイされます (y/N): ', (answer) => {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  // スタックドリフトを修復
  async repairDrift(): Promise<boolean> {
    console.log('🔧 スタックドリフトの修復を開始しています...');
    
    try {
      // スタックを再デプロイして修復
      console.log('スタックを再デプロイしています...');
      execSync(`npx cdk deploy --require-approval never`, { stdio: 'inherit' });
      console.log('✅ スタック修復が完了しました');
      
      // 修復結果を検証
      console.log('🔍 修復結果を検証しています...');
      const detectionId = await this.startDriftDetection();
      const driftStatus = await this.waitForDriftDetection(detectionId);
      
      if (driftStatus.StackDriftStatus === 'IN_SYNC') {
        console.log('✅ スタックドリフトの修復が成功しました。すべてのリソースが同期されています');
        return true;
      } else {
        console.log('⚠️  スタックにまだドリフトが残っている可能性があります。手動で確認することをお勧めします');
        return false;
      }
      
    } catch (error: any) {
      console.error('❌ スタックドリフトの修復に失敗しました:', error.message);
      return false;
    }
  }

  // メインの検出フロー
  async detectAndReport() {
    try {
      // スタックが存在するかチェック
      const stackExists = await this.checkStackExists();
      if (!stackExists) {
        console.log(`ℹ️  スタック ${this.stackName} が存在しません。ドリフト検出は不要です`);
        return { needsRepair: false, stackExists: false };
      }
      
      // ドリフト検出を開始
      const detectionId = await this.startDriftDetection();
      
      // 検出完了を待機
      const driftStatus = await this.waitForDriftDetection(detectionId);
      console.log('\n✅ ドリフト検出が完了しました');
      
      // 詳細情報を取得
      const drifts = await this.getDriftDetails();
      const analysis = this.analyzeDrifts(drifts);
      
      // レポートを表示
      this.displayDriftReport(driftStatus, analysis);
      
      // 修復するかどうか尋ねる
      const shouldRepair = await this.askForRepair(analysis);
      
      return {
        needsRepair: shouldRepair,
        stackExists: true,
        driftStatus,
        analysis,
        drifts
      };
      
    } catch (error: any) {
      console.error('❌ ドリフト検出プロセス中にエラーが発生しました:', error.message);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  // 完全な検出と修復フロー
  async detectAndRepair() {
    const result = await this.detectAndReport();
    
    if (result.needsRepair) {
      const repairSuccess = await this.repairDrift();
      return {
        ...result,
        repairAttempted: true,
        repairSuccess
      };
    }
    
    return {
      ...result,
      repairAttempted: false,
      repairSuccess: false
    };
  }
}

// このスクリプトが直接実行された場合
if (require.main === module) {
  const detector = new DriftDetector();
  detector.detectAndRepair()
    .then(result => {
      console.log('\n📋 最終結果:');
      console.log(`スタック存在: ${result.stackExists}`);
      if (result.stackExists) {
        console.log(`修復試行: ${result.repairAttempted}`);
        if (result.repairAttempted) {
          console.log(`修復成功: ${result.repairSuccess}`);
        }
      }
      process.exit(result.stackExists && (!result.needsRepair || result.repairSuccess) ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ プログラム実行に失敗しました:', error.message);
      process.exit(1);
    });
}
