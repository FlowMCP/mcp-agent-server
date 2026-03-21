import type { AgentToolsServer } from '../AgentToolsServer.js';
declare class A2AAdapter {
    #private;
    constructor({ agentCard, requestHandler }: {
        agentCard: any;
        requestHandler: any;
    });
    static from({ mcp, manifest, serverUrl }: {
        mcp: AgentToolsServer;
        manifest: Record<string, any>;
        serverUrl?: string;
    }): A2AAdapter;
    agentCardMiddleware(): (_req: any, res: any) => void;
    handler(): any;
    getAgentCard(): {
        agentCard: any;
    };
}
export { A2AAdapter };
//# sourceMappingURL=A2AAdapter.d.ts.map