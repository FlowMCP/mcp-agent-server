const LEVEL_ORDER = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3
};
const ENV_DEFAULTS = {
    'development': 'debug',
    'staging': 'info',
    'production': 'warn'
};
class Logger {
    static #level = Logger.#resolveLevel();
    static #resolveLevel() {
        const envLevel = process.env['LOG_LEVEL'];
        if (envLevel && LEVEL_ORDER[envLevel] !== undefined) {
            return envLevel;
        }
        const nodeEnv = process.env['NODE_ENV'] || 'development';
        return ENV_DEFAULTS[nodeEnv] || 'info';
    }
    static get level() {
        return Logger.#level;
    }
    static set level(value) {
        Logger.#level = value;
    }
    static debug(component, message, data) {
        Logger.#log('debug', component, message, data);
    }
    static info(component, message, data) {
        Logger.#log('info', component, message, data);
    }
    static warn(component, message, data) {
        Logger.#log('warn', component, message, data);
    }
    static error(component, message, data) {
        Logger.#log('error', component, message, data);
    }
    static #log(level, component, message, data) {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[Logger.#level]) {
            return;
        }
        const timestamp = new Date().toISOString();
        const tag = level.toUpperCase();
        const line = `[${timestamp}] [${tag}] [${component}] ${message}`;
        if (data !== undefined) {
            const suffix = typeof data === 'string' ? data : JSON.stringify(data);
            if (level === 'error') {
                console.error(`${line} | ${suffix}`);
            }
            else {
                console.log(`${line} | ${suffix}`);
            }
        }
        else {
            if (level === 'error') {
                console.error(line);
            }
            else {
                console.log(line);
            }
        }
    }
}
export { Logger };
//# sourceMappingURL=Logger.js.map