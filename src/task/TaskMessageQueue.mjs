class TaskMessageQueue {
    #queues
    #waitResolvers


    constructor() {
        this.#queues = new Map()
        this.#waitResolvers = new Map()
    }


    #getQueue( taskId ) {
        let queue = this.#queues.get( taskId )

        if( !queue ) {
            queue = []
            this.#queues.set( taskId, queue )
        }

        return queue
    }


    async enqueue( { taskId, message } ) {
        const queue = this.#getQueue( taskId )
        queue.push( { type: 'notification', message, timestamp: Date.now() } )
        this.#notifyWaiters( taskId )
    }


    async enqueueWithResolver( { taskId, message, resolver, originalRequestId } ) {
        const queue = this.#getQueue( taskId )

        const queuedMessage = {
            type: 'request',
            message,
            timestamp: Date.now(),
            resolver,
            originalRequestId
        }

        queue.push( queuedMessage )
        this.#notifyWaiters( taskId )
    }


    async dequeue( { taskId } ) {
        const queue = this.#getQueue( taskId )

        return queue.shift() || null
    }


    async dequeueAll( { taskId } ) {
        const queue = this.#queues.get( taskId ) || []
        this.#queues.delete( taskId )

        return queue
    }


    async waitForMessage( { taskId } ) {
        const queue = this.#getQueue( taskId )

        if( queue.length > 0 ) { return }

        return new Promise( ( resolve ) => {
            let waiters = this.#waitResolvers.get( taskId )

            if( !waiters ) {
                waiters = []
                this.#waitResolvers.set( taskId, waiters )
            }

            waiters.push( resolve )
        } )
    }


    #notifyWaiters( taskId ) {
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
