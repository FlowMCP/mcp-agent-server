import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema, CallToolRequestSchema, GetTaskRequestSchema, GetTaskPayloadRequestSchema, ListResourcesRequestSchema, ListPromptsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { ToolRegistry } from './registry/ToolRegistry.js'
import { TaskManager } from './task/TaskManager.js'
import { AgentLoop } from './agent/AgentLoop.js'
import { MASError, MAS_ERROR_CODES } from './errors/MASError.js'
import { Logger } from './logging/Logger.js'
import { DebugWriter } from './logging/DebugWriter.js'
import type { LLMConfig, ServerConfig } from './types/index.js'


class AgentToolsServer extends EventEmitter {
    #config: ServerConfig
    #llmConfig: LLMConfig
    #toolRegistry: ToolRegistry
    #taskManager: TaskManager
    #transports: Record<string, StreamableHTTPServerTransport>
    #sseClients: Set<any>


    constructor( { config, llmConfig, toolRegistry, taskManager }: { config: ServerConfig, llmConfig: LLMConfig, toolRegistry: ToolRegistry, taskManager: TaskManager } ) {
        super()
        this.#config = config
        this.#llmConfig = llmConfig
        this.#toolRegistry = toolRegistry
        this.#taskManager = taskManager
        this.#transports = {}
        this.#sseClients = new Set()
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
        if( !name ) {
            throw new MASError( { code: MAS_ERROR_CODES.MANIFEST_MISSING_FIELD, message: 'name is required' } )
        }

        if( !version ) {
            throw new MASError( { code: MAS_ERROR_CODES.MANIFEST_MISSING_FIELD, message: 'version is required' } )
        }

        if( !tools || tools.length === 0 ) {
            throw new MASError( { code: MAS_ERROR_CODES.MANIFEST_INVALID, message: 'tools array must not be empty' } )
        }

        if( !llm || !llm.baseURL ) {
            throw new MASError( { code: MAS_ERROR_CODES.LLM_CONFIG_MISSING, message: 'llm.baseURL is required' } )
        }

        if( !llm.apiKey ) {
            throw new MASError( { code: MAS_ERROR_CODES.LLM_CONFIG_MISSING, message: 'llm.apiKey is required' } )
        }

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
            toolRegistry: this.#toolRegistry,
            emitter: this
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


    sseMiddleware() {
        const sseClients = this.#sseClients
        const emitter = this

        const middleware = ( req: any, res: any, next: any ) => {
            if( req.path !== '/events' || req.method !== 'GET' ) {
                next()

                return
            }

            res.writeHead( 200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            } )

            res.write( 'data: {"type":"connected"}\n\n' )

            sseClients.add( res )

            const eventNames = [ 'agent:start', 'agent:status', 'agent:complete', 'agent:error' ]

            const listeners = eventNames
                .map( ( eventName ) => {
                    const listener = ( payload: any ) => {
                        res.write( `event: ${eventName}\ndata: ${JSON.stringify( payload )}\n\n` )
                    }

                    emitter.on( eventName, listener )

                    return { eventName, listener }
                } )

            req.on( 'close', () => {
                sseClients.delete( res )

                listeners
                    .forEach( ( { eventName, listener } ) => {
                        emitter.removeListener( eventName, listener )
                    } )
            } )
        }

        return middleware
    }


    #createServer() {
        const { name, version, elicitation } = this.#config
        const llmConfig = this.#llmConfig
        const toolRegistry = this.#toolRegistry
        const taskManager = this.#taskManager
        const emitter: EventEmitter = this

        const capabilities: Record<string, any> = {
            tools: {},
            resources: {},
            prompts: {},
            tasks: {
                requests: {
                    tools: { call: {} }
                }
            }
        }

        if( elicitation ) {
            capabilities.elicitation = {}
        }

        capabilities[ 'io.modelcontextprotocol/ui' ] = {}

        const server = new Server(
            { name, version },
            { capabilities }
        )

        const uiResourceUri = `ui://${name}/status`

