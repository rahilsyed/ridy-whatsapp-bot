// src/app.js
require("dotenv").config();
const express = require("express");
const webhook = require("./webhook");

const app = express();
app.use(express.json());

app.use("/webhook", webhook);

app.listen(process.env.PORT, () => {
  console.log("Server running");
});