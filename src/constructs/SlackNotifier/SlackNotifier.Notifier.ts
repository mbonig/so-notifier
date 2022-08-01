import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SQSEvent } from 'aws-lambda';
import axios from 'axios';

export const SECRET_KEY = 'SLACK_WEBHOOK_SECRET';

async function getWebhookUrl(): Promise<string> {
  const client = new SecretsManagerClient({});
  const results = await client.send(new GetSecretValueCommand({
    SecretId: process.env[SECRET_KEY],
  }));
  return results.SecretString!;
}

export const handler = async(event: SQSEvent)=>{
  console.log('Event:', JSON.stringify(event, null, 2));

  const webhookUrl = await getWebhookUrl();

  for await (const question of event.Records.map(record=>JSON.parse(record.body))) {
    console.log('question: ', JSON.stringify(question, null, 2));
    await axios.post(webhookUrl, {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `A new question was asked on StackOverflow, can you answer it?\n<${question.link}|${question.title}>`,
          },
        },
      ],
    });
  }
};
