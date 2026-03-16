import { InProcessToolClient } from '../client/InProcessToolClient.js'
import { CompositeToolClient } from '../client/CompositeToolClient.js'
import { SubAgentToolClient } from '../client/SubAgentToolClient.js'
import type { ToolClient } from '../types/index.js'


class ToolRegistry {
    #tools: Map<string, any>


    constructor( { tools }: { tools: Map<string, any> } ) {
        this.#tools = tools
    }


    static create( { toolConfigs }: { toolConfigs: any[] } ) {
        const tools = new Map()

        toolConfigs
            .forEach( ( config ) => {
                const { name } = config

                tools.set( name, config )
            } )

        const registry = new ToolRegistry( { tools } )

        return { registry }
    }


    listTools() {
        const tools = [ ...this.#tools.values() ]
            .map( ( config ) => {
                const { name, description, inputSchema, execution } = config

                const entry: Record<string, any> = { name, description, inputSchema }

                if( execution ) {
                    entry.execution = execution
                }

                return entry
            } )

        return { tools }
    }


    getToolConfig( { name }: { name: string } ) {
        const toolConfig = this.#tools.get( name ) || null

        return { toolConfig }
    }


    async createToolClient( { name }: { name: string } ): Promise<{ toolClient: ToolClient | null }> {
        const { toolConfig } = this.getToolConfig( { name } )

        if( !toolConfig ) {
            return { toolClient: null }
        }

        const { toolSources } = toolConfig

        if( !toolSources || toolSources.length === 0 ) {
            return { toolClient: null }
        }

        const clients: ToolClient[] = []

        const clientPromises = toolSources
            .map( async ( source: any ) => {
                const client = ToolRegistry.#createClientFromSource( { source } )

                if( client && ( client as any ).connect ) {
                    await ( client as any ).connect()
                }

                return client
            } )

        const resolvedClients = await Promise.all( clientPromises )
        resolvedClients
            .filter( Boolean )
            .forEach( ( client ) => { clients.push( client as ToolClient ) } )

        if( clients.length === 0 ) {
            return { toolClient: null }
        }

        if( clients.length === 1 ) {
            const toolClient = clients[ 0 ]

            return { toolClient }
        }

        const toolClient = new CompositeToolClient( { clients } )

        return { toolClient }
    }


    static fromManifest( { manifest, toolSources }: { manifest: Record<string, any>, toolSources: any[] } ) {
        const agentConfig = {
            systemPrompt: manifest[ 'systemPrompt' ] as string,
            model: manifest[ 'model' ] as string,
            maxRounds: manifest[ 'maxRounds' ] as number,
            maxTokens: manifest[ 'maxTokens' ] as number
        }

        const name = manifest[ 'name' ] as string
        const description = manifest[ 'description' ] as string
        const inputSchema = manifest[ 'inputSchema' ] || {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Input query for the agent'
                }
            },
            required: [ 'query' ]
        }

        const toolConfig = {
            name,
            description,
            inputSchema,
            agent: agentConfig,
            toolSources,
            _manifest: manifest
        }

        return { toolConfig }
    }


    static async #createClientFromSource( { source }: { source: any } ): Promise<ToolClient | null> {
        const { type } = source

        if( type === 'flowmcp' ) {
            const { schemaPaths, serverParams } = source
            const toolClient = await InProcessToolClient.create( {
                schemaPaths: schemaPaths || [],
                serverParams: serverParams || {}
            } )

            return toolClient
        }

        if( type === 'mcp-remote' ) {
            const { url, name } = source
            const toolClient = new SubAgentToolClient( { url, name } )

            return toolClient
        }

        console.warn( `[ToolRegistry] Unknown tool source type: "${type}" — skipping` )

        return null
    }
}


export { ToolRegistry }
