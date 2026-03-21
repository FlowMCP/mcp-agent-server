declare class TaskManager {
    #private;
    constructor({ taskStore }: {
        taskStore?: any;
    });
    createTask({ requestId, request, sessionId, taskParams }: {
        requestId: string;
        request: any;
        sessionId: string;
        taskParams: any;
    }): Promise<{
        task: any;
    }>;
    completeTask({ taskId, result }: {
        taskId: string;
        result: any;
    }): Promise<void>;
    failTask({ taskId, error }: {
        taskId: string;
        error: Error;
    }): Promise<void>;
    getTask({ taskId }: {
        taskId: string;
    }): Promise<{
        task: any;
    }>;
    getTaskResult({ taskId }: {
        taskId: string;
    }): Promise<any>;
    cancelTask({ taskId }: {
        taskId: string;
    }): Promise<{
        taskId: string;
        status: string;
    }>;
    updateTaskStatus({ taskId, status }: {
        taskId: string;
        status: string;
    }): Promise<void>;
    listTasks({ cursor, limit }?: {
        cursor?: string;
        limit?: number;
    }): Promise<any>;
    get taskStore(): any;
}
export { TaskManager };
//# sourceMappingURL=TaskManager.d.ts.map