const express = require("express");
const app = express();
const port = 4000;
const simpleGit = require("simple-git");
const path = require('path');

app.post("/run_ci", (req, res) => {
  console.log("POST /run_ci called");
  const repoUrl = "https://github.com/userpipelineci/test_repo.git";
  const localPath = path.join(__dirname, "test_repo_here");
  const git = simpleGit();
  git.clone(repoUrl, localPath)
    .then(() => console.log("Repository cloned successfully"))
    .catch(err => console.error("Failed to clone repository:", err));
  res.send("CI checks successful.");
});

app.listen(port, () => {
  console.log(`Runner app listening on port ${port}.`);
});
