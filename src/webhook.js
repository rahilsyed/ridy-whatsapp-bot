// src/webhook.js
const express = require("express");
const router = express.Router();
const { handleMessage } = require("./flows/bookingFlow");
const { isDuplicateMessage } = require("./store/sessionStore");

// Verification
router.get("/", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// Incoming messages
router.post("/", async (req, res) => {
  const entry = req.body.entry?.[0];
  const msg = entry?.changes?.[0]?.value?.messages?.[0];

  // Ack immediately: if we wait for the full flow (login/geocode/vehicle
  // lookups/Meta sends) before responding, WhatsApp can time out and
  // redeliver the same message, which then gets reprocessed against a
  // session that has already moved on (e.g. a stale pickup location
  // reapplied on top of a newer one).
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

module.exports = router;