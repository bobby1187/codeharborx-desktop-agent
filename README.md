# CodeHarborX

Standalone Windows development control center.

## Standalone architecture

CodeHarborX runs from the installed Electron application. The main interface is packaged with the installer and loads from local files rather than from a hosted web application.

Local application data is stored under the Windows Electron user-data directory. The configured UGREEN NAS is used as backup storage only.

### Included

- Local CodeHarborX command-center interface
- Dashboard and Command Center
- Project Studio with persistent local project records
- AI Agents and workflow records stored locally
- UGREEN NAS connectivity and backup scanning
- Ollama discovery and local-model listing
- Backup Center and restore-layer tracking
- GitHub repository metadata tracking
- App Packaging and deployment workspace
- Analytics, Knowledge Base, Asset Library, Extensions, and Team views
- Local MCP server at `http://127.0.0.1:48321/mcp`
- MCP tools for projects, backup health, agents, workflows, NAS scans, and local models
- Light and dark themes
- Automatic application updates through GitHub Releases

## External services

The installed CodeHarborX application does not require a hosted CodeHarborX runtime. GitHub is used for source control and application releases/updates. Ollama is accessed locally at `127.0.0.1:11434` when installed. The NAS is accessed directly through the configured Windows network path.

## Windows installer

GitHub Actions builds the Windows NSIS installer entirely from files stored in this repository. Branding assets are generated from the repository's local `build/icon.svg`; the build does not download UI or branding assets from another platform.

## Application data

Project records, settings, workflows, agent records, extension state, and activity history are stored in CodeHarborX's local Windows application-data directory. Use **Settings → Open local data folder** to inspect that location.

## Automatic updates

Packaged builds check the official GitHub Releases feed after startup and every four hours. New versions download automatically. When an update is ready, CodeHarborX shows **Install & Restart**; downloaded updates can also install when the application exits.

## Signing

Development installers are currently unsigned. Windows can show Unknown Publisher / SmartScreen until production code signing is configured.
