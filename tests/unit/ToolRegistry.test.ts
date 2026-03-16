import { describe, test, expect, vi } from 'vitest'


const { mockLoadSchema, mockPrepareServerTool } = vi.hoisted( () => {
    return {
        mockLoadSchema: vi.fn().mockResolvedValue( { main: { version: '3.0.0', namespace: 'mock', tools: {} }, handlerMap: {} } ),
        mockPrepareServerTool: vi.fn()
    }
} )

vi.mock( 'flowmcp', () => {
    return {
        FlowMCP: {
            loadSchema: mockLoadSchema,
            prepareServerTool: mockPrepareServerTool
        }
    }
} )

import { ToolRegistry } from '../../src/registry/ToolRegistry.js'


const createToolConfigs = () => {
    return [
        {
            name: 'defi-research',
            description: 'Research DeFi protocols',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string' }
                },
                required: [ 'query' ]
            },
            agent: {
                systemPrompt: 'You are a DeFi agent.',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 10,
                maxTokens: 4096
            },
            toolSources: [
                {
                    type: 'flowmcp',
                    schemaPaths: [ '/schemas/defilama.mjs' ],
                    serverParams: { DEFILAMA_KEY: 'test-key' }
                }
            ],
            execution: {
                taskSupport: 'optional',
                timeoutMs: 120000
            }
        },
        {
            name: 'price-check',
            description: 'Check token prices',
            inputSchema: {
                type: 'object',
                properties: {
                    token: { type: 'string' }
                },
                required: [ 'token' ]
            },
            agent: {
                systemPrompt: 'You are a price agent.',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 3,
                maxTokens: 2048
            },
            toolSources: [
                {
                    type: 'flowmcp',
                    schemas: [ { name: 'coingecko', routes: { getPrice: {} } } ]
                }
            ]
        }
    ]
}


