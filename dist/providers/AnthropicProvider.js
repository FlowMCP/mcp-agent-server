import Anthropic from '@anthropic-ai/sdk';
class AnthropicProvider {
    #client;
    constructor({ baseURL, apiKey }) {
        const config = {};
        if (baseURL) {
            config.baseURL = baseURL;
        }
        if (apiKey) {
            config.apiKey = apiKey;
        }
        this.#client = new Anthropic(config);
    }
    static create({ baseURL, apiKey }) {
        const provider = new AnthropicProvider({ baseURL, apiKey });
        return { provider };
    }
    async complete({ model, maxTokens, system, tools, messages }) {
        const response = await this.#client.messages.create({
            model,
            max_tokens: maxTokens,
            system,
            tools: tools,
            messages
        });
        const textBlocks = response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text);
        const toolCalls = response.content
            .filter((block) => block.type === 'tool_use')
            .map((block) => ({ id: block.id, name: block.name, input: block.input }));
        return {
            textBlocks,
            toolCalls,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            stopReason: response.stop_reason || ''
        };
    }
}
export { AnthropicProvider };
//# sourceMappingURL=AnthropicProvider.js.map