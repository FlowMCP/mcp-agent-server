import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema, CallToolRequestSchema, GetTaskRequestSchema, GetTaskPayloadRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { ToolRegistry } from './registry/ToolRegistry.mjs'
import { TaskManager } from './task/TaskManager.mjs'
import { AgentLoop } from './agent/AgentLoop.mjs'


class AgentToolsServer {
    #config
    #llmConfig
    #toolRegistry
    #taskManager
    #transports


    constructor( { config, llmConfig, toolRegistry, taskManager } ) {
        this.#config = config
        this.#llmConfig = llmConfig
        this.#toolRegistry = toolRegistry
        this.#taskManager = taskManager
        this.#transports = {}
    }


    static async create( { name, version, routePath = '/mcp', llm, tools, tasks = {} } ) {
        const config = { name, version, routePath }
        const llmConfig = { baseURL: llm.baseURL, apiKey: llm.apiKey }

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


    middleware() {
        const routePath = this.#config.routePath
        const transports = this.#transports
        const createServer = this.#createServer.bind( this )

        const middleware = async ( req, res, next ) => {
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
        const { name, version } = this.#config
        const llmConfig = this.#llmConfig
        const toolRegistry = this.#toolRegistry
        const taskManager = this.#taskManager

        const server = new Server(
            { name, version },
            {
                capabilities: {
                    tools: {},
                    tasks: {
                        requests: {
                            tools: { call: {} }
                        }
                    }
                }
            }
        )

        server.setRequestHandler( ListToolsRequestSchema, async () => {
            const { tools } = toolRegistry.listTools()

            return { tools }
        } )

        server.setRequestHandler( CallToolRequestSchema, async ( request, extra ) => {
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

        server.setRequestHandler( GetTaskRequestSchema, async ( request ) => {
            const { taskId } = request.params
            const { task } = await taskManager.getTask( { taskId } )

            if( !task ) {
                throw new Error( `Task ${taskId} not found` )
            }

            return task
        } )

        server.setRequestHandler( GetTaskPayloadRequestSchema, async ( request ) => {
            const { taskId } = request.params

            const result = await taskManager.getTaskResult( { taskId } )

            return result
        } )

        return server
    }


    static async #runSync( { toolConfig, args, llmConfig, toolRegistry } ) {
        const { name: toolName, agent } = toolConfig
        const { systemPrompt, model, maxRounds, maxTokens } = agent
        const { baseURL, apiKey } = llmConfig

        const { toolClient } = toolRegistry.createToolClient( { name: toolName } )

        if( !toolClient ) {
            return {
                content: [ { type: 'text', text: `No tool sources configured for: ${toolName}` } ],
                isError: true
            }
        }

        try {
            const { result } = await AgentLoop
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

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify( result, null, 2 )
                    }
                ],
                structuredContent: result
            }
        } catch( error ) {
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


    static async #runAsync( { taskId, toolConfig, args, llmConfig, toolRegistry, taskManager } ) {
        const { name: toolName, agent } = toolConfig
        const { systemPrompt, model, maxRounds, maxTokens } = agent
        const { baseURL, apiKey } = llmConfig

        const { toolClient } = toolRegistry.createToolClient( { name: toolName } )

        if( !toolClient ) {
            await taskManager.failTask( { taskId, error: new Error( `No tool sources configured for: ${toolName}` ) } )

            return
        }

        try {
            const { result } = await AgentLoop
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
        } catch( error ) {
            console.error( `[AgentServer] Task ${taskId} | ${toolName} | failed | ${error.message}` )

            await taskManager.failTask( { taskId, error } )
        } finally {
            toolClient.close()
        }
    }


    static async #handlePost( { req, res, transports, createServer } ) {
        const sessionId = req.headers[ 'mcp-session-id' ]

        try {
            if( sessionId && transports[ sessionId ] ) {
                const transport = transports[ sessionId ]
                await transport.handleRequest( req, res, req.body )

                return
            }

            if( !sessionId && AgentToolsServer.#isInitializeRequest( { body: req.body } ) ) {
                const transport = new StreamableHTTPServerTransport( {
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: ( sid ) => {
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
        } catch( error ) {
            if( !res.headersSent ) {
                res.status( 500 ).json( {
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null
                } )
            }
        }
    }


    static async #handleGet( { req, res, transports } ) {
        const sessionId = req.headers[ 'mcp-session-id' ]

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


    static async #handleDelete( { req, res, transports } ) {
        const sessionId = req.headers[ 'mcp-session-id' ]

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


    static #isInitializeRequest( { body } ) {
        const isObject = typeof body === 'object' && body !== null
        const isInit = isObject && body.method === 'initialize'

        return isInit
    }
}


export { AgentToolsServer }