describe( 'ToolRegistry', () => {
    describe( 'create', () => {
        test( 'creates registry from tool configs', () => {
            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            expect( registry ).toBeDefined()
        } )
    } )


    describe( 'listTools', () => {
        test( 'returns all registered tools in MCP format', () => {
            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            const { tools } = registry.listTools()

            expect( tools ).toHaveLength( 2 )
            expect( tools[ 0 ].name ).toBe( 'defi-research' )
            expect( tools[ 0 ].description ).toBe( 'Research DeFi protocols' )
            expect( tools[ 0 ].inputSchema ).toBeDefined()
        } )


        test( 'includes execution property when present', () => {
            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            const { tools } = registry.listTools()
            const defiTool = tools
                .find( ( t: { name: string } ) => t.name === 'defi-research' )

            expect( defiTool.execution ).toEqual( {
                taskSupport: 'optional',
                timeoutMs: 120000
            } )
        } )


        test( 'omits execution property when not present', () => {
            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            const { tools } = registry.listTools()
            const priceTool = tools
                .find( ( t: { name: string } ) => t.name === 'price-check' )

            expect( priceTool.execution ).toBeUndefined()
        } )


        test( 'returns empty array for no tools', () => {
            const { registry } = ToolRegistry.create( { toolConfigs: [] } )

            const { tools } = registry.listTools()

            expect( tools ).toHaveLength( 0 )
        } )
    } )


    describe( 'getToolConfig', () => {
        test( 'returns full config for existing tool', () => {
            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            const { toolConfig } = registry.getToolConfig( { name: 'defi-research' } )

            expect( toolConfig ).toBeDefined()
            expect( toolConfig.name ).toBe( 'defi-research' )
            expect( toolConfig.agent.systemPrompt ).toContain( 'DeFi' )
            expect( toolConfig.toolSources ).toHaveLength( 1 )
            expect( toolConfig.toolSources[ 0 ].type ).toBe( 'flowmcp' )
        } )


        test( 'returns null for unknown tool', async () => {
            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            const { toolConfig } = registry.getToolConfig( { name: 'nonexistent' } )

            expect( toolConfig ).toBeNull()
        } )
    } )


    describe( 'createToolClient', () => {
        test( 'creates InProcessToolClient for flowmcp source', async () => {
            mockPrepareServerTool.mockReset()

            mockPrepareServerTool.mockReturnValue( {
                toolName: 'mock_tool',
                description: 'Mock',
                zod: { type: 'object' },
                func: vi.fn()
            } )

            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            const { toolClient } = await registry.createToolClient( { name: 'defi-research' } )

            expect( toolClient ).toBeDefined()
            expect( typeof toolClient.listTools ).toBe( 'function' )
            expect( typeof toolClient.callTool ).toBe( 'function' )
            expect( typeof toolClient.close ).toBe( 'function' )
        } )


        test( 'passes serverParams to InProcessToolClient', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            mockLoadSchema.mockResolvedValue( {
                main: { version: '3.0.0', namespace: 'defilama', tools: { getProtocols: { description: 'Get protocols' } } },
                handlerMap: {}
            } )

            mockPrepareServerTool.mockReturnValue( {
                toolName: 'defilama_tool',
                description: 'DeFi Llama',
                zod: { type: 'object' },
                func: vi.fn()
            } )

            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            await registry.createToolClient( { name: 'defi-research' } )

            expect( mockLoadSchema ).toHaveBeenCalledWith( { filePath: '/schemas/defilama.mjs' } )
            expect( mockPrepareServerTool ).toHaveBeenCalledWith(
                expect.objectContaining( {
                    serverParams: { DEFILAMA_KEY: 'test-key' }
                } )
            )
        } )


        test( 'returns null for unknown tool', async () => {
            const toolConfigs = createToolConfigs()
            const { registry } = ToolRegistry.create( { toolConfigs } )

            const { toolClient } = await registry.createToolClient( { name: 'nonexistent' } )

            expect( toolClient ).toBeNull()
        } )


        test( 'returns null for tool without toolSources', async () => {
            const configWithoutSources = [
                {
                    name: 'empty-tool',
                    description: 'No sources',
                    inputSchema: { type: 'object', properties: {} },
                    agent: { systemPrompt: 'Test', model: 'test', maxRounds: 1, maxTokens: 1024 }
                }
            ]

            const { registry } = ToolRegistry.create( { toolConfigs: configWithoutSources } )

            const { toolClient } = await registry.createToolClient( { name: 'empty-tool' } )

            expect( toolClient ).toBeNull()
        } )


        test( 'creates CompositeToolClient for multiple sources', async () => {
            mockPrepareServerTool.mockReset()

            mockPrepareServerTool.mockReturnValue( {
                toolName: 'mock_tool',
                description: 'Mock',
                zod: { type: 'object' },
                func: vi.fn()
            } )

            const multiSourceConfig = [
                {
                    name: 'multi-tool',
                    description: 'Multi source tool',
                    inputSchema: { type: 'object', properties: {} },
                    agent: { systemPrompt: 'Test', model: 'test', maxRounds: 1, maxTokens: 1024 },
                    toolSources: [
                        { type: 'flowmcp', schemas: [ { name: 'api-a', routes: { getA: {} } } ] },
                        { type: 'flowmcp', schemas: [ { name: 'api-b', routes: { getB: {} } } ] }
                    ]
                }
            ]

            const { registry } = ToolRegistry.create( { toolConfigs: multiSourceConfig } )

            const { toolClient } = await registry.createToolClient( { name: 'multi-tool' } )

            expect( toolClient ).toBeDefined()
            expect( typeof toolClient.listTools ).toBe( 'function' )
            expect( typeof toolClient.callTool ).toBe( 'function' )
            expect( typeof toolClient.close ).toBe( 'function' )
        } )


        test( 'skips unknown source types', async () => {
            const unknownSourceConfig = [
                {
                    name: 'unknown-source-tool',
                    description: 'Unknown source',
                    inputSchema: { type: 'object', properties: {} },
                    agent: { systemPrompt: 'Test', model: 'test', maxRounds: 1, maxTokens: 1024 },
                    toolSources: [
                        { type: 'redis', connection: 'redis://localhost' }
                    ]
                }
            ]

            const { registry } = ToolRegistry.create( { toolConfigs: unknownSourceConfig } )

            const { toolClient } = await registry.createToolClient( { name: 'unknown-source-tool' } )

            expect( toolClient ).toBeNull()
        } )
    } )
} )
