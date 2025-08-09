import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';

export class IcebergCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. データレイク用の S3 バケットを作成
    const dataLakeBucket = new s3.Bucket(this, 'DataLakeBucket', {
      // バケット名はグローバルに一意である必要がある
      bucketName: `iceberg-datalake-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      // スタックが破棄される際にオブジェクトを自動削除（簡単なクリーンアップのため）
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 2. AWS Glue データベースを作成
    const databaseName = 'contract_lakehouse';
    const glueDatabase = new glue.CfnDatabase(this, 'GlueDatabase', {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseInput: {
        name: databaseName,
        description: 'Iceberg 契約データレイクハウス用のデータベース。',
      },
    });

    // 3. Iceberg サポート用の Athena ワークグループを作成
    const athenaWorkgroup = new athena.CfnWorkGroup(this, 'IcebergWorkGroup', {
      name: `iceberg-workgroup-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      description: 'Iceberg サポート付きの Athena ワークグループ',
      state: 'ENABLED',
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${dataLakeBucket.bucketName}/athena-query-results/`,
          encryptionConfiguration: {
            encryptionOption: 'SSE_S3',
          },
        },
        engineVersion: {
          selectedEngineVersion: 'Athena engine version 3',
        },
      },
    });

    // 4. 簡単なアクセスのため、作成されたリソース名を出力
    new cdk.CfnOutput(this, 'DataLakeBucketName', {
      value: dataLakeBucket.bucketName,
      description: 'Iceberg データレイク用の S3 バケット名。',
    });

    new cdk.CfnOutput(this, 'GlueDatabaseName', {
      value: databaseName,
      description: 'AWS Glue データベース名。',
    });

    new cdk.CfnOutput(this, 'AthenaWorkGroupName', {
      value: athenaWorkgroup.name!,
      description: 'Iceberg クエリ用の Athena ワークグループ名。',
    });
  }
}
