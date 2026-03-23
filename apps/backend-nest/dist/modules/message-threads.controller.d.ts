import type { Response } from "express";
import { Pool } from "pg";
export declare class MessageThreadsController {
    private readonly pool;
    constructor(pool: Pool | null);
    private ensureThreadTables;
    private safeRows;
    listThreads(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    createThread(req: any, body: {
        first_message?: string;
    }, res: Response): Promise<Response<any, Record<string, any>>>;
    getThread(req: any, id: string, res: Response): Promise<Response<any, Record<string, any>>>;
    getThreadMessages(req: any, id: string, res: Response): Promise<Response<any, Record<string, any>>>;
    sendMessage(req: any, id: string, body: {
        body?: string;
    }, res: Response): Promise<Response<any, Record<string, any>>>;
}
