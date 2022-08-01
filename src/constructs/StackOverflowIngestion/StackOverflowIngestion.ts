import { Duration } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';

import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Cloudwatch } from 'cdk-iam-floyd';
import { Construct } from 'constructs';
import { TABLE_PK, TABLE_SK } from './StackOverflowIngestion.Reader';

export interface StackOverflowIngestionProps {
  readonly tag: string;
}

export class StackOverflowIngestion extends Construct {
  public queue: Queue;
  constructor(scope: Construct, id: string, props: StackOverflowIngestionProps) {
    super(scope, id);

    const table = new Table(this, 'Table', {
      billingMode: BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      encryption: TableEncryption.AWS_MANAGED,
      partitionKey: {
        name: TABLE_PK,
        type: AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_SK,
        type: AttributeType.STRING,
      },
    });

    const queue = this.queue = new Queue(this, 'Queue', {
      encryption: QueueEncryption.KMS,

    });
    const reader = new NodejsFunction(this, 'Reader', {
      environment: {
        TAG: props.tag,
        TABLE_NAME: table.tableName,
        QUEUE_URL: queue.queueUrl,
      },
    });
    table.grantReadWriteData(reader);
    queue.grantSendMessages(reader);

    reader.addToRolePolicy(new Cloudwatch().allow().toPutMetricData().onAllResources());

    const everyHour = new Rule(this, 'Timer', {
      schedule: Schedule.rate(Duration.hours(1)),
    });
    everyHour.addTarget(new LambdaFunction(reader));

  }
}
