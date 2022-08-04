import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import { handler, SECRET_KEY } from '../../src/constructs/SlackNotifier/SlackNotifier.Notifier';

jest.mock('axios');

describe('Notifier handler', () => {
  const smMock = mockClient(SecretsManagerClient);
  const TEST_SECRET_STRING = 'https://somelongslackwebhookurl';
  const SOME_TITLE = 'sometitle';
  const SOME_LINK = 'https://somelink';

  beforeEach(() => {
    smMock.reset();
  });
  beforeAll(() => {
    process.env[SECRET_KEY] = 'some-test-secret';
  });

  function createSampleEvent(): SQSEvent {
    return <SQSEvent>{
      Records: [
        {
          body: JSON.stringify({ title: SOME_TITLE, link: SOME_LINK }),
        },
      ],
    };
  }

  function mockAxiosPost(items: any[] = []) {
    // @ts-ignore
    axios.post.mockResolvedValueOnce({ data: { items } });
  }

  function mockSecretRead() {
    const date = (new Date().getTime() / 1000);
    smMock.on(GetSecretValueCommand).resolvesOnce({ $metadata: {}, SecretString: TEST_SECRET_STRING });
    return date;
  }


  it('writes to slack', async () => {
    mockSecretRead();
    mockAxiosPost();
    await handler(createSampleEvent());
    expect(axios.post).toHaveBeenCalledWith(TEST_SECRET_STRING, {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `A new question was asked on StackOverflow, can you answer it?\n<${SOME_LINK}|${SOME_TITLE}>`,
          },
        },
      ],
    });
    expect(smMock).toHaveReceivedCommand(GetSecretValueCommand);

  });
});

