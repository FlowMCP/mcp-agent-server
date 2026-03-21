import type { ToolClient, Tool, ToolResult } from '../types/index.js';
declare class CompositeToolClient implements ToolClient {
    #private;
    constructor({ clients }: {
        clients: ToolClient[];
    });
    listTools(): Promise<{
        tools: Tool[];
    }>;
    callTool({ name, arguments: args }: {
        name: string;
        arguments: Record<string, unknown>;
    }): Promise<ToolResult>;
    close(): Promise<void>;
}
export { CompositeToolClient };
//# sourceMappingURL=CompositeToolClient.d.ts.map