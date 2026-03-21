import { InProcessToolClient } from '../client/InProcessToolClient.js';
import { CompositeToolClient } from '../client/CompositeToolClient.js';
import { SubAgentToolClient } from '../client/SubAgentToolClient.js';
import { Logger } from '../logging/Logger.js';
class ToolRegistry {
    #tools;
    constructor({ tools }) {
        this.#tools = tools;
    }
    static create({ toolConfigs }) {
        const tools = new Map();
        toolConfigs
            .forEach((config) => {
            const { name } = config;
            tools.set(name, config);
        });
        const registry = new ToolRegistry({ tools });
        return { registry };
    }
    listTools() {
        const tools = [...this.#tools.values()]
            .map((config) => {
            const { name, description, inputSchema, execution } = config;
            const entry = { name, description, inputSchema };
            if (execution) {
                entry.execution = execution;
            }
            return entry;
        });
        return { tools };
    }
    getToolConfig({ name }) {
        const toolConfig = this.#tools.get(name) || null;
        return { toolConfig };
    }
    async createToolClient({ name, onElicit }) {
        const { toolConfig } = this.getToolConfig({ name });
        if (!toolConfig) {
            return { toolClient: null };
        }
        const { toolSources } = toolConfig;
        if (!toolSources || toolSources.length === 0) {
            return { toolClient: null };
        }
        const clients = [];
        const clientPromises = toolSources
            .map(async (source) => {
            const client = ToolRegistry.#createClientFromSource({ source });
            if (client && client.connect) {
                await client.connect({ onElicit });
            }
            return client;
        });
        const resolvedClients = await Promise.all(clientPromises);
        resolvedClients
            .filter(Boolean)
            .forEach((client) => { clients.push(client); });
        if (clients.length === 0) {
            return { toolClient: null };
        }
        if (clients.length === 1) {
            const toolClient = clients[0];
            return { toolClient };
        }
        const toolClient = new CompositeToolClient({ clients });
        return { toolClient };
    }
    static fromManifest({ manifest, toolSources }) {
        const agentConfig = {
            systemPrompt: manifest['systemPrompt'],
            model: manifest['model'],
            maxRounds: manifest['maxRounds'],
            maxTokens: manifest['maxTokens']
        };
        const name = manifest['name'];
        const description = manifest['description'];
        const inputSchema = manifest['inputSchema'] || {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Input query for the agent'
                }
            },
            required: ['query']
        };
        const toolConfig = {
            name,
            description,
            inputSchema,
            agent: agentConfig,
            toolSources,
            elicitation: manifest['elicitation'] || undefined,
            _manifest: manifest
        };
        return { toolConfig };
    }
    static async #createClientFromSource({ source }) {
        const { type } = source;
        if (type === 'flowmcp') {
            const { schemaPaths, schemas, serverParams } = source;
            if (schemas && schemas.length > 0) {
                const toolClient = await InProcessToolClient.fromSchemas({
                    schemas,
                    serverParams: serverParams || {}
                });
                return toolClient;
            }
            const toolClient = await InProcessToolClient.create({
                schemaPaths: schemaPaths || [],
                serverParams: serverParams || {}
            });
            return toolClient;
        }
        if (type === 'mcp-remote') {
            const { url, name } = source;
            const toolClient = new SubAgentToolClient({ url, name });
            return toolClient;
        }
        Logger.warn('ToolRegistry', `Unknown tool source type: "${type}" — skipping`);
        return null;
    }
}
export { ToolRegistry };
//# sourceMappingURL=ToolRegistry.js.map