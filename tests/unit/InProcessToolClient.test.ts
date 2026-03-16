import { describe, test, expect, vi } from 'vitest'


const { mockLoadSchema, mockPrepareServerTool } = vi.hoisted( () => {
    return {
        mockLoadSchema: vi.fn(),
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

import { InProcessToolClient } from '../../src/client/InProcessToolClient.js'


describe( 'InProcessToolClient', () => {

    describe( 'create', () => {
        test( 'loads v3 schemas and prepares tools', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            mockLoadSchema.mockResolvedValueOnce( {
                main: { version: '3.0.0', namespace: 'test', tools: { getList: { description: 'Get list' } } },
                handlerMap: {}
            } )

            mockPrepareServerTool.mockReturnValueOnce( {
                toolName: 'get_list_test',
                description: 'Get list',
                zod: { type: 'object' },
                func: vi.fn()
            } )

            const client = await InProcessToolClient.create( {
                schemaPaths: [ '/path/to/schema.mjs' ]
            } )

            expect( mockLoadSchema ).toHaveBeenCalledWith( { filePath: '/path/to/schema.mjs' } )
            expect( mockPrepareServerTool ).toHaveBeenCalledTimes( 1 )
            expect( client ).toBeDefined()
        } )


        test( 'rejects v2 schemas with MAS_SCHEMA_VERSION error', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            mockLoadSchema.mockResolvedValueOnce( {
                main: { version: '2.0.0', namespace: 'old', routes: { getOld: {} } },
                handlerMap: {}
            } )

            await expect(
                InProcessToolClient.create( { schemaPaths: [ '/path/to/old.mjs' ] } )
            ).rejects.toThrow( 'not v3' )
        } )


        test( 'rejects schemas without version', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            mockLoadSchema.mockResolvedValueOnce( {
                main: { namespace: 'noversion', tools: { getThing: {} } },
                handlerMap: {}
            } )

            await expect(
                InProcessToolClient.create( { schemaPaths: [ '/path/to/noversion.mjs' ] } )
            ).rejects.toThrow( 'not v3' )
        } )


        test( 'loads multiple schemas', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            mockLoadSchema
                .mockResolvedValueOnce( {
                    main: { version: '3.0.0', namespace: 'a', tools: { getA: { description: 'A' } } },
                    handlerMap: {}
                } )
                .mockResolvedValueOnce( {
                    main: { version: '3.0.0', namespace: 'b', tools: { getB: { description: 'B' } } },
                    handlerMap: {}
                } )

            mockPrepareServerTool
                .mockReturnValueOnce( { toolName: 'get_a_a', description: 'A', zod: {}, func: vi.fn() } )
                .mockReturnValueOnce( { toolName: 'get_b_b', description: 'B', zod: {}, func: vi.fn() } )

            const client = await InProcessToolClient.create( {
                schemaPaths: [ '/a.mjs', '/b.mjs' ]
            } )

            expect( mockLoadSchema ).toHaveBeenCalledTimes( 2 )
            expect( mockPrepareServerTool ).toHaveBeenCalledTimes( 2 )

            const { tools } = await client.listTools()

            expect( tools ).toHaveLength( 2 )
        } )
    } )


    describe( 'listTools', () => {
        test( 'returns all prepared tools', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            mockLoadSchema.mockResolvedValueOnce( {
                main: { version: '3.0.0', namespace: 'test', tools: { getA: { description: 'A' }, getB: { description: 'B' } } },
                handlerMap: {}
            } )

            mockPrepareServerTool
                .mockReturnValueOnce( { toolName: 'get_a_test', description: 'A', zod: { type: 'object' }, func: vi.fn() } )
                .mockReturnValueOnce( { toolName: 'get_b_test', description: 'B', zod: { type: 'object' }, func: vi.fn() } )

            const client = await InProcessToolClient.create( { schemaPaths: [ '/test.mjs' ] } )
            const { tools } = await client.listTools()

            expect( tools ).toHaveLength( 2 )
            expect( tools[ 0 ].name ).toBe( 'get_a_test' )
            expect( tools[ 1 ].name ).toBe( 'get_b_test' )
        } )


        test( 'returns empty array for no schemas', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            const client = await InProcessToolClient.create( { schemaPaths: [] } )
            const { tools } = await client.listTools()

            expect( tools ).toHaveLength( 0 )
        } )
    } )


    describe( 'callTool', () => {
        test( 'calls the correct tool function', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            const mockFunc = vi.fn().mockResolvedValue( {
                content: [ { type: 'text', text: 'Result: test' } ]
            } )

            mockLoadSchema.mockResolvedValueOnce( {
                main: { version: '3.0.0', namespace: 'test', tools: { getData: { description: 'Get data' } } },
                handlerMap: {}
            } )

            mockPrepareServerTool.mockReturnValueOnce( {
                toolName: 'get_data_test',
                description: 'Get data',
                zod: { type: 'object' },
                func: mockFunc
            } )

            const client = await InProcessToolClient.create( { schemaPaths: [ '/test.mjs' ] } )
            const result = await client.callTool( { name: 'get_data_test', arguments: { query: 'test' } } )

            expect( mockFunc ).toHaveBeenCalledWith( { query: 'test' } )
            expect( result.content[ 0 ].text ).toContain( 'test' )
        } )


        test( 'returns error for unknown tool', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            const client = await InProcessToolClient.create( { schemaPaths: [] } )
            const result = await client.callTool( { name: 'unknown', arguments: {} } )

            expect( result.isError ).toBe( true )
            expect( result.content[ 0 ].text ).toContain( 'Unknown tool' )
        } )
    } )


    describe( 'close', () => {
        test( 'is a no-op that does not throw', async () => {
            mockLoadSchema.mockReset()
            mockPrepareServerTool.mockReset()

            const client = await InProcessToolClient.create( { schemaPaths: [] } )

            await expect( client.close() ).resolves.toBeUndefined()
        } )
    } )

} )
