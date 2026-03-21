import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../logging/Logger.js';
class SubAgentToolClient {
    #client;
    #transport;
    #url;
    #name;
    #tools;
    #connected;
    #onElicit;
    constructor({ url, name = 'sub-agent' }) {
        this.#url = url;
        this.#name = name;
        this.#tools = new Map();
        this.#connected = false;
        this.#client = null;
        this.#transport = null;
        this.#onElicit = null;
    }
    async connect({ onElicit } = {}) {
        this.#onElicit = onElicit || null;
        this.#transport = new StreamableHTTPClientTransport(new URL(this.#url));
        this.#client = new Client({ name: `main-agent-client-${this.#name}`, version: '1.0.0' }, { capabilities: {} });
        if (this.#onElicit) {
            const elicitCallback = this.#onElicit;
            this.#client.setRequestHandler(ElicitRequestSchema, async (request) => {
                const { message, requestedSchema } = request.params;
                Logger.debug('SubAgentToolClient', `Elicitation request from sub-agent "${this.#name}": ${message}`);
                const response = await elicitCallback({ message, requestedSchema });
                return {
                    action: response.action,
                    content: response.content
                };
            });
        }
        await this.#client.connect(this.#transport);
        this.#connected = true;
        const { tools } = await this.#client.listTools();
        tools
            .forEach((tool) => {
            const { name, description, inputSchema } = tool;
            this.#tools.set(name, { name, description, inputSchema });
        });
        return { tools: tools.length };
    }
    async listTools() {
        if (!this.#connected) {
            await this.connect();
        }
        const tools = [...this.#tools.values()];
        return { tools };
    }
    async callTool({ name, arguments: args }) {
        if (!this.#connected) {
            await this.connect();
        }
        const tool = this.#tools.get(name);
        if (!tool) {
            return {
                content: [{ type: 'text', text: `Error: Unknown tool "${name}" on sub-agent "${this.#name}"` }],
                isError: true
            };
        }
        try {
            const result = await this.#client.callTool({ name, arguments: args });
            return result;
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Error calling sub-agent "${this.#name}" tool "${name}": ${error.message}` }],
                isError: true
            };
        }
    }
    async close() {
        if (this.#client) {
            try {
                await this.#client.close();
            }
            catch {
                // Ignore close errors
            }
        }
        this.#connected = false;
    }
}
export { SubAgentToolClient };
//# sourceMappingURL=SubAgentToolClient.js.map