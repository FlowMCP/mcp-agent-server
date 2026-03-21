import type { ToolClient, ElicitCallback } from '../types/index.js';
declare class ToolRegistry {
    #private;
    constructor({ tools }: {
        tools: Map<string, any>;
    });
    static create({ toolConfigs }: {
        toolConfigs: any[];
    }): {
        registry: ToolRegistry;
    };
    listTools(): {
        tools: Record<string, any>[];
    };
    getToolConfig({ name }: {
        name: string;
    }): {
        toolConfig: any;
    };
    createToolClient({ name, onElicit }: {
        name: string;
        onElicit?: ElicitCallback;
    }): Promise<{
        toolClient: ToolClient | null;
    }>;
    static fromManifest({ manifest, toolSources }: {
        manifest: Record<string, any>;
        toolSources: any[];
    }): {
        toolConfig: {
            name: string;
            description: string;
            inputSchema: any;
            agent: {
                systemPrompt: string;
                model: string;
                maxRounds: number;
                maxTokens: number;
            };
            toolSources: any[];
            elicitation: any;
            _manifest: Record<string, any>;
        };
    };
}
export { ToolRegistry };
//# sourceMappingURL=ToolRegistry.d.ts.map