import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  handler,
  INGESTION_LOCK,
  LAST_READ,
  METRIC_NAMESPACE,
  QUESTION_INGESTED_METRIC_NAME,
  TABLE_PK,
  TABLE_SK,
} from '../../src/constructs/StackOverflowIngestion/StackOverflowIngestion.Reader';

jest.mock('axios');

expect.extend({
  toBeAround(actual, expected, delta = 500) {
    const pass = Math.abs(expected - actual) < delta;
    if (pass) {
      return {
        message: () => `expected ${actual} not to be around ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${actual} to be around ${expected}`,
        pass: false,
      };
    }
  },
});

describe('Ingestion Handler', function () {
  const ddbMock = mockClient(DynamoDBDocumentClient);
  const sqsMock = mockClient(SQSClient);
  const cloudWatchMock = mockClient(CloudWatchClient);
  const tableName = 'some-table';
  const tag = 'aws-cdk';

  beforeEach(() => {
    ddbMock.reset();
    sqsMock.reset();
    cloudWatchMock.reset();
  });
  beforeAll(() => {
    process.env.TAG = tag;
    process.env.TABLE_NAME = tableName;
    process.env.QUEUE_URL = 'somequeue';
  });

  function mockPutIngestionLock() {
    ddbMock.on(PutCommand, {
      Item: {
        [TABLE_PK]: INGESTION_LOCK,
        [TABLE_SK]: INGESTION_LOCK,
      },
    }).resolvesOnce({});
  }

  function mockDeleteIngestionLock() {
    ddbMock.on(DeleteCommand, {
      Key: {
        [TABLE_PK]: INGESTION_LOCK,
        [TABLE_SK]: INGESTION_LOCK,
      },
    }).resolvesOnce({});
  }

  function mockGetLastReadTime() {
    const date = (new Date().getTime() / 1000);
    ddbMock.on(GetCommand, {
      TableName: tableName,
      Key: {
        [TABLE_PK]: LAST_READ,
        [TABLE_SK]: LAST_READ,
      },
    }).resolvesOnce({ Item: { timestamp: date } });
    return date;
  }

  function mockAxiosRead(items: any[] = []) {
    // @ts-ignore
    axios.get.mockResolvedValueOnce({ data: { items } });
  }

  describe('locking works', () => {

    it('should do noting if ingestion lock exists', async () => {
      ddbMock.on(PutCommand).rejects(new ConditionalCheckFailedException({ $metadata: {} }));

      await handler({});
      expect(axios.get).not.toHaveBeenCalled();
      expect(ddbMock).toHaveReceivedCommand(PutCommand);
      expect(ddbMock).not.toHaveReceivedCommand(DeleteCommand);
    });

    it('should call to SO if not locked', async () => {
      // when
      mockPutIngestionLock();
      mockDeleteIngestionLock();
      mockGetLastReadTime();
      mockAxiosRead();

      // then
      await handler({});

      // expect
      expect(axios.get).toHaveBeenCalled();
      expect(ddbMock).toHaveReceivedCommand(PutCommand);
      expect(ddbMock).toHaveReceivedCommand(DeleteCommand);
      expect(ddbMock).toHaveReceivedCommand(GetCommand);

    });
  });

  function mockLastReadTimeWrite(date: number) {
    ddbMock.on(PutCommand, {
      Item: {
        [TABLE_PK]: LAST_READ,
        [TABLE_SK]: LAST_READ,
        timestamp: date,
      },
    }).resolvesOnce({});
  }

  describe('start date', () => {
    it('start date matches last read', async () => {
      // when
      mockPutIngestionLock();
      mockDeleteIngestionLock();
      const date = mockGetLastReadTime();
      mockAxiosRead();

      // then
      await handler({});

      // expect
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringMatching('https://api.stackexchange.com/2.3/questions/unanswered'),
        {
          params: {
            fromdate: date,
            todate: expect.anything(),
            order: 'desc',
            sort: 'activity',
            tagged: tag,
            site: 'stackoverflow',
          },
        },
      );
    });

    it('start date is one day ago when not previously run', async () => {
      // when
      mockPutIngestionLock();
      mockDeleteIngestionLock();
      ddbMock.on(GetCommand, {
        TableName: tableName,
        Key: {
          [TABLE_PK]: LAST_READ,
          [TABLE_SK]: LAST_READ,
        },
      }).resolvesOnce({ Item: undefined });

      mockAxiosRead();

      // then
      await handler({});

      // expect
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringMatching('https://api.stackexchange.com/2.3/questions/unanswered'),
        {
          params: {
            // @ts-ignore
            fromdate: expect.toBeAround(Math.round(dayjs().subtract(1, 'day').toDate().getTime() / 1000), 20),
            todate: expect.anything(),
            order: 'desc',
            sort: 'activity',
            tagged: tag,
            site: 'stackoverflow',
          },
        },
      );


    });

    it('writes date to table', async () => {
      // when
      mockPutIngestionLock();
      mockDeleteIngestionLock();
      const date = mockGetLastReadTime();
      mockAxiosRead();
      mockLastReadTimeWrite(date);

      // then
      await handler({});

      // expect
      expect(ddbMock.commandCalls(PutCommand)[1].args[0].input.Item![TABLE_PK]).toEqual(LAST_READ);
      expect(ddbMock.commandCalls(PutCommand)[1].args[0].input.Item![TABLE_SK]).toEqual(LAST_READ);
      let now = new Date();
      expect(ddbMock.commandCalls(PutCommand)[1].args[0].input.Item!.timestamp).toBeAround(Math.round(now.getTime() / 1000), 50);

      // I don't care if the individual second is correct.
      const replaceSeconds = (isoString: string) => isoString.replace(/\d\./, '0');
      expect(replaceSeconds(ddbMock.commandCalls(PutCommand)[1].args[0].input.Item!.timestamp_iso)).toEqual(replaceSeconds(now.toISOString().replace(/\.\d{3}/, '.000')));

    });
  });

  describe('enqueues', () => {
    it('write to queue', async () => {
      mockPutIngestionLock();
      mockDeleteIngestionLock();
      mockGetLastReadTime();

      // @ts-ignore
      mockAxiosRead([{}, {}, {}]);

      await handler({});

      expect(sqsMock).toHaveReceivedCommandTimes(SendMessageCommand, 3);
      expect(axios.get).toHaveBeenCalled();
      expect(ddbMock).toHaveReceivedCommand(PutCommand);
      expect(ddbMock).toHaveReceivedCommand(DeleteCommand);
    });

    it('doesnt send answered', async () => {
      mockPutIngestionLock();
      mockDeleteIngestionLock();
      mockGetLastReadTime();

      // @ts-ignore
      mockAxiosRead([{}, {}, { is_answered: true }]);

      await handler({});

      expect(sqsMock).toHaveReceivedCommandTimes(SendMessageCommand, 2);
      expect(axios.get).toHaveBeenCalled();
      expect(ddbMock).toHaveReceivedCommand(PutCommand);
      expect(ddbMock).toHaveReceivedCommand(DeleteCommand);
    });
  });

  describe('writes custom metric data', function () {
    it('should write one metric value per question published', async () => {

      mockPutIngestionLock();
      mockDeleteIngestionLock();
      mockGetLastReadTime();
      mockAxiosRead([{ is_answered: true }, {}, {}]);
      cloudWatchMock.on(PutMetricDataCommand).resolvesOnce({});

      await handler({});

      expect(cloudWatchMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
        Namespace: METRIC_NAMESPACE,
        MetricData: [{
          MetricName: QUESTION_INGESTED_METRIC_NAME,
          Value: 2,
        }],
      });
    });
  });
});
