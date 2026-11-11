// src/store/sessionStore.js
import 'dotenv/config'
import Redis from 'ioredis';
// On Vercel there is no local Redis, so a missing REDIS_URL is a config error.
if (!process.env.REDIS_URL && process.env.VERCEL) {
  console.error("[redis] REDIS_URL is not set — add it in Vercel → Settings → Environment Variables and redeploy");
}
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  // Fail a request after a few attempts instead of ~20 s of retries.
  maxRetriesPerRequest: 3,
});
redis.on("error", (err) => console.error("[redis]", err.message));

export const getSession = async (phone: any) => {
  const data = await redis.get(phone);
  return data ? JSON.parse(data) : null;
};

export const setSession = async (phone: any, session: any) => {
  await redis.set(phone, JSON.stringify(session), "EX", 3600);
};

export const deleteSession = async (phone: any) => {
  await redis.del(phone);
};

// Returns true if this WhatsApp message id was already processed (e.g. Meta
// redelivered the webhook because our response wasn't fast enough).
export const isDuplicateMessage = async (msgId: any) => {
  if (!msgId) return false;
  const set = await redis.set(`msgid:${msgId}`, "1", "EX", 86400, "NX");
  return set === null;
};
