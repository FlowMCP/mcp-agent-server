export type JSONSchema = Record<string, unknown>


export interface ElicitationField {
    type: 'string' | 'number' | 'integer' | 'boolean'
    title: string
    format?: string
    enum?: string[]
    enumNames?: string[]
    hints?: string[]
    description?: string
}


export interface ElicitationConfig {
    enabled: boolean
    maxRounds: number
    timeout: number
    fields: Record<string, ElicitationField>
}


export interface ElicitResult {
    action: 'accept' | 'decline' | 'cancel'
    content?: Record<string, string | number | boolean | string[]>
}


export type ElicitCallback = ( params: { message: string, requestedSchema: any } ) => Promise<ElicitResult>


export interface LLMConfig {
    baseURL: string
    apiKey: string
    sdk?: 'anthropic' | 'openai'
}


export interface LLMResponse {
    textBlocks: string[]
    toolCalls: Array<{ id: string, name: string, input: unknown }>
    inputTokens: number
    outputTokens: number
    stopReason: string
}


export interface LLMProvider {
    complete( params: {
        model: string
        maxTokens: number
        system: string
        tools: any[]
        messages: any[]
    } ): Promise<LLMResponse>
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
    listTools(): Promise<{ tools: Tool[] }>
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


export interface RoundLog {
    round: number
    timestamp: string
    llmInput: {
        messageCount: number
        systemPromptLength: number
        toolCount: number
    }
    llmOutput: {
        textBlocks: string[]
        toolCalls: Array<{
            name: string
            arguments: unknown
        }>
        inputTokens: number
        outputTokens: number
    }
    toolResults: Array<{
        name: string
        arguments: unknown
        duration: number
        success: boolean
        dataSize: number
        dataSample: string
        fullData: unknown
        error?: string
    }>
}


export type RoundLogCallback = ( log: RoundLog ) => void


export interface AgentLoopParams {
    query: string
    toolClient: ToolClient
    systemPrompt: string
    model: string
    maxRounds: number
    maxTokens: number
    onStatus?: ( params: StatusUpdate ) => void
    onRoundLog?: RoundLogCallback
    onElicit?: ElicitCallback
    elicitationConfig?: ElicitationConfig
    baseURL: string
    apiKey: string
    llmProvider?: LLMProvider
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


export interface SessionMessage {
    role: 'user' | 'assistant'
    content: string
    timestamp: string
}


export interface ConversationContext {
    sessionId: string
    messages: SessionMessage[]
    createdAt: string
    lastActivity: string
}


export interface SessionStoreBackend {
    get( params: { sessionId: string } ): Promise<ConversationContext | null>
    set( params: { sessionId: string, context: ConversationContext } ): Promise<void>
    delete( params: { sessionId: string } ): Promise<void>
    has( params: { sessionId: string } ): Promise<boolean>
    cleanup( params: { ttlMs: number } ): Promise<number>
}
