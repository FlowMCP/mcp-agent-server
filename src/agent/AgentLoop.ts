import { zodToJsonSchema } from 'zod-to-json-schema'

import { Logger } from '../logging/Logger.js'
import { AnthropicProvider } from '../providers/AnthropicProvider.js'
import { MASError, MAS_ERROR_CODES } from '../errors/MASError.js'
import type { ToolClient, StatusUpdate, JSONSchema, RoundLog, RoundLogCallback, LLMProvider, ElicitCallback, ElicitationConfig } from '../types/index.js'


class AgentLoop {
    static #buildAskUserTool( { elicitationConfig }: { elicitationConfig: ElicitationConfig } ) {
        const fieldDescriptions = Object.entries( elicitationConfig.fields )
            .map( ( [ key, field ] ) => {
                const hints = field.hints && field.hints.length > 0
                    ? ` — maps to: ${field.hints.join( ', ' )}`
                    : ''

                return `- ${key} (${field.title})${hints}`
            } )
            .join( '\n' )

        const askUserTool = {
            name: 'ask_user',
            description: `Frage den User nach fehlenden Informationen. Nutze dieses Tool wenn du nicht genug Infos hast um die Anfrage zu bearbeiten. Waehle die Felder die dir fehlen aus der Liste.\n\nVerfuegbare Felder:\n${fieldDescriptions}\n\nDer User bekommt ein Formular und kann alles auf einmal beantworten.`,
            input_schema: {
                type: 'object',
                properties: {
                    message: {
                        type: 'string',
                        description: 'Freundliche Nachricht an den User die erklaert was du brauchst'
                    },
                    fields: {
                        type: 'array',
                        items: { type: 'string' },
                        description: `Welche Felder fehlen? Erlaubte Werte: ${Object.keys( elicitationConfig.fields ).join( ', ' )}`
                    }
                },
                required: [ 'message', 'fields' ]
            }
        }

