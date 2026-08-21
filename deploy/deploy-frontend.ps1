# deploy/deploy-frontend.ps1  (Windows PowerShell)
# Baut das Frontend und laedt dist/ per SCP auf den VPS.
param(
  [string]$VpsUser = "root",
  [string]$VpsHost = "145.223.81.100",
  [string]$RemoteDir = "/var/www/kodinitools.com/audio-cutter"
)
$ErrorActionPreference = "Stop"
npm run build
Write-Host "Upload dist/ -> ${VpsUser}@${VpsHost}:${RemoteDir}"
scp -r dist/* "${VpsUser}@${VpsHost}:${RemoteDir}/"
Write-Host "Fertig. Danach ggf.: sudo nginx -t && sudo systemctl reload nginx"
