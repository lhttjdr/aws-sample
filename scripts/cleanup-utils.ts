/**
 * 汎用クリーンアップツールモジュール
 * 異なるレベルのクリーンアップ機能を提供し、重複コードを回避
 */

import { execSync } from "child_process";
import { cleanLocalFiles } from "./clean";

// ANSI カラー定数
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

interface CommandResult {
  success: boolean;
  output: string;
  optional?: boolean;
}

function log(color: string, message: string): void {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command: string, description: string, optional: boolean = false): CommandResult {
  log(colors.blue, `\n🔄 ${description}...`);
  log(colors.yellow, `実行: ${command}`);

  try {
    const output = execSync(command, { 
      stdio: "pipe", 
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    
    if (output.trim()) {
      console.log(output);
    }
    
    log(colors.green, `✅ ${description} 完了`);
    return { success: true, output };
  } catch (error: any) {
    if (optional) {
      log(colors.yellow, `⚠️ ${description} スキップ (オプション手順)`);
      return { success: false, output: error.message, optional: true };
    } else {
      log(colors.red, `❌ ${description} 失敗`);
      console.error(error.message);
      return { success: false, output: error.message };
    }
  }
}

// AWS 関連クリーンアップ機能
class AWSCleanupManager {
  async getStackInfo(): Promise<any | null> {
    try {
      const result = runCommand(
        'aws cloudformation describe-stacks --stack-name IcebergCdkStack --region ap-northeast-1',
        'CloudFormation スタック状態の確認',
        true
      );
      
      if (result.success) {
        const stackInfo = JSON.parse(result.output);
        return stackInfo.Stacks[0];
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getS3BucketName(): Promise<string | null> {
    try {
      const accountResult = runCommand(
        'aws sts get-caller-identity --query Account --output text',
        'AWS アカウント ID の取得',
        true
      );
      
      if (accountResult.success) {
        const accountId = accountResult.output.trim();
        return `iceberg-datalake-${accountId}-ap-northeast-1`;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async cleanupS3Bucket(bucketName: string | null): Promise<void> {
    if (!bucketName) {
      log(colors.yellow, '⚠️ S3 バケット名を特定できません。S3 クリーンアップをスキップします');
      return;
    }

    log(colors.blue, `🪣 S3 バケットをクリーンアップ: ${bucketName}`);

    // バケットが存在するかチェック
    const checkResult = runCommand(
      `aws s3 ls s3://${bucketName}`,
      `S3 バケット ${bucketName} の存在確認`,
      true
    );

    if (!checkResult.success) {
      log(colors.yellow, `⚠️ S3 バケット ${bucketName} が存在しないか、アクセス権限がありません`);
      return;
    }

    // バケット内のすべてのオブジェクトを削除
    runCommand(
      `aws s3 rm s3://${bucketName} --recursive`,
      `S3 バケット ${bucketName} 内のすべてのオブジェクトを削除`,
      true
    );

    // バケットを削除
    runCommand(
      `aws s3 rb s3://${bucketName}`,
      `S3 バケット ${bucketName} を削除`,
      true
    );
  }

  async cleanupCloudFormationStack(): Promise<void> {
    log(colors.blue, '☁️ CloudFormation スタックをクリーンアップ');

    const stackInfo = await this.getStackInfo();
    
    if (!stackInfo) {
      log(colors.yellow, '⚠️ CloudFormation スタックが存在しないか、既に削除されています');
      return;
    }

    log(colors.yellow, `スタック状態を検出: ${stackInfo.StackStatus}`);

    if (stackInfo.StackStatus === 'ROLLBACK_COMPLETE' || 
        stackInfo.StackStatus === 'CREATE_FAILED' ||
        stackInfo.StackStatus === 'DELETE_FAILED') {
      
      log(colors.yellow, '🔄 スタックが失敗状態です。最初に削除が必要です');
      runCommand(
        'aws cloudformation delete-stack --stack-name IcebergCdkStack --region ap-northeast-1',
        '失敗した CloudFormation スタックを削除'
      );
      
      // 削除完了を待機
      log(colors.blue, '⏳ スタックの削除完了を待機中...');
      runCommand(
        'aws cloudformation wait stack-delete-complete --stack-name IcebergCdkStack --region ap-northeast-1',
        'スタック削除完了を待機',
        true
      );
    } else {
      // CDK destroy を使用
      runCommand('cdk destroy --force', 'CDK スタックを破棄');
    }
  }

  async performFullAWSCleanup(): Promise<void> {
    log(colors.bold, "\n📋 ステップ 1: AWS リソース情報を収集");
    const bucketName = await this.getS3BucketName();
    if (bucketName) {
      log(colors.green, `✅ S3 バケットを検出: ${bucketName}`);
    }

    log(colors.bold, "\n🪣 ステップ 2: S3 リソースをクリーンアップ");
    await this.cleanupS3Bucket(bucketName);

    log(colors.bold, "\n☁️ ステップ 3: CloudFormation スタックをクリーンアップ");
    await this.cleanupCloudFormationStack();
  }
}

// クリーンアップレベル列挙
export const CleanupLevel = {
  LOCAL_ONLY: 'local',           // ローカルコンパイルファイルのみクリーンアップ
  DATA_ONLY: 'data',             // テストデータのみクリーンアップ（データベーステーブル）
  AWS_INFRASTRUCTURE: 'aws',     // AWS インフラストラクチャをクリーンアップ（S3、CloudFormation）
  FULL: 'full'                   // 完全クリーンアップ（上記すべてを含む）
} as const;

export type CleanupLevelType = typeof CleanupLevel[keyof typeof CleanupLevel];

// メインクリーンアップコーディネーター
export class CleanupManager {
  private awsCleanup: AWSCleanupManager;

  constructor() {
    this.awsCleanup = new AWSCleanupManager();
  }

  async performCleanup(level: CleanupLevelType = CleanupLevel.LOCAL_ONLY): Promise<void> {
    log(colors.bold + colors.blue, `\n🧹 ${level} レベルクリーンアップを開始`);

    try {
      switch (level) {
        case CleanupLevel.LOCAL_ONLY:
          await this.cleanLocalOnly();
          break;
        
        case CleanupLevel.AWS_INFRASTRUCTURE:
          await this.cleanAWSOnly();
          break;
        
        case CleanupLevel.FULL:
          await this.cleanAll();
          break;
        
        default:
          throw new Error(`未知のクリーンアップレベル: ${level}`);
      }

      log(colors.bold + colors.green, `\n🎉 ${level} レベルクリーンアップ完了！`);
    } catch (error) {
      log(colors.red, `\n💥 ${level} レベルクリーンアップ失敗`);
      throw error;
    }
  }

  async cleanLocalOnly(): Promise<void> {
    log(colors.bold, "\n🗂️ ローカルファイルをクリーンアップ");
    cleanLocalFiles();
  }

  async cleanAWSOnly(): Promise<void> {
    await this.awsCleanup.performFullAWSCleanup();
  }

  async cleanAll(): Promise<void> {
    // 最初に AWS リソースをクリーンアップ
    await this.cleanAWSOnly();
    
    // 次にローカルファイルをクリーンアップ
    log(colors.bold, "\n🗂️ ステップ 4: ローカルファイルをクリーンアップ");
    cleanLocalFiles();
  }
}

export {
  AWSCleanupManager,
  colors,
  log,
  runCommand
};
