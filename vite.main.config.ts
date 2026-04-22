import { defineConfig } from 'vite';
import { ENV_DEFAULTS } from './src/shared/envDefaults';

// https://vitejs.dev/config
export default defineConfig(({ command }) => {
  // command === 'serve' ONLY in pnpm dev. Always 'build' in pnpm make/package/CI.
  const isDev = command === 'serve';
  const env = isDev ? ENV_DEFAULTS.development : ENV_DEFAULTS.production;

  return {
  define: {
    // Inyectar la URL del dev server en tiempo de compilación
    'process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL': isDev
      ? JSON.stringify(process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || 'http://localhost:5173')
      : 'undefined',
    // Bake platform URLs using command (not mode) — command is guaranteed by Vite itself
    'process.env.LEVANTE_PLATFORM_URL': JSON.stringify(env.LEVANTE_PLATFORM_URL),
    'process.env.LEVANTE_SERVICES_HOST': JSON.stringify(env.LEVANTE_SERVICES_HOST),
  },
  build: {
    minify: false,  // Probar con minificación habilitada ahora que los imports están corregidos
    rollupOptions: {
      external: [
        'electron',
        'original-fs',
        'better-sqlite3',
        '@modelcontextprotocol/sdk',
        // Marcar todos @libsql/* como external para que no sean empaquetados
        // El plugin auto-unpack-natives debería copiarlos
        '@libsql/client',
        /^@libsql\/.*/,
        // Optional native modules (ws dependencies)
        'bufferutil',
        'utf-8-validate',
        // Winston must be external - mcp-use's Logger.configure() loads it at runtime
        'winston',
        /^winston\/.*/,
        'winston-daily-rotate-file',
        // sharp is a native binary addon — must remain external and be copied in packageAfterCopy
        'sharp',
        /^@img\/.*/,
        // NOTE: mcp-use bundled by Vite, but winston kept external for Logger
        // logfire-node is dev-only; keep external so it's never bundled in production
        '@pydantic/logfire-node',
        /^@pydantic\//,
      ]
    }
  },
  resolve: {
    // Some libs that can run in both Web and Node.js, such as `axios`, we need to tell Vite to build them in Node.js.
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext']
  }
  };
});
