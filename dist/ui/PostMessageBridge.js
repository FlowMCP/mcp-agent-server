import { Logger } from '../logging/Logger.js';
class PostMessageBridge {
    #emitter;
    #eventCount;
    #listeners;
    constructor({ emitter }) {
        this.#emitter = emitter;
        this.#eventCount = 0;
        this.#listeners = [];
    }
    static create({ emitter }) {
        const bridge = new PostMessageBridge({ emitter });
        return { bridge };
    }
    start({ onEvent }) {
        const eventNames = ['agent:start', 'agent:status', 'agent:complete', 'agent:error'];
        eventNames.forEach((eventName) => {
            const listener = (payload) => {
                this.#eventCount++;
                const event = {
                    type: eventName,
                    timestamp: Date.now(),
                    payload
                };
                try {
                    onEvent(event);
                }
                catch (err) {
                    Logger.error('PostMessageBridge', `Failed to forward event ${eventName}`, err.message);
                }
            };
            this.#emitter.on(eventName, listener);
            this.#listeners.push({ eventName, listener });
        });
        Logger.info('PostMessageBridge', `Started — listening to ${eventNames.length} event types`);
    }
    stop() {
        this.#listeners.forEach(({ eventName, listener }) => {
            this.#emitter.removeListener(eventName, listener);
        });
        this.#listeners = [];
        Logger.info('PostMessageBridge', `Stopped — ${this.#eventCount} events forwarded`);
    }
    get eventCount() {
        return this.#eventCount;
    }
}
export { PostMessageBridge };
//# sourceMappingURL=PostMessageBridge.js.map