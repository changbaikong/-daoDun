# Sync the local project to the server and restart the blog service.
# Usage (from project root):
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1
# Custom SSH key:
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -Key "C:\path\id_rsa"
#
# NOTE: keep this file ASCII-only so Windows PowerShell 5.1 can parse it
# regardless of the system codepage.
param(
  [string]$Server = '106.55.41.41',
  [string]$Key = "$env:USERPROFILE\.ssh\conyu_lh"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sshOpts = @(
  '-i', $Key,
  '-o', 'IdentitiesOnly=yes',
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10',
  '-o', 'StrictHostKeyChecking=accept-new'
)

Write-Host "Uploading project to root@${Server}:/opt/jk-blog ..."
& scp @sshOpts -r `
  "$root\server" `
  "$root\web" `
  "$root\package.json" `
  "$root\README.md" `
  "root@${Server}:/opt/jk-blog/"
if ($LASTEXITCODE -ne 0) { throw "scp failed (exit $LASTEXITCODE)" }

$remoteScript = @'
set -e
chown -R root:root /opt/jk-blog
find /opt/jk-blog -type d -exec chmod 755 {} +
find /opt/jk-blog -type f -exec chmod 644 {} +
systemctl restart jk-blog
sleep 1
systemctl is-active jk-blog
curl -fsS http://127.0.0.1:4173/api/health
echo
'@

Write-Host "Fixing permissions and restarting service ..."
& ssh @sshOpts "root@$Server" $remoteScript
if ($LASTEXITCODE -ne 0) { throw "remote deploy failed (exit $LASTEXITCODE)" }

Write-Host "Deploy finished: http://${Server}/"
