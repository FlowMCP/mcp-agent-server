import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema, CallToolRequestSchema, GetTaskRequestSchema, GetTaskPayloadRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { ToolRegistry } from './registry/ToolRegistry.js'
import { TaskManager } from './task/TaskManager.js'
import { AgentLoop } from './agent/AgentLoop.js'
import type { LLMConfig, ServerConfig } from './types/index.js'


class AgentToolsServer {
    #config: ServerConfig
    #llmConfig: LLMConfig
    #toolRegistry: ToolRegistry
    #taskManager: TaskManager
    #transports: Record<string, StreamableHTTPServerTransport>


    constructor( { config, llmConfig, toolRegistry, taskManager }: { config: ServerConfig, llmConfig: LLMConfig, toolRegistry: ToolRegistry, taskManager: TaskManager } ) {
        this.#config = config
        this.#llmConfig = llmConfig
        this.#toolRegistry = toolRegistry
        this.#taskManager = taskManager
        this.#transports = {}
    }


    static async fromManifest( { manifest, llm, schemas = [], serverParams = {}, subAgents = {}, elicitation = false, routePath = '/mcp' }: { manifest: Record<string, any>, llm: LLMConfig, schemas?: any[], serverParams?: Record<string, string>, subAgents?: Record<string, { url: string }>, elicitation?: boolean, routePath?: string } ) {
        const toolSources: any[] = []

        if( schemas.length > 0 ) {
            toolSources.push( {
                type: 'flowmcp',
                schemas,
                serverParams
            } )
        }

        Object.entries( subAgents )
            .forEach( ( [ name, config ] ) => {
                toolSources.push( {
                    type: 'mcp-remote',
                    url: config.url,
                    name
                } )
            } )

        const { toolConfig } = ToolRegistry.fromManifest( {
            manifest,
            toolSources
        } )

        const name = manifest[ 'name' ] as string
        const version = ( manifest[ 'version' ] || 'flowmcp/3.0.0' ) as string
        const tools = [ toolConfig ]

        const result = await AgentToolsServer.create( { name, version, routePath, llm, tools, elicitation } )

        return result
    }


    static async create( { name, version, routePath = '/mcp', llm, tools, tasks = {}, elicitation = false }: { name: string, version: string, routePath?: string, llm: LLMConfig, tools: any[], tasks?: { store?: any }, elicitation?: boolean } ) {
        const config: ServerConfig = { name, version, routePath, elicitation }
        const llmConfig: LLMConfig = { baseURL: llm.baseURL, apiKey: llm.apiKey }

        const { registry } = ToolRegistry.create( { toolConfigs: tools } )

        const taskStore = tasks.store || null
        const taskManager = new TaskManager( { taskStore } )

        const mcp = new AgentToolsServer( {
            config,
            llmConfig,
            toolRegistry: registry,
            taskManager
        } )

        return { mcp }
    }


    listToolDefinitions() {
        const { tools } = this.#toolRegistry.listTools()

        return { tools }
    }


    getToolConfig( { name }: { name: string } ) {
        const { toolConfig } = this.#toolRegistry.getToolConfig( { name } )

        return { toolConfig }
    }


