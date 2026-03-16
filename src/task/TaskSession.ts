class Resolver<T = any> {
    #done: boolean
    #promise: Promise<T>
    #resolve!: ( value: T ) => void
    #reject!: ( error: Error ) => void


    constructor() {
        this.#done = false
        this.#promise = new Promise<T>( ( resolve, reject ) => {
            this.#resolve = resolve
            this.#reject = reject
        } )
    }


    setResult( value: T ) {
        if( this.#done ) { return }
        this.#done = true
        this.#resolve( value )
    }


    setException( error: Error ) {
        if( this.#done ) { return }
        this.#done = true
        this.#reject( error )
    }


    wait() {
        return this.#promise
    }


    done() {
        return this.#done
    }
}


class TaskSession {
    #server: any
    #taskId: string
    #store: any
    #queue: any
    #requestCounter: number


    constructor( { server, taskId, store, queue }: { server: any, taskId: string, store: any, queue: any } ) {
        this.#server = server
        this.#taskId = taskId
        this.#store = store
        this.#queue = queue
        this.#requestCounter = 0
    }


    #nextRequestId() {
        this.#requestCounter++

        return `task-${this.#taskId}-${this.#requestCounter}`
    }


    async elicit( { message, requestedSchema }: { message: string, requestedSchema: any } ) {
        await this.#store.updateTaskStatus( this.#taskId, 'input_required' )

        const requestId = this.#nextRequestId()
        const resolver = new Resolver()

        const params = {
            message,
            requestedSchema,
            _meta: {
                'io.modelcontextprotocol/related-task': { taskId: this.#taskId }
            }
        }

        const jsonrpcRequest = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'elicitation/create',
            params
        }

        await this.#queue.enqueueWithResolver( {
            taskId: this.#taskId,
            message: jsonrpcRequest,
            resolver,
            originalRequestId: requestId
        } )

        try {
            const response = await resolver.wait()
            await this.#store.updateTaskStatus( this.#taskId, 'working' )

            return response
        } catch( error ) {
            await this.#store.updateTaskStatus( this.#taskId, 'working' )

            throw error
        }
    }


    async createMessage( { messages, maxTokens }: { messages: any[], maxTokens: number } ) {
        await this.#store.updateTaskStatus( this.#taskId, 'input_required' )

        const requestId = this.#nextRequestId()
        const resolver = new Resolver()

        const params = {
            messages,
            maxTokens,
            _meta: {
                'io.modelcontextprotocol/related-task': { taskId: this.#taskId }
            }
        }

        const jsonrpcRequest = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'sampling/createMessage',
            params
        }

        await this.#queue.enqueueWithResolver( {
            taskId: this.#taskId,
            message: jsonrpcRequest,
            resolver,
            originalRequestId: requestId
        } )

        try {
            const response = await resolver.wait()
            await this.#store.updateTaskStatus( this.#taskId, 'working' )

            return response
        } catch( error ) {
            await this.#store.updateTaskStatus( this.#taskId, 'working' )

            throw error
        }
    }
}


export { TaskSession, Resolver }
