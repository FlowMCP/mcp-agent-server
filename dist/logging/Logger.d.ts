type LogLevel = 'debug' | 'info' | 'warn' | 'error';
declare class Logger {
    #private;
    static get level(): LogLevel;
    static set level(value: LogLevel);
    static debug(component: string, message: string, data?: any): void;
    static info(component: string, message: string, data?: any): void;
    static warn(component: string, message: string, data?: any): void;
    static error(component: string, message: string, data?: any): void;
}
export { Logger };
export type { LogLevel };
//# sourceMappingURL=Logger.d.ts.map