interface QueuedMessage {
    type: 'notification' | 'request';
    message: any;
    timestamp: number;
    resolver?: any;
    originalRequestId?: string;
}
declare class TaskMessageQueue {
    #private;
    constructor();
    enqueue({ taskId, message }: {
        taskId: string;
        message: any;
    }): Promise<void>;
    enqueueWithResolver({ taskId, message, resolver, originalRequestId }: {
        taskId: string;
        message: any;
        resolver: any;
        originalRequestId: string;
    }): Promise<void>;
    dequeue({ taskId }: {
        taskId: string;
    }): Promise<QueuedMessage | null>;
    dequeueAll({ taskId }: {
        taskId: string;
    }): Promise<QueuedMessage[]>;
    waitForMessage({ taskId }: {
        taskId: string;
    }): Promise<void>;
    cleanup(): void;
}
export { TaskMessageQueue };
//# sourceMappingURL=TaskMessageQueue.d.ts.map