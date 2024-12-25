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
import util from "util";

dotenv.config();

const app = express();

const port = process.env.PORT;
const appId = process.env.GITHUB_APP_IDENTIFIER;
const webhookSecret = process.env.WEBHOOK_SECRET;
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

app.use(express.json());
app.use(express.text({ type: "text/plain" }));

app.get("/health", async (req, res) => {
  res.status(200)
  res.send("Runner is alive")
});

const updateStatus = async (octokitClient, repoOwner, repoToClone, sha, executionStatus, statusMessage) => {

  await octokitClient.request("POST /repos/{owner}/{repo}/statuses/{sha}", {
    owner: repoOwner,
    repo: repoToClone,
    sha: sha,
    state: executionStatus,
    target_url: 'https://example.com/build/status',
    description: statusMessage,
    context: 'ci-update/status-update',
    headers: {
      "x-github-api-version": "2022-11-28",
    },
  });

}

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


app.post("/run_ci", async (req, res) => {

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
  } else {
    console.log("Invalid messageType, messageType=", messageType);
    res.status(500).send("Invalid messageType");
  }

  const messageObject = JSON.parse(parsedBody.Message);
  const installationId = messageObject.installationId.toString();
  const repoOwner = messageObject.repoOwner;
  const repoToClone = messageObject.repoToClone;
  const branch = messageObject.branch;
  const sha = messageObject.sha;

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
  let statusMessage;

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
    const execPromise = util.promisify(exec);
    try {
      await execPromise(`cd ${filenameNoExtension}; ./pipelineci.sh`);

      statusMessage = "./pipelineci.sh executed successfully.";
      console.log(statusMessage);
      executionStatus = "success";

    } catch(e) {
      const shortErrMessage = e.message.split("\n")[1];
      statusMessage = `./pipelineci.sh execution failed; Error message: ${shortErrMessage}`;
      console.log(statusMessage);
      executionStatus = "failure";
    }

  } catch (e) {
    statusMessage = `Download failed: Error message: ${e.message}`;
    console.log(statusMessage);
    executionStatus = "failure";
  }

  console.log("Execution status: ", executionStatus);
  await updateStatus(octokitClient, repoOwner, repoToClone, sha, executionStatus, statusMessage);

  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log(`PipelineCI Runner listening on port ${port}`)
})
