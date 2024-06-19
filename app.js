import dotenv from "dotenv";
import { App } from "octokit";
import express from "express";
import fs from "fs";
import simpleGit from "simple-git";
import path from 'path';

const app = express();
const port = 4000;

dotenv.config();

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

console.log("ghApp=", ghApp);
app.post("/run_ci", async (req, res) => {
  console.log("POST /run_ci called");
  const ghAppResponse = await ghApp.request("GET /repos/{owner}/{repo}/zipball", {
    owner: 'userpipelineci',
    repo: 'private_repo',
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  console("ghAppResponse=", ghAppResponse);
  // const git = simpleGit();
  // git.clone(repoUrl, localPath)
  //   .then(() => console.log("Repository cloned successfully"))
  //   .catch(err => console.error("Failed to clone repository:", err));
  res.send("CI checks successful.");
});

app.listen(port, () => {
  console.log(`Runner app listening on port ${port}.`);
});
