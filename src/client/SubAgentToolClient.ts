import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { Logger } from '../logging/Logger.js'
import type { ToolClient, Tool, ToolResult, ElicitCallback } from '../types/index.js'


class SubAgentToolClient implements ToolClient {
    #client: Client | null
    #transport: StreamableHTTPClientTransport | null
    #url: string
    #name: string
    #tools: Map<string, Tool>
    #connected: boolean
    #onElicit: ElicitCallback | null


    constructor( { url, name = 'sub-agent' }: { url: string, name?: string } ) {
        this.#url = url
        this.#name = name
        this.#tools = new Map()
        this.#connected = false
        this.#client = null
        this.#transport = null
        this.#onElicit = null
    }


    async connect( { onElicit }: { onElicit?: ElicitCallback } = {} ) {
        this.#onElicit = onElicit || null

        this.#transport = new StreamableHTTPClientTransport(
            new URL( this.#url )
        )

        this.#client = new Client(
            { name: `main-agent-client-${this.#name}`, version: '1.0.0' },
            { capabilities: {} }
        )

        if( this.#onElicit ) {
            const elicitCallback = this.#onElicit

            this.#client.setRequestHandler( ElicitRequestSchema, async ( request: any ) => {
                const { message, requestedSchema } = request.params

                Logger.debug( 'SubAgentToolClient', `Elicitation request from sub-agent "${this.#name}": ${message}` )

                const response = await elicitCallback( { message, requestedSchema } )

                return {
                    action: response.action,
                    content: response.content
                }
            } )
        }

        await this.#client.connect( this.#transport )
        this.#connected = true

        const { tools } = await this.#client.listTools()
        tools
            .forEach( ( tool: any ) => {
                const { name, description, inputSchema } = tool

                this.#tools.set( name, { name, description, inputSchema } )
            } )

        return { tools: tools.length }
    }


    async listTools(): Promise<{ tools: Tool[] }> {
        if( !this.#connected ) {
            await this.connect()
        }

        const tools = [ ...this.#tools.values() ]

        return { tools }
    }


    async callTool( { name, arguments: args }: { name: string, arguments: Record<string, unknown> } ): Promise<ToolResult> {
        if( !this.#connected ) {
            await this.connect()
        }

        const tool = this.#tools.get( name )

        if( !tool ) {
            return {
                content: [ { type: 'text', text: `Error: Unknown tool "${name}" on sub-agent "${this.#name}"` } ],
                isError: true
            }
        }

        try {
            const result = await this.#client!.callTool( { name, arguments: args } )

            return result as ToolResult
        } catch( error: any ) {
            return {
                content: [ { type: 'text', text: `Error calling sub-agent "${this.#name}" tool "${name}": ${error.message}` } ],
                isError: true
            }
        }
    }


    async close(): Promise<void> {
        if( this.#client ) {
            try {
                await this.#client.close()
            } catch {
                // Ignore close errors
            }
        }

        this.#connected = false
    }
}


export { SubAgentToolClient }
