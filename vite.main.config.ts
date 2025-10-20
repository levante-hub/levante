import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config
export default defineConfig(({ command }) => ({
  define: {
    // Inyectar la URL del dev server en tiempo de compilación
    'process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL': command === 'serve'
      ? JSON.stringify(process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || 'http://localhost:5173')
      : 'undefined'
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
        /^@libsql\/.*/
      ]
    }
  },
  resolve: {
    // Some libs that can run in both Web and Node.js, such as `axios`, we need to tell Vite to build them in Node.js.
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext']
  }
}));
