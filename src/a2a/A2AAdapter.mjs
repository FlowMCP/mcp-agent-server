import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import { DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server'

import { AgentCardGenerator } from './AgentCardGenerator.mjs'


class A2AAdapter {
    #agentCard
    #requestHandler


    constructor( { agentCard, requestHandler } ) {
        this.#agentCard = agentCard
        this.#requestHandler = requestHandler
    }


    static from( { mcp, manifest, serverUrl = '' } ) {
        const { agentCard } = AgentCardGenerator.generate( { manifest, serverUrl } )

        const taskStore = new InMemoryTaskStore()

        const agentExecutor = A2AAdapter.#createExecutor( { mcp, manifest } )

        const requestHandler = new DefaultRequestHandler( {
            taskStore,
            agentCard,
            agent: agentExecutor
        } )

        const adapter = new A2AAdapter( { agentCard, requestHandler } )

        return adapter
    }


    agentCardMiddleware() {
        const card = this.#agentCard

        const handler = ( req, res ) => {
            res.json( card )
        }

        return handler
    }


    handler() {
        const requestHandler = this.#requestHandler

        const middleware = jsonRpcHandler( {
            handler: requestHandler,
            user: UserBuilder.noAuthentication()
        } )

        return middleware
    }


    getAgentCard() {
        const agentCard = this.#agentCard

        return { agentCard }
    }


    static #createExecutor( { mcp, manifest } ) {
        const agentName = manifest[ 'name' ]

        const executor = {
            async execute( { message, context, eventBus } ) {
                const query = A2AAdapter.#extractQuery( { message } )

                try {
                    const { toolConfig } = mcp.getToolConfig( { name: agentName } )

                    if( !toolConfig ) {
                        const errorMsg = { role: 'agent', parts: [ { text: `Agent "${agentName}" not found` } ] }
                        eventBus.publish( errorMsg )
                        eventBus.finished()

                        return
                    }

                    const result = await mcp.callTool( { name: agentName, arguments: { query } } )
                    const text = A2AAdapter.#extractText( { result } )

                    const responseMsg = { role: 'agent', parts: [ { text } ] }
                    eventBus.publish( responseMsg )
                    eventBus.finished()
                } catch( error ) {
                    const errorMsg = { role: 'agent', parts: [ { text: `Error: ${error.message}` } ] }
                    eventBus.publish( errorMsg )
                    eventBus.finished()
                }
            }
        }

        return executor
    }


    static #extractQuery( { message } ) {
        const parts = message[ 'parts' ] || []
        const textPart = parts
            .find( ( part ) => part[ 'text' ] !== undefined )

        const query = textPart ? textPart[ 'text' ] : ''

        return query
    }


    static #extractText( { result } ) {
        if( !result || !result[ 'content' ] ) {
            return 'No result'
        }

        const content = result[ 'content' ]
        const texts = content
            .filter( ( item ) => item[ 'type' ] === 'text' )
            .map( ( item ) => item[ 'text' ] )

        const text = texts.join( '\n' )

        return text
    }
}


export { A2AAdapter }
