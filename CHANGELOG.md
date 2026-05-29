# Changelog

All notable changes to mcp-agent-server are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- AgentLoop: `ask_user` tool description, message description, fields description, and elicitation cancel response translated DE → EN.

## [2.0.0]

### Added
- AgentLoop with elicitation (`ask_user` tool), max-rounds guard, round-log callback.
- A2A protocol support (`./a2a` export).
- ToolClient with FlowMCP schema-driven tool execution.
- Logger with environment-based default log level.

### Notes
- Retrospective entry — pre-CHANGELOG history captured via git log only.
