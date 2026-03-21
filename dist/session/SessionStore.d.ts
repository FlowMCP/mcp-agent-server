import type { SessionStoreBackend } from '../types/index.js';
declare class SessionStore {
    #private;
    constructor({ backend, maxMessages, ttlMs }: {
        backend: SessionStoreBackend;
        maxMessages?: number;
        ttlMs?: number;
    });
    static create({ backend, maxMessages, ttlMs }?: {
        backend?: SessionStoreBackend;
        maxMessages?: number;
        ttlMs?: number;
    }): {
        store: SessionStore;
    };
    addMessage({ sessionId, role, content }: {
        sessionId: string;
        role: 'user' | 'assistant';
        content: string;
    }): Promise<void>;
    getContext({ sessionId }: {
        sessionId: string;
    }): Promise<{
        contextPrefix: string;
    }>;
    clearContext({ sessionId }: {
        sessionId: string;
    }): Promise<void>;
    startCleanup({ intervalMs }?: {
        intervalMs?: number;
    }): void;
    stopCleanup(): void;
}
export { SessionStore };
//# sourceMappingURL=SessionStore.d.ts.map