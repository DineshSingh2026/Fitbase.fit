import {
  All,
  Controller,
  Req,
  Res,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { Request, Response } from "express";

@Controller()
export class LegacyProxyController {
  @All(["api/:path*", ":path*"])
  async proxy(@Req() req: Request, @Res() res: Response) {
    const legacy = process.env.LEGACY_SERVER_URL || "http://localhost:3000";
    const path = req.originalUrl || "/";
    const target = `${legacy}${path}`;

    const method = req.method.toUpperCase();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string" && k.toLowerCase() !== "host") headers[k] = v;
    }

    const bodyAllowed = !["GET", "HEAD"].includes(method);
    const body = bodyAllowed ? (req as any).body : undefined;

    const response = await fetch(target, {
      method,
      headers,
      body: bodyAllowed ? JSON.stringify(body ?? {}) : undefined
    }).catch(() => null);

    if (!response) {
      throw new HttpException("Legacy server unavailable", HttpStatus.BAD_GATEWAY);
    }

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return res.send(await response.text());
    }
    const arr = await response.arrayBuffer();
    return res.send(Buffer.from(arr));
  }
}
