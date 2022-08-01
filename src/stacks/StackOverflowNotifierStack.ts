import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SlackNotifier } from '../constructs/SlackNotifier/SlackNotifier';
import { StackOverflowIngestion } from '../constructs/StackOverflowIngestion';

export class StackOverflowNotifierStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const ingestion = new StackOverflowIngestion(this, 'Ingestion', {
      tag: 'aws-cdk',
    });
    new SlackNotifier(this, 'Notifier', {
      queue: ingestion.queue,
    });
  }
}
