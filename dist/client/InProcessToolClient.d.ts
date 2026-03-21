import type { ToolClient, Tool, ToolResult } from '../types/index.js';
declare class InProcessToolClient implements ToolClient {
    #private;
    private constructor();
    static create({ schemaPaths, serverParams }: {
        schemaPaths: string[];
        serverParams?: Record<string, string>;
    }): Promise<InProcessToolClient>;
    static fromSchemas({ schemas, serverParams }: {
        schemas: any[];
        serverParams?: Record<string, string>;
    }): Promise<InProcessToolClient>;
    listTools(): Promise<{
        tools: Tool[];
    }>;
    callTool({ name, arguments: args }: {
        name: string;
        arguments: Record<string, unknown>;
    }): Promise<ToolResult>;
    close(): Promise<void>;
}
export { InProcessToolClient };
//# sourceMappingURL=InProcessToolClient.d.ts.map