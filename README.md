# CodeHarborX

Standalone Windows development control center **plus a local Builder studio**.

## Version 0.6.0 — Background ChatGPT tunnel

CodeHarborX now manages the official OpenAI tunnel-client in a hidden background process. Start, stop, restart, automatic reconnect with bounded backoff, and live connection status are available without keeping PowerShell open. All v0.5.0 features and branding remain.

### One-time tunnel setup

1. Download the Windows client from the official [OpenAI tunnel-client releases](https://github.com/openai/tunnel-client/releases/latest). Use a current client with `--health.url-file` and `/api/system` support.
2. Keep your existing `codeharborx` profile. Its MCP target should be `http://127.0.0.1:48321/mcp`. Profiles must reference `env:CONTROL_PLANE_API_KEY`; remove any plaintext credential previously saved in a profile. CodeHarborX overrides the control-plane key source at launch.
3. In **Settings → ChatGPT tunnel**, browse to the official executable, enter the existing profile name, and enter a runtime credential into the masked field. Save, then click **Start**. Start on launch is enabled by default.
4. After confirming **ChatGPT connected**, close the old manually started tunnel. CodeHarborX owns only the process it starts; it does not terminate unrelated clients. Avoid running both against the same tunnel.

The executable and profile are stored in the local app-data `tunnel/settings.json`. The credential is encrypted using Electron `safeStorage`, backed by Windows DPAPI for the signed-in Windows account, in `tunnel/credential.bin`. It cannot be retrieved through UI, MCP, or status APIs. No plaintext credential fallback is permitted. Losing Windows secure storage requires entering the credential again. **Remove saved credential** stops the managed tunnel and deletes the encrypted credential.

The hidden supervisor receives the credential over an anonymous stdin pipe and hands it to the selected official client through its private environment. Keys are never command-line arguments, source code, build resources, or persisted logs. Tunnel stdout/stderr are drained and discarded; UI errors use fixed messages. As with other local secret stores, processes with access to your Windows account can potentially access its secrets. Select only the trusted official executable.

The status requires `/readyz`, a successful OpenAI poll within the last two minutes, and a direct or healthy control-plane route from the client admin API on a private, per-run loopback port. A running process alone does not show Connected. An unsupported health API, invalid profile, network outage, or bad credential shows Disconnected; an outage can take up to two minutes to expire the latest successful poll. The tunnel handles transport retries while alive; CodeHarborX restarts unexpected process exits with backoff up to 30 seconds. Manual Stop cancels retries until Start, Restart, or the next auto-start launch.

On normal app exit and updater restart, the supervisor delivers Ctrl-C, allows eight seconds for graceful shutdown, and then terminates a stuck child. A Windows job object cleans up the client's descendant processes. Parent-pipe EOF also initiates shutdown. Closing CodeHarborX ends the managed connection.

### Validation and release

`npm run build:tunnel-host` compiles the small Windows supervisor using the Windows .NET Framework compiler. `npm test` covers credential boundaries, start/stop/restart, backoff cancellation, secure-storage refusal and native graceful Ctrl-C. Windows release CI runs these tests before publishing the installer and updater metadata. Credentials and local configuration are outside the repository and packaged resources.

## Retained v0.5.0 Builder

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
