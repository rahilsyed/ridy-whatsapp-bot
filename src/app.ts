// src/app.js
import 'dotenv/config'
import express from 'express';
import webhook from './webhook'
const app = express();
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use("/webhook", webhook);

app.listen(process.env.PORT, () => {
  console.log("Server running on port",process.env.PORT);
});