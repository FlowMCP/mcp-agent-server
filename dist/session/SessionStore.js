import { InMemorySessionStore } from './InMemorySessionStore.js';
import { Logger } from '../logging/Logger.js';
class SessionStore {
    #backend;
    #maxMessages;
    #ttlMs;
    #cleanupTimer;
    constructor({ backend, maxMessages = 50, ttlMs = 3600000 }) {
        this.#backend = backend;
        this.#maxMessages = maxMessages;
        this.#ttlMs = ttlMs;
        this.#cleanupTimer = null;
    }
    static create({ backend, maxMessages, ttlMs } = {}) {
        const store = new SessionStore({
            backend: backend || new InMemorySessionStore(),
            maxMessages,
            ttlMs
        });
        return { store };
    }
    async addMessage({ sessionId, role, content }) {
        let context = await this.#backend.get({ sessionId });
        const now = new Date().toISOString();
        if (!context) {
            context = {
                sessionId,
                messages: [],
                createdAt: now,
                lastActivity: now
            };
        }
        const message = { role, content, timestamp: now };
        context.messages.push(message);
        if (context.messages.length > this.#maxMessages) {
            context.messages = context.messages.slice(-this.#maxMessages);
        }
        context.lastActivity = now;
        await this.#backend.set({ sessionId, context });
    }
    async getContext({ sessionId }) {
        const context = await this.#backend.get({ sessionId });
        if (!context || context.messages.length === 0) {
            return { contextPrefix: '' };
        }
        const formatted = context.messages
            .map((msg) => `[${msg.role}]: ${msg.content}`)
            .join('\n');
        const contextPrefix = `[Conversation Context]\n${formatted}\n[End Context]\n\n`;
        return { contextPrefix };
    }
    async clearContext({ sessionId }) {
        await this.#backend.delete({ sessionId });
    }
    startCleanup({ intervalMs = 600000 } = {}) {
        this.#cleanupTimer = setInterval(async () => {
            const removed = await this.#backend.cleanup({ ttlMs: this.#ttlMs });
            if (removed > 0) {
                Logger.info('SessionStore', `Cleanup: ${removed} expired sessions removed`);
            }
        }, intervalMs);
    }
    stopCleanup() {
        if (this.#cleanupTimer) {
            clearInterval(this.#cleanupTimer);
            this.#cleanupTimer = null;
        }
    }
}
export { SessionStore };
//# sourceMappingURL=SessionStore.js.map