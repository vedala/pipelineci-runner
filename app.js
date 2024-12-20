import dotenv from "dotenv";
import { App } from "octokit";
import { Octokit } from "@octokit/core";
import express from "express";
import axios from "axios";
import * as tar from 'tar';
import { writeFile } from "fs/promises";
import { Readable } from "stream";
import { exec } from "child_process";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

const port = process.env.PORT;
const appId = process.env.GITHUB_APP_IDENTIFIER;
const webhookSecret = process.env.WEBHOOK_SECRET;
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

app.use(express.json());
app.use(express.text({ type: "text/plain" }));

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

const getJwtToken = () => {
  const jwtToken = jwt.sign(
    {
    },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '10m',
      issuer: appId,
    }
  );

  return jwtToken;
}

const getInstallationToken = async (jwtToken, installationId) => {
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;

  const headers = {
    Authorization: `Bearer ${jwtToken}`,
    Accept: 'application/vnd.github+json',
  };

  try {
    const response = await axios.post(url,
      {},
      { headers },
    );
    console.log('Installation Token:', response.data.token);
    return response.data.token;
  } catch (error) {
    console.error('Error fetching installation token:', error.response.data);
    throw error;
  }
}


// app.post("/run_ci", async (req, res) => {
app.post("/", async (req, res) => {

  console.log("POST /run_ci called");

  const messageType = req.headers["x-amz-sns-message-type"];
  console.log("messageType:", messageType);
  console.log("req.body=", req.body);
  const parsedBody = JSON.parse(req.body);

console.log("parsedBody=", parsedBody);

  if (messageType === "SubscriptionConfirmation") {
    const subscribeUrl = parsedBody.SubscribeURL;
    console.log("Confirming subscription:", subscribeUrl);
    // Confirming by making GET request
    await axios.get(subscribeUrl);
    res.status(200).send("OK");
    return;
  } else if (messageType === "Notification") {
    // Handle the notification
    console.log("Received message:", parsedBody.Message);
  }

  const messageObject = JSON.parse(JSON.parse(parsedBody.Message));
  const installationId = messageObject.installationId.toString();
  const repoOwner = messageObject.repoOwner;
  const repoToClone = messageObject.repoToClone;
  const branch = messageObject.branch;

  const jwtToken = getJwtToken();
  const installationToken = await getInstallationToken(jwtToken, installationId);

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

  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log(`PipelineCI Runner listening on port ${port}`)
})
