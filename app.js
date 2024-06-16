const express = require("express");
const app = express();
const port = 4000;

app.get("/", (req, res) => {
  res.send("Working!");
});

app.listen(port, () => {
  console.log(`Runner app listening on port ${port}.`);
});
