import { Pool } from "pg";
export declare class HealthController {
    private readonly pool;
    constructor(pool: Pool | null);
    health(): Promise<{
        ok: boolean;
        db: string;
        stack: string;
    }>;
}
