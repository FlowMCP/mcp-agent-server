# Manual Testing — MCP Agent Server

## Server starten

```bash
cd repos/hackathon-anschluss-erreichen
npm run start:dev
# Server laeuft auf http://localhost:4100
```

## MCP Handshake Script (empfohlen)

```bash
# Nur Initialize + tools/list
node tests/manual/mcp-handshake.mjs

# Mit Tool-Aufruf
node tests/manual/mcp-handshake.mjs --url http://localhost:4100/mcp/main --tool anschluss-mobility --query "Berlin Hbf Abfahrten"

# Gegen ngrok
node tests/manual/mcp-handshake.mjs --url https://hackathon-anschluss.ngrok.app/mcp/main
```

## curl-basiertes Testing

### 1. Initialize

```bash
curl -s -D - -X POST http://localhost:4100/mcp/main \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0.0"}}}'
```

Session ID aus dem `mcp-session-id` Response Header kopieren.

### 2. tools/list

```bash
curl -s -X POST http://localhost:4100/mcp/main \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: SESSION_ID_HIER" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq
```

### 3. tools/call

```bash
curl -s -X POST http://localhost:4100/mcp/main \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: SESSION_ID_HIER" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{"query":"Berlin Hbf"}}}' | jq
```

## SSE Events empfangen

```bash
curl -N http://localhost:4100/events
```

Dann in einem zweiten Terminal einen tools/call ausfuehren. Events erscheinen im SSE Stream:
- `agent:start` — Agent Loop startet
- `agent:status` — Tool-Call, Round-Update
- `agent:complete` — Ergebnis
- `agent:error` — Fehler

## MCP Inspector CLI

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:4100/mcp/main \
  --transport http --method tools/list
```

## Debug HTML

Browser oeffnen: `http://localhost:4100/events` zeigt SSE Events.
Oder: `tests/manual/sse-debug.html` lokal oeffnen.
