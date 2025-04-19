import esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['src/**/*.ts'],
  bundle: false,                     // бандлимо TS → JS
  platform: 'node',                 // пакет для Node.js
  target: 'node20',                 // Node.js 20 (Lambda Runtime)
  format: 'cjs',                    // CommonJS, щоб require('sharp') працював
  outdir: 'dist',                   // куди викидуємо файли
  sourcemap: true,                  // мапи корисні для дебага
  splitting: false,
  logLevel: 'info',
}).catch(() => process.exit(1));