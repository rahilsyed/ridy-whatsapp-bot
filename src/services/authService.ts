// src/services/authService.js
import crypto from "crypto";
import axios from "axios";
const api = axios.create({
  baseURL: process.env.BASE_URL,
});

// Every auth call identifies this bot as an OAuth2 client:
// X-Client-Key = base64("client_id:client_secret"), stored pre-encoded in CLIENT_KEY.
api.interceptors.request.use((config) => {
  const clientKey = process.env.CLIENT_KEY;
  if (!clientKey) {
    throw new Error("CLIENT_KEY must be set in the environment");
  }
  config.headers.set("X-Client-Key", clientKey);
  config.headers.set("X-Request-Id", crypto.randomUUID());
  return config;
});

// WhatsApp sends numbers without "+" (e.g. 919265825711); the API expects E.164.
const toE164 = (phone: string) => (phone.startsWith("+") ? phone : `+${phone}`);

// Sends an OTP to the customer. The returned loginHandle must be passed to verify().
// No Authorization header: the customer has no token until verify() succeeds.
export const login = async (phone: string) => {
  const res = await api.post("/auth/v1/oauth2/login/passwordless/initiate", {
    phone_number: toE164(phone),
  });
  return {
    loginHandle: res.data.login_handle as string,
    expiresAt: res.data.expires_at as string,
  };
};

export const verify = async (loginHandle: string, code: string) => {
  const res = await api.post("/auth/v1/oauth2/login/passwordless/complete", {
    code: code.trim(),
    login_handle: loginHandle,
  });

  const { access_token, refresh_token, expires_in, id } = res.data;
  console.log("[verify] logged in customer:", id);

  return {
    token: access_token as string,
    refreshToken: refresh_token as string,
    customerId: id as string,
    expiresAt: Date.now() + expires_in * 1000,
  };
};
