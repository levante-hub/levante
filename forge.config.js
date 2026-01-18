const path = require('path');
const fs = require('fs-extra');

// Optimization: Blacklist of packages that are NOT needed at runtime
// These are typically build-time only packages that get copied unnecessarily
const UNNECESSARY_DEPS = new Set([
  // TypeScript and type definitions (build-time only)
  'typescript',
  // NOTE: tslib removed from blacklist - apache-arrow needs it at runtime
  '@types/node',
  '@types/better-sqlite3',
  '@types/ws',
  // Testing frameworks and tools
  'vitest',
  '@vitest/ui',
  '@vitest/utils',
  'playwright',
  '@playwright/test',
  // Build tools
  'vite',
  'esbuild',
  'rollup',
  // Linters and formatters
  'eslint',
  'prettier',
  // Documentation and examples
  'examples',
  'docs',
  // Source maps (if they leak into deps)
  'source-map',
  'source-map-support',
]);

module.exports = {
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      const platform = process.platform;
      const arch = process.arch;

      console.log('🔧 Copying native modules and dependencies...');
      console.log(`📦 Building for: ${platform}-${arch}`);

      // Ruta de node_modules en el proyecto
      const projectNodeModules = path.join(__dirname, 'node_modules');
      // Ruta de node_modules en el paquete
      const packageNodeModules = path.join(buildPath, 'node_modules');

      // Crear directorio node_modules si no existe
      await fs.ensureDir(packageNodeModules);

      // Stats tracking
      let filteredCount = 0;
      const depUsageCount = new Map(); // Track how many packages use each dependency

      // Función recursiva para obtener todas las dependencias de un paquete
      const getAllDependencies = async (packageName, visited = new Set()) => {
        if (visited.has(packageName)) return visited;

        // Filter out unnecessary dependencies
        if (UNNECESSARY_DEPS.has(packageName)) {
          filteredCount++;
          return visited;
        }

        visited.add(packageName);

        // Track dependency usage
        depUsageCount.set(packageName, (depUsageCount.get(packageName) || 0) + 1);

        const pkgJsonPath = path.join(projectNodeModules, packageName, 'package.json');
        if (!await fs.pathExists(pkgJsonPath)) return visited;

        try {
          const pkgJson = await fs.readJson(pkgJsonPath);
          const deps = {
            ...pkgJson.dependencies,
            ...pkgJson.optionalDependencies,
            ...pkgJson.peerDependencies  // Include peer dependencies (e.g., apache-arrow for lancedb)
          };

          for (const dep of Object.keys(deps || {})) {
            await getAllDependencies(dep, visited);
          }
        } catch (error) {
          console.log(`    ⚠ Error reading ${packageName}/package.json`);
        }

        return visited;
      };

      // Copiar TODOS los paquetes @libsql/*
      const libsqlDir = path.join(projectNodeModules, '@libsql');
      const destLibsqlDir = path.join(packageNodeModules, '@libsql');

      if (await fs.pathExists(libsqlDir)) {
        console.log('  ✓ Copying all @libsql/* packages...');
        await fs.copy(libsqlDir, destLibsqlDir, { overwrite: true, dereference: true });

        const packages = await fs.readdir(libsqlDir);
        packages.forEach(pkg => console.log(`    - @libsql/${pkg}`));
      } else {
        console.log('  ⚠ @libsql directory not found');
      }

      // Copiar TODOS los paquetes @lancedb/*
      const lancedbDir = path.join(projectNodeModules, '@lancedb');
      const destLancedbDir = path.join(packageNodeModules, '@lancedb');

      if (await fs.pathExists(lancedbDir)) {
        console.log('  ✓ Copying all @lancedb/* packages...');
        await fs.copy(lancedbDir, destLancedbDir, { overwrite: true, dereference: true });

        const packages = await fs.readdir(lancedbDir);
        const platformPkgs = packages.filter(pkg =>
          pkg.includes(platform) || pkg.includes(arch)
        );

        packages.forEach(pkg => {
          const isPlatformPkg = platformPkgs.includes(pkg);
          console.log(`    ${isPlatformPkg ? '★' : '-'} @lancedb/${pkg}${isPlatformPkg ? ' (current platform)' : ''}`);
        });
      } else {
        console.log('  ⚠ @lancedb directory not found');
      }

      // Copiar TODOS los paquetes @xenova/* (HuggingFace Transformers)
      const xenovaDir = path.join(projectNodeModules, '@xenova');
      const destXenovaDir = path.join(packageNodeModules, '@xenova');

      if (await fs.pathExists(xenovaDir)) {
        console.log('  ✓ Copying all @xenova/* packages...');
        await fs.copy(xenovaDir, destXenovaDir, { overwrite: true, dereference: true });

        const packages = await fs.readdir(xenovaDir);
        packages.forEach(pkg => console.log(`    - @xenova/${pkg}`));
        console.log('    (includes ONNX Runtime bindings for ML inference)');
      } else {
        console.log('  ⚠ @xenova directory not found');
      }

      // Obtener TODAS las dependencias de @libsql/client recursivamente
      console.log('  ✓ Finding all @libsql/client dependencies...');
      const allDeps = await getAllDependencies('@libsql/client');

      // Añadir dependencias de @lancedb/lancedb
      console.log('  ✓ Finding all @lancedb/lancedb dependencies...');
      const lancedbDeps = await getAllDependencies('@lancedb/lancedb');
      for (const dep of lancedbDeps) {
        allDeps.add(dep);
      }

      // Añadir dependencias de @xenova/transformers
      console.log('  ✓ Finding all @xenova/transformers dependencies...');
      const xenovaDeps = await getAllDependencies('@xenova/transformers');
      for (const dep of xenovaDeps) {
        allDeps.add(dep);
      }

      console.log('  ✓ Copying dependencies...');
      for (const dep of allDeps) {
        if (dep.startsWith('@libsql/') || dep.startsWith('@lancedb/') || dep.startsWith('@xenova/')) continue; // Ya copiado arriba

        const srcPath = path.join(projectNodeModules, dep);
        const destPath = path.join(packageNodeModules, dep);

        if (await fs.pathExists(srcPath)) {
          console.log(`    - ${dep}`);
          await fs.copy(srcPath, destPath, { overwrite: true, dereference: true });
        }
      }

      // Copiar update-electron-app y sus dependencias
      console.log('  ✓ Finding update-electron-app dependencies...');
      const updateAppDeps = await getAllDependencies('update-electron-app');

      for (const dep of updateAppDeps) {
        if (allDeps.has(dep)) continue; // Ya copiado

        const srcPath = path.join(projectNodeModules, dep);
        const destPath = path.join(packageNodeModules, dep);

        if (await fs.pathExists(srcPath)) {
          console.log(`    - ${dep}`);
          await fs.copy(srcPath, destPath, { overwrite: true, dereference: true });
        }
      }

      // Copiar winston (external - requerido por mcp-use Logger en runtime)
      console.log('  ✓ Finding winston dependencies...');
      const winstonDeps = await getAllDependencies('winston');

      for (const dep of winstonDeps) {
        if (allDeps.has(dep) || updateAppDeps.has(dep)) continue;

        const srcPath = path.join(projectNodeModules, dep);
        const destPath = path.join(packageNodeModules, dep);

        if (await fs.pathExists(srcPath)) {
          console.log(`    - ${dep}`);
          await fs.copy(srcPath, destPath, { overwrite: true, dereference: true });
        }
      }

      // Copiar pdf-parse (external - requerido por DocumentProcessor en runtime)
      console.log('  ✓ Finding pdf-parse dependencies...');
      const pdfParseDeps = await getAllDependencies('pdf-parse');

      for (const dep of pdfParseDeps) {
        if (allDeps.has(dep) || updateAppDeps.has(dep) || winstonDeps.has(dep)) continue;

        const srcPath = path.join(projectNodeModules, dep);
        const destPath = path.join(packageNodeModules, dep);

        if (await fs.pathExists(srcPath)) {
          console.log(`    - ${dep}`);
          await fs.copy(srcPath, destPath, { overwrite: true, dereference: true });
        }
      }

      // NOTE: mcp-use bundled by Vite, winston and pdf-parse kept external

      // Find shared dependencies (used by 2+ packages)
      const sharedDeps = Array.from(depUsageCount.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 most shared

      // Summary
      console.log('');
      console.log('✅ Dependency copy completed successfully');
      console.log(`   Platform: ${platform}-${arch}`);
      console.log(`   Packages copied: ${allDeps.size + updateAppDeps.size + winstonDeps.size + pdfParseDeps.size}`);
      if (filteredCount > 0) {
        console.log(`   🎯 Optimization: ${filteredCount} build-time packages filtered`);
        console.log('      (typescript, vitest, eslint, etc. - see UNNECESSARY_DEPS)');
      }
      if (sharedDeps.length > 0) {
        console.log(`   📦 Shared dependencies (top 5):`);
        sharedDeps.forEach(([dep, count]) => {
          console.log(`      - ${dep} (used by ${count} packages)`);
        });
        console.log('      (copied only once - no duplication)');
      }
      console.log('');
    }
  },

  packagerConfig: {
    // ASAR disabled for complex native dependencies
    // Reason: @lancedb, @xenova, and @libsql have deep transitive dependency trees
    // that require direct filesystem access for proper require() resolution.
    // ASAR unpack patterns are unreliable for such complex scenarios.
    // Trade-off: Slightly slower startup (~50-100ms) vs guaranteed module resolution
    asar: false,
    name: 'Levante',
    executableName: 'Levante',
    appBundleId: 'com.levante.app',
    icon: './resources/icons/icon', // Forge will add appropriate extension (.icns/.ico)

    // macOS Code Signing
    osxSign: process.env.CI ? {
      // In CI: import sets up keychain, sign will find the cert automatically
      'hardened-runtime': true,
      entitlements: 'build/entitlements.mac.plist',
      'entitlements-inherit': 'build/entitlements.mac.inherit.plist',
      'signature-flags': 'library',
      'optionsForFile': (_filePath) => {
        // Sign all native modules with same entitlements
        return {
          hardenedRuntime: true,
          entitlements: 'build/entitlements.mac.inherit.plist'
        }
      }
    } : {
      // Local: use specific identity
      identity: 'Developer ID Application',
      'hardened-runtime': true,
      entitlements: 'build/entitlements.mac.plist',
      'entitlements-inherit': 'build/entitlements.mac.inherit.plist',
      'signature-flags': 'library',
      'optionsForFile': (_filePath) => {
        // Sign all native modules with same entitlements
        return {
          hardenedRuntime: true,
          entitlements: 'build/entitlements.mac.inherit.plist'
        }
      }
    },

    // macOS Notarization
    osxNotarize: process.env.APPLE_ID ? {
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    } : undefined,

    // Windows specific
    win32metadata: {
      CompanyName: 'Levante Team',
      FileDescription: 'Levante - AI Chat Application',
      OriginalFilename: 'Levante.exe',
      ProductName: 'Levante',
      InternalName: 'Levante'
    }
  },

  rebuildConfig: {},

  makers: [
    // macOS makers
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {}
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'Levante',
        icon: './resources/icons/icon.icns',
        contents: (opts) => {
          return [
            {
              x: 130,
              y: 220,
              type: 'file',
              path: opts.appPath
            },
            {
              x: 410,
              y: 220,
              type: 'link',
              path: '/Applications'
            }
          ];
        }
      }
    },
    // Windows makers
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Levante',
        setupIcon: './resources/icons/icon.ico'
        // loadingGif is optional, can be added later if needed
        // Code signing will be added in Phase 2
        // certificateFile: './cert.pfx',
        // certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
      config: {}
    },
    // Linux makers
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'levante',
          productName: 'Levante',
          genericName: 'AI Chat Application',
          description: 'A friendly, private desktop chat app with AI and MCP integration',
          categories: ['Utility', 'Network'],
          maintainer: 'Levante Team',
          homepage: 'https://www.levanteapp.com',
          icon: './resources/icons/icon.png'
        }
      }
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'levante',
          productName: 'Levante',
          genericName: 'AI Chat Application',
          description: 'A friendly, private desktop chat app with AI and MCP integration',
          categories: ['Utility', 'Network'],
          homepage: 'https://www.levanteapp.com',
          icon: './resources/icons/icon.png'
        }
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['linux'],
      config: {}
    }
  ],

  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'levante-hub',
          name: 'levante'
        },
        draft: true,
        prerelease: false,
        // GitHub token will be provided via GITHUB_TOKEN env variable
        // This is automatically available in GitHub Actions
      }
    }
  ],

  plugins: [
    // Native module handling:
    // - @libsql/*, @lancedb/*, @xenova/* copied manually in packageAfterCopy hook (lines 36-214)
    // - ASAR disabled entirely (line 250) for guaranteed module resolution
    // - Not using @electron-forge/plugin-auto-unpack-natives due to complex transitive deps
    // - See docs/architecture/native-dependencies.md for detailed explanation
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // Vite config for main process
        build: [
          {
            entry: 'src/main/main.ts',
            config: 'vite.main.config.ts',
            target: 'main'
          },
          {
            entry: 'src/preload/preload.ts',
            config: 'vite.preload.config.ts',
            target: 'preload'
          }
        ],
        // Vite config for renderer process
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.ts'
          }
        ]
      }
    }
  ]
};
