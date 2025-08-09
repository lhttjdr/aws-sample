#!/usr/bin/env node

/**
 * 完全クリーンアップスクリプト
 * 統一されたクリーンアップツールを使用して完全クリーンアップを実行
 */

import * as readline from "readline";
import { CleanupManager, CleanupLevel, colors, log } from "./cleanup-utils";

function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer: string) => {
      rl.close();
      const response = answer.trim().toLowerCase();
      resolve(response === "y" || response === "yes");
    });
  });
}

async function main(): Promise<void> {
  log(colors.bold + colors.blue, "\n🧹 Apache Iceberg CDK 完全クリーンアップツール");
  log(colors.yellow, "これはS3バケットとCloudFormationスタックを含む、すべての関連AWSリソースをクリーンアップします\n");

  // 操作を確認
  const confirmed = await confirmAction(
    colors.red + "⚠️ 警告: これはすべてのIceberg関連AWSリソースを削除します。続行しますか？" + colors.reset
  );

  if (!confirmed) {
    log(colors.yellow, "❌ ユーザーが操作をキャンセルしました");
    process.exit(0);
  }

  try {
    const cleanupManager = new CleanupManager();
    await cleanupManager.performCleanup(CleanupLevel.FULL);

    log(colors.green, "すべてのAWSリソースとローカルファイルがクリーンアップされました");

  } catch (error: any) {
    log(colors.red, "\n💥 クリーンアップ処理中にエラーが発生しました");
    console.error(error.message);

    log(colors.yellow, "\n🔧 手動クリーンアップの提案:");
    log(colors.yellow, "1. S3バケットを確認して削除:");
    log(colors.yellow, "   aws s3 rb s3://iceberg-datalake-[ACCOUNT-ID]-ap-northeast-1 --force");
    log(colors.yellow, "2. CloudFormationスタックを確認して削除:");
    log(colors.yellow, "   aws cloudformation delete-stack --stack-name IcebergCdkStack --region ap-northeast-1");
    log(colors.yellow, "3. ローカルファイルをクリーンアップ:");
    log(colors.yellow, "   npm run clean");

    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
