import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { useLogger } from '@matthewbonig/simple-logger';
import axios from 'axios';
import dayjs from 'dayjs';

export const INGESTION_LOCK = 'INGESTION_LOCK';
export const LAST_READ = 'LAST_READ';
export const METRIC_NAMESPACE = 'cdk.dev';
export const QUESTION_INGESTED_METRIC_NAME = 'QuestionsIngested';

export const TABLE_PK = 'pk';
export const TABLE_SK = 'sk';

function getTableName() {
  // this creates a lock record in a table so that we're idempotent
  // since this will be trigger by cloudwatch events and that's often a 1+ delivery
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('Please provide a TABLE_NAME to connect to for idempotency locks');
  }
  return tableName;
}

async function lockIngestion(timestamp: number): Promise<boolean> {
  const tableName = getTableName();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  try {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: { [TABLE_PK]: INGESTION_LOCK, [TABLE_SK]: INGESTION_LOCK, timestamp: timestamp },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      console.warn('There was an error writing the ingestion lock, probably because there was already a process running', err);
      return false;
    }
    throw err;

  }
}

async function readQuestions(tag: string = 'aws-cdk', lastReadTime: number, endTime: number) {
  const results = await axios.get('https://api.stackexchange.com/2.3/questions/unanswered', {
    params: {
      fromdate: lastReadTime,
      todate: endTime,
      order: 'desc',
      sort: 'activity',
      tagged: tag,
      site: 'stackoverflow',
    },
  });
  return results.data.items;
}

async function enqueueQuestions(questions: any[]) {
  const queueUrl = process.env.QUEUE_URL;
  if (!queueUrl) {
    throw new Error('Please provide a QUEUE_URL for sqs');
  }
  const client = new SQSClient({});
  const unansweredQuestions = questions.filter(question => !question.is_answered);

  await client.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(unansweredQuestions),
  }));

  const cloudWatchClient = new CloudWatchClient({});
  await cloudWatchClient.send(new PutMetricDataCommand({
    Namespace: METRIC_NAMESPACE,
    MetricData: [
      {
        MetricName: QUESTION_INGESTED_METRIC_NAME,
        Value: unansweredQuestions.length,
      },
    ],
  }));

}

async function unlockIngestion() {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('Please provide a TABLE_NAME to connect to for idempotency locks');
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: {
      [TABLE_PK]: INGESTION_LOCK,
      [TABLE_SK]: INGESTION_LOCK,
    },
  }));
}

async function getLastReadDate(): Promise<number> {
  const tableName = getTableName();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const results = await client.send(new GetCommand({
    TableName: tableName,
    Key: {
      [TABLE_PK]: LAST_READ, [TABLE_SK]: LAST_READ,
    },
  }));
  const item = results.Item;
  if (!item) {
    // we didn't get an item, so let's come up with a date, last 24 hours?
    return Math.round(dayjs().subtract(1, 'day').toDate().getTime() / 1000);
  }
  return item!.timestamp;
}

async function writeLastReadDate(startTime: number) {
  const tableName = getTableName();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      [TABLE_PK]: LAST_READ,
      [TABLE_SK]: LAST_READ,
      timestamp: startTime,
      timestamp_iso: dayjs(startTime * 1000).toISOString(),
    },
  }));
}

export const handler = async (event: {}) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  const startTime = Math.round(new Date().getTime() / 1000);
  if (!await useLogger(lockIngestion)(startTime)) {
    console.warn('Ingestion lock could not be created, probably because another process is already running. Existing ingestion.');
    return;
  }
  try {
    const lastReadDate = await useLogger(getLastReadDate)();
    const questions = await useLogger(readQuestions)(process.env.TAG, lastReadDate, startTime);
    await useLogger(enqueueQuestions)(questions);
    await useLogger(writeLastReadDate)(startTime);
  } catch (err) {
    console.error(err);
  } finally {
    await useLogger(unlockIngestion)();
  }
};
