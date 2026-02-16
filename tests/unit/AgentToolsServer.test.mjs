import { describe, test, expect, jest, beforeEach } from '@jest/globals'


const mockServerConnect = jest.fn()
const mockSetRequestHandler = jest.fn()

jest.unstable_mockModule( '@modelcontextprotocol/sdk/server/index.js', () => {
    return {
        Server: class MockServer {
            constructor( info, options ) {
                this.info = info
                this.options = options
                this.connect = mockServerConnect
                this.setRequestHandler = mockSetRequestHandler
            }
        }
    }
} )

jest.unstable_mockModule( '@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
    return {
        StreamableHTTPServerTransport: class MockTransport {
            constructor( opts ) {
                this.opts = opts
                this.handleRequest = jest.fn()
                this.close = jest.fn()
            }
        }
    }
} )

jest.unstable_mockModule( '@modelcontextprotocol/sdk/types.js', () => {
    return {
        ListToolsRequestSchema: 'ListToolsRequestSchema',
        CallToolRequestSchema: 'CallToolRequestSchema',
        GetTaskRequestSchema: 'GetTaskRequestSchema',
        GetTaskPayloadRequestSchema: 'GetTaskPayloadRequestSchema'
    }
} )

jest.unstable_mockModule( '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js', () => {
    return {
        InMemoryTaskStore: class MockTaskStore {
            constructor() {
                this.createTask = jest.fn()
                this.getTask = jest.fn()
                this.getTaskResult = jest.fn()
                this.storeTaskResult = jest.fn()
            }
        }
    }
} )

jest.unstable_mockModule( '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js', () => {
    return {
        isTerminal: jest.fn( ( status ) => status === 'completed' || status === 'failed' || status === 'cancelled' )
    }
} )

const mockPrepareServerTool = jest.fn().mockReturnValue( {
    toolName: 'mock_tool',
    description: 'Mock',
    zod: { type: 'object' },
    func: jest.fn()
} )

jest.unstable_mockModule( 'flowmcp', () => {
    return {
        FlowMCP: {
            prepareServerTool: mockPrepareServerTool
        }
    }
} )

const { AgentToolsServer } = await import( '../../src/AgentToolsServer.mjs' )


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
            func: jest.fn()
        } )
    } )


    describe( 'create', () => {
        test( 'returns mcp instance in object', async () => {
            const { mcp } = await AgentToolsServer.create( testConfig )

            expect( mcp ).toBeDefined()
        } )


        test( 'uses default routePath when not specified', async () => {
            const configWithoutRoute = { ...testConfig }
            delete configWithoutRoute.routePath

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
                .find( ( t ) => t.name === 'test-research' )

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
            const next = jest.fn()

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
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
                headersSent: false
            }

            const next = jest.fn()

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
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, jest.fn() )

            const handlerSchemas = mockSetRequestHandler.mock.calls
                .map( ( call ) => call[ 0 ] )

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
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, jest.fn() )

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
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }

            await mcpMiddleware( req, res, jest.fn() )

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
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            }

            await mcpMiddleware( req, res, jest.fn() )

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
            const next = jest.fn()

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
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, jest.fn() )

            const listToolsHandler = mockSetRequestHandler.mock.calls
                .find( ( call ) => call[ 0 ] === 'ListToolsRequestSchema' )[ 1 ]

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
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
                headersSent: false
            }

            await mcpMiddleware( req, res, jest.fn() )

            const callToolHandler = mockSetRequestHandler.mock.calls
                .find( ( call ) => call[ 0 ] === 'CallToolRequestSchema' )[ 1 ]

            const result = await callToolHandler(
                { params: { name: 'nonexistent', arguments: {} } },
                { requestId: 'req-1', sessionId: 'sess-1' }
            )

            expect( result.isError ).toBe( true )
            expect( result.content[ 0 ].text ).toContain( 'Unknown tool' )
        } )
    } )
} )
