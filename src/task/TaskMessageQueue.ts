interface QueuedMessage {
    type: 'notification' | 'request'
    message: any
    timestamp: number
    resolver?: any
    originalRequestId?: string
}


class TaskMessageQueue {
    #queues: Map<string, QueuedMessage[]>
    #waitResolvers: Map<string, Array<() => void>>


    constructor() {
        this.#queues = new Map()
        this.#waitResolvers = new Map()
    }


    #getQueue( taskId: string ): QueuedMessage[] {
        let queue = this.#queues.get( taskId )

        if( !queue ) {
            queue = []
            this.#queues.set( taskId, queue )
        }

        return queue
    }


    async enqueue( { taskId, message }: { taskId: string, message: any } ) {
        const queue = this.#getQueue( taskId )
        queue.push( { type: 'notification', message, timestamp: Date.now() } )
        this.#notifyWaiters( taskId )
    }


    async enqueueWithResolver( { taskId, message, resolver, originalRequestId }: { taskId: string, message: any, resolver: any, originalRequestId: string } ) {
        const queue = this.#getQueue( taskId )

        const queuedMessage: QueuedMessage = {
            type: 'request',
            message,
            timestamp: Date.now(),
            resolver,
            originalRequestId
        }

        queue.push( queuedMessage )
        this.#notifyWaiters( taskId )
    }


    async dequeue( { taskId }: { taskId: string } ): Promise<QueuedMessage | null> {
        const queue = this.#getQueue( taskId )

        return queue.shift() || null
    }


    async dequeueAll( { taskId }: { taskId: string } ): Promise<QueuedMessage[]> {
        const queue = this.#queues.get( taskId ) || []
        this.#queues.delete( taskId )

        return queue
    }


    async waitForMessage( { taskId }: { taskId: string } ) {
        const queue = this.#getQueue( taskId )

        if( queue.length > 0 ) { return }

        return new Promise<void>( ( resolve ) => {
            let waiters = this.#waitResolvers.get( taskId )

            if( !waiters ) {
                waiters = []
                this.#waitResolvers.set( taskId, waiters )
            }

            waiters.push( resolve )
        } )
    }


    #notifyWaiters( taskId: string ) {
        const waiters = this.#waitResolvers.get( taskId )

        if( waiters ) {
            this.#waitResolvers.delete( taskId )
            waiters
                .forEach( ( resolve ) => { resolve() } )
        }
    }


    cleanup() {
        this.#queues.clear()
        this.#waitResolvers.clear()
    }
}


export { TaskMessageQueue }
