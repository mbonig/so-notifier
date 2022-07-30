const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.34.2',
  defaultReleaseBranch: 'main',
  name: 'so-notifier',
  projenrcTs: true,

  deps: [
    'axios',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-sqs',
    '@aws-sdk/lib-dynamodb',
    'aws-sdk-client-mock',
  ],
  // description: undefined,      /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],                 /* Build dependencies for this module. */
  // packageName: undefined,      /* The "name" in package.json. */
  // release: undefined,          /* Add release management to this project. */
});
project.synth();
