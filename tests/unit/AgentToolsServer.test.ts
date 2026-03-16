import { describe, test, expect, vi, beforeEach } from 'vitest'


const mockServerConnect = vi.fn()
const mockSetRequestHandler = vi.fn()

vi.mock( '@modelcontextprotocol/sdk/server/index.js', () => {
    return {
        Server: class MockServer {
            info: unknown
            options: unknown
            connect: ReturnType<typeof vi.fn>
            setRequestHandler: ReturnType<typeof vi.fn>

            constructor( info: unknown, options: unknown ) {
                this.info = info
                this.options = options
                this.connect = mockServerConnect
                this.setRequestHandler = mockSetRequestHandler
            }
        }
    }
} )

vi.mock( '@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
    return {
        StreamableHTTPServerTransport: class MockTransport {
            opts: unknown
            handleRequest: ReturnType<typeof vi.fn>
            close: ReturnType<typeof vi.fn>

            constructor( opts: unknown ) {
                this.opts = opts
                this.handleRequest = vi.fn()
                this.close = vi.fn()
            }
        }
    }
} )

vi.mock( '@modelcontextprotocol/sdk/types.js', () => {
    return {
        ListToolsRequestSchema: 'ListToolsRequestSchema',
        CallToolRequestSchema: 'CallToolRequestSchema',
        GetTaskRequestSchema: 'GetTaskRequestSchema',
        GetTaskPayloadRequestSchema: 'GetTaskPayloadRequestSchema'
    }
} )

vi.mock( '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js', () => {
    return {
        InMemoryTaskStore: class MockTaskStore {
            createTask: ReturnType<typeof vi.fn>
            getTask: ReturnType<typeof vi.fn>
            getTaskResult: ReturnType<typeof vi.fn>
            storeTaskResult: ReturnType<typeof vi.fn>

            constructor() {
                this.createTask = vi.fn()
                this.getTask = vi.fn()
                this.getTaskResult = vi.fn()
                this.storeTaskResult = vi.fn()
            }
        }
    }
} )

vi.mock( '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js', () => {
    return {
        isTerminal: vi.fn( ( status: string ) => status === 'completed' || status === 'failed' || status === 'cancelled' )
    }
} )

const mockPrepareServerTool = vi.fn().mockReturnValue( {
    toolName: 'mock_tool',
    description: 'Mock',
    zod: { type: 'object' },
    func: vi.fn()
} )

vi.mock( 'flowmcp', () => {
    return {
        FlowMCP: {
            prepareServerTool: mockPrepareServerTool
        }
    }
} )

import { AgentToolsServer } from '../../src/AgentToolsServer.js'


const testConfig = {
    name: 'Test Agent Server',
    version: '1.0.0',
    routePath: '/mcp',
    llm: {
        baseURL: 'https://openrouter.ai/api',
        apiKey: 'test-key'
    },
    tools: [
        {
            name: 'test-research',
            description: 'Test research tool',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string' }
                },
                required: [ 'query' ]
            },
            agent: {
                systemPrompt: 'You are a test agent.',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 5,
                maxTokens: 2048
            },
            toolSources: [
                { type: 'flowmcp', schemas: [], serverParams: {} }
            ],
            execution: {
                taskSupport: 'optional'
            }
        },
        {
            name: 'simple-tool',
            description: 'Simple tool without execution',
            inputSchema: {
                type: 'object',
                properties: {
                    input: { type: 'string' }
                },
                required: [ 'input' ]
            },
            agent: {
                systemPrompt: 'You are a simple agent.',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 3,
                maxTokens: 1024
            },
            toolSources: [
                { type: 'flowmcp', schemas: [], serverParams: {} }
            ]
        }
    ]
}


