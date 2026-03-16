import type { ToolClient, Tool, ToolResult } from '../types/index.js'


class CompositeToolClient implements ToolClient {
    #clients: ToolClient[]


    constructor( { clients }: { clients: ToolClient[] } ) {
        this.#clients = clients
    }


    async listTools(): Promise<{ tools: Tool[] }> {
        const toolArrays = await Promise.all(
            this.#clients
                .map( async ( client ) => {
                    const { tools } = await client.listTools()

                    return tools
                } )
        )

        const tools = toolArrays.flat()

        return { tools }
    }


    async callTool( { name, arguments: args }: { name: string, arguments: Record<string, unknown> } ): Promise<ToolResult> {
        const entries = await Promise.all(
            this.#clients
                .map( async ( client ) => {
                    const { tools } = await client.listTools()
                    const hasTool = tools
                        .some( ( tool ) => tool.name === name )

                    return { client, hasTool }
                } )
        )

        const match = entries
            .find( ( { hasTool } ) => hasTool )

        if( !match ) {
            return {
                content: [ { type: 'text', text: `Error: Unknown tool "${name}"` } ],
                isError: true
            }
        }

        const result = await match.client.callTool( { name, arguments: args } )

        return result
    }


    async close(): Promise<void> {
        await Promise.all(
            this.#clients
                .map( async ( client ) => {
                    await client.close()
                } )
        )
    }
}


export { CompositeToolClient }
