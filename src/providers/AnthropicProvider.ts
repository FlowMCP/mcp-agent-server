import Anthropic from '@anthropic-ai/sdk'

import type { LLMProvider, LLMResponse } from '../types/index.js'


class AnthropicProvider implements LLMProvider {
    #client: Anthropic


    constructor( { baseURL, apiKey }: { baseURL: string, apiKey: string } ) {
        const config: Record<string, string> = {}

        if( baseURL ) { config.baseURL = baseURL }
        if( apiKey ) { config.apiKey = apiKey }

        this.#client = new Anthropic( config )
    }


    static create( { baseURL, apiKey }: { baseURL: string, apiKey: string } ) {
        const provider = new AnthropicProvider( { baseURL, apiKey } )

        return { provider }
    }


    async complete( { model, maxTokens, system, tools, messages }: { model: string, maxTokens: number, system: string, tools: any[], messages: any[] } ): Promise<LLMResponse> {
        const response = await this.#client.messages.create( {
            model,
            max_tokens: maxTokens,
            system,
            tools: tools as any,
            messages
        } )

        const textBlocks = response.content
            .filter( ( block: any ) => block.type === 'text' )
            .map( ( block: any ) => block.text )

        const toolCalls = response.content
            .filter( ( block: any ) => block.type === 'tool_use' )
            .map( ( block: any ) => ( { id: block.id, name: block.name, input: block.input } ) )

        return {
            textBlocks,
            toolCalls,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            stopReason: response.stop_reason || ''
        }
    }
}


export { AnthropicProvider }
