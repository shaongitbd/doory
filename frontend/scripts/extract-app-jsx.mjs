// One-time migration of literal JSX labels to the shared message catalog.
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
const root = new URL('../src/', import.meta.url)
const files = []
function collect(dir) {
  for (const entry of fs.readdirSync(new URL(dir, root), { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`
    if (entry.isDirectory()) collect(name)
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) files.push(name)
  }
}
for (const dir of ['pages', 'features', 'app']) collect(dir)
const english = JSON.parse(fs.readFileSync(new URL('i18n/en.json', root)))
let count = 0
for (const file of files) {
  const url = new URL(file, root)
  const text = fs.readFileSync(url, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  function add(start, end, value, replacement) {
    if (!/[a-zA-Z]/.test(value) || !value.trim() || /^[A-Z0-9 .·×/-]{1,8}$/.test(value.trim())) return
    english[`app.${value}`] = value
    edits.push({ start, end, replacement })
  }
  function walk(node) {
    if (ts.isJsxText(node)) {
      const raw = node.getText(source)
      const value = raw.includes('\n') ? raw.trim().replace(/\s+/g, ' ') : raw
      if (value) add(node.getStart(source), node.end, value, `{msg(${JSON.stringify(value)})}`)
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)
      && ['aria-label', 'placeholder', 'title', 'alt', 'label', 'description', 'legend', 'heading', 'caption', 'hint'].includes(node.name.text)) {
      const value = node.initializer.text
      add(node.initializer.getStart(source), node.initializer.end, value, `{msg(${JSON.stringify(value)})}`)
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  if (!edits.length) continue
  let output = text
  for (const edit of edits.sort((a,b) => b.start-a.start)) output = output.slice(0,edit.start)+edit.replacement+output.slice(edit.end)
  if (!output.includes("import { msg } from '@/i18n/catalog'")) output = `import { msg } from '@/i18n/catalog'\n` + output
  fs.writeFileSync(url, output)
  count += edits.length
  console.log(file, edits.length)
}
fs.writeFileSync(new URL('i18n/en.json', root), JSON.stringify(Object.fromEntries(Object.entries(english).sort(([a],[b]) => a.localeCompare(b))), null, 2)+'\n')
console.log('Extracted JSX messages',count,'total',Object.keys(english).length)
