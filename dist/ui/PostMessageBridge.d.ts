import { EventEmitter } from 'node:events';
type BridgeEvent = {
    type: string;
    timestamp: number;
    payload: Record<string, unknown>;
};
declare class PostMessageBridge {
    #private;
    constructor({ emitter }: {
        emitter: EventEmitter;
    });
    static create({ emitter }: {
        emitter: EventEmitter;
    }): {
        bridge: PostMessageBridge;
    };
    start({ onEvent }: {
        onEvent: (event: BridgeEvent) => void;
    }): void;
    stop(): void;
    get eventCount(): number;
}
export { PostMessageBridge };
export type { BridgeEvent };
//# sourceMappingURL=PostMessageBridge.d.ts.map