        const uiMeta = {
            csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: []
            },
            displayModes: [ 'inline' ]
        }

        server.setRequestHandler( ListResourcesRequestSchema, async () => {
            return {
                resources: [
                    {
                        uri: uiResourceUri,
                        name: `${name} Status UI`,
                        description: `Real-time status display for ${name} agent`,
                        mimeType: 'text/html;profile=mcp-app',
                        _meta: { ui: uiMeta }
                    }
                ]
            }
        } )

        server.setRequestHandler( ReadResourceRequestSchema, async ( request: any ) => {
            const { uri } = request.params

            if( uri === uiResourceUri ) {
                return {
                    contents: [ {
                        uri: uiResourceUri,
                        mimeType: 'text/html;profile=mcp-app',
                        text: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>:root{--bg:#fff;--fg:#000;--accent:#2563eb}@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--accent:#60a5fa}}body{font-family:system-ui;margin:0;padding:16px;background:var(--bg);color:var(--fg)}</style></head><body data-theme="auto"><h1>${name}</h1><p>Agent Status</p><noscript>This UI requires JavaScript to display real-time agent status.</noscript></body></html>`,
                        _meta: {
                            ui: uiMeta
                        }
                    } ]
                }
            }

            return { contents: [] }
        } )

        server.setRequestHandler( ListPromptsRequestSchema, async () => {
            return { prompts: [] }
        } )

        server.setRequestHandler( ListToolsRequestSchema, async () => {
            const { tools } = toolRegistry.listTools()

            const toolsWithUi = tools
                .map( ( tool: any ) => ( {
                    ...tool,
                    _meta: {
                        ...( tool._meta || {} ),
                        ui: { resourceUri: uiResourceUri, ...uiMeta }
                    }
                } ) )

            return { tools: toolsWithUi }
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
                const result = await AgentToolsServer.#runSync( { toolConfig, args, llmConfig, toolRegistry, emitter, mcpServer: server } )

                return result
            }

            const { task } = await taskManager.createTask( {
                requestId: extra.requestId,
                request,
                sessionId: extra.sessionId,
                taskParams
            } )

            AgentToolsServer.#runAsync( { taskId: task.taskId, toolConfig, args, llmConfig, toolRegistry, taskManager, emitter } )

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


    static async #runSync( { toolConfig, args, llmConfig, toolRegistry, emitter, mcpServer }: { toolConfig: any, args: any, llmConfig: LLMConfig, toolRegistry: ToolRegistry, emitter?: EventEmitter, mcpServer?: any } ) {
        const { name: toolName, agent } = toolConfig
        const { systemPrompt, model, maxRounds, maxTokens } = agent
        const { baseURL, apiKey } = llmConfig
        const taskId = randomUUID()
        const query = args.query || JSON.stringify( args )

        const onElicit = mcpServer && toolConfig.elicitation?.enabled
            ? async ( { message, requestedSchema }: { message: string, requestedSchema: any } ) => {
                try {
                    const result = await mcpServer.elicitInput( { message, requestedSchema } )

                    return result
                } catch( err: any ) {
                    Logger.error( 'AgentServer', `Elicitation failed: ${err.message}` )

                    return { action: 'cancel' as const }
                }
            }
            : undefined

        const { toolClient } = await toolRegistry.createToolClient( { name: toolName, onElicit } )

        if( !toolClient ) {
            return {
                content: [ { type: 'text', text: `No tool sources configured for: ${toolName}` } ],
                isError: true
            }
        }

        const debugLevel = ( process.env[ 'DEBUG_LEVEL' ] || '' ) as 'info' | 'debug' | 'trace' | ''
        let debugWriter: DebugWriter | null = null

        if( debugLevel ) {
            const { writer } = DebugWriter.create( { agentName: toolName, level: debugLevel as any } )
            debugWriter = writer
        }

        if( emitter ) {
            emitter.emit( 'agent:start', { taskId, query, model, agentName: toolName, timestamp: Date.now() } )
        }

        try {
            const loopResult = await AgentLoop
                .start( {
                    query,
                    toolClient,
                    systemPrompt,
                    model,
                    maxRounds,
                    maxTokens,
                    baseURL,
                    apiKey,
                    answerSchema: agent.answerSchema || null,
                    elicitationConfig: toolConfig.elicitation || undefined,
                    onElicit,
                    onStatus: ( { status, round, message }: { status: string, round: number, message: string } ) => {
                        Logger.info( 'AgentServer', `sync | ${toolName} | ${status} | Round ${round} | ${message}` )

                        if( emitter ) {
                            emitter.emit( 'agent:status', { taskId, agentName: toolName, status, round, message, timestamp: Date.now() } )
                        }
                    },
                    onRoundLog: debugWriter ? ( log ) => debugWriter!.onRoundLog( log ) : undefined
                } )
            const { result } = loopResult!

            if( debugWriter ) {
                await debugWriter.flush()
            }

            if( emitter ) {
                emitter.emit( 'agent:complete', { taskId, agentName: toolName, result, timestamp: Date.now() } )
            }

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
            Logger.error( 'AgentServer', `sync | ${toolName} | failed | ${error.message}` )

            if( emitter ) {
                emitter.emit( 'agent:error', { taskId, agentName: toolName, error: error.message, timestamp: Date.now() } )
            }

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


    static async #runAsync( { taskId, toolConfig, args, llmConfig, toolRegistry, taskManager, emitter }: { taskId: string, toolConfig: any, args: any, llmConfig: LLMConfig, toolRegistry: ToolRegistry, taskManager: TaskManager, emitter?: EventEmitter } ) {
        const { name: toolName, agent } = toolConfig
        const { systemPrompt, model, maxRounds, maxTokens } = agent
        const { baseURL, apiKey } = llmConfig
        const query = args.query || JSON.stringify( args )

        const { toolClient } = await toolRegistry.createToolClient( { name: toolName } )

        if( !toolClient ) {
            await taskManager.failTask( { taskId, error: new Error( `No tool sources configured for: ${toolName}` ) } )

            return
        }

        const asyncDebugLevel = ( process.env[ 'DEBUG_LEVEL' ] || '' ) as 'info' | 'debug' | 'trace' | ''
        let asyncDebugWriter: DebugWriter | null = null

        if( asyncDebugLevel ) {
            const { writer } = DebugWriter.create( { agentName: toolName, level: asyncDebugLevel as any } )
            asyncDebugWriter = writer
        }

        if( emitter ) {
            emitter.emit( 'agent:start', { taskId, query, model, agentName: toolName, timestamp: Date.now() } )
        }

        try {
            const asyncResult = await AgentLoop
                .start( {
                    query,
                    toolClient,
                    systemPrompt,
                    model,
                    maxRounds,
                    maxTokens,
                    baseURL,
                    apiKey,
                    answerSchema: agent.answerSchema || null,
                    onStatus: ( { status, round, message }: { status: string, round: number, message: string } ) => {
                        Logger.info( 'AgentServer', `Task ${taskId} | ${toolName} | ${status} | Round ${round} | ${message}` )

                        if( emitter ) {
                            emitter.emit( 'agent:status', { taskId, agentName: toolName, status, round, message, timestamp: Date.now() } )
                        }
                    },
                    onRoundLog: asyncDebugWriter ? ( log ) => asyncDebugWriter!.onRoundLog( log ) : undefined
                } )
            const { result } = asyncResult!

            if( asyncDebugWriter ) {
                await asyncDebugWriter.flush()
            }

            if( emitter ) {
                emitter.emit( 'agent:complete', { taskId, agentName: toolName, result, timestamp: Date.now() } )
            }

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
            Logger.error( 'AgentServer', `Task ${taskId} | ${toolName} | failed | ${error.message}` )

            if( emitter ) {
                emitter.emit( 'agent:error', { taskId, agentName: toolName, error: error.message, timestamp: Date.now() } )
            }

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
