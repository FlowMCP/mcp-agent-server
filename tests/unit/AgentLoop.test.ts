import { describe, test, expect, vi, beforeEach } from 'vitest'


const mockCreate = vi.fn()

vi.mock( '@anthropic-ai/sdk', () => {
    return {
        default: class MockAnthropic {
            messages: { create: ReturnType<typeof vi.fn> }

            constructor() {
                this.messages = { create: mockCreate }
            }
        }
    }
} )

import { AgentLoop } from '../../src/agent/AgentLoop.js'


const createMockToolClient = ( { tools = [] as unknown[] } = {} ) => {
    return {
        listTools: vi.fn().mockResolvedValue( { tools } ),
        callTool: vi.fn().mockResolvedValue( {
            content: [ { type: 'text', text: '{"result": "mock tool response"}' } ]
        } )
    }
}

const mockTool = {
    name: 'get_prices',
    description: 'Get crypto prices',
    inputSchema: {
        type: 'object',
        properties: {
            ids: { type: 'array' }
        }
    }
}


describe( 'AgentLoop', () => {
    beforeEach( () => {
        mockCreate.mockReset()
    } )


    test( 'completes in one round when LLM returns text only', async () => {
        mockCreate.mockResolvedValueOnce( {
            content: [
                { type: 'text', text: '{"recommendation": "Buy ETH"}' }
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 }
        } )

        const toolClient = createMockToolClient( { tools: [ mockTool ] } )

        const { result } = await AgentLoop
            .start( {
                query: 'What should I buy?',
                toolClient,
                systemPrompt: 'You are a test agent.',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 5,
                maxTokens: 1024
            } )

        expect( result.status ).toBe( 'elicitation' )
        expect( result.query ).toBe( 'What should I buy?' )
        expect( result.metadata.llmRounds ).toBe( 1 )
        expect( result.metadata.toolCalls ).toBe( 0 )
    } )


    test( 'executes tool calls and loops back to LLM', async () => {
        const submitResult = {
            title: 'BTC Price',
            analysis: 'Bitcoin is at $50k [1].',
            keyFindings: [ 'BTC at $50k' ],
            sources: [ { id: 1, tool: 'get_prices', query: 'bitcoin', insight: 'Price data' } ]
        }

        mockCreate
            .mockResolvedValueOnce( {
                content: [
                    {
                        type: 'tool_use',
                        id: 'call_1',
                        name: 'get_prices',
                        input: { ids: [ 'bitcoin' ] }
                    }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 200, output_tokens: 80 }
            } )
            .mockResolvedValueOnce( {
                content: [
                    { type: 'text', text: '{"recommendation": "BTC at $50k"}' }
                ],
                stop_reason: 'end_turn',
                usage: { input_tokens: 300, output_tokens: 100 }
            } )
            .mockResolvedValueOnce( {
                content: [
                    { type: 'tool_use', id: 'submit_1', name: 'submit_answer', input: submitResult }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 400, output_tokens: 150 }
            } )

        const toolClient = createMockToolClient( { tools: [ mockTool ] } )

        const { result } = await AgentLoop
            .start( {
                query: 'Price of BTC?',
                toolClient,
                systemPrompt: 'Test agent',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 5,
                maxTokens: 1024
            } )

        expect( result.status ).toBe( 'success' )
        expect( result.metadata.llmRounds ).toBe( 3 )
        expect( result.metadata.toolCalls ).toBe( 1 )
        expect( result.result.title ).toBe( 'BTC Price' )
        expect( toolClient.callTool ).toHaveBeenCalledWith( {
            name: 'get_prices',
            arguments: { ids: [ 'bitcoin' ] }
        } )

        const toolBreakdown = result.costs.breakdown
            .find( ( b: { type: string } ) => b.type === 'tool' )

        expect( toolBreakdown.name ).toBe( 'get_prices' )
        expect( toolBreakdown.success ).toBe( true )
    } )


    test( 'handles tool call errors gracefully', async () => {
        const submitResult = {
            title: 'Error Report',
            analysis: 'Tool failed [1].',
            keyFindings: [ 'API timeout' ],
            sources: [ { id: 1, tool: 'get_prices', query: 'unknown', insight: 'API timeout error' } ]
        }

        mockCreate
            .mockResolvedValueOnce( {
                content: [
                    {
                        type: 'tool_use',
                        id: 'call_err',
                        name: 'get_prices',
                        input: { ids: [ 'unknown' ] }
                    }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 150, output_tokens: 60 }
            } )
            .mockResolvedValueOnce( {
                content: [
                    { type: 'text', text: '{"status": "partial", "error": "tool failed"}' }
                ],
                stop_reason: 'end_turn',
                usage: { input_tokens: 250, output_tokens: 80 }
            } )
            .mockResolvedValueOnce( {
                content: [
                    { type: 'tool_use', id: 'submit_1', name: 'submit_answer', input: submitResult }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 300, output_tokens: 100 }
            } )

        const toolClient = createMockToolClient( { tools: [ mockTool ] } )
        toolClient.callTool.mockRejectedValueOnce( new Error( 'API timeout' ) )

        const { result } = await AgentLoop
            .start( {
                query: 'Get unknown coin',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 5,
                maxTokens: 1024
            } )

        expect( result.status ).toBe( 'success' )
        expect( result.metadata.toolCalls ).toBe( 1 )
        expect( result.result.title ).toBe( 'Error Report' )

        const toolBreakdown = result.costs.breakdown
            .find( ( b: { type: string } ) => b.type === 'tool' )

        expect( toolBreakdown.success ).toBe( false )
    } )


    test( 'respects maxRounds limit', async () => {
        mockCreate
            .mockResolvedValueOnce( {
                content: [
                    { type: 'tool_use', id: 'c1', name: 'get_prices', input: {} }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 100, output_tokens: 50 }
            } )
            .mockResolvedValueOnce( {
                content: [
                    { type: 'tool_use', id: 'c2', name: 'get_prices', input: {} }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 100, output_tokens: 50 }
            } )
            .mockResolvedValueOnce( {
                content: [
                    { type: 'text', text: '{"forced": "answer after max rounds"}' }
                ],
                stop_reason: 'end_turn',
                usage: { input_tokens: 100, output_tokens: 50 }
            } )

        const toolClient = createMockToolClient( { tools: [ mockTool ] } )

        const { result } = await AgentLoop
            .start( {
                query: 'Keep looping',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 2,
                maxTokens: 1024
            } )

        expect( result.status ).toBe( 'success' )
        expect( result.metadata.llmRounds ).toBeLessThanOrEqual( 3 )
    } )


    test( 'calls onStatus callback during execution', async () => {
        mockCreate.mockResolvedValueOnce( {
            content: [
                { type: 'text', text: '"done"' }
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 20 }
        } )

        const toolClient = createMockToolClient( { tools: [] } )
        const statusUpdates: unknown[] = []

        await AgentLoop
            .start( {
                query: 'Test status',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 5,
                maxTokens: 1024,
                onStatus: ( update: unknown ) => {
                    statusUpdates.push( update )
                }
            } )

        expect( statusUpdates.length ).toBeGreaterThanOrEqual( 2 )
        expect( ( statusUpdates[ 0 ] as { status: string } ).status ).toBe( 'working' )
        expect( ( statusUpdates[ statusUpdates.length - 1 ] as { status: string } ).status ).toBe( 'completed' )
    } )


    test( 'converts tool client tools to Anthropic format', async () => {
        mockCreate.mockResolvedValueOnce( {
            content: [
                { type: 'text', text: '"test"' }
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 20 }
        } )

        const toolClient = createMockToolClient( { tools: [ mockTool ] } )

        await AgentLoop
            .start( {
                query: 'Test',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 1,
                maxTokens: 1024
            } )

        const calledTools = mockCreate.mock.calls[ 0 ][ 0 ].tools

        expect( calledTools ).toHaveLength( 2 )
        expect( calledTools[ 0 ].name ).toBe( 'get_prices' )
        expect( calledTools[ 0 ].description ).toBe( 'Get crypto prices' )
        expect( calledTools[ 0 ].input_schema ).toEqual( mockTool.inputSchema )
        expect( calledTools[ 1 ].name ).toBe( 'submit_answer' )
    } )


    test( 'parses JSON from markdown code blocks', async () => {
        mockCreate.mockResolvedValueOnce( {
            content: [
                { type: 'text', text: 'Here is the result:\n```json\n{"key": "value"}\n```' }
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 30 }
        } )

        const toolClient = createMockToolClient( { tools: [] } )

        const { result } = await AgentLoop
            .start( {
                query: 'Parse json',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 1,
                maxTokens: 1024
            } )

        expect( result.status ).toBe( 'elicitation' )
        expect( result.result ).toEqual( { text: 'Here is the result:\n```json\n{"key": "value"}\n```' } )
    } )


    test( 'intercepts submit_answer tool call as structured result', async () => {
        const structuredResult = {
            title: 'ETH Analysis',
            analysis: 'Ethereum TVL is $50B [1].',
            keyFindings: [ 'TVL at $50B', 'Lido dominates' ],
            sources: [
                { id: 1, tool: 'get_chain_tvl', query: 'ethereum', insight: 'TVL data' },
                { id: 2, tool: 'get_protocols', query: 'top protocols', insight: 'Lido #1' }
            ]
        }

        mockCreate
            .mockResolvedValueOnce( {
                content: [
                    { type: 'tool_use', id: 'c1', name: 'get_prices', input: { ids: [ 'ethereum' ] } }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 100, output_tokens: 50 }
            } )
            .mockResolvedValueOnce( {
                content: [
                    { type: 'tool_use', id: 'submit_1', name: 'submit_answer', input: structuredResult }
                ],
                stop_reason: 'tool_use',
                usage: { input_tokens: 200, output_tokens: 100 }
            } )

        const toolClient = createMockToolClient( { tools: [ mockTool ] } )

        const { result } = await AgentLoop
            .start( {
                query: 'Analyze ETH',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 5,
                maxTokens: 1024
            } )

        expect( result.status ).toBe( 'success' )
        expect( result.result.title ).toBe( 'ETH Analysis' )
        expect( result.result.keyFindings ).toHaveLength( 2 )
        expect( result.result.sources ).toHaveLength( 2 )
        expect( result.metadata.toolCalls ).toBe( 1 )
        expect( result.metadata.llmRounds ).toBe( 2 )
    } )


    test( 'handles non-JSON text response', async () => {
        mockCreate.mockResolvedValueOnce( {
            content: [
                { type: 'text', text: 'This is plain text without JSON.' }
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 20 }
        } )

        const toolClient = createMockToolClient( { tools: [] } )

        const { result } = await AgentLoop
            .start( {
                query: 'Plain text',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 1,
                maxTokens: 1024
            } )

        expect( result.result ).toEqual( { text: 'This is plain text without JSON.' } )
    } )


    test( 'uses custom answerSchema when provided', async () => {
        const customSchema = {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                score: { type: 'number' }
            },
            required: [ 'summary', 'score' ]
        }

        mockCreate.mockResolvedValueOnce( {
            content: [
                { type: 'tool_use', id: 's1', name: 'submit_answer', input: { summary: 'Good', score: 8 } }
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 50, output_tokens: 30 }
        } )

        const toolClient = createMockToolClient( { tools: [] } )

        const { result } = await AgentLoop
            .start( {
                query: 'Rate this',
                toolClient,
                systemPrompt: 'Test',
                model: 'anthropic/claude-sonnet-4.5',
                maxRounds: 1,
                maxTokens: 1024,
                answerSchema: customSchema
            } )

        expect( result.result.summary ).toBe( 'Good' )
        expect( result.result.score ).toBe( 8 )

        const calledTools = mockCreate.mock.calls[ 0 ][ 0 ].tools
        const answerTool = calledTools
            .find( ( t: { name: string } ) => t.name === 'submit_answer' )

        expect( answerTool.input_schema ).toEqual( customSchema )
    } )
} )
