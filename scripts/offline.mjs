// Inline the single-entry production build into a single self-contained HTML document.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]) + sep)
  : new URL('../dist/', import.meta.url)
let html = await readFile(new URL('index.html', dist), 'utf8')
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/)
const style = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)
if (!script || !style)
  throw new Error('Expected one JavaScript entry and one stylesheet in the production build.')
const js = await readFile(new URL(script[1], dist), 'utf8')
const css = await readFile(new URL(style[1], dist), 'utf8')
html = html.replace(
  script[0],
  () => '<script type="module">' + js.replace(/<\/script/gi, '<\\/script') + '</script>',
)
html = html.replace(style[0], () => '<style>' + css + '</style>')
const licenses = await Promise.all(
  ['dm-sans-license.txt', 'dm-serif-text-license.txt'].map((name) =>
    readFile(new URL('../src/features/fonts/' + name, import.meta.url), 'utf8'),
  ),
)
html += '\n<!-- Bundled font licenses\n' + licenses.join('\n') + '\n-->\n'
await writeFile(new URL('NoKitchen-1.4.1.html', dist), html)
