import { EventEmitter } from 'node:events'

import { Logger } from '../logging/Logger.js'


type BridgeEvent = {
    type: string
    timestamp: number
    payload: Record<string, unknown>
}


class PostMessageBridge {
    #emitter: EventEmitter
    #eventCount: number
    #listeners: Array<{ eventName: string, listener: ( ...args: any[] ) => void }>


    constructor( { emitter }: { emitter: EventEmitter } ) {
        this.#emitter = emitter
        this.#eventCount = 0
        this.#listeners = []
    }


    static create( { emitter }: { emitter: EventEmitter } ) {
        const bridge = new PostMessageBridge( { emitter } )

        return { bridge }
    }


    start( { onEvent }: { onEvent: ( event: BridgeEvent ) => void } ) {
        const eventNames = [ 'agent:start', 'agent:status', 'agent:complete', 'agent:error' ]

        eventNames.forEach( ( eventName ) => {
            const listener = ( payload: Record<string, unknown> ) => {
                this.#eventCount++

                const event: BridgeEvent = {
                    type: eventName,
                    timestamp: Date.now(),
                    payload
                }

                try {
                    onEvent( event )
                } catch( err: any ) {
                    Logger.error( 'PostMessageBridge', `Failed to forward event ${eventName}`, err.message )
                }
            }

            this.#emitter.on( eventName, listener )
            this.#listeners.push( { eventName, listener } )
        } )

        Logger.info( 'PostMessageBridge', `Started — listening to ${eventNames.length} event types` )
    }


    stop() {
        this.#listeners.forEach( ( { eventName, listener } ) => {
            this.#emitter.removeListener( eventName, listener )
        } )

        this.#listeners = []
        Logger.info( 'PostMessageBridge', `Stopped — ${this.#eventCount} events forwarded` )
    }


    get eventCount(): number {
        return this.#eventCount
    }
}


export { PostMessageBridge }
export type { BridgeEvent }
