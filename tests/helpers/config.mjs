const testLlmConfig = {
    baseURL: 'https://openrouter.ai/api',
    apiKey: 'test-api-key'
}

const testToolConfig = {
    name: 'test-research',
    description: 'Test research tool',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Research query' },
            tier: { type: 'string', enum: [ 'spark', 'pro', 'deep' ] }
        },
        required: [ 'query' ]
    },
    agent: {
        systemPrompt: 'You are a test research agent.',
        model: 'anthropic/claude-sonnet-4.5',
        maxRounds: 5,
        maxTokens: 2048
    },
    toolSources: [
        {
            type: 'flowmcp',
            schemas: [],
            serverParams: {}
        }
    ],
    execution: {
        taskSupport: 'optional',
        timeoutMs: 60000
    }
}

const testMiddlewareConfig = {
    name: 'Test Agent Server',
    version: '1.0.0',
    routePath: '/mcp',
    llm: testLlmConfig,
    tools: [ testToolConfig ]
}


export { testLlmConfig, testToolConfig, testMiddlewareConfig }
