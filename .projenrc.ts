import { awscdk } from 'projen';
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.34.2',
  defaultReleaseBranch: 'main',
  name: 'so-notifier',
  projenrcTs: true,
  deps: [
    'axios',
    '@aws-sdk/client-cloudwatch',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-secrets-manager',
    '@aws-sdk/lib-dynamodb',
    '@matthewbonig/simple-logger',
    '@types/aws-lambda',
    '@types/node',
    'aws-sdk-client-mock',
    'cdk-iam-floyd',
    'dayjs',
  ],
});
project.synth();
