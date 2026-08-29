// server/ecosystem.config.cjs
// PM2-Prozess für das Backend. Port 9017 (9016 ist bereits vom playlistkonverter-server belegt).
// cwd = __dirname macht die Konfig portabel: laeuft dort, wo das Repo liegt
// (z. B. /opt/audio-cutter/server) – kein fixer Deploy-Pfad noetig.
module.exports = {
  apps: [
    {
      name: 'audio-cutter-api',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 9017,
        CORS_ORIGIN: 'https://kodinitools.com',
        MAX_FILE_MB: 300,
        MAX_CONCURRENT: 2,
        FFMPEG_TIMEOUT_MS: 180000,
      },
    },
  ],
}
