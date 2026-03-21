import type { ToolClient, StatusUpdate, JSONSchema, RoundLogCallback, LLMProvider, ElicitCallback, ElicitationConfig } from '../types/index.js';
declare class AgentLoop {
    #private;
    static start({ query, toolClient, systemPrompt, model, maxRounds, maxTokens, onStatus, onRoundLog, onElicit, elicitationConfig, baseURL, apiKey, llmProvider, answerSchema, discovery }: {
        query: string;
        toolClient: ToolClient;
        systemPrompt: string;
        model: string;
        maxRounds: number;
        maxTokens: number;
        onStatus?: (params: StatusUpdate) => void;
        onRoundLog?: RoundLogCallback;
        onElicit?: ElicitCallback;
        elicitationConfig?: ElicitationConfig;
        baseURL?: string;
        apiKey?: string;
        llmProvider?: LLMProvider;
        answerSchema?: JSONSchema | null;
        discovery?: boolean;
    }): Promise<{
        result: {
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
        };
    } | {
        result: {
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
    } | undefined>;
}
export { AgentLoop };
//# sourceMappingURL=AgentLoop.d.ts.map