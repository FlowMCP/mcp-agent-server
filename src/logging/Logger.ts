type LogLevel = 'debug' | 'info' | 'warn' | 'error'


const LEVEL_ORDER: Record<LogLevel, number> = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3
}


const ENV_DEFAULTS: Record<string, LogLevel> = {
    'development': 'debug',
    'staging': 'info',
    'production': 'warn'
}


class Logger {
    static #level: LogLevel = Logger.#resolveLevel()


    static #resolveLevel(): LogLevel {
        const envLevel = process.env[ 'LOG_LEVEL' ] as LogLevel | undefined

        if( envLevel && LEVEL_ORDER[ envLevel ] !== undefined ) {
            return envLevel
        }

        const nodeEnv = process.env[ 'NODE_ENV' ] || 'development'

        return ENV_DEFAULTS[ nodeEnv ] || 'info'
    }


    static get level(): LogLevel {
        return Logger.#level
    }


    static set level( value: LogLevel ) {
        Logger.#level = value
    }


    static debug( component: string, message: string, data?: any ): void {
        Logger.#log( 'debug', component, message, data )
    }


    static info( component: string, message: string, data?: any ): void {
        Logger.#log( 'info', component, message, data )
    }


    static warn( component: string, message: string, data?: any ): void {
        Logger.#log( 'warn', component, message, data )
    }


    static error( component: string, message: string, data?: any ): void {
        Logger.#log( 'error', component, message, data )
    }


    static #log( level: LogLevel, component: string, message: string, data?: any ): void {
        if( LEVEL_ORDER[ level ] < LEVEL_ORDER[ Logger.#level ] ) {
            return
        }

        const timestamp = new Date().toISOString()
        const tag = level.toUpperCase()
        const line = `[${timestamp}] [${tag}] [${component}] ${message}`

        if( data !== undefined ) {
            const suffix = typeof data === 'string' ? data : JSON.stringify( data )

            if( level === 'error' ) {
                console.error( `${line} | ${suffix}` )
            } else {
                console.log( `${line} | ${suffix}` )
            }
        } else {
            if( level === 'error' ) {
                console.error( line )
            } else {
                console.log( line )
            }
        }
    }
}


export { Logger }
export type { LogLevel }
