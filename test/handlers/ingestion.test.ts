import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import { handler } from '../../src/constructs/StackOverflowIngestion/StackOverflowIngestion.Reader';

jest.mock('axios');
describe('Ingestion Handler', function () {
  let ddbMock = mockClient(DynamoDBDocumentClient);
  let sqsMock = mockClient(SQSClient);
  beforeEach(() => {
    ddbMock.reset();
    sqsMock.reset();
  });
  beforeAll(() => {
    process.env.TAGS = 'aws-cdk,cdk';
    process.env.TABLE_NAME = 'some-table';
    process.env.QUEUE_URL = 'somequeue';
  });

  describe('locking works', () => {

    it('should do noting if ingestion lock exists', async () => {
      ddbMock.on(PutCommand).rejects(new ConditionalCheckFailedException({ $metadata: {} }));

      await handler({});
      expect(axios.get).not.toHaveBeenCalled();
      expect(ddbMock).toHaveReceivedCommand(PutCommand);
      expect(ddbMock).not.toHaveReceivedCommand(DeleteCommand);
    });

    it('should call to SO if not locked', async () => {
      ddbMock.on(PutCommand).resolvesOnce({});
      ddbMock.on(DeleteCommand).resolvesOnce({});
      // @ts-ignore
      axios.get.mockResolvedValueOnce({ data: {} });
      await handler({});
      expect(axios.get).toHaveBeenCalled();
      expect(ddbMock).toHaveReceivedCommand(PutCommand);
      expect(ddbMock).toHaveReceivedCommand(DeleteCommand);

    });
  });

  describe('enqueues', () => {
    it('write to queue', async () => {
      ddbMock.on(PutCommand).resolvesOnce({});
      ddbMock.on(DeleteCommand).resolvesOnce({});
      // @ts-ignore
      axios.get.mockResolvedValueOnce({ data: { items: [{}, {}, {}] } });

      await handler({});

      expect(sqsMock).toHaveReceivedCommandTimes(SendMessageCommand, 3);
      expect(axios.get).toHaveBeenCalled();
      expect(ddbMock).toHaveReceivedCommand(PutCommand);
      expect(ddbMock).toHaveReceivedCommand(DeleteCommand);

    });
  });

});
