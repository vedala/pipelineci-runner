const express = require("express");
const app = express();
const port = 4000;

app.post("/run_ci", (req, res) => {
  res.send("CI checks successful.");
});

app.listen(port, () => {
  console.log(`Runner app listening on port ${port}.`);
});
