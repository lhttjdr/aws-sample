#!/usr/bin/env node

/**
 * 静默的AWS基础设施清理脚本
 * demo.ts 开始时使用，不需要用户确认
 */

import { CleanupManager, CleanupLevel, colors, log } from "./cleanup-utils";

async function main(): Promise<void> {
  log(colors.blue, "🧹 AWS リソースの静默クリーンアップを実行中...");

  try {
    const cleanupManager = new CleanupManager();
    // AWS基础设施清理，但不需要用户确认
    await cleanupManager.performCleanup(CleanupLevel.AWS_INFRASTRUCTURE);

    log(colors.green, "✅ AWS リソースクリーンアップ完了");

  } catch (error: any) {
    log(colors.yellow, "⚠️  クリーンアップ中にエラーが発生しました（新規環境の可能性）");
    // 静默模式下不抛出错误，让demo继续执行
    if (process.env.VERBOSE_CLEANUP) {
      console.error(error.message);
    }
  }
}

if (require.main === module) {
  main().catch(() => {
    // 静默处理错误，让demo继续
    process.exit(0);
  });
}

export { main };
