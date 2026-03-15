/**
 * Reference Implementation: MCP Agent Server with A2A Adapter
 *
 * Starts an Express server exposing both MCP and A2A protocols.
 * The same agent is accessible via:
 *   - MCP:  POST /mcp (tools/list, tools/call)
 *   - A2A:  GET  /.well-known/agent.json (discovery)
 *   - A2A:  POST /a2a/v1 (message/send)
 *
 * Usage:
 *   OPENROUTER_API_KEY=... node tests/manual/reference-implementation-a2a.mjs
 */

import express from 'express'

import { AgentToolsServer } from '../../src/index.mjs'
import { A2AAdapter } from '../../src/a2a/index.mjs'


const manifest = {
    name: 'demo-agent',
    description: 'Demo agent for testing MCP + A2A integration',
    version: 'flowmcp/3.0.0',
    model: 'anthropic/claude-sonnet-4-5-20250929',
    systemPrompt: 'You are a helpful demo agent. Answer questions concisely.',
    tools: {},
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Your question' }
        },
        required: [ 'query' ]
    }
}

const PORT = 4100

const app = express()
app.use( express.json() )

// 1. MCP Server
const { mcp } = await AgentToolsServer.fromManifest( {
    manifest,
    llm: {
        baseURL: 'https://openrouter.ai/api',
        apiKey: process.env.OPENROUTER_API_KEY
    }
} )

app.use( mcp.middleware() )

// 2. A2A Adapter (optional)
const a2a = A2AAdapter.from( {
    mcp,
    manifest,
    serverUrl: `http://localhost:${PORT}`
} )

app.use( '/.well-known/agent.json', a2a.agentCardMiddleware() )
app.use( '/a2a/v1', a2a.handler() )

// 3. Health Check
app.get( '/health', ( req, res ) => {
    res.json( { status: 'ok', protocols: [ 'mcp', 'a2a' ] } )
} )

app.listen( PORT, () => {
    console.log( '' )
    console.log( `  MCP Agent Server + A2A` )
    console.log( `  ──────────────────────` )
    console.log( `  MCP:       http://localhost:${PORT}/mcp` )
    console.log( `  A2A Card:  http://localhost:${PORT}/.well-known/agent.json` )
    console.log( `  A2A:       http://localhost:${PORT}/a2a/v1` )
    console.log( `  Health:    http://localhost:${PORT}/health` )
    console.log( '' )
} )
