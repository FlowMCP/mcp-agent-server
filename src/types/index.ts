export type JSONSchema = Record<string, unknown>


export interface LLMConfig {
    baseURL: string
    apiKey: string
}


export interface AgentManifest {
    name: string
    description: string
    version: string
    tools: ToolConfig[]
    agent: AgentConfig
}


export interface AgentConfig {
    systemPrompt: string
    model: string
    maxRounds: number
    maxTokens: number
    answerSchema?: JSONSchema
}


export interface ToolConfig {
    name: string
    description: string
    inputSchema: JSONSchema
    toolSources: ToolSource[]
    agent?: AgentConfig
}


export interface ToolSource {
    type: 'flowmcp' | 'mcp-remote'
    schemas?: unknown[]
    url?: string
}


export interface ToolClient {
    listTools(): Promise<Tool[]>
    callTool( params: { name: string, arguments: Record<string, unknown> } ): Promise<ToolResult>
    close(): Promise<void>
}


export interface Tool {
    name: string
    description: string
    inputSchema: JSONSchema
}


export interface ToolResult {
    content: Array<{ type: string, text: string }>
    isError?: boolean
}


export interface AgentEvent {
    type: string
    taskId: string
    timestamp: number
    payload: Record<string, unknown>
}


export interface MASErrorConfig {
    code: string
    message: string
    details?: Record<string, unknown>
}


export interface AgentLoopParams {
    query: string
    toolClient: ToolClient
    systemPrompt: string
    model: string
    maxRounds: number
    maxTokens: number
    onStatus?: ( params: StatusUpdate ) => void
    baseURL: string
    apiKey: string
    answerSchema?: JSONSchema | null
    discovery?: boolean
}


export interface StatusUpdate {
    status: 'working' | 'completed' | 'failed'
    round: number
    message: string
}


export interface AgentLoopResult {
    status: string
    query: string
    result: unknown
    costs: {
        inputTokens: number
        outputTokens: number
    }
    metadata: Record<string, unknown>
}


export interface TaskConfig {
    ttl?: number
    pollInterval?: number
}


export interface ServerConfig {
    name: string
    version: string
    routePath: string
    elicitation: boolean
}
