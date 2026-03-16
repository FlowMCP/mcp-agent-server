import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js'
import { isTerminal } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js'


class TaskManager {
    #taskStore
    #taskResolvers


    constructor( { taskStore = null } ) {
        this.#taskStore = taskStore || new InMemoryTaskStore()
        this.#taskResolvers = new Map()
    }


    async createTask( { requestId, request, sessionId, taskParams } ) {
        const taskOptions = {
            ttl: taskParams.ttl,
            pollInterval: taskParams.pollInterval ?? 1000
        }

        const task = await this.#taskStore.createTask(
            taskOptions,
            requestId,
            request,
            sessionId
        )

        return { task }
    }


    async completeTask( { taskId, result } ) {
        await this.#taskStore.storeTaskResult( taskId, 'completed', result )

        TaskManager.#notifyResolvers( { taskId, taskResolvers: this.#taskResolvers } )
    }


    async failTask( { taskId, error } ) {
        const errorResult = {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify( { status: 'error', error: error.message }, null, 2 )
                }
            ],
            isError: true
        }

        await this.#taskStore.storeTaskResult( taskId, 'failed', errorResult )

        TaskManager.#notifyResolvers( { taskId, taskResolvers: this.#taskResolvers } )
    }


    async getTask( { taskId } ) {
        const task = await this.#taskStore.getTask( taskId )

        return { task }
    }


    async getTaskResult( { taskId } ) {
        const { task } = await this.getTask( { taskId } )

        if( !task ) {
            throw new Error( `Task ${taskId} not found` )
        }

        if( isTerminal( task.status ) ) {
            const result = await this.#taskStore.getTaskResult( taskId )

            return result
        }

        await TaskManager.#waitForComplete( { taskId, taskResolvers: this.#taskResolvers } )

        const result = await this.#taskStore.getTaskResult( taskId )

        return result
    }


    async cancelTask( { taskId } ) {
        const { task } = await this.getTask( { taskId } )

        if( !task ) {
            throw new Error( `Task ${taskId} not found` )
        }

        if( isTerminal( task.status ) ) {
            throw new Error( `Cannot cancel task ${taskId} — already in terminal status: ${task.status}` )
        }

        await this.#taskStore.updateTaskStatus( taskId, 'cancelled' )

        TaskManager.#notifyResolvers( { taskId, taskResolvers: this.#taskResolvers } )

        return { taskId, status: 'cancelled' }
    }


    async updateTaskStatus( { taskId, status, statusMessage } ) {
        await this.#taskStore.updateTaskStatus( taskId, status, statusMessage )

        if( isTerminal( status ) ) {
            TaskManager.#notifyResolvers( { taskId, taskResolvers: this.#taskResolvers } )
        }
    }


    async listTasks( { cursor, limit = 50 } = {} ) {
        const allTasks = []
        const store = this.#taskStore

        if( store.listTasks ) {
            const result = await store.listTasks( cursor, limit )

            return result
        }

        return { tasks: allTasks }
    }


    get taskStore() {
        return this.#taskStore
    }


    static #notifyResolvers( { taskId, taskResolvers } ) {
        const resolvers = taskResolvers.get( taskId )

        if( resolvers ) {
            taskResolvers.delete( taskId )
            resolvers.forEach( ( resolve ) => resolve() )
        }
    }


    static #waitForComplete( { taskId, taskResolvers } ) {
        return new Promise( ( resolve ) => {
            const existing = taskResolvers.get( taskId ) || []
            existing.push( resolve )
            taskResolvers.set( taskId, existing )
        } )
    }
}


export { TaskManager }
