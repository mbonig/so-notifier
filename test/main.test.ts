import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StackOverflowNotifierStack } from '../src/stacks/StackOverflowNotifierStack';

test('Snapshot', () => {
  const app = new App();
  const stack = new StackOverflowNotifierStack(app, 'test');

  const assert = Template.fromStack(stack);
  expect(assert.toJSON()).toMatchSnapshot();
});
