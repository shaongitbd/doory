import ts from 'typescript'
import fs from 'node:fs'
const functions = JSON.parse(fs.readFileSync(new URL('../src/i18n/functions.json', import.meta.url)))
const strings = new Set()
for (const { source } of Object.values(functions)) {
  const ast = ts.createSourceFile('function.ts', `const fn = ${source}`, ts.ScriptTarget.Latest, true)
  function visit(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) strings.add(n.text)
    ts.forEachChild(n, visit)
  }
  visit(ast)
}
fs.writeFileSync(new URL('../src/i18n/fragments.json', import.meta.url), JSON.stringify([...strings].sort(), null, 2) + '\n')
console.log(strings.size)
