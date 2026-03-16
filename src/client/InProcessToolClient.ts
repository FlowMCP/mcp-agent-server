import { FlowMCP } from 'flowmcp/v1'

import type { ToolClient, Tool, ToolResult } from '../types/index.js'


class InProcessToolClient implements ToolClient {
    #tools: Map<string, { name: string, description: string, inputSchema: any, func: ( args: any ) => Promise<any> }>


    constructor( { schemas, serverParams = {} }: { schemas: any[], serverParams?: Record<string, string> } ) {
        this.#tools = new Map()

        schemas
            .forEach( ( schema: any ) => {
                const routeNames = Object.keys( schema.routes )
                routeNames
                    .forEach( ( routeName ) => {
                        const { toolName, description, zod, func } = FlowMCP
                            .prepareServerTool( { schema, serverParams, routeName, validate: false } )

                        this.#tools.set( toolName, { name: toolName, description, inputSchema: zod, func } )
                    } )
            } )
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

        const result = await tool.func( args )

        return result
    }


    async close(): Promise<void> {
        // no-op — in-process, nothing to close
    }
}


export { InProcessToolClient }
