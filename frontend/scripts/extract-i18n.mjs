// Regenerate the English key inventory from the editor's existing source of truth.
import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../src/', import.meta.url)
const sources = [
  ['editor/strings.ts', 'english', ''],
  ['editor/animation/strings.ts', 'animationStrings', 'animation'],
  ['editor/audio/strings.ts', 'audioStrings', 'audio'],
  ['editor/clips/strings.ts', 'clipStrings', 'clips'],
  ['editor/collab/strings.ts', 'collab', 'collab'],
  ['editor/dialogs/print/strings.ts', 'print', 'print'],
  ['editor/dialogs/video/strings.ts', 'videoStrings', 'video'],
]
const result = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'))).filter(([key]) => key.startsWith('app.')))
const functions = {}
for (const [file, name, prefix] of sources) {
  const text = readFileSync(new URL(file, root), 'utf8')
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const declaration = ast.statements.flatMap(s => ts.isVariableStatement(s) ? [...s.declarationList.declarations] : []).find(d => d.name.getText(ast) === name)
  const object = declaration && ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration?.initializer
  if (!object || !ts.isObjectLiteralExpression(object)) throw new Error(`Missing ${name} in ${file}`)
  function visit(node, path) {
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const key = property.name.getText(ast).replace(/^['"]|['"]$/g, '')
      const full = [...path, key]
      const value = property.initializer
      if (ts.isObjectLiteralExpression(value)) visit(value, full)
      else if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) result[full.join('.')] = value.text
      else if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) functions[full.join('.')] = { source: value.getText(ast), file }
    }
  }
  visit(object, prefix ? [prefix] : [])
}
const output = new URL('../src/i18n/en.json', import.meta.url)
writeFileSync(output, JSON.stringify(Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n')
writeFileSync(new URL('../src/i18n/functions.json', import.meta.url), JSON.stringify(Object.fromEntries(Object.entries(functions).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n')
console.log(`Extracted ${Object.keys(result).length} strings and ${Object.keys(functions).length} functions`)
