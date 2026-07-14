// src/store/sessionStore.js
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

exports.getSession = async (phone) => {
  const data = await redis.get(phone);
  return data ? JSON.parse(data) : null;
};

exports.setSession = async (phone, session) => {
  await redis.set(phone, JSON.stringify(session), "EX", 3600);
};

exports.deleteSession = async (phone) => {
  await redis.del(phone);
};

// Returns true if this WhatsApp message id was already processed (e.g. Meta
// redelivered the webhook because our response wasn't fast enough).
exports.isDuplicateMessage = async (msgId) => {
  if (!msgId) return false;
  const set = await redis.set(`msgid:${msgId}`, "1", "EX", 86400, "NX");
  return set === null;
};