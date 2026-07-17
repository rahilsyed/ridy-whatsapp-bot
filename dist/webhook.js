"use strict";
// src/webhook.js
// const express = require("express");
// const router = express.Router();
// const { handleMessage } = require("./flows/bookingFlow");
// const { isDuplicateMessage } = require("./store/sessionStore");
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const sessionStore_1 = require("./store/sessionStore");
const bookingFlow_1 = require("./flows/bookingFlow");
const router = (0, express_1.Router)();
// Verifies that POST bodies actually came from Meta, using the app secret
// (Meta App Dashboard → Settings → Basic → App Secret), not the access token.
// Without this, anyone who finds the URL can POST fake WhatsApp messages.
function verifySignature(req, res, next) {
    const signature = req.get("x-hub-signature-256");
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
        console.error("[webhook] META_APP_SECRET is not set — refusing request");
        return res.sendStatus(500);
    }
    if (!signature) {
        return res.sendStatus(401);
    }
    const expected = `sha256=${crypto_1.default
        .createHmac("sha256", appSecret)
        .update(req.rawBody || Buffer.alloc(0))
        .digest("hex")}`;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto_1.default.timingSafeEqual(a, b)) {
        return res.sendStatus(401);
    }
    next();
}
// Verification
router.get("/", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});
router.get("/health", (req, res) => {
    if (req) {
        res.send("ok");
    }
});
router.post("/", verifySignature, async (req, res) => {
    const entry = req.body.entry?.[0];
    const msg = entry?.changes?.[0]?.value?.messages?.[0];
    res.sendStatus(200);
    if (!msg)
        return;
    try {
        if (await (0, sessionStore_1.isDuplicateMessage)(msg.id)) {
            console.log("[webhook] duplicate delivery, skipping:", msg.id);
            return;
        }
        const phone = msg.from;
        await (0, bookingFlow_1.handleMessage)(phone, msg);
    }
    catch (err) {
        console.error(err);
    }
});
exports.default = router;
//# sourceMappingURL=webhook.js.map