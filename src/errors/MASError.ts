import type { MASErrorConfig } from '../types/index.js'


export const MAS_ERROR_CODES = {
    ENV_MISSING: 'MAS_ENV_MISSING',
    ENV_INVALID: 'MAS_ENV_INVALID',
    MANIFEST_INVALID: 'MAS_MANIFEST_INVALID',
    MANIFEST_MISSING_FIELD: 'MAS_MANIFEST_MISSING_FIELD',
    SCHEMA_NOT_FOUND: 'MAS_SCHEMA_NOT_FOUND',
    SCHEMA_INVALID: 'MAS_SCHEMA_INVALID',
    SCHEMA_VERSION: 'MAS_SCHEMA_VERSION',
    LLM_CONFIG_MISSING: 'MAS_LLM_CONFIG_MISSING',
    LLM_CONNECTION_FAILED: 'MAS_LLM_CONNECTION_FAILED',
    TOOL_NOT_FOUND: 'MAS_TOOL_NOT_FOUND',
    TOOL_CALL_FAILED: 'MAS_TOOL_CALL_FAILED',
    AGENT_MAX_ROUNDS: 'MAS_AGENT_MAX_ROUNDS',
    AGENT_LOOP_ERROR: 'MAS_AGENT_LOOP_ERROR',
    TASK_NOT_FOUND: 'MAS_TASK_NOT_FOUND',
    TASK_TERMINAL: 'MAS_TASK_TERMINAL'
} as const


export type MASErrorCode = typeof MAS_ERROR_CODES[keyof typeof MAS_ERROR_CODES]


export class MASError extends Error {
    code: string
    details?: Record<string, unknown>

    constructor( { code, message, details }: MASErrorConfig ) {
        super( message )
        this.name = 'MASError'
        this.code = code
        this.details = details
    }
}
