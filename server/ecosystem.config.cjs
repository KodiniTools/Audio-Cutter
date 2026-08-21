// server/ecosystem.config.cjs
// PM2-Prozess für das Backend. Port 9016 (nächster freier nach video-cutter-api:9015).
module.exports = {
  apps: [
    {
      name: 'audio-cutter-api',
      script: 'index.js',
      cwd: '/var/www/kodinitools.com/audio-cutter-api',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 9016,
        CORS_ORIGIN: 'https://kodinitools.com',
        MAX_FILE_MB: 300,
        MAX_CONCURRENT: 2,
        FFMPEG_TIMEOUT_MS: 180000,
      },
    },
  ],
}
