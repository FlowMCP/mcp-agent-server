import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'


class SubAgentToolClient {
    #client
    #transport
    #url
    #name
    #tools
    #connected


    constructor( { url, name = 'sub-agent' } ) {
        this.#url = url
        this.#name = name
        this.#tools = new Map()
        this.#connected = false
    }


    async connect() {
        this.#transport = new StreamableHTTPClientTransport(
            new URL( this.#url )
        )

        this.#client = new Client(
            { name: `main-agent-client-${this.#name}`, version: '1.0.0' },
            { capabilities: {} }
        )

        await this.#client.connect( this.#transport )
        this.#connected = true

        const { tools } = await this.#client.listTools()
        tools
            .forEach( ( tool ) => {
                const { name, description, inputSchema } = tool

                this.#tools.set( name, { name, description, inputSchema } )
            } )

        return { tools: tools.length }
    }


    async listTools() {
        if( !this.#connected ) {
            await this.connect()
        }

        const tools = [ ...this.#tools.values() ]

        return { tools }
    }


    async callTool( { name, arguments: args } ) {
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
            const result = await this.#client.callTool( { name, arguments: args } )

            return result
        } catch( error ) {
            return {
                content: [ { type: 'text', text: `Error calling sub-agent "${this.#name}" tool "${name}": ${error.message}` } ],
                isError: true
            }
        }
    }


    close() {
        if( this.#client ) {
            try {
                this.#client.close()
            } catch {
                // Ignore close errors
            }
        }

        this.#connected = false
    }
}


export { SubAgentToolClient }
