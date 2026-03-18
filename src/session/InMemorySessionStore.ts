import type { ConversationContext, SessionStoreBackend } from '../types/index.js'


class InMemorySessionStore implements SessionStoreBackend {
    #store: Map<string, ConversationContext>


    constructor() {
        this.#store = new Map()
    }


    async get( { sessionId }: { sessionId: string } ): Promise<ConversationContext | null> {
        return this.#store.get( sessionId ) || null
    }


    async set( { sessionId, context }: { sessionId: string, context: ConversationContext } ): Promise<void> {
        this.#store.set( sessionId, context )
    }


    async delete( { sessionId }: { sessionId: string } ): Promise<void> {
        this.#store.delete( sessionId )
    }


    async has( { sessionId }: { sessionId: string } ): Promise<boolean> {
        return this.#store.has( sessionId )
    }


    async cleanup( { ttlMs }: { ttlMs: number } ): Promise<number> {
        const now = Date.now()
        let removed = 0

        const expired = [ ...this.#store.entries() ]
            .filter( ( [ , ctx ] ) => {
                const lastActivity = new Date( ctx.lastActivity ).getTime()
                return ( now - lastActivity ) > ttlMs
            } )

        expired.forEach( ( [ sessionId ] ) => {
            this.#store.delete( sessionId )
            removed++
        } )

        return removed
    }
}


export { InMemorySessionStore }
