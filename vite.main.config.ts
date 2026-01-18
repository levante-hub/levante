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
        // Native dependencies with complex transitive deps
        // These packages are marked external and copied manually via packageAfterCopy hook (forge.config.js)
        // ASAR disabled (forge.config.js line 250) for guaranteed require() resolution
        '@libsql/client',
        /^@libsql\/.*/,
        // LanceDB and its native bindings (Rust via NAPI)
        '@lancedb/lancedb',
        /^@lancedb\/.*/,
        // HuggingFace Transformers (ONNX Runtime bindings via onnxruntime-node)
        '@xenova/transformers',
        // PDF parsing library
        'pdf-parse',
        // Optional native modules (ws dependencies)
        'bufferutil',
        'utf-8-validate',
        // Winston must be external - mcp-use's Logger.configure() loads it at runtime
        'winston',
        /^winston\/.*/,
        // NOTE: mcp-use bundled by Vite, but winston kept external for Logger
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
