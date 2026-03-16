declare module 'flowmcp/v1' {
    export class FlowMCP {
        static prepareServerTool( params: {
            schema: any
            serverParams: Record<string, string>
            routeName: string
            validate?: boolean
        } ): {
            toolName: string
            description: string
            zod: any
            func: ( args: any ) => Promise<any>
        }
    }
}

declare module '@a2a-js/sdk/server/express' {
    export function agentCardHandler( card: any ): any
    export function jsonRpcHandler( options: any ): any
    export const UserBuilder: { noAuthentication(): any }
}

declare module '@a2a-js/sdk/server' {
    export class DefaultRequestHandler {
        constructor( options: any )
    }
    export class InMemoryTaskStore {
        constructor()
    }
}

declare module '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js' {
    export class InMemoryTaskStore {
        constructor()
        createTask( options: any, requestId: string, request: any, sessionId: string ): Promise<any>
        getTask( taskId: string ): Promise<any>
        getTaskResult( taskId: string ): Promise<any>
        storeTaskResult( taskId: string, status: string, result: any ): Promise<void>
        updateTaskStatus( taskId: string, status: string, message?: string ): Promise<void>
        listTasks?( cursor: any, limit: number ): Promise<any>
    }
}

declare module '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js' {
    export function isTerminal( status: string ): boolean
}
