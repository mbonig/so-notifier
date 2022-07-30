import { App } from 'aws-cdk-lib';
import { StackOverflowNotifierStack } from './stacks/StackOverflowNotifierStack';

const app = new App();

new StackOverflowNotifierStack(app, 'StackOverflowNotifier', { });

app.synth();
