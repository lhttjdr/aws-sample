import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// クリーンアップツール関数
function deletePattern(pattern: string, dir: string = '.'): void {
  try {
    if (process.platform === 'win32') {
      // Windows は PowerShell を使用
      execSync(`powershell -Command "Remove-Item -Path '${path.join(dir, pattern)}' -Force -ErrorAction SilentlyContinue"`, { stdio: 'inherit' });
    } else {
      // Unix-like システムは rm を使用
      execSync(`rm -f ${path.join(dir, pattern)}`, { stdio: 'inherit' });
    }
  } catch (error) {
    // ファイルが存在しないエラーを無視
    console.log(`クリーンアップ済み: ${path.join(dir, pattern)}`);
  }
}

function deleteDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      execSync(`npx rimraf "${dirPath}"`, { stdio: 'inherit' });
      console.log(`ディレクトリを削除しました: ${dirPath}`);
    }
  } catch (error) {
    console.log(`ディレクトリクリーンアップ時にエラーが発生: ${dirPath}`);
  }
}

// ローカルファイルクリーンアップ機能
export function cleanLocalFiles(): void {
  console.log('🧹 コンパイルファイルのクリーンアップを開始...');

  // dist ディレクトリを削除
  deleteDir('dist');

  // ルートディレクトリのコンパイルファイルを削除
  deletePattern('*.js');
  deletePattern('*.d.ts');
  deletePattern('*.js.map');
  deletePattern('*.d.ts.map');

  // lib ディレクトリのコンパイルファイルを削除
  deletePattern('*.js', 'lib');
  deletePattern('*.d.ts', 'lib');
  deletePattern('*.js.map', 'lib');
  deletePattern('*.d.ts.map', 'lib');

  // bin ディレクトリのコンパイルファイルを削除
  deletePattern('*.js', 'bin');
  deletePattern('*.d.ts', 'bin');
  deletePattern('*.js.map', 'bin');
  deletePattern('*.d.ts.map', 'bin');

  // 重要な JS 設定ファイルを保持
  const preserveFiles: string[] = [
    'jest.config.js',
    'test/jest.setup.js',
    'test/jest.sequencer.js',
    'test/run-tests.js'
  ];

  console.log('✅ クリーンアップ完了');
  console.log('📋 保持された設定ファイル:');
  preserveFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`  - ${file}`);
    }
  });
}

// 他のスクリプトで使用するために関数をエクスポート
export { deletePattern, deleteDir };

// このスクリプトを直接実行した場合、ローカルクリーンアップを実行
if (require.main === module) {
  cleanLocalFiles();
}
