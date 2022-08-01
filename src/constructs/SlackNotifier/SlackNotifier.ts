import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { IQueue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { SECRET_KEY } from './SlackNotifier.Notifier';

export interface SlackNotifierProps {
  readonly queue: IQueue;
}

export class SlackNotifier extends Construct {
  constructor(scope: Construct, id: string, props: SlackNotifierProps) {
    super(scope, id);

    const slackWebhookSecret = new Secret(this, 'SlackWebhook', {

    });

    const handler = new NodejsFunction(this, 'Notifier', {
      environment: {
        [SECRET_KEY]: slackWebhookSecret.secretArn,
      },
    });
    slackWebhookSecret.grantRead(handler);
    handler.addEventSource(new SqsEventSource(props.queue, {}));

  }
}
