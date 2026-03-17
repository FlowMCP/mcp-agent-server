import { describe, test, expect, vi } from 'vitest'


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
import { MASError } from '../../src/errors/MASError.js'


describe( 'Error Handling Integration', () => {

    test( 'create throws MASError when name is missing', async () => {
        await expect(
            AgentToolsServer.create( {
                name: '',
                version: '1.0.0',
                llm: { baseURL: 'https://test.com', apiKey: 'key' },
                tools: [ { name: 'tool', description: 'test', inputSchema: {}, agent: { systemPrompt: '', model: 'm', maxRounds: 1, maxTokens: 100 }, toolSources: [] } ]
            } )
        ).rejects.toThrow( MASError )
    } )


    test( 'create throws MASError when version is missing', async () => {
        await expect(
            AgentToolsServer.create( {
                name: 'test',
                version: '',
                llm: { baseURL: 'https://test.com', apiKey: 'key' },
                tools: [ { name: 'tool', description: 'test', inputSchema: {}, agent: { systemPrompt: '', model: 'm', maxRounds: 1, maxTokens: 100 }, toolSources: [] } ]
            } )
        ).rejects.toThrow( MASError )
    } )


    test( 'create throws MASError when tools array is empty', async () => {
        await expect(
            AgentToolsServer.create( {
                name: 'test',
                version: '1.0.0',
                llm: { baseURL: 'https://test.com', apiKey: 'key' },
                tools: []
            } )
        ).rejects.toThrow( MASError )
    } )


    test( 'create throws MASError when llm.baseURL is missing', async () => {
        await expect(
            AgentToolsServer.create( {
                name: 'test',
                version: '1.0.0',
                llm: { baseURL: '', apiKey: 'key' },
                tools: [ { name: 'tool', description: 'test', inputSchema: {}, agent: { systemPrompt: '', model: 'm', maxRounds: 1, maxTokens: 100 }, toolSources: [] } ]
            } )
        ).rejects.toThrow( MASError )
    } )


    test( 'create throws MASError when llm.apiKey is missing', async () => {
        await expect(
            AgentToolsServer.create( {
                name: 'test',
                version: '1.0.0',
                llm: { baseURL: 'https://test.com', apiKey: '' },
                tools: [ { name: 'tool', description: 'test', inputSchema: {}, agent: { systemPrompt: '', model: 'm', maxRounds: 1, maxTokens: 100 }, toolSources: [] } ]
            } )
        ).rejects.toThrow( MASError )
    } )


    test( 'callTool returns error for unknown tool name', async () => {
        const { mcp } = await AgentToolsServer.create( {
            name: 'test',
            version: '1.0.0',
            llm: { baseURL: 'https://test.com', apiKey: 'key' },
            tools: [ {
                name: 'known-tool',
                description: 'Known',
                inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
                agent: { systemPrompt: 'test', model: 'test/m', maxRounds: 3, maxTokens: 1024 },
                toolSources: [ { type: 'flowmcp', schemas: [], serverParams: {} } ]
            } ]
        } )

        const result = await mcp.callTool( { name: 'nonexistent', arguments: {} } )

        expect( result.isError ).toBe( true )
        expect( result.content[ 0 ].text ).toContain( 'Unknown tool' )
    } )


    test( 'MASError has correct code format', () => {
        const error = new MASError( {
            code: 'MAS_MANIFEST_MISSING_FIELD',
            message: 'Field missing'
        } )

        expect( error.code ).toBe( 'MAS_MANIFEST_MISSING_FIELD' )
        expect( error.name ).toBe( 'MASError' )
        expect( error ).toBeInstanceOf( Error )
    } )
} )
