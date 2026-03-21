class InMemorySessionStore {
    #store;
    constructor() {
        this.#store = new Map();
    }
    async get({ sessionId }) {
        return this.#store.get(sessionId) || null;
    }
    async set({ sessionId, context }) {
        this.#store.set(sessionId, context);
    }
    async delete({ sessionId }) {
        this.#store.delete(sessionId);
    }
    async has({ sessionId }) {
        return this.#store.has(sessionId);
    }
    async cleanup({ ttlMs }) {
        const now = Date.now();
        let removed = 0;
        const expired = [...this.#store.entries()]
            .filter(([, ctx]) => {
            const lastActivity = new Date(ctx.lastActivity).getTime();
            return (now - lastActivity) > ttlMs;
        });
        expired.forEach(([sessionId]) => {
            this.#store.delete(sessionId);
            removed++;
        });
        return removed;
    }
}
export { InMemorySessionStore };
//# sourceMappingURL=InMemorySessionStore.js.map