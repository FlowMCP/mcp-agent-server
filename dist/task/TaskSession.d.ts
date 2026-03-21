declare class Resolver<T = any> {
    #private;
    constructor();
    setResult(value: T): void;
    setException(error: Error): void;
    wait(): Promise<T>;
    done(): boolean;
}
declare class TaskSession {
    #private;
    constructor({ server, taskId, store, queue }: {
        server: any;
        taskId: string;
        store: any;
        queue: any;
    });
    elicit({ message, requestedSchema }: {
        message: string;
        requestedSchema: any;
    }): Promise<any>;
    createMessage({ messages, maxTokens }: {
        messages: any[];
        maxTokens: number;
    }): Promise<any>;
}
export { TaskSession, Resolver };
//# sourceMappingURL=TaskSession.d.ts.map