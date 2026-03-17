/**
 * MCP Handshake Test Script
 *
 * Performs a complete MCP handshake against a running server:
 * 1. Initialize → Session ID
 * 2. tools/list → Tool listing
 * 3. tools/call → Agent query (optional)
 *
 * Usage:
 *   node tests/manual/mcp-handshake.mjs
 *   node tests/manual/mcp-handshake.mjs --url http://localhost:4100/mcp/main
 *   node tests/manual/mcp-handshake.mjs --url http://localhost:4100/mcp/main --tool anschluss-mobility --query "Berlin nach Muenchen"
 */

const args = process.argv.slice( 2 )

const getArg = ( name ) => {
    const idx = args.indexOf( `--${name}` )
    return idx !== -1 && args[ idx + 1 ] ? args[ idx + 1 ] : null
}

const url = getArg( 'url' ) || 'http://localhost:4100/mcp/main'
const toolName = getArg( 'tool' )
const query = getArg( 'query' )


const jsonrpc = ( id, method, params = {} ) => ( {
    jsonrpc: '2.0',
    id,
    method,
    params
} )


const post = async ( { body, sessionId } ) => {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }

    if( sessionId ) {
        headers[ 'mcp-session-id' ] = sessionId
    }

    const start = Date.now()
    const response = await fetch( url, {
        method: 'POST',
        headers,
        body: JSON.stringify( body )
    } )
    const elapsed = Date.now() - start
    const raw = await response.text()

    // Server responds as SSE (text/event-stream) — extract JSON from "data: {...}" lines
    let data
    const contentType = response.headers.get( 'content-type' ) || ''

    if( contentType.includes( 'text/event-stream' ) ) {
        const dataLines = raw.split( '\n' )
            .filter( ( line ) => line.startsWith( 'data: ' ) )
            .map( ( line ) => line.slice( 6 ) )

        data = dataLines.length > 0 ? JSON.parse( dataLines[ dataLines.length - 1 ] ) : {}
    } else {
        data = JSON.parse( raw )
    }

    return { data, elapsed, headers: Object.fromEntries( response.headers ) }
}


const run = async () => {
    console.log( `\n=== MCP Handshake Test ===` )
    console.log( `URL: ${url}\n` )

    // Step 1: Initialize
    console.log( '--- Step 1: Initialize ---' )
    const initResult = await post( {
        body: jsonrpc( 1, 'initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'mcp-handshake-test', version: '1.0.0' }
        } )
    } )

    const sessionId = initResult.headers[ 'mcp-session-id' ] || null
    console.log( `  Session ID: ${sessionId || 'none'}` )
    console.log( `  Protocol:   ${initResult.data?.result?.protocolVersion || 'unknown'}` )
    console.log( `  Timing:     ${initResult.elapsed}ms\n` )

    if( !initResult.data?.result ) {
        console.error( '  FAILED: No result in initialize response' )
        console.error( '  Response:', JSON.stringify( initResult.data, null, 2 ) )
        process.exit( 1 )
    }

    // Step 2: tools/list
    console.log( '--- Step 2: tools/list ---' )
    const listResult = await post( {
        body: jsonrpc( 2, 'tools/list', {} ),
        sessionId
    } )

    const tools = listResult.data?.result?.tools || []
    console.log( `  Tools found: ${tools.length}` )
    tools.forEach( ( t ) => {
        console.log( `    - ${t.name}: ${( t.description || '' ).slice( 0, 80 )}` )
    } )
    console.log( `  Timing: ${listResult.elapsed}ms\n` )

    // Step 3: tools/call (optional)
    if( toolName && query ) {
        console.log( `--- Step 3: tools/call (${toolName}) ---` )
        const callResult = await post( {
            body: jsonrpc( 3, 'tools/call', {
                name: toolName,
                arguments: { query }
            } ),
            sessionId
        } )

        console.log( `  Timing: ${callResult.elapsed}ms` )

        if( callResult.data?.result ) {
            const content = callResult.data.result.content || []
            content.forEach( ( c ) => {
                if( c.type === 'text' ) {
                    const text = c.text.length > 500 ? c.text.slice( 0, 500 ) + '...' : c.text
                    console.log( `  Result: ${text}` )
                }
            } )
        } else if( callResult.data?.error ) {
            console.error( `  Error: ${JSON.stringify( callResult.data.error )}` )
        }
        console.log()
    } else {
        console.log( '--- Step 3: Skipped (no --tool and --query provided) ---\n' )
    }

    console.log( '=== Done ===' )
}


run().catch( ( err ) => {
    console.error( `\nFATAL: ${err.message}` )
    console.error( `Is the server running at ${url}?` )
    process.exit( 1 )
} )
