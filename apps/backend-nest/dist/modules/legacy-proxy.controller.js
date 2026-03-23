"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyProxyController = void 0;
const common_1 = require("@nestjs/common");
let LegacyProxyController = class LegacyProxyController {
    async proxy(req, res) {
        const legacy = process.env.LEGACY_SERVER_URL || "http://localhost:3000";
        const path = req.originalUrl || "/";
        const target = `${legacy}${path}`;
        const method = req.method.toUpperCase();
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === "string" && k.toLowerCase() !== "host")
                headers[k] = v;
        }
        const bodyAllowed = !["GET", "HEAD"].includes(method);
        const body = bodyAllowed ? req.body : undefined;
        const response = await fetch(target, {
            method,
            headers,
            body: bodyAllowed ? JSON.stringify(body ?? {}) : undefined
        }).catch(() => null);
        if (!response) {
            throw new common_1.HttpException("Legacy server unavailable", common_1.HttpStatus.BAD_GATEWAY);
        }
        res.status(response.status);
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "transfer-encoding")
                return;
            res.setHeader(key, value);
        });
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return res.send(await response.text());
        }
        const arr = await response.arrayBuffer();
        return res.send(Buffer.from(arr));
    }
};
exports.LegacyProxyController = LegacyProxyController;
__decorate([
    (0, common_1.All)(["api/:path*", ":path*"]),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], LegacyProxyController.prototype, "proxy", null);
exports.LegacyProxyController = LegacyProxyController = __decorate([
    (0, common_1.Controller)()
], LegacyProxyController);
//# sourceMappingURL=legacy-proxy.controller.js.map