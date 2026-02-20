import { FlowMCP } from 'flowmcp/v1'


class InProcessToolClient {
    #tools


    constructor( { schemas, serverParams = {} } ) {
        this.#tools = new Map()

        schemas
            .forEach( ( schema ) => {
                const routeNames = Object.keys( schema.routes )
                routeNames
                    .forEach( ( routeName ) => {
                        const { toolName, description, zod, func } = FlowMCP
                            .prepareServerTool( { schema, serverParams, routeName, validate: false } )

                        this.#tools.set( toolName, { name: toolName, description, inputSchema: zod, func } )
                    } )
            } )
    }


    async listTools() {
        const tools = [ ...this.#tools.values() ]
            .map( ( { name, description, inputSchema } ) => {
                return { name, description, inputSchema }
            } )

        return { tools }
    }


    async callTool( { name, arguments: args } ) {
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


    close() {
        // no-op — in-process, nothing to close
    }
}


export { InProcessToolClient }
