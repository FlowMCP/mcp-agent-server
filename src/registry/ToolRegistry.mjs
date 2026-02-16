import { InProcessToolClient } from '../client/InProcessToolClient.mjs'
import { CompositeToolClient } from '../client/CompositeToolClient.mjs'


class ToolRegistry {
    #tools


    constructor( { tools } ) {
        this.#tools = tools
    }


    static create( { toolConfigs } ) {
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

                const entry = { name, description, inputSchema }

                if( execution ) {
                    entry.execution = execution
                }

                return entry
            } )

        return { tools }
    }


    getToolConfig( { name } ) {
        const toolConfig = this.#tools.get( name ) || null

        return { toolConfig }
    }


    createToolClient( { name } ) {
        const { toolConfig } = this.getToolConfig( { name } )

        if( !toolConfig ) {
            return { toolClient: null }
        }

        const { toolSources } = toolConfig

        if( !toolSources || toolSources.length === 0 ) {
            return { toolClient: null }
        }

        const clients = toolSources
            .map( ( source ) => {
                return ToolRegistry.#createClientFromSource( { source } )
            } )
            .filter( Boolean )

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


    static #createClientFromSource( { source } ) {
        const { type } = source

        if( type === 'flowmcp' ) {
            const { schemas, serverParams } = source
            const toolClient = new InProcessToolClient( {
                schemas: schemas || [],
                serverParams: serverParams || {}
            } )

            return toolClient
        }

        console.warn( `[ToolRegistry] Unknown tool source type: "${type}" — skipping` )

        return null
    }
}


export { ToolRegistry }