describe( 'AgentToolsServer', () => {
    beforeEach( () => {
        mockServerConnect.mockReset()
        mockSetRequestHandler.mockReset()
        mockPrepareServerTool.mockClear()

        mockPrepareServerTool.mockReturnValue( {
            toolName: 'mock_tool',
            description: 'Mock',
            zod: { type: 'object' },
            func: vi.fn()
        } )
    } )


    describe( 'create', () => {
        test( 'returns mcp instance in object', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )

            expect( mcp ).toBeDefined()
        } )


        test( 'uses default routePath when not specified', async () => {
            const configWithoutRoute = { ...testConfig }
            delete ( configWithoutRoute as Record<string, unknown> ).routePath

            const { mcp } = await AgentToolsServer.create( configWithoutRoute )

            expect( mcp ).toBeDefined()
        } )
    } )


    describe( 'listToolDefinitions', () => {
        test( 'returns all configured tools', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )

            const { tools } = mcp.listToolDefinitions()

            expect( tools ).toHaveLength( 2 )
            expect( tools[ 0 ].name ).toBe( 'test-research' )
            expect( tools[ 1 ].name ).toBe( 'simple-tool' )
        } )


        test( 'includes execution property for tools that have it', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )

            const { tools } = mcp.listToolDefinitions()
            const researchTool = tools
                .find( ( t: { name: string } ) => t.name === 'test-research' )

            expect( researchTool.execution ).toEqual( { taskSupport: 'optional' } )
        } )
    } )


    describe( 'middleware', () => {
        test( 'returns a middleware function', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )

            const mcpMiddleware = mcp.middleware()

            expect( typeof mcpMiddleware ).toBe( 'function' )
        } )


        test( 'calls next for non-matching paths', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = { path: '/other', method: 'POST' }
            const res = {}
            const next = vi.fn()

            await mcpMiddleware( req, res, next )

            expect( next ).toHaveBeenCalledTimes( 1 )
        } )


        test( 'handles POST initialize request', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'POST',
                headers: {},
                body: { jsonrpc: '2.0', method: 'initialize', id: 1 }
            }

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                headersSent: false
            }

            const next = vi.fn()

            await mcpMiddleware( req, res, next )

            expect( next ).not.toHaveBeenCalled()
            expect( mockServerConnect ).toHaveBeenCalledTimes( 1 )
            expect( mockSetRequestHandler ).toHaveBeenCalledTimes( 4 )
        } )


        test( 'registers four request handlers on MCP Server', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'POST',
                headers: {},
                body: { jsonrpc: '2.0', method: 'initialize', id: 1 }
            }

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, vi.fn() )

            const handlerSchemas = mockSetRequestHandler.mock.calls
                .map( ( call: unknown[] ) => call[ 0 ] )

            expect( handlerSchemas ).toContain( 'ListToolsRequestSchema' )
            expect( handlerSchemas ).toContain( 'CallToolRequestSchema' )
            expect( handlerSchemas ).toContain( 'GetTaskRequestSchema' )
            expect( handlerSchemas ).toContain( 'GetTaskPayloadRequestSchema' )
        } )


        test( 'returns 400 for POST without session and non-initialize body', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'POST',
                headers: {},
                body: { jsonrpc: '2.0', method: 'tools/list', id: 1 }
            }

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, vi.fn() )

            expect( res.status ).toHaveBeenCalledWith( 400 )
            expect( res.json ).toHaveBeenCalledWith(
                expect.objectContaining( {
                    jsonrpc: '2.0',
                    error: expect.objectContaining( { code: -32000 } )
                } )
            )
        } )


        test( 'returns 400 for GET without valid session', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'GET',
                headers: {}
            }

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            }

            await mcpMiddleware( req, res, vi.fn() )

            expect( res.status ).toHaveBeenCalledWith( 400 )
        } )


        test( 'returns 400 for DELETE without valid session', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'DELETE',
                headers: {}
            }

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            }

            await mcpMiddleware( req, res, vi.fn() )

            expect( res.status ).toHaveBeenCalledWith( 400 )
        } )


        test( 'calls next for unsupported HTTP methods on route', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'PUT',
                headers: {}
            }

            const res = {}
            const next = vi.fn()

            await mcpMiddleware( req, res, next )

            expect( next ).toHaveBeenCalledTimes( 1 )
        } )


        test( 'ListTools handler returns all tools', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'POST',
                headers: {},
                body: { jsonrpc: '2.0', method: 'initialize', id: 1 }
            }

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, vi.fn() )

            const listToolsHandler = mockSetRequestHandler.mock.calls
                .find( ( call: unknown[] ) => call[ 0 ] === 'ListToolsRequestSchema' )[ 1 ]

            const result = await listToolsHandler()

            expect( result.tools ).toHaveLength( 2 )
            expect( result.tools[ 0 ].name ).toBe( 'test-research' )
            expect( result.tools[ 1 ].name ).toBe( 'simple-tool' )
        } )


        test( 'CallTool handler returns error for unknown tool', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )
            const mcpMiddleware = mcp.middleware()

            const req = {
                path: '/mcp',
                method: 'POST',
                headers: {},
                body: { jsonrpc: '2.0', method: 'initialize', id: 1 }
            }

            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, vi.fn() )

            const callToolHandler = mockSetRequestHandler.mock.calls
                .find( ( call: unknown[] ) => call[ 0 ] === 'CallToolRequestSchema' )[ 1 ]

            const result = await callToolHandler(
                { params: { name: 'nonexistent', arguments: {} } },
                { requestId: 'req-1', sessionId: 'sess-1' }
            )

            expect( result.isError ).toBe( true )
            expect( result.content[ 0 ].text ).toContain( 'Unknown tool' )
        } )
    } )
} )
