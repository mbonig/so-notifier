import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackOverflowIngestion } from '../constructs/StackOverflowIngestion';

export class StackOverflowNotifierStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    new StackOverflowIngestion(this, 'Ingestion', {
      tag: 'aws-cdk',
    });
  }
}
