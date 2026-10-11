$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$source = Join-Path $PSScriptRoot 'TunnelHost.cs'
$output = Join-Path (Split-Path $PSScriptRoot -Parent) 'build\tunnel-host.exe'
& $compiler /nologo /target:exe /reference:System.Web.Extensions.dll "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw 'Tunnel host compilation failed.' }
