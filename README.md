# CodeHarborX Desktop Agent

Windows desktop bridge for the CodeHarborX Control Center.

## What v0.1.0 does

- Connects the ROG Strix to the CodeHarborX web dashboard with a private pairing key.
- Tests access to the UGREEN NAS backup root.
- Reports online/NAS status to CodeHarborX.
- Scans the six backup categories under `Project_Backups`.
- Opens the NAS backup folder in File Explorer.
- Stores settings locally under the Electron user-data folder.
- Does not repartition, format, or modify the NAS storage pool.

## Windows installer

GitHub Actions builds a normal Windows installer automatically.

Expected installer:

`CodeHarborX-Desktop-Agent-Setup-0.1.0.exe`

## Signing

v0.1.0 is unsigned. Windows may show an Unknown Publisher / SmartScreen warning.
Code signing should be added before public distribution.
