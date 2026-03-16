import Anthropic from '@anthropic-ai/sdk'

import { MASError, MAS_ERROR_CODES } from '../errors/MASError.js'
import type { ToolClient, StatusUpdate, JSONSchema } from '../types/index.js'


class AgentLoop {
    static async start( { query, toolClient, systemPrompt, model, maxRounds, maxTokens, onStatus, baseURL, apiKey, answerSchema = null, discovery = false }: { query: string, toolClient: ToolClient, systemPrompt: string, model: string, maxRounds: number, maxTokens: number, onStatus?: ( params: StatusUpdate ) => void, baseURL?: string, apiKey?: string, answerSchema?: JSONSchema | null, discovery?: boolean } ) {
        if( !query ) {
            throw new MASError( { code: MAS_ERROR_CODES.AGENT_LOOP_ERROR, message: 'query is required' } )
        }

        if( !toolClient ) {
            throw new MASError( { code: MAS_ERROR_CODES.AGENT_LOOP_ERROR, message: 'toolClient is required' } )
        }

        if( !systemPrompt ) {
            throw new MASError( { code: MAS_ERROR_CODES.AGENT_LOOP_ERROR, message: 'systemPrompt is required' } )
        }

        if( !model ) {
            throw new MASError( { code: MAS_ERROR_CODES.AGENT_LOOP_ERROR, message: 'model is required' } )
        }
        const startTime = Date.now()
        let totalInputTokens = 0
        let totalOutputTokens = 0
        const toolCallLog: Array<{ name: string, input: any, duration: number, success: boolean, error?: string }> = []

        const { tools: clientTools } = await toolClient.listTools()

        const anthropicTools = clientTools
            .map( ( tool: any ) => {
                const { name, description, inputSchema } = tool

                return { name, description, input_schema: inputSchema }
            } )

        const answerToolName = 'submit_answer'
        const { answerTool } = AgentLoop.#buildAnswerTool( { answerToolName, answerSchema } )
        const builtinTools: any[] = [ answerTool ]

        if( discovery ) {
            const { discoveryTool } = AgentLoop.#buildDiscoveryTool()
            builtinTools.push( discoveryTool )
        }

        const allTools = [ ...anthropicTools, ...builtinTools ]

        const messages: any[] = [
            { role: 'user', content: query }
        ]

        const clientConfig: Record<string, string> = {}
        if( baseURL ) { clientConfig.baseURL = baseURL }
        if( apiKey ) { clientConfig.apiKey = apiKey }

        const anthropic = new Anthropic( clientConfig )
        let round = 0
        let running = true
        let hasRequestedSubmit = false

        if( onStatus ) { onStatus( { status: 'working', round, message: 'Agent loop started' } ) }

        do {
            round++

            if( round > maxRounds ) {
                messages.push( {
                    role: 'user',
                    content: `You have reached the maximum number of rounds. Call ${answerToolName} now with your analysis based on all data gathered so far.`
                } )
            }

            const response = await anthropic.messages.create( {
                model,
                max_tokens: maxTokens,
                system: systemPrompt,
                tools: allTools as any,
                messages
            } )

            totalInputTokens += response.usage.input_tokens
            totalOutputTokens += response.usage.output_tokens

            const { content } = response

            const submitBlock = content
                .find( ( block: any ) => block.type === 'tool_use' && block.name === answerToolName )

            if( submitBlock ) {
                const duration = Date.now() - startTime

                const result = AgentLoop
                    .#buildResult( {
                        query,
                        parsedResult: ( submitBlock as any ).input,
                        toolCallLog,
                        totalInputTokens,
                        totalOutputTokens,
                        model,
                        round,
                        duration
                    } )

                running = false

                if( onStatus ) { onStatus( { status: 'completed', round, message: 'Agent loop finished' } ) }

                return { result }
            }

            const hasToolUse = content
                .some( ( block: any ) => block.type === 'tool_use' )

