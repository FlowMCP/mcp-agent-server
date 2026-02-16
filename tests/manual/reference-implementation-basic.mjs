/**
 * Reference Implementation: Basic MCP Agent Server
 *
 * Prerequisites:
 *   - OPENROUTER_API_KEY in environment or ../.env
 *   - FlowMCP schemas imported (or use empty schemas for structure test)
 *
 * Usage:
 *   node tests/manual/reference-implementation-basic.mjs
 *
 * Test:
 *   curl -X POST http://localhost:4100/mcp \
 *     -H "Content-Type: application/json" \
 *     -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
 */

import express from 'express'
import { AgentToolsServer } from '../../src/index.mjs'


const app = express()
app.use( express.json() )

const { mcp } = await AgentToolsServer.create( {
    name: 'Test Agent Server',
    version: '1.0.0',
    routePath: '/mcp',
    llm: {
        baseURL: 'https://openrouter.ai/api',
        apiKey: process.env.OPENROUTER_API_KEY || 'test-key'
    },
    tools: [
        {
            name: 'echo-research',
            description: 'Echo research tool for testing',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Research query' }
                },
                required: [ 'query' ]
            },
            agent: {
                systemPrompt: 'You are a test research agent. Respond with a brief analysis.',
                model: 'anthropic/claude-sonnet-4-5-20250929',
                maxRounds: 3,
                maxTokens: 1024
            },
            toolSources: [
                {
                    type: 'flowmcp',
                    schemas: [],
                    serverParams: {}
                }
            ],
            execution: {
                taskSupport: 'optional'
            }
        }
    ]
} )

app.use( mcp.middleware() )

const port = 4100

app.listen( port, () => {
    console.log( `MCP Agent Server running on http://localhost:${port}/mcp` )
    console.log( '' )
    console.log( 'Test with:' )
    console.log( `  curl -X POST http://localhost:${port}/mcp \\` )
    console.log( '    -H "Content-Type: application/json" \\' )
    console.log( '    -d \'{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\'' )
} )
