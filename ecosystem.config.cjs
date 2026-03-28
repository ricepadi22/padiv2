module.exports = {
  apps: [
    {
      name: 'threeworlds-api',
      script: './node_modules/.bin/tsx',
      args: 'server/index.ts',
      cwd: '/home/ubuntu/padiv2',
      env_file: '/home/ubuntu/padiv2/.env',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
