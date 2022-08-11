import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { SQSEvent } from 'aws-lambda';
import axios from 'axios';
import { decode } from 'html-entities';

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

interface Question {
  link: string;
  title: string;
}

interface Questions extends Array<Question> {}

function createSlackBlockkitResponse(questions: Questions) {
  function formatQuestionEntry(question: Question): any {
    const decodedTitle = decode(question.title);
    const slackEncodedTitle = decodedTitle
      .replace(/\&/g, '&amp;')
      .replace(/\>/g, '&gt;')
      .replace(/</g, '&lt;');
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${question.link}|${slackEncodedTitle}>`,
      },
    };
  }
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

  return {
    blocks: [...headers, ...questionLinks],
  };
}

export const handler = async (event: SQSEvent) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  const webhookUrl = getWebhookUrl();
  for await (const questions of event.Records.map((record) =>
    JSON.parse(record.body),
  )) {
    console.log('question: ', JSON.stringify(questions, null, 2));
    const slackPayload = createSlackBlockkitResponse(questions);
    await axios.post(await webhookUrl, slackPayload);
  }
};
