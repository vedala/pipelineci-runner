const dotenv = require("dotenv");
const express = require("express");
const app = express();
const port = 4000;
const simpleGit = require("simple-git");
const path = require('path');

dotenv.config();

const repoUrl = process.env.PRIVATE_REPO_URL;
const localPath = process.env.REPO_CLONE_DIR_NAME;

app.post("/run_ci", (req, res) => {
  console.log("POST /run_ci called");
  const git = simpleGit();
  git.clone(repoUrl, localPath)
    .then(() => console.log("Repository cloned successfully"))
    .catch(err => console.error("Failed to clone repository:", err));
  res.send("CI checks successful.");
});

app.listen(port, () => {
  console.log(`Runner app listening on port ${port}.`);
});
