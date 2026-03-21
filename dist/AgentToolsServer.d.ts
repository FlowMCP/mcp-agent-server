import { EventEmitter } from 'node:events';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { TaskManager } from './task/TaskManager.js';
import type { LLMConfig, ServerConfig } from './types/index.js';
declare class AgentToolsServer extends EventEmitter {
    #private;
    constructor({ config, llmConfig, toolRegistry, taskManager }: {
        config: ServerConfig;
        llmConfig: LLMConfig;
        toolRegistry: ToolRegistry;
        taskManager: TaskManager;
    });
    static fromManifest({ manifest, llm, schemas, serverParams, subAgents, elicitation, routePath }: {
        manifest: Record<string, any>;
        llm: LLMConfig;
        schemas?: any[];
        serverParams?: Record<string, string>;
        subAgents?: Record<string, {
            url: string;
        }>;
        elicitation?: boolean;
        routePath?: string;
    }): Promise<{
        mcp: AgentToolsServer;
    }>;
    static create({ name, version, routePath, llm, tools, tasks, elicitation }: {
        name: string;
        version: string;
        routePath?: string;
        llm: LLMConfig;
        tools: any[];
        tasks?: {
            store?: any;
        };
        elicitation?: boolean;
    }): Promise<{
        mcp: AgentToolsServer;
    }>;
    listToolDefinitions(): {
        tools: Record<string, any>[];
    };
    getToolConfig({ name }: {
        name: string;
    }): {
        toolConfig: any;
    };
    callTool({ name, arguments: args }: {
        name: string;
        arguments: Record<string, unknown>;
    }): Promise<{
        content: {
            type: string;
            text: string;
        }[];
        structuredContent: {
            status: string;
            query: string;
            result: any;
            costs: {
                breakdown: {
                    type: string;
                    name: any;
                    calls: number;
                    duration: any;
                    success: any;
                }[];
            };
            metadata: {
                model: string;
                toolCalls: number;
                llmRounds: number;
                duration: number;
            };
        } | {
            status: string;
            query: string;
            result: {
                text: string;
            };
            costs: {
                inputTokens: number;
                outputTokens: number;
            };
            metadata: {
                model: string;
                toolCalls: number;
                llmRounds: number;
                duration: number;
            };
        };
        isError?: undefined;
    } | {
        content: {
            type: string;
            text: string;
        }[];
        isError: boolean;
    }>;
    middleware(): (req: any, res: any, next: any) => Promise<void>;
    sseMiddleware(): (req: any, res: any, next: any) => void;
}
export { AgentToolsServer };
//# sourceMappingURL=AgentToolsServer.d.ts.map