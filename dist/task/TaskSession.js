class Resolver {
    #done;
    #promise;
    #resolve;
    #reject;
    constructor() {
        this.#done = false;
        this.#promise = new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });
    }
    setResult(value) {
        if (this.#done) {
            return;
        }
        this.#done = true;
        this.#resolve(value);
    }
    setException(error) {
        if (this.#done) {
            return;
        }
        this.#done = true;
        this.#reject(error);
    }
    wait() {
        return this.#promise;
    }
    done() {
        return this.#done;
    }
}
class TaskSession {
    #server;
    #taskId;
    #store;
    #queue;
    #requestCounter;
    constructor({ server, taskId, store, queue }) {
        this.#server = server;
        this.#taskId = taskId;
        this.#store = store;
        this.#queue = queue;
        this.#requestCounter = 0;
    }
    #nextRequestId() {
        this.#requestCounter++;
        return `task-${this.#taskId}-${this.#requestCounter}`;
    }
    async elicit({ message, requestedSchema }) {
        await this.#store.updateTaskStatus(this.#taskId, 'input_required');
        const requestId = this.#nextRequestId();
        const resolver = new Resolver();
        const params = {
            message,
            requestedSchema,
            _meta: {
                'io.modelcontextprotocol/related-task': { taskId: this.#taskId }
            }
        };
        const jsonrpcRequest = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'elicitation/create',
            params
        };
        await this.#queue.enqueueWithResolver({
            taskId: this.#taskId,
            message: jsonrpcRequest,
            resolver,
            originalRequestId: requestId
        });
        try {
            const response = await resolver.wait();
            await this.#store.updateTaskStatus(this.#taskId, 'working');
            return response;
        }
        catch (error) {
            await this.#store.updateTaskStatus(this.#taskId, 'working');
            throw error;
        }
    }
    async createMessage({ messages, maxTokens }) {
        await this.#store.updateTaskStatus(this.#taskId, 'input_required');
        const requestId = this.#nextRequestId();
        const resolver = new Resolver();
        const params = {
            messages,
            maxTokens,
            _meta: {
                'io.modelcontextprotocol/related-task': { taskId: this.#taskId }
            }
        };
        const jsonrpcRequest = {
            jsonrpc: '2.0',
            id: requestId,
            method: 'sampling/createMessage',
            params
        };
        await this.#queue.enqueueWithResolver({
            taskId: this.#taskId,
            message: jsonrpcRequest,
            resolver,
            originalRequestId: requestId
        });
        try {
            const response = await resolver.wait();
            await this.#store.updateTaskStatus(this.#taskId, 'working');
            return response;
        }
        catch (error) {
            await this.#store.updateTaskStatus(this.#taskId, 'working');
            throw error;
        }
    }
}
export { TaskSession, Resolver };
//# sourceMappingURL=TaskSession.js.map