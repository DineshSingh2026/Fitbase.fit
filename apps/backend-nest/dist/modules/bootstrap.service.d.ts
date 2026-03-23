import { OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
export declare class BootstrapService implements OnModuleInit {
    private readonly pool;
    constructor(pool: Pool | null);
    onModuleInit(): Promise<void>;
    private ensureUsersTable;
    private ensureOperationalTables;
    private updateSuperadmin;
    private insertSuperadmin;
}
