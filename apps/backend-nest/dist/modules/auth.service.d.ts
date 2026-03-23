import { JwtPayload } from "./auth.types";
export declare class AuthService {
    private get secret();
    sign(payload: JwtPayload): string;
    verify(token: string): JwtPayload;
}
