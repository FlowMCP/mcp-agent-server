/**
 * AgentProbe Validation Test
 *
 * Starts an MCP Agent Server that can be validated with AgentProbe
 * (mcp-agent-validator). No secrets are hardcoded.
 *
 * AgentProbe checks:
 *   1. MCP Initialize handshake
 *   2. tools/list, resources/list, prompts/list
 *   3. tools/call per tool (with minimal test args)
 *   4. Latency (ping + listTools)
 *
 * Prerequisites:
 *   - OPENROUTER_API_KEY in environment (for live agent loop)
 *   - Without API key: server starts but tool calls will fail gracefully
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... node tests/manual/agentprobe-test.mjs
 *
 * Then validate with AgentProbe:
 *   - Local:  http://localhost:4000 → enter http://localhost:4200/mcp
 *   - Remote: https://agentprobe.xyz → needs ngrok or public URL
 */

import express from 'express'
import { AgentToolsServer } from '../../src/index.mjs'


const port = 4200
const hasApiKey = !!process.env.OPENROUTER_API_KEY

const { mcp } = await AgentToolsServer.create( {
    name: 'AgentProbe Test Server',
    version: '1.0.0',
    routePath: '/mcp',
    llm: {
        baseURL: 'https://openrouter.ai/api',
        apiKey: process.env.OPENROUTER_API_KEY || 'not-set'
    },
    tools: [
        {
            name: 'protocol-test',
            description: 'A simple test tool for MCP protocol validation. Returns a greeting based on the query.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'A test query string'
                    }
                },
                required: [ 'query' ]
            },
            agent: {
                systemPrompt: 'You are a test agent. When asked anything, immediately call submit_answer with a brief response. Do not use any other tools.',
                model: 'anthropic/claude-haiku-4-5-20251001',
                maxRounds: 1,
                maxTokens: 256
            },
            toolSources: [
                {
                    type: 'flowmcp',
                    schemas: [],
                    serverParams: {}
                }
            ]
        },
        {
            name: 'echo-tool',
            description: 'Echoes back the input for testing purposes.',
            inputSchema: {
                type: 'object',
                properties: {
                    message: {
                        type: 'string',
                        description: 'Message to echo back'
                    }
                },
                required: [ 'message' ]
            },
            agent: {
                systemPrompt: 'You are an echo agent. Repeat the user input back. Call submit_answer immediately.',
                model: 'anthropic/claude-haiku-4-5-20251001',
                maxRounds: 1,
                maxTokens: 256
            },
            toolSources: [
                {
                    type: 'flowmcp',
                    schemas: [],
                    serverParams: {}
                }
            ]
        }
    ]
} )

const app = express()
app.use( express.json() )
app.use( mcp.middleware() )

app.listen( port, () => {
    console.log( '' )
    console.log( '  MCP Agent Server for AgentProbe Validation' )
    console.log( '  ===========================================' )
    console.log( '' )
    console.log( `  Endpoint:  http://localhost:${port}/mcp` )
    console.log( `  Tools:     ${mcp.listToolDefinitions().tools.length} registered` )
    console.log( `  API Key:   ${hasApiKey ? 'set (live mode)' : 'NOT SET (protocol-only mode)'}` )
    console.log( '' )
    console.log( '  AgentProbe Validation:' )
    console.log( `    Local:   http://localhost:4000 → enter http://localhost:${port}/mcp` )
    console.log( '    Remote:  https://agentprobe.xyz → needs public URL (ngrok)' )
    console.log( '' )

    if( !hasApiKey ) {
        console.log( '  Warning: No OPENROUTER_API_KEY set.' )
        console.log( '  MCP protocol checks (initialize, list) will pass.' )
        console.log( '  Tool calls will fail at LLM step (expected without key).' )
        console.log( '' )
    }

    console.log( '  Quick test:' )
    console.log( `    curl -s -X POST http://localhost:${port}/mcp \\` )
    console.log( '      -H "Content-Type: application/json" \\' )
    console.log( '      -d \'{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"1.0.0"}}}\'' )
    console.log( '' )
} )
