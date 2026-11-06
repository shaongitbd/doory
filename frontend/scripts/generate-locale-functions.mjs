// Generate function-style translations without changing their arguments or control flow.
// Only source string/template fragments are translated; branches and interpolations stay intact.
import ts from 'typescript'
import fs from 'node:fs'
const source = JSON.parse(fs.readFileSync(new URL('../src/i18n/functions.json', import.meta.url)))
const printer = ts.createPrinter({ removeComments: true })
for (const locale of ['zh-CN', 'zh-TW']) {
  const translations = JSON.parse(fs.readFileSync(new URL(`../src/i18n/fragments-${locale}.json`, import.meta.url)))
  const lines = [
    '/* Generated from editor strings; do not change the English functions or argument handling here. */',
    'const plural = (_n: number, one: string, _many: string): string => one',
    "const people = (n: number): string => `${n} 人`",
    'export const functions: Record<string, (...args: never[]) => string> = {',
  ]
  for (const [key, { source: code }] of Object.entries(source)) {
    const ast = ts.createSourceFile('fn.ts', `const fn = ${code}`, ts.ScriptTarget.Latest, true)
    const decl = ast.statements[0].declarationList.declarations[0]
    const transform = ts.transform(decl.initializer, [context => root => {
      const visit = node => {
        if (ts.isStringLiteral(node)) {
          if (ts.isCallExpression(node.parent) && ts.isPropertyAccessExpression(node.parent.expression) && node.parent.expression.name.text === 'toLocaleString') return ts.factory.createStringLiteral(locale)
          return ts.factory.createStringLiteral(translations[node.text] ?? node.text)
        }
        if (ts.isNoSubstitutionTemplateLiteral(node)) return ts.factory.createNoSubstitutionTemplateLiteral(translations[node.text] ?? node.text)
        if (ts.isTemplateHead(node)) return ts.factory.createTemplateHead(translations[node.text] ?? node.text)
        if (ts.isTemplateMiddle(node)) return ts.factory.createTemplateMiddle(translations[node.text] ?? node.text)
        if (ts.isTemplateTail(node)) return ts.factory.createTemplateTail(translations[node.text] ?? node.text)
        return ts.visitEachChild(node, visit, context)
      }
      return ts.visitNode(root, visit)
    }])
    const rendered = printer.printNode(ts.EmitHint.Expression, transform.transformed[0], ast)
      .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    lines.push(`  ${JSON.stringify(key)}: ${rendered},`)
    transform.dispose()
  }
  lines.push('}', '')
  fs.writeFileSync(new URL(`../src/i18n/functions-${locale}.ts`, import.meta.url), lines.join('\n'))
  console.log(locale, Object.keys(source).length)
}
