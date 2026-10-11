# CodeHarborX

Standalone Windows development control center **plus a local Builder studio**.

## Version 0.5.0 — Builder

CodeHarborX keeps the existing command-center features and adds a Builder module for creating and editing websites and web-platform prototypes directly on the computer.

### Builder features

- Create local website and dashboard/platform projects
- Project files stored under the CodeHarborX Builder workspace
- Built-in source file browser and text editor
- Save changes directly to local project files
- Localhost live preview with start/stop controls
- Open the project folder in Windows Explorer
- Generate or revise project files with a locally installed Ollama model
- Builder projects and previews remain local to the computer
- MCP Builder tools for approved AI clients:
  - `builder_status`
  - `builder_create_project`
  - `builder_list_files`
  - `builder_read_file`
  - `builder_write_file`
  - `builder_generate`
  - `builder_start_preview`
  - `builder_stop_preview`

These MCP tools are what allow a securely connected AI client to inspect and build CodeHarborX projects without giving it unrestricted filesystem or shell access.

## Existing CodeHarborX features retained

- Dashboard and Command Center
- Project Studio with persistent local project records
- AI Agents and workflow records
- UGREEN NAS connectivity and backup scanning
- Ollama discovery and local-model listing
- Backup Center and restore-layer tracking
- GitHub repository metadata tracking
- App Packaging and deployment workspace
- Analytics, Knowledge Base, Asset Library, Extensions, and Team views
- Local MCP server at `http://127.0.0.1:48321/mcp`
- Light and dark themes
- Automatic application updates through GitHub Releases

## Standalone architecture

The installed CodeHarborX application does not require a hosted CodeHarborX runtime. The UI is packaged in the installer and application/project metadata is stored locally. Builder source projects live in the local CodeHarborX Builder workspace.

GitHub remains the source-control and application release/update channel. Ollama is accessed locally at `127.0.0.1:11434` when installed. The configured UGREEN NAS is accessed directly over the Windows network path.

## Windows installer

GitHub Actions builds the Windows NSIS installer entirely from files in this repository. The official CodeHarborX branding is stored directly under `build/icon.png` and `build/logo.png`.

## Automatic updates

Packaged builds check GitHub Releases after startup and every four hours. New versions download automatically. When an update is ready, CodeHarborX shows **Install & Restart**.

## Signing

Development installers are currently unsigned. Windows can show Unknown Publisher / SmartScreen until production code signing is configured.
