# CodeHarborX Desktop Agent

The official Windows bridge for CodeHarborX.

## Version 0.2.2

This release upgrades the original proof-of-concept into a branded local control application.

### Included

- Official CodeHarborX application icon and installer branding
- Premium light and dark themes
- Dashboard, Connection, NAS Backup, Local AI, MCP Bridge and System views
- Secure Windows storage for the CodeHarborX pairing key when Electron safeStorage is available
- UGREEN NAS connectivity and backup-folder scanning
- Ollama discovery and local-model listing
- Local MCP server on `http://127.0.0.1:48321/mcp`
- MCP read tools for projects, backup health, agents, workflows, NAS scan and local models
- MCP write tools for creating project registry records and recording backup status
- No destructive/delete MCP tools in v0.2
- Heartbeat reporting for NAS, local AI and MCP status

## ChatGPT / MCP

The local MCP endpoint is intentionally bound to `127.0.0.1`. It is not exposed directly to the internet.

To make it available to supported ChatGPT environments, connect the local MCP through OpenAI Secure MCP Tunnel or another approved MCP client workflow. The NAS itself is never exposed as an MCP server.

## Windows installer

GitHub Actions produces:

`CodeHarborX-Desktop-Agent-Setup-0.2.2.exe`

## Signing

The development installer is currently unsigned. Windows may show Unknown Publisher / SmartScreen until a production code-signing certificate is configured.


## Automatic updates

Version 0.2.1 introduced the automatic updater. Version 0.2.2 validates the end-to-end GitHub Releases update path and keeps future version reporting synchronized with the installed app package. It checks the official GitHub Releases feed on startup and every four hours. New versions download automatically; when ready, the app can install them with **Install & Restart**. Downloaded updates also install when the app exits.

The release workflow publishes the installer, blockmap, and `latest.yml` metadata required by Electron's differential updater.
