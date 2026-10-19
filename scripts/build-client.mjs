/**
 * Bundle `src/client.tsx` into the browser module system's lazy-CJS factory
 * format and write `lib/client.js`.
 *
 * The Harness Web shell seeds a fixed module table and registers plugin bundles
 * with `window.__ModuleLoader__.load({ id, factory })`; the factory receives a
 * synchronous `require` for the shared platform modules. esbuild therefore
 * emits CommonJS with those modules external, and this script wraps the output
 * in the factory envelope. No @deepseek-ai package is required to build: every
 * external is supplied by the shell's module table at runtime.
 */
import { build, context } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** Package identity; must equal the manifest name and the factory id. */
const PACKAGE_NAME = '@local/dsh-balance'
/** Source entry and build output. */
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ENTRY = join(ROOT, 'src', 'client.tsx')
const OUTPUT = join(ROOT, 'lib', 'client.js')

/**
 * Modules the Harness Web shell seeds into the module table
 * (`staticModules` in `@deepseek-ai/dsh-web-frontend`). Bundling any of them
 * would ship a duplicate React/cordis/zod instance and break plugin interop.
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const HEADER =
  'window.__ModuleLoader__.load({\n' +
  '\tid: ' +
  JSON.stringify(PACKAGE_NAME) +
  ',\n' +
  '\tfactory: (require) => {\n' +
  '\t\tvar module = { exports: {} };\n' +
  '\t\tvar exports = module.exports;\n' +
  '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n'

const FOOTER = '\n\t\treturn module.exports;\n\t}\n});\n'

/** Wrap one esbuild CommonJS output file in the lazy factory envelope. */
async function emit(outputFiles) {
  const file = outputFiles.find((candidate) => candidate.path.endsWith('client.js'))
  if (file === undefined) throw new Error('build-client: esbuild produced no client.js output')
  const code = HEADER + file.text + FOOTER
  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, code, 'utf8')
  const marker = 'window.__ModuleLoader__.load('
  if (!code.startsWith(marker)) throw new Error('build-client: output does not start with the module loader call')
  for (const needle of ['factory', 'sidebar.footer.action', 'plugins.row.config', 'inject']) {
    if (!code.includes(needle)) throw new Error('build-client: output is missing "' + needle + '"')
  }
  return code.length
}

const options = {
  entryPoints: [ENTRY],
  outfile: OUTPUT,
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110', 'safari16', 'firefox110'],
  jsx: 'automatic',
  external: PLATFORM_MODULES,
  logLevel: 'warning',
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
  define: { 'process.env.NODE_ENV': '"production"' },
}

const watch = process.argv.includes('--watch')

if (watch) {
  const watcher = await context({
    ...options,
    plugins: [
      {
        name: 'wrap-module-loader',
        setup(buildApi) {
          buildApi.onEnd(async (result) => {
            if (result.errors.length > 0) return
            try {
              const size = await emit(result.outputFiles ?? [])
              console.log('build-client: wrote ' + OUTPUT + ' (' + size + ' bytes)')
            } catch (error) {
              console.error(error)
            }
          })
        },
      },
    ],
  })
  await watcher.watch()
  console.log('build-client: watching ' + ENTRY)
} else {
  const result = await build(options)
  const size = await emit(result.outputFiles ?? [])
  console.log('build-client: wrote ' + OUTPUT + ' (' + size + ' bytes)')
}
