import type { RoundLog } from '../types/index.js';
type DebugLevel = 'info' | 'debug' | 'trace';
declare class DebugWriter {
    #private;
    constructor({ agentName, logDir, level }: {
        agentName: string;
        logDir: string;
        level: DebugLevel;
    });
    static create({ agentName, logDir, level }: {
        agentName: string;
        logDir?: string;
        level?: DebugLevel;
    }): {
        writer: DebugWriter;
    };
    onRoundLog(log: RoundLog): void;
    flush(): Promise<{
        jsonlPath: string;
        summaryPath: string;
    }>;
}
export { DebugWriter };
export type { DebugLevel };
//# sourceMappingURL=DebugWriter.d.ts.map