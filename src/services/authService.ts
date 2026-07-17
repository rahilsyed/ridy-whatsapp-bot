// src/services/authService.js
import axios from "axios";
const api = axios.create({
  baseURL: process.env.BASE_URL,
});

export const login = (phone:any) => {
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

export const verify = async (phone:any, code:any) => {
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