        return { askUserTool }
    }


    static async start( { query, toolClient, systemPrompt, model, maxRounds, maxTokens, onStatus, onRoundLog, onElicit, elicitationConfig, baseURL, apiKey, llmProvider, answerSchema = null, discovery = false }: { query: string, toolClient: ToolClient, systemPrompt: string, model: string, maxRounds: number, maxTokens: number, onStatus?: ( params: StatusUpdate ) => void, onRoundLog?: RoundLogCallback, onElicit?: ElicitCallback, elicitationConfig?: ElicitationConfig, baseURL?: string, apiKey?: string, llmProvider?: LLMProvider, answerSchema?: JSONSchema | null, discovery?: boolean } ) {
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

        Logger.info( 'AgentLoop', `Tools available: ${clientTools.length}`, clientTools.map( ( t: any ) => t.name ) )

        const anthropicTools = clientTools
            .map( ( tool: any ) => {
                const { name, description, inputSchema } = tool

                let jsonSchema = inputSchema

                if( inputSchema && inputSchema._def ) {
                    jsonSchema = zodToJsonSchema( inputSchema, { target: 'openApi3' } )
                } else if( inputSchema && !inputSchema.type ) {
                    jsonSchema = { type: 'object', properties: inputSchema }
                }

                return { name, description, input_schema: jsonSchema }
            } )

        const answerToolName = 'submit_answer'
        const { answerTool } = AgentLoop.#buildAnswerTool( { answerToolName, answerSchema } )
        const builtinTools: any[] = [ answerTool ]

        if( discovery ) {
            const { discoveryTool } = AgentLoop.#buildDiscoveryTool()
            builtinTools.push( discoveryTool )
        }

        const askUserToolName = 'ask_user'
        let elicitationCount = 0
        const maxElicitations = elicitationConfig?.maxRounds || 3

        if( elicitationConfig?.enabled && onElicit ) {
            const { askUserTool } = AgentLoop.#buildAskUserTool( { elicitationConfig } )
            builtinTools.push( askUserTool )
        }

        const allTools = [ ...anthropicTools, ...builtinTools ]

        const now = new Date()
        const datePrefix = `[Aktuelles Datum: ${now.toISOString().split( 'T' )[ 0 ]}, Uhrzeit: ${now.toTimeString().slice( 0, 5 )} CET]`
        const enrichedSystemPrompt = `${datePrefix}\n\n${systemPrompt}`

        const messages: any[] = [
            { role: 'user', content: query }
        ]

        const provider = llmProvider || AnthropicProvider.create( { baseURL: baseURL || '', apiKey: apiKey || '' } ).provider
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

            const roundLog: RoundLog = {
                round,
                timestamp: new Date().toISOString(),
                llmInput: {
                    messageCount: messages.length,
                    systemPromptLength: systemPrompt.length,
                    toolCount: allTools.length
                },
                llmOutput: {
                    textBlocks: [],
                    toolCalls: [],
                    inputTokens: 0,
                    outputTokens: 0
                },
                toolResults: []
            }

            const llmResponse = await provider.complete( {
                model,
                maxTokens,
                system: enrichedSystemPrompt,
                tools: allTools,
                messages
            } )

            totalInputTokens += llmResponse.inputTokens
            totalOutputTokens += llmResponse.outputTokens

            roundLog.llmOutput.inputTokens = llmResponse.inputTokens
            roundLog.llmOutput.outputTokens = llmResponse.outputTokens
            roundLog.llmOutput.textBlocks = llmResponse.textBlocks
            roundLog.llmOutput.toolCalls = llmResponse.toolCalls
                .map( ( tc ) => ( { name: tc.name, arguments: tc.input } ) )

            const content = [
                ...llmResponse.textBlocks.map( ( text ) => ( { type: 'text' as const, text } ) ),
                ...llmResponse.toolCalls.map( ( tc ) => ( { type: 'tool_use' as const, id: tc.id, name: tc.name, input: tc.input } ) )
            ]

            const submitBlock = llmResponse.toolCalls
                .find( ( tc ) => tc.name === answerToolName )

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
                const textBlocks = content
                    .filter( ( block: any ) => block.type === 'text' )
                    .map( ( block: any ) => block.text )

                const finalText = textBlocks.join( '\n' )

                if( toolCallLog.length === 0 && !hasRequestedSubmit && round <= maxRounds ) {
                    const duration = Date.now() - startTime

                    if( onRoundLog ) { onRoundLog( roundLog ) }

                    const result = {
                        status: 'elicitation',
                        query,
                        result: { text: finalText },
                        costs: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
                        metadata: { model, toolCalls: 0, llmRounds: round, duration }
                    }

                    running = false

                    if( onStatus ) { onStatus( { status: 'completed', round, message: 'Agent needs more info (elicitation)' } ) }

                    return { result }
                }

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
                        if( name === askUserToolName && onElicit && elicitationConfig ) {
                            const { message: elicitMessage, fields: requestedFields } = input as any
                            const schemaProperties: Record<string, any> = {};

                            ( requestedFields as string[] || [] ).forEach( ( fieldKey: string ) => {
                                const fieldDef = elicitationConfig.fields[ fieldKey ]

                                if( fieldDef ) {
                                    const prop: Record<string, any> = { type: fieldDef.type, title: fieldDef.title }

                                    if( fieldDef.format ) { prop.format = fieldDef.format }
                                    if( fieldDef.enum ) { prop.enum = fieldDef.enum }
                                    if( fieldDef.enumNames ) { prop.enumNames = fieldDef.enumNames }
                                    if( fieldDef.description ) { prop.description = fieldDef.description }

                                    schemaProperties[ fieldKey ] = prop
                                }
                            } )

                            const requestedSchema = {
                                type: 'object',
                                properties: schemaProperties,
                                required: requestedFields || []
                            }

                            elicitationCount++

                            if( onStatus ) { onStatus( { status: 'working', round, message: `Asking user: ${elicitMessage}` } ) }

                            const elicitResult = await onElicit( { message: elicitMessage, requestedSchema } )
                            const callDuration = Date.now() - callStart

                            if( elicitResult.action === 'accept' && elicitResult.content ) {
                                const contentParts = Object.entries( elicitResult.content )
                                    .map( ( [ key, value ] ) => `${key}: ${value}` )
                                    .join( ', ' )

                                toolCallLog.push( { name, input, duration: callDuration, success: true } )

                                if( elicitationCount >= maxElicitations ) {
                                    const askUserIndex = allTools.findIndex( ( t: any ) => t.name === askUserToolName )
                                    if( askUserIndex !== -1 ) { allTools.splice( askUserIndex, 1 ) }
                                }

                                return {
                                    type: 'tool_result',
                                    tool_use_id: id,
                                    content: `User hat geantwortet: ${contentParts}`
                                }
                            }

                            if( elicitResult.action === 'decline' ) {
                                toolCallLog.push( { name, input, duration: callDuration, success: true } )

                                return {
                                    type: 'tool_result',
                                    tool_use_id: id,
                                    content: 'User moechte diese Information nicht geben. Versuche mit den vorhandenen Infos weiterzumachen.'
                                }
                            }

                            toolCallLog.push( { name, input, duration: callDuration, success: false, error: 'User cancelled' } )

                            return {
                                type: 'tool_result',
                                tool_use_id: id,
                                content: 'User hat abgebrochen.',
                                is_error: true
                            }
                        }

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

                        roundLog.toolResults.push( {
                            name,
                            arguments: input,
                            duration: callDuration,
                            success: true,
                            dataSize: fullResultText.length,
                            dataSample: fullResultText.slice( 0, 500 ),
                            fullData: callResult
                        } )

                        return {
                            type: 'tool_result',
                            tool_use_id: id,
                            content: resultText
                        }
                    } catch( error: any ) {
                        const callDuration = Date.now() - callStart

                        toolCallLog.push( { name, input, duration: callDuration, success: false, error: error.message } )

                        roundLog.toolResults.push( {
                            name,
                            arguments: input,
                            duration: callDuration,
                            success: false,
                            dataSize: 0,
                            dataSample: '',
                            fullData: null,
                            error: error.message
                        } )

                        return {
                            type: 'tool_result',
                            tool_use_id: id,
                            content: `Error calling tool ${name}: ${error.message}`,
                            is_error: true
                        }
                    }
                } )

            const resolvedResults = await Promise.all( toolResultPromises )

            if( onRoundLog ) {
                onRoundLog( roundLog )
            }

            Logger.info( 'AgentLoop', `Round ${round}: ${roundLog.llmOutput.toolCalls.length} tool-calls, ${roundLog.toolResults.length} results, ${roundLog.llmOutput.inputTokens}+${roundLog.llmOutput.outputTokens} tokens` )

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
