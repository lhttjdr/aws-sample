#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IcebergCdkStack } from '../lib/iceberg_cdk_stack';

const app = new cdk.App();
new IcebergCdkStack(app, 'IcebergCdkStack', {
  /* 'env' を指定しない場合、このスタックは環境に依存しません。
   * アカウント/リージョン依存の機能とコンテキスト検索は動作しませんが、
   * 単一の合成されたテンプレートをどこにでもデプロイできます。 */

  /* 現在のCLI設定で暗黙的に指定されるAWSアカウントと
   * リージョンにこのスタックを特化させる場合は、次の行のコメントを外してください。 */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* スタックをデプロイするアカウントとリージョンを正確に知っている場合は、
   * 次の行のコメントを外してください。 */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* 詳細については、https://docs.aws.amazon.com/cdk/latest/guide/environments.html を参照してください */
});