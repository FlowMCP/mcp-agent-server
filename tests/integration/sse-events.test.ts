import { describe, test, expect, vi, beforeEach } from 'vitest'


vi.mock( '@modelcontextprotocol/sdk/server/index.js', () => {
    return {
        Server: class MockServer {
            connect = vi.fn()
            setRequestHandler = vi.fn()

            constructor() {}
        }
    }
} )

vi.mock( '@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
    return {
        StreamableHTTPServerTransport: class MockTransport {
            handleRequest = vi.fn()
            close = vi.fn()

            constructor() {}
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
            createTask = vi.fn()
            getTask = vi.fn()
            getTaskResult = vi.fn()
            storeTaskResult = vi.fn()
        }
    }
} )

vi.mock( '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js', () => {
    return {
        isTerminal: vi.fn( ( status: string ) => status === 'completed' || status === 'failed' )
    }
} )

vi.mock( 'flowmcp', () => {
    return {
        FlowMCP: {
            loadSchema: vi.fn().mockResolvedValue( { main: { version: '3.0.0', namespace: 'mock', tools: {} }, handlerMap: {} } ),
            prepareServerTool: vi.fn().mockReturnValue( {
                toolName: 'mock_tool',
                description: 'Mock',
                zod: { type: 'object' },
                func: vi.fn()
            } )
        }
    }
} )

import { AgentToolsServer } from '../../src/AgentToolsServer.js'


const createServer = async () => {
    const { mcp } = await AgentToolsServer.create( {
        name: 'Integration Test Server',
        version: '1.0.0',
        routePath: '/mcp',
        llm: {
            baseURL: 'https://openrouter.ai/api',
            apiKey: 'test-key'
        },
        tools: [
            {
                name: 'test-tool',
                description: 'Test tool',
                inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: [ 'query' ] },
                agent: { systemPrompt: 'Test', model: 'test/model', maxRounds: 3, maxTokens: 1024 },
                toolSources: [ { type: 'flowmcp', schemas: [], serverParams: {} } ]
            }
        ]
    } )

    return mcp
}


describe( 'SSE Events Integration', () => {

    test( 'sseMiddleware returns function', async () => {
        const mcp = await createServer()

        const middleware = mcp.sseMiddleware()

        expect( typeof middleware ).toBe( 'function' )
    } )


    test( 'sseMiddleware sends connected event on GET /events', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        const req = { path: '/events', method: 'GET', on: vi.fn() }
        const res = { writeHead: vi.fn(), write: vi.fn() }
        const next = vi.fn()

        middleware( req, res, next )

        expect( res.writeHead ).toHaveBeenCalledWith( 200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        } )
        expect( res.write ).toHaveBeenCalledWith( 'data: {"type":"connected"}\n\n' )
        expect( next ).not.toHaveBeenCalled()
    } )


    test( 'sseMiddleware calls next for non-events path', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        const req = { path: '/other', method: 'GET', on: vi.fn() }
        const res = {}
        const next = vi.fn()

        middleware( req, res, next )

        expect( next ).toHaveBeenCalledTimes( 1 )
    } )


    test( 'sseMiddleware forwards agent:start events to SSE client', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        const req = { path: '/events', method: 'GET', on: vi.fn() }
        const res = { writeHead: vi.fn(), write: vi.fn() }

        middleware( req, res, vi.fn() )

        const payload = { taskId: 'task-1', agentName: 'test', timestamp: Date.now() }
        mcp.emit( 'agent:start', payload )

        expect( res.write ).toHaveBeenCalledTimes( 2 )
        const sseMessage = res.write.mock.calls[ 1 ][ 0 ]
        expect( sseMessage ).toContain( 'event: agent:start' )
        expect( sseMessage ).toContain( JSON.stringify( payload ) )
    } )


    test( 'sseMiddleware forwards agent:status events to SSE client', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        const req = { path: '/events', method: 'GET', on: vi.fn() }
        const res = { writeHead: vi.fn(), write: vi.fn() }

        middleware( req, res, vi.fn() )

        const payload = { taskId: 'task-1', agentName: 'test', status: 'tool_call', round: 1, message: 'Calling tool', timestamp: Date.now() }
        mcp.emit( 'agent:status', payload )

        const sseMessage = res.write.mock.calls[ 1 ][ 0 ]
        expect( sseMessage ).toContain( 'event: agent:status' )
        expect( sseMessage ).toContain( '"round":1' )
    } )


    test( 'sseMiddleware forwards agent:complete events to SSE client', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        const req = { path: '/events', method: 'GET', on: vi.fn() }
        const res = { writeHead: vi.fn(), write: vi.fn() }

        middleware( req, res, vi.fn() )

        const payload = { taskId: 'task-1', agentName: 'test', result: { answer: 'done' }, timestamp: Date.now() }
        mcp.emit( 'agent:complete', payload )

        const sseMessage = res.write.mock.calls[ 1 ][ 0 ]
        expect( sseMessage ).toContain( 'event: agent:complete' )
        expect( sseMessage ).toContain( '"answer":"done"' )
    } )


    test( 'sseMiddleware forwards agent:error events to SSE client', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        const req = { path: '/events', method: 'GET', on: vi.fn() }
        const res = { writeHead: vi.fn(), write: vi.fn() }

        middleware( req, res, vi.fn() )

        const payload = { taskId: 'task-1', agentName: 'test', error: 'Something failed', timestamp: Date.now() }
        mcp.emit( 'agent:error', payload )

        const sseMessage = res.write.mock.calls[ 1 ][ 0 ]
        expect( sseMessage ).toContain( 'event: agent:error' )
        expect( sseMessage ).toContain( 'Something failed' )
    } )


    test( 'sseMiddleware cleans up listener on client disconnect', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        let closeHandler: () => void = () => {}
        const req = {
            path: '/events',
            method: 'GET',
            on: vi.fn( ( event: string, handler: () => void ) => {
                if( event === 'close' ) {
                    closeHandler = handler
                }
            } )
        }
        const res = { writeHead: vi.fn(), write: vi.fn() }

        middleware( req, res, vi.fn() )

        expect( mcp.listenerCount( 'agent:start' ) ).toBe( 1 )

        closeHandler()

        expect( mcp.listenerCount( 'agent:start' ) ).toBe( 0 )
    } )


    test( 'sseMiddleware supports multiple concurrent clients', async () => {
        const mcp = await createServer()
        const middleware = mcp.sseMiddleware()

        const req1 = { path: '/events', method: 'GET', on: vi.fn() }
        const res1 = { writeHead: vi.fn(), write: vi.fn() }

        const req2 = { path: '/events', method: 'GET', on: vi.fn() }
        const res2 = { writeHead: vi.fn(), write: vi.fn() }

        middleware( req1, res1, vi.fn() )
        middleware( req2, res2, vi.fn() )

        const payload = { taskId: 'task-1', timestamp: Date.now() }
        mcp.emit( 'agent:start', payload )

        expect( res1.write ).toHaveBeenCalledTimes( 2 )
        expect( res2.write ).toHaveBeenCalledTimes( 2 )
    } )


    test( 'EventEmitter extends correctly — mcp is an EventEmitter', async () => {
        const mcp = await createServer()

        expect( typeof mcp.on ).toBe( 'function' )
        expect( typeof mcp.emit ).toBe( 'function' )
        expect( typeof mcp.removeListener ).toBe( 'function' )
    } )
} )
