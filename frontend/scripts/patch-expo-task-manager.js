const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'node_modules', 'expo-task-manager', 'android', 'src', 'main', 'java', 'expo', 'modules', 'taskManager');

// ── Patch 1: TaskManagerModule.kt ───────────────────────────────────────────
// expo-task-manager@12.0.6 imports `ModuleNotFoundException` from
// expo.modules.core.errors, but that class was removed in expo-modules-core@55.
// Replace the broken import and its two throw sites with a plain Exception.
//
// Actual import:  import expo.modules.core.errors.ModuleNotFoundException
// Actual throws:  throw ModuleNotFoundException(SomeInterface::class.java.toString())

const ktFile = path.join(BASE, 'TaskManagerModule.kt');
const KT_MARKER = '// patched-ModuleNotFoundException';

if (!fs.existsSync(ktFile)) {
  console.log('[patch-expo-task-manager] TaskManagerModule.kt not found, skipping.');
} else {
  let src = fs.readFileSync(ktFile, 'utf8');
  if (src.includes(KT_MARKER)) {
    console.log('[patch-expo-task-manager] TaskManagerModule.kt already patched.');
  } else {
    // Remove the broken import line
    src = src.replace(
      /^import expo\.modules\.core\.errors\.ModuleNotFoundException[^\n]*\n/m,
      `${KT_MARKER}\n`
    );
    // Replace throw sites whose argument has inner parens: Foo::class.java.toString()
    // Use [^(]+ to stop before the inner '(' rather than consuming it.
    src = src.replace(
      /throw ModuleNotFoundException\([^(]+\(\)\)/g,
      'throw Exception("Required module not available")'
    );
    fs.writeFileSync(ktFile, src, 'utf8');
    console.log('[patch-expo-task-manager] Patched TaskManagerModule.kt — removed ModuleNotFoundException.');
  }
}

// ── Patch 2: TaskService.java ────────────────────────────────────────────────
// expo-task-manager@12.0.6 catches HeadlessAppLoader.AppConfigurationError on
// line ~422, but that nested class was removed from the HeadlessAppLoader
// interface in expo-modules-core@55.0.25 (only Params remains).
// Replace the unreachable catch type with RuntimeException so javac succeeds.

const javaFile = path.join(BASE, 'TaskService.java');
const JAVA_MARKER = '// patched-AppConfigurationError';

if (!fs.existsSync(javaFile)) {
  console.log('[patch-expo-task-manager] TaskService.java not found, skipping.');
} else {
  let src = fs.readFileSync(javaFile, 'utf8');
  if (src.includes(JAVA_MARKER)) {
    console.log('[patch-expo-task-manager] TaskService.java already patched.');
  } else {
    // Include the opening '{' in the match so our line-comment marker
    // doesn't accidentally comment it out.
    src = src.replace(
      /catch\s*\(\s*HeadlessAppLoader\.AppConfigurationError\s+(\w+)\s*\)\s*\{/g,
      `catch (RuntimeException $1) { ${JAVA_MARKER}`
    );
    fs.writeFileSync(javaFile, src, 'utf8');
    console.log('[patch-expo-task-manager] Patched TaskService.java — replaced HeadlessAppLoader.AppConfigurationError with RuntimeException.');
  }
}
