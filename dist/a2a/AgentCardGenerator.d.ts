declare class AgentCardGenerator {
    #private;
    static generate({ manifest, serverUrl }: {
        manifest: Record<string, any>;
        serverUrl: string;
    }): {
        agentCard: {
            protocolVersion: string;
            name: any;
            description: any;
            url: string;
            capabilities: {
                streaming: boolean;
            };
            defaultInputModes: string[];
            defaultOutputModes: string[];
            skills: any[];
        };
    };
}
export { AgentCardGenerator };
//# sourceMappingURL=AgentCardGenerator.d.ts.map