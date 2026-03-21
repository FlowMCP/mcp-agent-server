import type { ConversationContext, SessionStoreBackend } from '../types/index.js';
declare class InMemorySessionStore implements SessionStoreBackend {
    #private;
    constructor();
    get({ sessionId }: {
        sessionId: string;
    }): Promise<ConversationContext | null>;
    set({ sessionId, context }: {
        sessionId: string;
        context: ConversationContext;
    }): Promise<void>;
    delete({ sessionId }: {
        sessionId: string;
    }): Promise<void>;
    has({ sessionId }: {
        sessionId: string;
    }): Promise<boolean>;
    cleanup({ ttlMs }: {
        ttlMs: number;
    }): Promise<number>;
}
export { InMemorySessionStore };
//# sourceMappingURL=InMemorySessionStore.d.ts.map