    async callTool( { name, arguments: args }: { name: string, arguments: Record<string, unknown> } ) {
        const { toolConfig } = this.#toolRegistry.getToolConfig( { name } )

        if( !toolConfig ) {
            return {
                content: [ { type: 'text', text: `Error: Unknown tool "${name}"` } ],
                isError: true
            }
        }

        const result = await AgentToolsServer.#runSync( {
            toolConfig,
            args,
            llmConfig: this.#llmConfig,
            toolRegistry: this.#toolRegistry
        } )

        return result
    }


    middleware() {
        const routePath = this.#config.routePath
        const transports = this.#transports
        const createServer = this.#createServer.bind( this )

        const middleware = async ( req: any, res: any, next: any ) => {
            const isRoute = req.path === routePath

            if( !isRoute ) {
                next()

                return
            }

            const method = req.method

            if( method === 'POST' ) {
                await AgentToolsServer.#handlePost( { req, res, transports, createServer } )

                return
            }

            if( method === 'GET' ) {
                await AgentToolsServer.#handleGet( { req, res, transports } )

                return
            }

            if( method === 'DELETE' ) {
                await AgentToolsServer.#handleDelete( { req, res, transports } )

                return
            }

            next()
        }

        return middleware
    }


    #createServer() {
        const { name, version, elicitation } = this.#config
        const llmConfig = this.#llmConfig
        const toolRegistry = this.#toolRegistry
        const taskManager = this.#taskManager

        const capabilities: Record<string, any> = {
            tools: {},
            tasks: {
                requests: {
                    tools: { call: {} }
                }
            }
        }

        if( elicitation ) {
            capabilities.elicitation = {}
        }

        const server = new Server(
            { name, version },
            { capabilities }
        )

        server.setRequestHandler( ListToolsRequestSchema, async () => {
            const { tools } = toolRegistry.listTools()

            return { tools }
        } )

        server.setRequestHandler( CallToolRequestSchema, async ( request: any, extra: any ) => {
            const { name: toolName, arguments: args } = request.params
            const taskParams = request.params._meta?.task || request.params.task

            const { toolConfig } = toolRegistry.getToolConfig( { name: toolName } )

            if( !toolConfig ) {
                return {
                    content: [ { type: 'text', text: `Unknown tool: ${toolName}` } ],
                    isError: true
                }
            }

            if( !taskParams ) {
                const result = await AgentToolsServer.#runSync( { toolConfig, args, llmConfig, toolRegistry } )

                return result
            }

            const { task } = await taskManager.createTask( {
                requestId: extra.requestId,
                request,
                sessionId: extra.sessionId,
                taskParams
            } )

            AgentToolsServer.#runAsync( { taskId: task.taskId, toolConfig, args, llmConfig, toolRegistry, taskManager } )

            return { task }
        } )

        server.setRequestHandler( GetTaskRequestSchema, async ( request: any ) => {
            const { taskId } = request.params
            const { task } = await taskManager.getTask( { taskId } )

            if( !task ) {
                throw new Error( `Task ${taskId} not found` )
            }

            return task
        } )

        server.setRequestHandler( GetTaskPayloadRequestSchema, async ( request: any ) => {
            const { taskId } = request.params

            const result = await taskManager.getTaskResult( { taskId } )

            return result
        } )

        return server
    }


    static async #runSync( { toolConfig, args, llmConfig, toolRegistry }: { toolConfig: any, args: any, llmConfig: LLMConfig, toolRegistry: ToolRegistry } ) {
        const { name: toolName, agent } = toolConfig
        const { systemPrompt, model, maxRounds, maxTokens } = agent
        const { baseURL, apiKey } = llmConfig

        const { toolClient } = await toolRegistry.createToolClient( { name: toolName } )

        if( !toolClient ) {
            return {
                content: [ { type: 'text', text: `No tool sources configured for: ${toolName}` } ],
                isError: true
            }
        }

        try {
            const loopResult = await AgentLoop
                .start( {
                    query: args.query || JSON.stringify( args ),
                    toolClient,
                    systemPrompt,
                    model,
                    maxRounds: maxRounds || 10,
                    maxTokens: maxTokens || 4096,
                    baseURL,
                    apiKey,
                    answerSchema: agent.answerSchema || null,
                    onStatus: ( { status, round, message } ) => {
                        console.log( `[AgentServer] sync | ${toolName} | ${status} | Round ${round} | ${message}` )
                    }
                } )
            const { result } = loopResult!

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify( result, null, 2 )
                    }
                ],
                structuredContent: result
            }
        } catch( error: any ) {
            console.error( `[AgentServer] sync | ${toolName} | failed | ${error.message}` )

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify( { status: 'error', error: error.message }, null, 2 )
                    }
                ],
                isError: true
            }
        } finally {
            toolClient.close()
        }
    }


    static async #runAsync( { taskId, toolConfig, args, llmConfig, toolRegistry, taskManager }: { taskId: string, toolConfig: any, args: any, llmConfig: LLMConfig, toolRegistry: ToolRegistry, taskManager: TaskManager } ) {
        const { name: toolName, agent } = toolConfig
        const { systemPrompt, model, maxRounds, maxTokens } = agent
        const { baseURL, apiKey } = llmConfig

        const { toolClient } = await toolRegistry.createToolClient( { name: toolName } )

        if( !toolClient ) {
            await taskManager.failTask( { taskId, error: new Error( `No tool sources configured for: ${toolName}` ) } )

            return
        }

        try {
            const asyncResult = await AgentLoop
                .start( {
                    query: args.query || JSON.stringify( args ),
                    toolClient,
                    systemPrompt,
                    model,
                    maxRounds: maxRounds || 10,
                    maxTokens: maxTokens || 4096,
                    baseURL,
                    apiKey,
                    answerSchema: agent.answerSchema || null,
                    onStatus: ( { status, round, message } ) => {
                        console.log( `[AgentServer] Task ${taskId} | ${toolName} | ${status} | Round ${round} | ${message}` )
                    }
                } )
            const { result } = asyncResult!

            await taskManager.completeTask( {
                taskId,
                result: {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify( result, null, 2 )
                        }
                    ],
                    structuredContent: result
                }
            } )
        } catch( error: any ) {
            console.error( `[AgentServer] Task ${taskId} | ${toolName} | failed | ${error.message}` )

            await taskManager.failTask( { taskId, error } )
        } finally {
            toolClient.close()
        }
    }


    static async #handlePost( { req, res, transports, createServer }: { req: any, res: any, transports: Record<string, any>, createServer: () => Server } ) {
        const sessionId = req.headers[ 'mcp-session-id' ] as string | undefined

        try {
            if( sessionId && transports[ sessionId ] ) {
                const transport = transports[ sessionId ]
                await transport.handleRequest( req, res, req.body )

                return
            }

            if( !sessionId && AgentToolsServer.#isInitializeRequest( { body: req.body } ) ) {
                const transport = new StreamableHTTPServerTransport( {
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: ( sid: string ) => {
                        transports[ sid ] = transport
                    }
                } )

                transport.onclose = () => {
                    const sid = transport.sessionId

                    if( sid && transports[ sid ] ) {
                        delete transports[ sid ]
                    }
                }

                const server = createServer()
                await server.connect( transport )
                await transport.handleRequest( req, res, req.body )

                return
            }

            res.status( 400 ).json( {
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: No valid session ID' },
                id: null
            } )
        } catch {
            if( !res.headersSent ) {
                res.status( 500 ).json( {
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null
                } )
            }
        }
    }


    static async #handleGet( { req, res, transports }: { req: any, res: any, transports: Record<string, any> } ) {
        const sessionId = req.headers[ 'mcp-session-id' ] as string | undefined

        if( !sessionId || !transports[ sessionId ] ) {
            res.status( 400 ).json( {
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Invalid or missing session ID' },
                id: null
            } )

            return
        }

        const transport = transports[ sessionId ]
        await transport.handleRequest( req, res )
    }


    static async #handleDelete( { req, res, transports }: { req: any, res: any, transports: Record<string, any> } ) {
        const sessionId = req.headers[ 'mcp-session-id' ] as string | undefined

        if( !sessionId || !transports[ sessionId ] ) {
            res.status( 400 ).json( {
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Invalid or missing session ID' },
                id: null
            } )

            return
        }

        const transport = transports[ sessionId ]
        await transport.handleRequest( req, res )
    }


    static #isInitializeRequest( { body }: { body: any } ) {
        const isObject = typeof body === 'object' && body !== null
        const isInit = isObject && body.method === 'initialize'

        return isInit
    }
}


export { AgentToolsServer }
