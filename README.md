# Apache Iceberg データレイクプロジェクト

AWS CDK を基盤とした Apache Iceberg データレイクソリューション。ACID トランザクション、タイムトラベル、データマージなどのコア機能をデモンストレーションします。

---

## 目次

1. プロジェクト概要
2. 環境要件
3. 使用方法
   - 環境準備
   - デプロイ・セットアップ
   - テスト実行
   - クリーンアップ
   - 高度なワークフロー
4. コンポーネント説明
5. よくある問題・トラブルシューティング
6. 関連リンク
7. ライセンス

---

## 1. プロジェクト概要

Apache Iceberg データレイクを AWS 上で構築・検証するための CDK プロジェクトです。Glue, Athena, S3 を活用し、データの ACID 保証やタイムトラベル、マージ操作などを実現します。

## 2. 環境要件

| コンポーネント | バージョン   | 説明             |
| -------------- | ------------ | ---------------- |
| Node.js        | v20.19.4 LTS | 必須、CDK 互換性 |
| AWS CDK CLI    | v2.1024.0+   | インフラ展開     |
| pnpm           | v10.13.1+    | パッケージ管理   |

> ⚠️ **重要**: Node.js 20.x LTS を使用し、22.x バージョンの互換性問題を回避してください。

## 3. 使用方法

### 3.1 環境準備

#### Node.js バージョン管理

```bash
nvm install 20.19.4
nvm use 20.19.4
node --version  # v20.19.4
```

#### AWS 認証情報設定

AWS 認証情報の設定は、下記いずれか一方の方法を選択してください：

- 方法 1：AWS CLI を使用

  ```bash
  aws configure
  ```

- 方法 2：環境変数で設定

  ```bash
  export AWS_ACCESS_KEY_ID=your_access_key
  export AWS_SECRET_ACCESS_KEY=your_secret_key
  export AWS_DEFAULT_REGION=your_region
  ```

設定後、認証情報を確認：

```bash
aws sts get-caller-identity
```

### 3.2 デプロイ・セットアップ

依存関係インストール後、デプロイ・セットアップは下記いずれか一方の方法を選択してください：

- 一括自動化（推奨）

  ```bash
  pnpm run deploy-and-setup
  ```

- 手動ステップ

  ```bash
  pnpm run build
  pnpm run deploy
  pnpm run setup
  pnpm run validate
  ```

### 3.3 テスト実行

#### 全テスト実行

```bash
pnpm run test --runInBand
```

すべてのテストスイートを順番に実行します。並列実行による競合を防ぎます。テストはカスタム sequencer で順序制御されます。

#### 個別テスト実行

```bash
npx jest test/00-auth-validation.test.ts
npx jest test/01-glue-db.test.ts
npx jest test/02-athena-query.test.ts
npx jest test/03-s3-operations.test.ts
npx jest test/04-merge-transaction.test.ts
```

特定のテストファイルのみを個別に実行します。ファイルパスは任意のテストに変更可能です。

### 3.4 クリーンアップ

```bash
pnpm run cleanup         # 完全削除（推奨）

pnpm run clean          # ローカルのみ
pnpm run clean:aws      # AWS のみ
pnpm run destroy        # CDK スタックのみ
```

削除後は AWS CLI でリソース消失を確認できます。

### 3.5 高度なワークフロー

#### 安全なデプロイ

```bash
pnpm run deploy:safe
```

TypeScript ビルド → CDK デプロイ → ドリフト検証を自動実行。

#### ドリフト検出・修復

```bash
pnpm run drift:detect
pnpm run drift:verify
```

CloudFormation スタックと AWS リソースの差異を検出・修復。

#### 安全なテスト実行

```bash
pnpm run test:safe
```

事前チェック（ドリフト検出）→ 修復 → テスト実行。

### 3.6 デモ実行

#### デモ概要

`pnpm run demo` コマンドは、Iceberg データレイクの主要機能（デプロイ、テスト、クリーンアップ）を一括で体験できるデモフローを実行します。
このコマンドは以下を自動化します：

1. 事前クリーンアップ
2. インフラストラクチャのデプロイ
3. デプロイ後の検証（ドリフト検出）
4. テスト環境のセットアップ
5. テストスイートの実行
6. 事後クリーンアップ

#### 他のステップとの関係

`pnpm run demo` は、3.2（デプロイ・セットアップ）、3.3（テスト実行）、3.4（クリーンアップ）、3.5（高度なワークフロー）で説明した各手順を一括で自動実行します。
個別コマンドを手動で実行する代わりに、`pnpm run demo` を使うことで、これらの流れを一度に体験・検証できます。

#### 実行方法

```bash
pnpm run demo
```

#### 利用シーン

- 初めてプロジェクトを体験する場合
- 機能検証やデモンストレーションを行いたい場合
- 一連の流れを自動化したい場合

## 4. コンポーネント説明

- **S3 バケット**: `iceberg-datalake-{ACCOUNT_ID}-{REGION}` - データストレージ
- **Glue データベース**: `contract_lakehouse` - メタデータ管理
- **Athena ワークグループ**: `iceberg-workgroup` - クエリエンジン（Iceberg 対応）

## 5. よくある問題・トラブルシューティング

### バージョン関連

- Node.js 22.x → 20.x LTS に切り替え: `nvm use 20.19.4`
- CDK バージョン不一致 → `npm install -g aws-cdk@latest`

### デプロイ・テスト関連

- スタックが存在しない → `pnpm run deploy:safe`
- デプロイ後に問題発生 → `pnpm run drift:verify` → `pnpm run drift:detect`
- 並列実行の競合 → `pnpm run test --runInBand`
- 環境未設定 → `pnpm run setup` で `.env` 生成
- テスト中エラー → `pnpm run drift:detect` で修復後再実行

### AWS 権限・認証

- 認証情報エラー → `aws sts get-caller-identity` で検証
- 権限不足 → S3, Glue, Athena, CloudFormation の権限確認
- 重要リソース不足 → `pnpm run deploy:safe`

## 6. 関連リンク

- [Apache Iceberg ドキュメント](https://iceberg.apache.org/)
- [AWS CDK ガイド](https://docs.aws.amazon.com/cdk/)
- [Amazon Athena Iceberg サポート](https://docs.aws.amazon.com/athena/latest/ug/querying-iceberg.html)
- [AWS Glue データカタログ](https://docs.aws.amazon.com/glue/latest/dg/populate-data-catalog.html)

## 7. ライセンス

このプロジェクトは ISC ライセンスを使用しています。
| `clean:aws` | AWS 基盤設施 (S3, CloudFormation) | AWS リソースのみ削除 |