            if( !hasToolUse || round > maxRounds ) {
                if( !hasRequestedSubmit && toolCallLog.length > 0 && round <= maxRounds ) {
                    hasRequestedSubmit = true
                    messages.push( { role: 'assistant', content } )
                    messages.push( {
                        role: 'user',
                        content: `Now call the ${answerToolName} tool with your complete structured analysis based on all data gathered. Do NOT respond with text — you MUST call ${answerToolName}.`
                    } )

                    if( onStatus ) { onStatus( { status: 'working', round, message: `Requesting structured output via ${answerToolName}` } ) }

                    continue
                }

                const textBlocks = content
                    .filter( ( block: any ) => block.type === 'text' )
                    .map( ( block: any ) => block.text )

                const finalText = textBlocks.join( '\n' )
                const duration = Date.now() - startTime

                const result = AgentLoop
                    .#buildResult( {
                        query,
                        finalText,
                        toolCallLog,
                        totalInputTokens,
                        totalOutputTokens,
                        model,
                        round,
                        duration
                    } )

                running = false

                if( onStatus ) { onStatus( { status: 'completed', round, message: 'Agent loop finished' } ) }

                return { result }
            }

            messages.push( { role: 'assistant', content } )

            const toolUseBlocks = content
                .filter( ( block: any ) => block.type === 'tool_use' )

            const toolResultPromises = toolUseBlocks
                .map( async ( toolUse: any ) => {
                    const { id, name, input } = toolUse

                    if( onStatus ) {
                        onStatus( { status: 'working', round, message: `Calling tool: ${name}` } )
                    }

                    const callStart = Date.now()

                    try {
                        const isDiscovery = name === 'discover_agent'
                        const callResult = isDiscovery
                            ? await AgentLoop.#handleDiscovery( { input } )
                            : await toolClient.callTool( { name, arguments: input } )
                        const callDuration = Date.now() - callStart

                        toolCallLog.push( { name, input, duration: callDuration, success: true } )

                        const maxResultLength = 8000
                        const fullResultText = callResult.content
                            .filter( ( c: any ) => c.type === 'text' )
                            .map( ( c: any ) => c.text )
                            .join( '\n' )

                        let resultText = fullResultText

                        if( resultText.length > maxResultLength ) {
                            resultText = resultText.slice( 0, maxResultLength ) + '\n\n[... truncated, total ' + resultText.length + ' chars]'
                        }

                        return {
                            type: 'tool_result',
                            tool_use_id: id,
                            content: resultText
                        }
                    } catch( error: any ) {
                        const callDuration = Date.now() - callStart

                        toolCallLog.push( { name, input, duration: callDuration, success: false, error: error.message } )

                        return {
                            type: 'tool_result',
                            tool_use_id: id,
                            content: `Error calling tool ${name}: ${error.message}`,
                            is_error: true
                        }
                    }
                } )

            const resolvedResults = await Promise.all( toolResultPromises )

            messages.push( { role: 'user', content: resolvedResults } )
        } while( running )
    }


    static #buildResult( { query, finalText, parsedResult, toolCallLog, totalInputTokens, totalOutputTokens, model, round, duration }: { query: string, finalText?: string, parsedResult?: any, toolCallLog: any[], totalInputTokens: number, totalOutputTokens: number, model: string, round: number, duration: number } ) {
        if( !parsedResult ) {
            try {
                const jsonMatch = finalText!.match( /```json\s*([\s\S]*?)```/ )

                if( jsonMatch ) {
                    parsedResult = JSON.parse( jsonMatch[ 1 ].trim() )
                } else {
                    parsedResult = JSON.parse( finalText! )
                }
            } catch {
                parsedResult = { text: finalText }
            }
        }

        const breakdown = toolCallLog
            .map( ( call ) => {
                const { name, duration: callDuration, success } = call

                return { type: 'tool', name, calls: 1, duration: callDuration, success }
            } )

        breakdown.unshift( {
            type: 'llm',
            name: model,
            calls: round,
            duration: 0,
            success: true
        } )

        const result = {
            status: 'success',
            query,
            result: parsedResult,
            costs: {
                breakdown
            },
            metadata: {
                model,
                toolCalls: toolCallLog.length,
                llmRounds: round,
                duration
            }
        }

        return result
    }


    static #buildAnswerTool( { answerToolName, answerSchema }: { answerToolName: string, answerSchema: JSONSchema | null } ) {
        const defaultSchema = {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Short title of the result'
                },
                analysis: {
                    type: 'string',
                    description: 'Detailed analysis with inline citations [1], [2], etc.'
                },
                keyFindings: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key findings from the research'
                },
                sources: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'number', description: 'Source ID matching citation number' },
                            tool: { type: 'string', description: 'Tool name used' },
                            query: { type: 'string', description: 'What was queried' },
                            insight: { type: 'string', description: 'What the data revealed' }
                        },
                        required: [ 'id', 'tool', 'query', 'insight' ]
                    },
                    description: 'Sources array'
                }
            },
            required: [ 'title', 'analysis', 'keyFindings', 'sources' ]
        }

        const inputSchema = answerSchema || defaultSchema

        const answerTool = {
            name: answerToolName,
            description: 'Submit your final result. You MUST call this tool as your last action after gathering all data.',
            input_schema: inputSchema
        }

        return { answerTool }
    }


    static #buildDiscoveryTool() {
        const discoveryTool = {
            name: 'discover_agent',
            description: 'Discover an A2A agent by fetching its Agent Card. Returns the agent capabilities, skills, and endpoint URL.',
            input_schema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'Base URL of the agent (e.g. https://agent.example.com)'
                    }
                },
                required: [ 'url' ]
            }
        }

        return { discoveryTool }
    }


    static async #handleDiscovery( { input }: { input: { url: string } } ) {
        const { url } = input
        const agentCardUrl = `${url.replace( /\/$/, '' )}/.well-known/agent.json`

        try {
            const response = await fetch( agentCardUrl )

            if( !response.ok ) {
                return {
                    content: [ { type: 'text', text: `Discovery failed: ${agentCardUrl} returned ${response.status}` } ],
                    isError: true
                }
            }

            const agentCard = await response.json()
            const text = JSON.stringify( agentCard, null, 4 )

            return {
                content: [ { type: 'text', text } ]
            }
        } catch( error: any ) {
            return {
                content: [ { type: 'text', text: `Discovery failed: ${error.message}` } ],
                isError: true
            }
        }
    }
}


export { AgentLoop }
