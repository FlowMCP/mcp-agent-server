import type { ToolClient, Tool, ToolResult, ElicitCallback } from '../types/index.js';
declare class SubAgentToolClient implements ToolClient {
    #private;
    constructor({ url, name }: {
        url: string;
        name?: string;
    });
    connect({ onElicit }?: {
        onElicit?: ElicitCallback;
    }): Promise<{
        tools: number;
    }>;
    listTools(): Promise<{
        tools: Tool[];
    }>;
    callTool({ name, arguments: args }: {
        name: string;
        arguments: Record<string, unknown>;
    }): Promise<ToolResult>;
    close(): Promise<void>;
}
export { SubAgentToolClient };
//# sourceMappingURL=SubAgentToolClient.d.ts.map