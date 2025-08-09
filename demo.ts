#!/usr/bin/env node


import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function log(msg: string) {
  console.log(`\x1b[36m${msg}\x1b[0m`);
}

function run(command: string, desc: string, interactive = false) {
  log(`\n🔄 ${desc}`);
  log(`$ ${command}`);
  try {
    if (interactive) {
      execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    } else {
      const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });
      if (result.trim()) log(result);
    }
    log(`✅ ${desc} 完了`);
    return true;
  } catch (e: any) {
    log(`❌ ${desc} 失敗: ${e.message}`);
    throw e;
  }
}

async function main() {
  log('🚀 Iceberg CDK デモフロー開始');
  // 1. 事前クリーンアップ
  run('pnpm run cleanup', '事前クリーンアップ', true);

  // 2. インフラストラクチャのデプロイ
  run('pnpm run build', 'TypeScript ビルド');
  run('pnpm run deploy', 'CDK デプロイ', true);

  // 3. デプロイ後の検証（ドリフト検出）
  run('pnpm run drift:verify', 'ドリフト検証');

  // 4. テスト環境のセットアップ
  run('pnpm run setup', 'テスト環境セットアップ');
  run('pnpm run validate', '環境検証');

  // 5. テストスイートの実行
  run('pnpm run test:sequential', 'テストスイート実行');

  // 6. HTMLレポート表示
  const reportPath = path.join(process.cwd(), 'test-reports', 'jest-report.html');
  if (fs.existsSync(reportPath)) {
    log(`📄 HTML レポート: ${reportPath}`);
    // Windows: cmd /c start "" "path"
    if (process.platform === 'win32') {
      execSync(`cmd /c start "" "${reportPath}"`);
    } else if (process.platform === 'darwin') {
      execSync(`open "${reportPath}"`);
    } else {
      execSync(`xdg-open "${reportPath}"`);
    }
    log('📖 HTML レポートをブラウザで開きました');
  }

  // 7. 事後クリーンアップ
  run('pnpm run cleanup', '事後クリーンアップ', true);

  log('🎊 デモンストレーション完了！');
}

if (require.main === module) {
  main().catch(e => {
    log('💥 デモ中にエラーが発生しました: ' + e.message);
    process.exit(1);
  });
}
