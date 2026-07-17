"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app.js
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const webhook_1 = __importDefault(require("./webhook"));
const app = (0, express_1.default)();
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
app.use("/webhook", webhook_1.default);
app.listen(process.env.PORT, () => {
    console.log("Server running on port", process.env.PORT);
});
//# sourceMappingURL=app.js.map