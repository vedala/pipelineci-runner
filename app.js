import dotenv from "dotenv";
import { App } from "octokit";
import { Octokit } from "@octokit/core";
import * as tar from 'tar';
import { writeFile } from "fs/promises";
import { Readable } from "stream";
import { exec } from "child_process";
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";

dotenv.config();

const appId = process.env.GITHUB_APP_IDENTIFIER;
const webhookSecret = process.env.WEBHOOK_SECRET;
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

// const ghApp = new App({
//   appId: appId,
//   privateKey: privateKey,
//   webhooks: {
//     secret: webhookSecret
//   },
// });

// function sleep(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

console.log("POST /run_ci called");

const installationToken = process.env.INSTALLATION_TOKEN;
// const eventPayload = req.body.payload;
const repoOwner = process.env.REPO_OWNER;
const repoToClone = process.env.REPO_NAME;
const branch = process.env.REPO_BRANCH;

const octokitClient = new Octokit({
  auth: installationToken
});

const ghAppResponse = await octokitClient.request("GET /repos/{owner}/{repo}/tarball/{ref}", {
  owner: repoOwner,
  repo: repoToClone,
  ref: branch,
  headers: {
    'X-GitHub-Api-Version': '2022-11-28'
  }
});

console.log("ghAppResponse=", ghAppResponse);

const headerContentDisposition = ghAppResponse.headers['content-disposition'];
const tarballFileName = headerContentDisposition.replace(/^.*filename=/, "");

const urlToDownload = ghAppResponse.url;

let executionStatus;

console.log("Downloading", urlToDownload);
try {
  const downloadResponse = await fetch(urlToDownload);
  const downloadBody = Readable.fromWeb(downloadResponse.body);
  await writeFile(tarballFileName, downloadBody);
  console.log("Download done");

  await tar.extract(
    {
      f: tarballFileName
    }
  ).then( _ => { console.log("tarball has been dumped in cwd") })

  const filenameNoExtension = tarballFileName.replace(/.tar.gz$/, "");
  try {
    exec(`cd ${filenameNoExtension}; ./pipelineci.sh`);
    console.log("./pipelineci.sh executed successfully.")
  } catch(e) {
    console.log("./pipelineci.sh execution failed.")
    console.log("error=", e.message);
  }

  executionStatus = "success";

  // console.log("Sleeping for 20 seconds");
  // await sleep(20000);
  // console.log("Sleeping done");

  // await octokitClient.request("POST /repos/{owner}/{repo}/statuses/{sha}", {
  //   owner: repoOwner,
  //   repo: repoToClone,
  //   sha: eventPayload.pull_request.head.sha,
  //   state: "success",
  //   target_url: 'https://example.com/build/status',
  //   description: 'Description from app.js',
  //   context: 'ci-update/status-update',
  //   headers: {
  //     "x-github-api-version": "2022-11-28",
  //   },
  // });

} catch (e) {
  console.log("Download failed");
  console.log(e.message);
  executionStatus = "failure"
}

console.log("Execution status: ", executionStatus);

// res.send("CI checks successful.");

const receiveMessages = async () => {
  const params = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 10,
  };

  try {
    const result = await sqsClient.send(new ReceiveMessageCommand(params));
    if (result.Messages) {
      result.Messages.forEach((message) => {
          console.log('Message received:', message.Body);

          // Process the message here
          // ...

          // Delete the message after processing (optional)
          deleteMessage(message.ReceiptHandle);
      });
  } else {
      console.log('No messages received');
  }
  } catch (error) {
    console.error('Error receiving messages:', error);
  }
}

const deleteMessage = async (receiptHandle) => {
  const params = {
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  };

  try {
    await SQSClient.send(new DeleteMessageCommand(params));
    console.log('Message deleted successfully');
  } catch (error) {
    console.error('Error deleting message:', error);
  }
}

receiveMessages();
