import { describe, test, expect, jest } from '@jest/globals'


const mockPrepareServerTool = jest.fn()

jest.unstable_mockModule( 'flowmcp', () => {
    return {
        FlowMCP: {
            prepareServerTool: mockPrepareServerTool
        }
    }
} )

const { InProcessToolClient } = await import( '../../src/client/InProcessToolClient.mjs' )


describe( 'InProcessToolClient', () => {
    describe( 'constructor', () => {
        test( 'prepares tools from schemas', () => {
            const mockFunc = jest.fn()

            mockPrepareServerTool
                .mockReturnValueOnce( {
                    toolName: 'defilama_api',
                    description: 'DeFi Llama API',
                    zod: { type: 'object' },
                    func: mockFunc
                } )
                .mockReturnValueOnce( {
                    toolName: 'coingecko_price',
                    description: 'CoinGecko Price',
                    zod: { type: 'object' },
                    func: mockFunc
                } )

            const client = new InProcessToolClient( {
                schemas: [ { name: 'schema1' }, { name: 'schema2' } ]
            } )

            expect( mockPrepareServerTool ).toHaveBeenCalledTimes( 2 )
            expect( client ).toBeDefined()
        } )


        test( 'passes serverParams to prepareServerTool', () => {
            mockPrepareServerTool.mockReset()

            mockPrepareServerTool.mockReturnValueOnce( {
                toolName: 'tool_a',
                description: 'Tool A',
                zod: { type: 'object' },
                func: jest.fn()
            } )

            const serverParams = { apiKey: 'test-key' }

            new InProcessToolClient( {
                schemas: [ { name: 's1' } ],
                serverParams
            } )

            expect( mockPrepareServerTool ).toHaveBeenCalledWith( {
                schema: { name: 's1' },
                serverParams,
                validate: false
            } )
        } )
    } )


    describe( 'listTools', () => {
        test( 'returns all prepared tools', async () => {
            mockPrepareServerTool.mockReset()

            mockPrepareServerTool
                .mockReturnValueOnce( {
                    toolName: 'tool_a',
                    description: 'Tool A',
                    zod: { type: 'object', properties: { q: { type: 'string' } } },
                    func: jest.fn()
                } )
                .mockReturnValueOnce( {
                    toolName: 'tool_b',
                    description: 'Tool B',
                    zod: { type: 'object', properties: {} },
                    func: jest.fn()
                } )

            const client = new InProcessToolClient( {
                schemas: [ { name: 's1' }, { name: 's2' } ]
            } )

            const { tools } = await client.listTools()

            expect( tools ).toHaveLength( 2 )
            expect( tools[ 0 ].name ).toBe( 'tool_a' )
            expect( tools[ 0 ].description ).toBe( 'Tool A' )
            expect( tools[ 0 ].inputSchema ).toBeDefined()
            expect( tools[ 1 ].name ).toBe( 'tool_b' )
        } )


        test( 'returns empty array for no schemas', async () => {
            mockPrepareServerTool.mockReset()

            const client = new InProcessToolClient( { schemas: [] } )

            const { tools } = await client.listTools()

            expect( tools ).toHaveLength( 0 )
        } )
    } )


    describe( 'callTool', () => {
        test( 'calls the correct tool function with arguments', async () => {
            mockPrepareServerTool.mockReset()

            const mockFuncA = jest.fn().mockResolvedValue( {
                content: [ { type: 'text', text: 'Result: {"data": "test"}' } ]
            } )

            mockPrepareServerTool.mockReturnValueOnce( {
                toolName: 'tool_a',
                description: 'Tool A',
                zod: { type: 'object' },
                func: mockFuncA
            } )

            const client = new InProcessToolClient( { schemas: [ { name: 's1' } ] } )

            const result = await client.callTool( {
                name: 'tool_a',
                arguments: { query: 'test' }
            } )

            expect( mockFuncA ).toHaveBeenCalledWith( { query: 'test' } )
            expect( result.content[ 0 ].text ).toContain( 'test' )
        } )


        test( 'returns error for unknown tool', async () => {
            mockPrepareServerTool.mockReset()

            mockPrepareServerTool.mockReturnValueOnce( {
                toolName: 'known_tool',
                description: 'Known',
                zod: { type: 'object' },
                func: jest.fn()
            } )

            const client = new InProcessToolClient( { schemas: [ { name: 's1' } ] } )

            const result = await client.callTool( {
                name: 'unknown_tool',
                arguments: {}
            } )

            expect( result.isError ).toBe( true )
            expect( result.content[ 0 ].text ).toContain( 'Unknown tool' )
        } )
    } )


    describe( 'close', () => {
        test( 'is a no-op that does not throw', () => {
            mockPrepareServerTool.mockReset()

            const client = new InProcessToolClient( { schemas: [] } )

            expect( () => client.close() ).not.toThrow()
        } )
    } )
} )
