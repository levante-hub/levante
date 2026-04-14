const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');

const hasRpmbuild = (() => {
  try {
    execSync('which rpmbuild', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

module.exports = {
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      console.log('🔧 Copying @libsql native modules...');

      // Ruta de node_modules en el proyecto
      const projectNodeModules = path.join(__dirname, 'node_modules');
      // Ruta de node_modules en el paquete
      const packageNodeModules = path.join(buildPath, 'node_modules');

      // Crear directorio node_modules si no existe
      await fs.ensureDir(packageNodeModules);

      // Función recursiva para obtener todas las dependencias de un paquete
      const getAllDependencies = async (packageName, visited = new Set()) => {
        if (visited.has(packageName)) return visited;
        visited.add(packageName);

        const pkgJsonPath = path.join(projectNodeModules, packageName, 'package.json');
        if (!await fs.pathExists(pkgJsonPath)) return visited;

        try {
          const pkgJson = await fs.readJson(pkgJsonPath);
          const deps = { ...pkgJson.dependencies, ...pkgJson.optionalDependencies };

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

      // Obtener TODAS las dependencias de @libsql/client recursivamente
      console.log('  ✓ Finding all @libsql/client dependencies...');
      const allDeps = await getAllDependencies('@libsql/client');

      console.log('  ✓ Copying dependencies...');
      for (const dep of allDeps) {
        if (dep.startsWith('@libsql/')) continue; // Ya copiado arriba

        const srcPath = path.join(projectNodeModules, dep);
        const destPath = path.join(packageNodeModules, dep);

        if (await fs.pathExists(srcPath)) {
          console.log(`    - ${dep}`);
          await fs.copy(srcPath, destPath, { overwrite: true, dereference: true });
        }
      }

      // Copiar update-electron-app y sus dependencias (macOS)
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

      // Copiar electron-updater y sus dependencias (Windows NSIS)
      console.log('  ✓ Finding electron-updater dependencies...');
      const electronUpdaterDeps = await getAllDependencies('electron-updater');

      for (const dep of electronUpdaterDeps) {
        if (allDeps.has(dep) || updateAppDeps.has(dep)) continue; // Ya copiado

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

      // Copiar winston-daily-rotate-file (external - requerido por logging system)
      console.log('  ✓ Finding winston-daily-rotate-file dependencies...');
      const winstonRotateDeps = await getAllDependencies('winston-daily-rotate-file');

      for (const dep of winstonRotateDeps) {
        if (allDeps.has(dep) || updateAppDeps.has(dep) || winstonDeps.has(dep)) continue;

        const srcPath = path.join(projectNodeModules, dep);
        const destPath = path.join(packageNodeModules, dep);

        if (await fs.pathExists(srcPath)) {
          console.log(`    - ${dep}`);
          await fs.copy(srcPath, destPath, { overwrite: true, dereference: true });
        }
      }

      // NOTE: mcp-use bundled by Vite, only winston kept external for Logger

      // Copiar sharp y sus bindings @img/* (external — binario nativo)
      console.log('  ✓ Finding sharp dependencies...');
      const sharpDeps = await getAllDependencies('sharp');

      for (const dep of sharpDeps) {
        if (
          allDeps.has(dep) ||
          updateAppDeps.has(dep) ||
          winstonDeps.has(dep) ||
          winstonRotateDeps.has(dep)
        ) continue;

        const srcPath = path.join(projectNodeModules, dep);
        const destPath = path.join(packageNodeModules, dep);

        if (await fs.pathExists(srcPath)) {
          console.log(`    - ${dep}`);
          await fs.copy(srcPath, destPath, { overwrite: true, dereference: true });
        }
      }

      // Copiar todos los paquetes @img/* (bindings nativos de sharp)
      const imgDir = path.join(projectNodeModules, '@img');
      const destImgDir = path.join(packageNodeModules, '@img');

      if (await fs.pathExists(imgDir)) {
        console.log('  ✓ Copying all @img/* packages...');
        await fs.copy(imgDir, destImgDir, { overwrite: true, dereference: true });

        const imgPackages = await fs.readdir(imgDir);
        imgPackages.forEach(pkg => console.log(`    - @img/${pkg}`));
      }

      console.log(`✅ Copied external dependencies successfully`);
    }
  },

  packagerConfig: {
    extraResource: [
      './resources/default-skills'
    ],
    asar: {
      unpack: '{**/@libsql/**/*.node,**/node_modules/sharp/**/*,**/node_modules/@img/**/*}'
    },
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
      name: '@felixrieseberg/electron-forge-maker-nsis',
      config: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        installerIcon: './resources/icons/icon.ico',
        uninstallerIcon: './resources/icons/icon.ico',
        // Disable electron-builder's own publish — Electron Forge handles publishing.
        // publish: 'never' is ignored by this maker; getAppBuilderConfig is the correct way.
        getAppBuilderConfig: async () => ({ publish: null }),
        // Code signing will be added in a future phase
        // certificateFile: './cert.pfx',
        // certificatePassword: process.env.WIN_CSC_KEY_PASSWORD,
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
      config: {}
    },
    // Linux makers
    ...(process.env.FORGE_TARGET === 'AppImage'
      ? [
          {
            name: '@reforged/maker-appimage',
            config: {
              options: {
                name: 'levante',
                bin: 'Levante',
                productName: 'Levante',
                genericName: 'AI Chat Application',
                description: 'A friendly, private desktop chat app with AI and MCP integration',
                categories: ['Utility', 'Network'],
                maintainer: 'Levante Team',
                homepage: 'https://www.levanteapp.com',
                icon: './resources/icons/icon.png'
              }
            }
          }
        ]
      : [
          {
            name: '@electron-forge/maker-deb',
            config: {
              options: {
                name: 'levante',
                bin: 'Levante',
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
          ...(hasRpmbuild ? [{
            name: '@electron-forge/maker-rpm',
            config: {
              options: {
                name: 'levante',
                bin: 'Levante',
                productName: 'Levante',
                genericName: 'AI Chat Application',
                description: 'A friendly, private desktop chat app with AI and MCP integration',
                categories: ['Utility', 'Network'],
                homepage: 'https://www.levanteapp.com',
                icon: './resources/icons/icon.png'
              }
            }
          }] : []),
          {
            name: '@electron-forge/maker-zip',
            platforms: ['linux'],
            config: {}
          }
        ]
    ),
  ],

  plugins: [
    // Removido auto-unpack-natives porque ASAR está desactivado
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
