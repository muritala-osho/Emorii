const fs = require('fs');
const path = require('path');

// ── 1. Patch metro/package.json to expose internal src paths needed by expo@49 ──
const metroPkgPath = path.join(__dirname, '..', 'node_modules', 'metro', 'package.json');

if (fs.existsSync(metroPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(metroPkgPath, 'utf8'));
  if (pkg.exports) {
    const neededExports = {
      './src/lib/TerminalReporter': './src/lib/TerminalReporter.js',
      './src/lib/createWebsocketServer': './src/lib/createWebsocketServer.js',
      './src/lib/splitBundleOptions': './src/lib/splitBundleOptions.js',
      './src/lib/reporting': './src/lib/reporting.js',
      './src/Server': './src/Server.js',
      './src/HmrServer': './src/HmrServer.js',
      './src/Assets': './src/Assets.js',
      './src/DeltaBundler': './src/DeltaBundler.js',
      './src/IncrementalBundler': './src/IncrementalBundler.js',
      './src/Bundler': './src/Bundler.js',
      './src/shared/types': './src/shared/types.js',
      './src/DeltaBundler/types': './src/DeltaBundler/types.js',
      './src/DeltaBundler/Graph': './src/DeltaBundler/Graph.js',
      './src/DeltaBundler/Serializers/helpers/js': './src/DeltaBundler/Serializers/helpers/js.js',
      './src/DeltaBundler/Serializers/sourceMapString': './src/DeltaBundler/Serializers/sourceMapString.js',
      './src/lib/bundleToString': './src/lib/bundleToString.js',
      './src/lib/CountingSet': './src/lib/CountingSet.js',
      './src/lib/countLines': './src/lib/countLines.js',
      './src/lib/getAppendScripts': './src/lib/getAppendScripts.js',
      './src/ModuleGraph/worker/JsFileWrapping': './src/ModuleGraph/worker/JsFileWrapping.js',
      './src/ModuleGraph/worker/generateImportNames': './src/ModuleGraph/worker/generateImportNames.js',
      './src/Bundler/util': './src/Bundler/util.js',
    };
    let patched = false;
    for (const [exportPath, filePath] of Object.entries(neededExports)) {
      if (!pkg.exports[exportPath]) {
        pkg.exports[exportPath] = filePath;
        patched = true;
      }
    }
    if (patched) {
      fs.writeFileSync(metroPkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log('[patch-metro] Patched metro/package.json exports.');
    } else {
      console.log('[patch-metro] metro/package.json already patched.');
    }
  }
}

// ── 1c. Patch metro-transform-worker/package.json — same class of issue: ──
//        Expo SDK 52's metro-config imports `metro-transform-worker/src/utils/getMinifier`.
const mtwPkgPath = path.join(__dirname, '..', 'node_modules', 'metro-transform-worker', 'package.json');

if (fs.existsSync(mtwPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(mtwPkgPath, 'utf8'));
  if (pkg.exports) {
    const neededExports = {
      './src/utils/getMinifier': './src/utils/getMinifier.js',
      './src/utils/assetTransformer': './src/utils/assetTransformer.js',
    };
    let patched = false;
    for (const [exportPath, filePath] of Object.entries(neededExports)) {
      if (!pkg.exports[exportPath]) {
        pkg.exports[exportPath] = filePath;
        patched = true;
      }
    }
    if (patched) {
      fs.writeFileSync(mtwPkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log('[patch-metro] Patched metro-transform-worker/package.json exports.');
    } else {
      console.log('[patch-metro] metro-transform-worker/package.json already patched.');
    }
  }
}

// ── 1b. Patch metro-cache/package.json so @expo/metro-config can require ──
//        `metro-cache/src/stores/FileStore`. The newer metro-cache package
//        (shipped with RN 0.83.x) restricts subpath access via the "exports"
//        field, which breaks Expo SDK 52's @expo/metro-config that imports
//        FileStore directly. The file exists on disk; we just need to expose it.
const metroCachePkgPath = path.join(__dirname, '..', 'node_modules', 'metro-cache', 'package.json');

if (fs.existsSync(metroCachePkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(metroCachePkgPath, 'utf8'));
  if (pkg.exports) {
    const neededExports = {
      './src/stores/FileStore': './src/stores/FileStore.js',
      './src/stores/AutoCleanFileStore': './src/stores/AutoCleanFileStore.js',
      './src/stores/HttpStore': './src/stores/HttpStore.js',
      './src/stores/HttpGetStore': './src/stores/HttpGetStore.js',
      './src/stores/HttpError': './src/stores/HttpError.js',
      './src/stores/NetworkError': './src/stores/NetworkError.js',
    };
    let patched = false;
    for (const [exportPath, filePath] of Object.entries(neededExports)) {
      if (!pkg.exports[exportPath]) {
        pkg.exports[exportPath] = filePath;
        patched = true;
      }
    }
    if (patched) {
      fs.writeFileSync(metroCachePkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log('[patch-metro] Patched metro-cache/package.json exports.');
    } else {
      console.log('[patch-metro] metro-cache/package.json already patched.');
    }
  }
}

// ── 2. Patch @expo/cli resolveFromProject.js for ES module interop ──
// expo@49 expects CJS classes but metro@0.83.x exports ES module default exports.
const resolveFromProjectPath = path.join(
  __dirname, '..', 'node_modules', '@expo', 'cli', 'build', 'src',
  'start', 'server', 'metro', 'resolveFromProject.js'
);

if (fs.existsSync(resolveFromProjectPath)) {
  let src = fs.readFileSync(resolveFromProjectPath, 'utf8');
  const marker = '/* patched-esm-interop */';

  if (!src.includes(marker)) {
    // Fix importMetroHmrServerFromProject to unwrap default export
    src = src.replace(
      'function importMetroHmrServerFromProject(projectRoot) {\n    return importFromProject(projectRoot, "metro/src/HmrServer");\n}',
      `function importMetroHmrServerFromProject(projectRoot) { ${marker}\n    const mod = importFromProject(projectRoot, "metro/src/HmrServer");\n    return mod && mod.__esModule ? mod.default : mod;\n}`
    );

    // Fix importMetroCreateWebsocketServerFromProject similarly
    src = src.replace(
      'function importMetroCreateWebsocketServerFromProject(projectRoot) {\n    return importFromProject(projectRoot, "metro/src/lib/createWebsocketServer");\n}',
      `function importMetroCreateWebsocketServerFromProject(projectRoot) {\n    const mod = importFromProject(projectRoot, "metro/src/lib/createWebsocketServer");\n    return mod && mod.__esModule ? mod.default : mod;\n}`
    );

    fs.writeFileSync(resolveFromProjectPath, src, 'utf8');
    console.log('[patch-metro] Patched @expo/cli resolveFromProject.js for ES module interop.');
  } else {
    console.log('[patch-metro] @expo/cli resolveFromProject.js already patched.');
  }
}
