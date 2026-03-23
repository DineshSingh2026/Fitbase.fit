import { Injectable } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { JwtPayload } from "./auth.types";

@Injectable()
export class AuthService {
  private get secret(): string {
    return process.env.JWT_SECRET || "dev-secret-change-me";
  }

  sign(payload: JwtPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: "30d" });
  }

  verify(token: string): JwtPayload {
    return jwt.verify(token, this.secret) as JwtPayload;
  }
}
