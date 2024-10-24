import dotenv from "dotenv";
import { App } from "octokit";
import { Octokit } from "@octokit/core";
import express from "express";
import fs from "fs";
import * as tar from 'tar';
import { writeFile } from "fs/promises";
import { Readable } from "stream";
import { exec } from "child_process";

dotenv.config();

const app = express();
const port = process.env.RUN_ON_PORT;

app.use(express.json());

const appId = process.env.GITHUB_APP_IDENTIFIER;
const webhookSecret = process.env.WEBHOOK_SECRET;
const privateKeyPath = process.env.PRIVATE_KEY_PATH;

const privateKey = fs.readFileSync(privateKeyPath, "utf8");

const ghApp = new App({
  appId: appId,
  privateKey: privateKey,
  webhooks: {
    secret: webhookSecret
  },
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.post("/run_ci", async (req, res) => {
  console.log("POST /run_ci called");

  const installationToken = req.body.token;
  const eventPayload = req.body.payload;
  const repoOwner = eventPayload.repository.owner.login;
  const repoToClone = eventPayload.repository.name;

  const octokitClient = new Octokit({
    auth: installationToken
  });
  const ghAppResponse = await octokitClient.request("GET /repos/{owner}/{repo}/tarball", {
    owner: repoOwner,
    repo: repoToClone,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  console.log("ghAppResponse=", ghAppResponse);

  const headerContentDisposition = ghAppResponse.headers['content-disposition'];
  const tarballFileName = headerContentDisposition.replace(/^.*filename=/, "");

  const urlToDownload = ghAppResponse.url;

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
    } catch(e) {
      console.log("error=", e.message);
      throw new Error(e);
    }

    console.log("Sleeping for 20 seconds");
    await sleep(20000);
    console.log("Sleeping done");

    await octokitClient.request("POST /repos/{owner}/{repo}/statuses/{sha}", {
      owner: repoOwner,
      repo: repoToClone,
      sha: eventPayload.pull_request.head.sha,
      state: "success",
      target_url: 'https://example.com/build/status',
      description: 'Description from app.js',
      context: 'ci-update/status-update',
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    });
  } catch (e) {
    console.log("Download failed");
    console.log(e.message);
  }

  res.send("CI checks successful.");
});

app.listen(port, () => {
  console.log(`Runner app listening on port ${port}.`);
});
