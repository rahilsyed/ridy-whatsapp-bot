"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDuplicateMessage = exports.deleteSession = exports.setSession = exports.getSession = void 0;
// src/store/sessionStore.js
const Redis = require("ioredis");
const redis = new Redis("redis://127.0.0.1:6379");
const getSession = async (phone) => {
    const data = await redis.get(phone);
    return data ? JSON.parse(data) : null;
};
exports.getSession = getSession;
const setSession = async (phone, session) => {
    await redis.set(phone, JSON.stringify(session), "EX", 3600);
};
exports.setSession = setSession;
const deleteSession = async (phone) => {
    await redis.del(phone);
};
exports.deleteSession = deleteSession;
// Returns true if this WhatsApp message id was already processed (e.g. Meta
// redelivered the webhook because our response wasn't fast enough).
const isDuplicateMessage = async (msgId) => {
    if (!msgId)
        return false;
    const set = await redis.set(`msgid:${msgId}`, "1", "EX", 86400, "NX");
    return set === null;
};
exports.isDuplicateMessage = isDuplicateMessage;
//# sourceMappingURL=sessionStore.js.map