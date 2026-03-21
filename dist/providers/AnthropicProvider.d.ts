import type { LLMProvider, LLMResponse } from '../types/index.js';
declare class AnthropicProvider implements LLMProvider {
    #private;
    constructor({ baseURL, apiKey }: {
        baseURL: string;
        apiKey: string;
    });
    static create({ baseURL, apiKey }: {
        baseURL: string;
        apiKey: string;
    }): {
        provider: AnthropicProvider;
    };
    complete({ model, maxTokens, system, tools, messages }: {
        model: string;
        maxTokens: number;
        system: string;
        tools: any[];
        messages: any[];
    }): Promise<LLMResponse>;
}
export { AnthropicProvider };
//# sourceMappingURL=AnthropicProvider.d.ts.map