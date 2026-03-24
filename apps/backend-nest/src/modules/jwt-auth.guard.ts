import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { toUserRole } from "./auth-role.util";
import { JwtPayload } from "./auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = String(req.headers?.authorization || "");
    if (!auth.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const token = auth.slice("Bearer ".length).trim();
    if (!token) throw new UnauthorizedException("Missing bearer token");
    try {
      const payload = this.authService.verify(token) as JwtPayload;
      req.user = {
        ...payload,
        role: toUserRole(payload.role)
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
