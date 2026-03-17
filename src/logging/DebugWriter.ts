import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { Logger } from './Logger.js'
import type { RoundLog } from '../types/index.js'


type DebugLevel = 'info' | 'debug' | 'trace'


class DebugWriter {
    #agentName: string
    #timestamp: string
    #logDir: string
    #level: DebugLevel
    #rounds: RoundLog[]
    #startTime: number


    constructor( { agentName, logDir, level }: { agentName: string, logDir: string, level: DebugLevel } ) {
        this.#agentName = agentName
        this.#timestamp = new Date().toISOString().replace( /[:.]/g, '-' )
        this.#logDir = logDir
        this.#level = level
        this.#rounds = []
        this.#startTime = Date.now()
    }


    static create( { agentName, logDir, level = 'debug' }: { agentName: string, logDir?: string, level?: DebugLevel } ) {
        const resolvedDir = logDir || process.env[ 'LOG_DIR' ] || 'logs'

        const writer = new DebugWriter( { agentName, logDir: resolvedDir, level } )

        return { writer }
    }


    onRoundLog( log: RoundLog ): void {
        this.#rounds.push( log )

        if( this.#level === 'debug' || this.#level === 'trace' ) {
            const toolSummary = log.toolResults
                .map( ( t ) => `${t.name}(${t.success ? t.dataSize + 'b' : 'ERR'} ${t.duration}ms)` )
                .join( ', ' )

            Logger.debug( 'DebugWriter', `Round ${log.round}: ${toolSummary}` )
        }
    }


    async flush(): Promise<{ jsonlPath: string, summaryPath: string }> {
        const dirPath = this.#logDir
        await mkdir( dirPath, { recursive: true } )

        const baseName = `${this.#agentName}-${this.#timestamp}`
        const jsonlPath = join( dirPath, `${baseName}.jsonl` )
        const summaryPath = join( dirPath, `${baseName}.summary.md` )

        const jsonlContent = this.#rounds
            .map( ( round ) => {
                if( this.#level === 'trace' ) {
                    return JSON.stringify( round )
                }

                const filtered = {
                    ...round,
                    toolResults: round.toolResults
                        .map( ( t ) => ( {
                            name: t.name,
                            arguments: this.#level === 'debug' ? t.arguments : undefined,
                            duration: t.duration,
                            success: t.success,
                            dataSize: t.dataSize,
                            dataSample: this.#level === 'debug' ? t.dataSample : undefined,
                            error: t.error
                        } ) )
                }

                return JSON.stringify( filtered )
            } )
            .join( '\n' )

        await writeFile( jsonlPath, jsonlContent + '\n', 'utf-8' )

        const summary = this.#buildSummary()
        await writeFile( summaryPath, summary, 'utf-8' )

        Logger.info( 'DebugWriter', `Logs written: ${jsonlPath}` )

        return { jsonlPath, summaryPath }
    }


    #buildSummary(): string {
        const totalDuration = Date.now() - this.#startTime
        const totalRounds = this.#rounds.length

        const toolStats: Record<string, { calls: number, success: number, errors: number, totalDuration: number }> = {}

        this.#rounds.forEach( ( round ) => {
            round.toolResults.forEach( ( t ) => {
                if( !toolStats[ t.name ] ) {
                    toolStats[ t.name ] = { calls: 0, success: 0, errors: 0, totalDuration: 0 }
                }

                toolStats[ t.name ].calls++
                toolStats[ t.name ].totalDuration += t.duration

                if( t.success ) {
                    toolStats[ t.name ].success++
                } else {
                    toolStats[ t.name ].errors++
                }
            } )
        } )

        const totalTokensIn = this.#rounds.reduce( ( sum, r ) => sum + r.llmOutput.inputTokens, 0 )
        const totalTokensOut = this.#rounds.reduce( ( sum, r ) => sum + r.llmOutput.outputTokens, 0 )

        const toolTable = Object.entries( toolStats )
            .sort( ( [ , a ], [ , b ] ) => b.calls - a.calls )
            .map( ( [ name, stats ] ) => {
                const avgDuration = Math.round( stats.totalDuration / stats.calls )

                return `| ${name} | ${stats.calls} | ${stats.success} | ${stats.errors} | ${avgDuration}ms |`
            } )
            .join( '\n' )

        return `# Debug Summary: ${this.#agentName}

**Timestamp:** ${this.#timestamp}
**Total Duration:** ${totalDuration}ms
**Rounds:** ${totalRounds}
**Tokens:** ${totalTokensIn} in / ${totalTokensOut} out

## Tool Usage

| Tool | Calls | Success | Errors | Avg Duration |
|------|-------|---------|--------|-------------|
${toolTable}

## Round Details

${this.#rounds.map( ( r ) => {
    const tools = r.toolResults.map( ( t ) => `${t.name}(${t.success ? 'OK' : 'ERR'})` ).join( ', ' )
    const text = r.llmOutput.textBlocks.length > 0 ? r.llmOutput.textBlocks[ 0 ].slice( 0, 100 ) : '(no text)'

    return `### Round ${r.round}
- Tools: ${tools || '(none)'}
- Tokens: ${r.llmOutput.inputTokens}+${r.llmOutput.outputTokens}
- LLM said: ${text}...
`
} ).join( '\n' ) }
`
    }
}


export { DebugWriter }
export type { DebugLevel }
