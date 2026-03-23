import type { Request, Response } from "express";
export declare class LegacyProxyController {
    proxy(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
