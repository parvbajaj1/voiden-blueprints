#!/usr/bin/env node
import { build } from 'esbuild'
import { readFileSync } from 'fs'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id

const SHIMS = {
  'react': `const _s=window.__voiden_shims__['react'];export default _s;export const {useState,useEffect,useCallback,useMemo,useRef,useContext,createContext,forwardRef,memo,Fragment,createElement,cloneElement,Children,StrictMode,Suspense,lazy,isValidElement,Component,PureComponent,createRef,startTransition,useReducer,useLayoutEffect,useImperativeHandle,useDebugValue,useTransition,useDeferredValue,useId}=_s;`,
  'react/jsx-runtime': `const _s=window.__voiden_shims__?.['react/jsx-runtime']??{};const _r=window.__voiden_shims__?.['react']??{};export const jsx=_s.jsx??_s.jsxDEV??_r.createElement;export const jsxs=_s.jsxs??_s.jsxDEV??_r.createElement;export const Fragment=_s.Fragment??_r.Fragment;`,
  'react-dom': `const _s=window.__voiden_shims__['react-dom'];export default _s;export const {createPortal,flushSync,render,unmountComponentAtNode}=_s;`,
  '@voiden/sdk': `const _s=window.__voiden_shims__['@voiden/sdk']||{};export default _s;`,
  '@voiden/sdk/ui': `const _s=window.__voiden_shims__['@voiden/sdk/ui']||{};export default _s;export const {PluginContext,CorePluginContext,Plugin,SlashCommand,SlashCommandGroup,Tab,EditorAction,StatusBarItem,PluginHelpers,BlockPasteHandler,BlockExtension,PatternHandler,PluginCommand,PluginTopBarItem,PluginContextMenuItem}=_s;`,
  '@tiptap/core': `const _s=window.__voiden_shims__['@tiptap/core']||{};export default _s;export const {Editor,Extension,Node,JSONContent,generateJSON,mergeAttributes,getSchema}=_s;`,
  '@tiptap/pm/model': `const _s=window.__voiden_shims__['@tiptap/pm/model']||{};export default _s;export const {DOMParser,Fragment,Node,Slice}=_s;`,
  '@tiptap/pm/state': `const _s=window.__voiden_shims__['@tiptap/pm/state']||{};export default _s;export const {EditorState,Plugin,PluginKey,TextSelection}=_s;`,
  '@tiptap/pm/view': `const _s=window.__voiden_shims__['@tiptap/pm/view']||{};export default _s;export const {EditorView}=_s;`,
  '@tiptap/suggestion': `const _s=window.__voiden_shims__['@tiptap/suggestion']||{};export default _s;`,
}

const shimPlugin = {
  name: 'voiden-shims',
  setup(build) {
    const shimKeys = Object.keys(SHIMS)
    build.onResolve({ filter: /.*/ }, (args) => {
      if (shimKeys.includes(args.path)) {
        return { path: args.path, namespace: 'voiden-shim' }
      }
    })
    build.onLoad({ filter: /.*/, namespace: 'voiden-shim' }, (args) => ({
      contents: SHIMS[args.path] ?? 'export default {}',
      loader: 'js',
    }))
  },
}

const caps = { slashCommands: {}, blocks: {} }
const mfStr = JSON.stringify({ ...manifest, capabilities: caps })

await build({
  entryPoints: ['./src/plugin.ts'],
  bundle: true,
  format: 'esm',
  outfile: `dist/main.js`,
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  tsconfigRaw: JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  }),
  plugins: [shimPlugin],
  banner: {
    js: `globalThis["__voiden_bundle_version__"]=2;\nexport const __voiden_bundle_version__=2;\nexport const __voiden_manifest__=${mfStr};\n`,
  },
  logLevel: 'info',
})
