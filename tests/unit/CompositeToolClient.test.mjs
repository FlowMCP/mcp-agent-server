import { describe, test, expect, jest } from '@jest/globals'
import { CompositeToolClient } from '../../src/client/CompositeToolClient.mjs'


const createMockClient = ( { tools = [] } = {} ) => {
    return {
        listTools: jest.fn().mockResolvedValue( { tools } ),
        callTool: jest.fn().mockResolvedValue( {
            content: [ { type: 'text', text: '{"data": "mock"}' } ]
        } ),
        close: jest.fn()
    }
}


describe( 'CompositeToolClient', () => {
    describe( 'listTools', () => {
        test( 'merges tools from multiple clients', async () => {
            const clientA = createMockClient( {
                tools: [
                    { name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object' } }
                ]
            } )

            const clientB = createMockClient( {
                tools: [
                    { name: 'tool_b', description: 'Tool B', inputSchema: { type: 'object' } },
                    { name: 'tool_c', description: 'Tool C', inputSchema: { type: 'object' } }
                ]
            } )

            const composite = new CompositeToolClient( { clients: [ clientA, clientB ] } )

            const { tools } = await composite.listTools()

            expect( tools ).toHaveLength( 3 )
            expect( tools[ 0 ].name ).toBe( 'tool_a' )
            expect( tools[ 1 ].name ).toBe( 'tool_b' )
            expect( tools[ 2 ].name ).toBe( 'tool_c' )
        } )


        test( 'returns empty array for no clients', async () => {
            const composite = new CompositeToolClient( { clients: [] } )

            const { tools } = await composite.listTools()

            expect( tools ).toHaveLength( 0 )
        } )
    } )


    describe( 'callTool', () => {
        test( 'routes call to correct client', async () => {
            const clientA = createMockClient( {
                tools: [
                    { name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object' } }
                ]
            } )

            const clientB = createMockClient( {
                tools: [
                    { name: 'tool_b', description: 'Tool B', inputSchema: { type: 'object' } }
                ]
            } )

            clientB.callTool.mockResolvedValueOnce( {
                content: [ { type: 'text', text: '{"result": "from B"}' } ]
            } )

            const composite = new CompositeToolClient( { clients: [ clientA, clientB ] } )

            const result = await composite.callTool( {
                name: 'tool_b',
                arguments: { query: 'test' }
            } )

            expect( clientB.callTool ).toHaveBeenCalledWith( {
                name: 'tool_b',
                arguments: { query: 'test' }
            } )
            expect( result.content[ 0 ].text ).toContain( 'from B' )
            expect( clientA.callTool ).not.toHaveBeenCalled()
        } )


        test( 'returns error for unknown tool', async () => {
            const clientA = createMockClient( {
                tools: [
                    { name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object' } }
                ]
            } )

            const composite = new CompositeToolClient( { clients: [ clientA ] } )

            const result = await composite.callTool( {
                name: 'nonexistent',
                arguments: {}
            } )

            expect( result.isError ).toBe( true )
            expect( result.content[ 0 ].text ).toContain( 'Unknown tool' )
        } )
    } )


    describe( 'close', () => {
        test( 'closes all clients', () => {
            const clientA = createMockClient()
            const clientB = createMockClient()

            const composite = new CompositeToolClient( { clients: [ clientA, clientB ] } )

            composite.close()

            expect( clientA.close ).toHaveBeenCalledTimes( 1 )
            expect( clientB.close ).toHaveBeenCalledTimes( 1 )
        } )


        test( 'handles clients without close method', () => {
            const clientWithoutClose = {
                listTools: jest.fn().mockResolvedValue( { tools: [] } ),
                callTool: jest.fn()
            }

            const composite = new CompositeToolClient( { clients: [ clientWithoutClose ] } )

            expect( () => composite.close() ).not.toThrow()
        } )
    } )
} )
