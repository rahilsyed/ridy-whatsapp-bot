"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verify = exports.login = void 0;
// src/services/authService.js
const axios_1 = __importDefault(require("axios"));
const api = axios_1.default.create({
    baseURL: process.env.BASE_URL,
});
const login = (phone) => {
    return api.post("/customer/auth/login/initiate", { phone }, {
        headers: {
            Authorization: `Bearer ${process.env.SYSTEM_AUTH_TOKEN}`,
        },
    });
};
exports.login = login;
const verify = async (phone, code) => {
    const res = await api.post("/customer/auth/login/complete", {
        phone,
        verificationCode: code,
    }, {
        headers: {
            Authorization: `Bearer ${process.env.SYSTEM_AUTH_TOKEN}`,
        },
    });
    console.log("[verify] full response:", JSON.stringify(res.data, null, 2));
    // ⚠️ adjust after you send actual response
    return {
        token: res.data.data.accessToken,
        customerId: res.data.data.customerId,
    };
};
exports.verify = verify;
//# sourceMappingURL=authService.js.map