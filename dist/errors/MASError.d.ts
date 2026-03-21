import type { MASErrorConfig } from '../types/index.js';
export declare const MAS_ERROR_CODES: {
    readonly ENV_MISSING: "MAS_ENV_MISSING";
    readonly ENV_INVALID: "MAS_ENV_INVALID";
    readonly MANIFEST_INVALID: "MAS_MANIFEST_INVALID";
    readonly MANIFEST_MISSING_FIELD: "MAS_MANIFEST_MISSING_FIELD";
    readonly SCHEMA_NOT_FOUND: "MAS_SCHEMA_NOT_FOUND";
    readonly SCHEMA_INVALID: "MAS_SCHEMA_INVALID";
    readonly SCHEMA_VERSION: "MAS_SCHEMA_VERSION";
    readonly LLM_CONFIG_MISSING: "MAS_LLM_CONFIG_MISSING";
    readonly LLM_CONNECTION_FAILED: "MAS_LLM_CONNECTION_FAILED";
    readonly TOOL_NOT_FOUND: "MAS_TOOL_NOT_FOUND";
    readonly TOOL_CALL_FAILED: "MAS_TOOL_CALL_FAILED";
    readonly AGENT_MAX_ROUNDS: "MAS_AGENT_MAX_ROUNDS";
    readonly AGENT_LOOP_ERROR: "MAS_AGENT_LOOP_ERROR";
    readonly TASK_NOT_FOUND: "MAS_TASK_NOT_FOUND";
    readonly TASK_TERMINAL: "MAS_TASK_TERMINAL";
};
export type MASErrorCode = typeof MAS_ERROR_CODES[keyof typeof MAS_ERROR_CODES];
export declare class MASError extends Error {
    code: string;
    details?: Record<string, unknown>;
    constructor({ code, message, details }: MASErrorConfig);
}
//# sourceMappingURL=MASError.d.ts.map