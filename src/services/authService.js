// src/services/authService.js
const axios = require("axios");

const api = axios.create({
  baseURL: process.env.BASE_URL,
});

exports.login = (phone) => {
  return api.post(
    "/customer/auth/login/initiate",
    { phone },
    {
      headers: {
        Authorization: `Bearer ${process.env.SYSTEM_AUTH_TOKEN}`,
      },
    }
  );
};

exports.verify = async (phone, code) => {
  const res = await api.post(
    "/customer/auth/login/complete",
    {
      phone,
      verificationCode: code,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SYSTEM_AUTH_TOKEN}`,
      },
    }
  );

  console.log("[verify] full response:", JSON.stringify(res.data, null, 2));

  // ⚠️ adjust after you send actual response
  return {
    token: res.data.data.accessToken,
    customerId: res.data.data.customerId,
  };
};