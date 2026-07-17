// src/webhook.js
// const express = require("express");
// const router = express.Router();
// const { handleMessage } = require("./flows/bookingFlow");
// const { isDuplicateMessage } = require("./store/sessionStore");

import crypto from "crypto";
import { Request, Response, NextFunction, Router } from "express";
import { isDuplicateMessage } from "./store/sessionStore";
import { handleMessage } from "./flows/bookingFlow";
const router = Router();

// Verifies that POST bodies actually came from Meta, using the app secret
// (Meta App Dashboard → Settings → Basic → App Secret), not the access token.
// Without this, anyone who finds the URL can POST fake WhatsApp messages.
function verifySignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.get("x-hub-signature-256");
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    console.error("[webhook] META_APP_SECRET is not set — refusing request");
    return res.sendStatus(500);
  }

  if (!signature) {
    return res.sendStatus(401);
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update((req as any).rawBody || Buffer.alloc(0))
    .digest("hex")}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.sendStatus(401);
  }

  next();
}
// Verification
router.get("/", (req: Request, res: Response) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

router.get("/health", (req :Request, res:Response) => {
    if(req){
        res.send("ok");
    }
});


router.post("/", verifySignature, async (req:Request, res:Response) => {
  const entry = req.body.entry?.[0];
  const msg = entry?.changes?.[0]?.value?.messages?.[0];
  res.sendStatus(200);

  if (!msg) return;

  try {
    if (await isDuplicateMessage(msg.id)) {
      console.log("[webhook] duplicate delivery, skipping:", msg.id);
      return;
    }

    const phone = msg.from;
    await handleMessage(phone, msg);
  } catch (err) {
    console.error(err);
  }
});
export default router
