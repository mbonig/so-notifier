import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';

const INGESTION_LOCK = 'INGESTION_LOCK';
export const TABLE_PK = 'pk';
export const TABLE_SK = 'sk';

async function lockIngestion(timestamp: string): Promise<boolean> {
  // this creates a lock record in a table so that we're idempotent
  // since this will be trigger by cloudwatch events and that's often a 1+ delivery
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('Please provide a TABLE_NAME to connect to for idempotency locks');
  }
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

async function readQuestions(tag: string = 'aws-cdk') {
  const results = await axios.get(`https://api.stackexchange.com/2.3/questions/unanswered?fromdate=1659052800&order=desc&sort=activity&tagged=${tag}&site=stackoverflow`);
  return results.data.items;
}

async function enqueueQuestions(questions: any[]) {
  const queueUrl = process.env.QUEUE_URL;
  if (!queueUrl) {
    throw new Error('Please provide a QUEUE_URL for sqs');
  }
  const client = new SQSClient({});
  for await (const question of questions) {

    await client.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(question),
    }));
  }

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

export const handler = async (event: {}) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  const startTime = new Date().toISOString();
  if (!await lockIngestion(startTime)) {
    console.warn('Ingestion lock could not be created, probably because another process is already running. Existing ingestion.');
    return;
  }
  const questions = await readQuestions(process.env.TAG);
  await enqueueQuestions(questions);
  await unlockIngestion();
};
