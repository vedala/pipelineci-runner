import dotenv from "dotenv";
import { App } from "octokit";
import { Octokit } from "@octokit/core";
import express from "express";
import fs from "fs";
import simpleGit from "simple-git";
import path from 'path';
import download from "./download.js";

const app = express();
const port = 4000;

dotenv.config();

app.use(express.json());

const appId = process.env.GITHUB_APP_IDENTIFIER;
const webhookSecret = process.env.WEBHOOK_SECRET;
const privateKeyPath = process.env.PRIVATE_KEY_PATH;
const repoUrl = process.env.PRIVATE_REPO_URL;
const localPath = process.env.REPO_CLONE_DIR_NAME;

const privateKey = fs.readFileSync(privateKeyPath, "utf8");

const ghApp = new App({
  appId: appId,
  privateKey: privateKey,
  webhooks: {
    secret: webhookSecret
  },
});

app.post("/run_ci", async (req, res) => {
  console.log("POST /run_ci called");

  const installationToken = req.body.token;
  const octokitClient = new Octokit({
    auth: installationToken
  });
  const ghAppResponse = await octokitClient.request("GET /repos/{owner}/{repo}/tarball", {
    owner: 'userpipelineci',
    repo: 'private_repo',
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  console.log("ghAppResponse=", ghAppResponse);

  const urlToDownload = ghAppResponse.url;

  console.log("Downloading", urlToDownload);
  try {
    await download(urlToDownload, "myrepo");
    console.log("Download done");
  } catch (e) {
    console.log("Download failed");
    console.log(e.message);
  }

  // const git = simpleGit();
  // git.clone(repoUrl, localPath)
  //   .then(() => console.log("Repository cloned successfully"))
  //   .catch(err => console.error("Failed to clone repository:", err));
  res.send("CI checks successful.");
});

app.listen(port, () => {
  console.log(`Runner app listening on port ${port}.`);
});
