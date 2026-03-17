import { FlowMCP } from 'flowmcp'

import { Logger } from '../logging/Logger.js'
import { MASError, MAS_ERROR_CODES } from '../errors/MASError.js'
import type { ToolClient, Tool, ToolResult } from '../types/index.js'


class InProcessToolClient implements ToolClient {
    #tools: Map<string, { name: string, description: string, inputSchema: any, func: ( args: any ) => Promise<any> }>


    private constructor() {
        this.#tools = new Map()
    }


    static async create( { schemaPaths, serverParams = {} }: { schemaPaths: string[], serverParams?: Record<string, string> } ): Promise<InProcessToolClient> {
        const client = new InProcessToolClient()
        await client.#loadSchemas( { schemaPaths, serverParams } )

        return client
    }


    static async fromSchemas( { schemas, serverParams = {} }: { schemas: any[], serverParams?: Record<string, string> } ): Promise<InProcessToolClient> {
        const client = new InProcessToolClient()
        await client.#loadPreloadedSchemas( { schemas, serverParams } )

        return client
    }


    async #loadSchemas( { schemaPaths, serverParams }: { schemaPaths: string[], serverParams: Record<string, string> } ) {
        for( const schemaPath of schemaPaths ) {
            const { main, handlerMap } = await FlowMCP.loadSchema( { filePath: schemaPath } )

            if( !main.version || !main.version.startsWith( '3.' ) ) {
                throw new MASError( {
                    code: MAS_ERROR_CODES.SCHEMA_VERSION,
                    message: `Schema "${schemaPath}" is not v3. Found version: ${main.version || 'undefined'}`,
                    details: { schemaPath, version: main.version }
                } )
            }

            const toolNames = Object.keys( main[ 'tools' ] || {} )

            for( const routeName of toolNames ) {
                const { toolName, description, zod, func } = FlowMCP
                    .prepareServerTool( { main, handlerMap, serverParams, routeName } )

                this.#tools.set( toolName, { name: toolName, description, inputSchema: zod, func } )
            }
        }
    }


    async #loadPreloadedSchemas( { schemas, serverParams }: { schemas: any[], serverParams: Record<string, string> } ) {
        for( const schema of schemas ) {
            const main = schema
            const rawHandlers = schema.handlers || {}
            const handlerMap = typeof rawHandlers === 'function' ? rawHandlers( { sharedLists: {}, libraries: {} } ) : rawHandlers

            if( !main.version || !main.version.startsWith( '3.' ) ) {
                throw new MASError( {
                    code: MAS_ERROR_CODES.SCHEMA_VERSION,
                    message: `Schema "${main.namespace}" is not v3. Found version: ${main.version || 'undefined'}`,
                    details: { namespace: main.namespace, version: main.version }
                } )
            }

            const toolNames = Object.keys( main[ 'tools' ] || {} )

            for( const routeName of toolNames ) {
                try {
                    const { toolName, description, zod, func } = FlowMCP
                        .prepareServerTool( { main, handlerMap, serverParams, routeName } )

                    this.#tools.set( toolName, { name: toolName, description, inputSchema: zod, func } )
                } catch( err: any ) {
                    Logger.warn( 'InProcessToolClient', `Skipping tool "${main.namespace}/${routeName}": ${err.message}` )
                }
            }
        }
    }


    async listTools(): Promise<{ tools: Tool[] }> {
        const tools = [ ...this.#tools.values() ]
            .map( ( { name, description, inputSchema } ) => {
                return { name, description, inputSchema }
            } )

        return { tools }
    }


    async callTool( { name, arguments: args }: { name: string, arguments: Record<string, unknown> } ): Promise<ToolResult> {
        const tool = this.#tools.get( name )

        if( !tool ) {
            return {
                content: [ { type: 'text', text: `Error: Unknown tool "${name}"` } ],
                isError: true
            }
        }

        const raw = await tool.func( args )

        if( raw && raw.content && Array.isArray( raw.content ) ) {
            return raw
        }

        if( raw && raw.status !== undefined ) {
            const text = raw.data
                ? JSON.stringify( raw.data )
                : raw.dataAsString || JSON.stringify( raw )

            return {
                content: [ { type: 'text', text } ],
                isError: !raw.status
            }
        }

        return {
            content: [ { type: 'text', text: JSON.stringify( raw ) } ],
            isError: false
        }
    }


    async close(): Promise<void> {
        // no-op — in-process, nothing to close
    }
}


export { InProcessToolClient }
