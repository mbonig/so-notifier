import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { SQSEvent } from 'aws-lambda';
import axios from 'axios';

export const SECRET_KEY = 'SLACK_WEBHOOK_SECRET';

async function getWebhookUrl(): Promise<string> {
  const client = new SecretsManagerClient({});
  const results = await client.send(
    new GetSecretValueCommand({
      SecretId: process.env[SECRET_KEY],
    }),
  );
  return results.SecretString!;
}

function formatQuestionEntry(question: { link: string; title: string }) {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '<${question.link}|${question.title}>',
    },
  };
}

export const handler = async (event: SQSEvent) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const webhookUrl = await getWebhookUrl();

  for await (const questions of event.Records.map((record) =>
    JSON.parse(record.body),
  )) {
    console.log('question: ', JSON.stringify(questions, null, 2));

    const questionLinks = questions.map(formatQuestionEntry);

    const headers = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Unanswered CDK questions on Stack Overflow',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Can you help answer them?',
        },
      },
    ];

    await axios.post(webhookUrl, {
      blocks: [
        ...headers,
        ...questionLinks,
      ],
    });
  }
};
