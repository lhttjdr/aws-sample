/**
 * Jest テストシーケンサー
 * テストが正しい順序で実行されることを保証
 */

const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // ファイル名でソート、数字順での実行を保証
    return tests.sort((testA, testB) => {
      const orderA = this.getTestOrder(testA.path);
      const orderB = this.getTestOrder(testB.path);
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // 数字プレフィックスがない場合、ファイル名でソート
      return testA.path.localeCompare(testB.path);
    });
  }
  
  getTestOrder(testPath) {
    // ファイル名から数字プレフィックスを抽出 (例: 01-environment.test.ts -> 1)
    const match = testPath.match(/(\d+)-.*\.test\.ts$/);
    return match ? parseInt(match[1], 10) : 999;
  }
}

module.exports = CustomSequencer;
