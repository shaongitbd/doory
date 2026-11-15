import germanSource from './functions-de.ts?raw'
import ts from 'typescript'
import english from './en.json'
import de from './de.json'
import inventory from './functions.json'
import { functions } from './functions-de'

it('preserves static placeholders, technical syntax and fragment spacing', () => {
  for (const [key, source] of Object.entries(english)) {
    const translated = de[key as keyof typeof de]
    expect(translated.trim(), key).not.toBe('')
    const tokens = (s: string) => s.match(/\$?\{[^{}]+\}/g)?.sort() ?? []
    expect(tokens(translated), key).toEqual(tokens(source))
    if (source.startsWith(' ')) expect(translated.startsWith(' '), key).toBe(true)
    if (source.endsWith(' ')) expect(translated.endsWith(' '), key).toBe(true)
  }
  expect(de['bulk.dataPlaceholder']).toBe(english['bulk.dataPlaceholder'])
  expect(de['tools.linkPlaceholder']).toBe('https://')
  expect(de['tools.widthShort']).toBe('W')
  expect(de['tools.heightShort']).toBe('H')
})

const printer = ts.createPrinter()
function structure(code: string) {
  const file = ts.createSourceFile('function.ts', `const fn = ${code}`, ts.ScriptTarget.Latest, true)
  const declaration = (file.statements[0] as ts.VariableStatement).declarationList.declarations[0]
  const fn = declaration.initializer as ts.ArrowFunction
  const print = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, file)
  const interpolation = (expression: ts.Expression) => {
    const transformed = ts.transform(expression, [context => root => {
      const visit = (node: ts.Node): ts.VisitResult<ts.Node> => ts.isStringLiteral(node)
        ? ts.factory.createStringLiteral('TEXT')
        : ts.visitEachChild(node, visit, context)
      return ts.visitNode(root, visit) as ts.Expression
    }])
    const result = print(transformed.transformed[0])
    transformed.dispose()
    return result
  }
  const conditions = new Set<string>()
  const interpolations: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isConditionalExpression(node)) conditions.add(print(node.condition))
    if (ts.isIfStatement(node)) conditions.add(print(node.expression))
    if (ts.isTemplateSpan(node)) {
      const expression = node.expression
      // Plural words and nested branches are translated; names and other expressions stay intact.
      if (!ts.isConditionalExpression(expression) && !(ts.isCallExpression(expression) && expression.expression.getText(file) === 'plural')) {
        interpolations.push(interpolation(expression))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(fn)
  return { parameters: fn.parameters.map(print), returnType: fn.type && print(fn.type), conditions, interpolations: interpolations.sort() }
}

it('preserves every English function signature, condition and content interpolation', () => {
  const file = ts.createSourceFile('de.ts', germanSource, ts.ScriptTarget.Latest, true)
  const translated = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) translated.set(node.name.text, node.initializer.getText(file))
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const [key, { source }] of Object.entries(inventory)) {
    const original = structure(source)
    const german = structure(translated.get(key)!)
    expect(german.parameters, key).toEqual(original.parameters)
    expect(german.returnType, key).toEqual(original.returnType)
    for (const condition of original.conditions) expect(german.conditions.has(condition), `${key}: ${condition}`).toBe(true)
    // Role is a translated UI noun, so German must keep its capitalization.
    const expected = key === 'brand.chooseFont' ? ['role'] : original.interpolations
    expect(german.interpolations, key).toEqual(expected)
  }
})

const call = (key: string, ...args: unknown[]) => functions[key](...args as never[])

it('uses German plurals, number formatting and conditional messages', () => {
  expect(call('audio.freesound.count', 1000)).toBe('1.000 Audiodateien')
  expect(call('bgRemoval.wait', 1)).toBe('in 1 Sekunde')
  expect(call('bgRemoval.wait', 120)).toBe('in 2 Minuten')
  expect(call('bgRemoval.wait', 7200)).toBe('in 2 Stunden')
  expect(call('comments.pin.label', 3, 'Ada', 'Mein Text {x}', true, 1)).toBe('Kommentar 3 von Ada, erledigt, 1 Antwort: Mein Text {x}')
  expect(call('comments.pin.label', 3, 'Ada', 'Mein Text {x}', false, 0)).toBe('Kommentar 3 von Ada: Mein Text {x}')
  expect(call('comments.pin.replies', 0)).toBe('0 Antworten')
  expect(call('audio.tracks.pageOption', 2)).toBe('Seite 2')
  expect(call('audio.tracks.pageOption', 2, 'User title')).toBe('Seite 2 · User title')
  expect(call('ctx.fieldType', 'text')).toBe('Textfeld')
  expect(call('ctx.fieldType', 'machine_key')).toBe('machine_key')
  expect(call('imageDrawer.listNames', [])).toBe('')
  expect(call('imageDrawer.listNames', ['A', 'B', 'C'])).toBe('A, B und C')
  expect(call('userFonts.missing.body', 'My Font', false, false)).toBe('My Font: Text in dieser Schrift wird in einer Ersatzschrift angezeigt.')
  expect(call('userFonts.missing.body', 'My Fonts', true, true)).toContain('diesen Schriften')
  expect(call('video.madeWith', 'GIF', null)).toBe('GIF')
  expect(call('video.madeWith', 'H.264', 'AAC')).toBe('H.264-Video, AAC-Ton')
  expect(call('video.madeWith', 'H.264', null)).toBe('H.264-Video, ohne Ton')
})

it.each([0, 1, 2])('uses German count forms for %i without losing numeric arguments', n => {
  expect(call('announce.deleted', n)).toBe(`${n} ${n === 1 ? 'Ebene' : 'Ebenen'} gelöscht`)
  expect(call('audio.tracks.count', n)).toBe(`${n} ${n === 1 ? 'Spur' : 'Spuren'}`)
  expect(call('audio.record.countdown', n)).toBe(`Aufnahme startet in ${n} ${n === 1 ? 'Sekunde' : 'Sekunden'}`)
  expect(call('templates.pageCount', n)).toBe(`${n} ${n === 1 ? 'Seite' : 'Seiten'}`)
  expect(call('userFonts.styles', n)).toBe(`${n} ${n === 1 ? 'Stil' : 'Stile'}`)
  expect(call('stickers.items', n)).toBe(`${n} Sticker`)
})

it.each([false, true])('preserves sentinel content across optional branches (enabled=%s)', enabled => {
  const name = 'USER {name} – \'quoted\' 😀'
  const filename = 'Original {title}.png'
  expect(call('audio.uploads.remove', filename)).toBe(`${filename} aus Deinen Uploads löschen`)
  expect(call('audio.tracks.pageOption', 2, enabled ? name : undefined)).toBe(enabled ? `Seite 2 · ${name}` : 'Seite 2')
  expect(call('comments.pin.label', 7, name, filename, enabled, enabled ? 2 : 0)).toBe(`Kommentar 7 von ${name}${enabled ? ', erledigt, 2 Antworten' : ''}: ${filename}`)
  expect(call('userFonts.missing.body', name, enabled, enabled)).toBe(`${name}: Text in ${enabled ? 'diesen Schriften' : 'dieser Schrift'} wird in einer Ersatzschrift angezeigt.${enabled ? ' Lade die Schrift erneut hoch oder wähle eine andere.' : ''}`)
  expect(call('video.engine.webcodecs', 'H.264', enabled ? 'AAC' : null)).toBe(enabled ? 'In Deinem Browser mit H.264 und AAC erstellt.' : 'In Deinem Browser mit H.264 erstellt.')
})

it('keeps translated font-role capitalization and context-specific nouns', () => {
  expect(call('brand.chooseFont', 'Fließtext')).toBe('Schrift für Fließtext wählen')
  expect(de['basicShapes.star']).toBe('Stern')
  expect(de['masks.star']).toBe('Stern')
  expect(de['app.Star']).toBe('Als Favorit markieren')
  expect(de['fonts.mono']).toBe('Nichtproportional')
  expect(de['filterPresets.mono']).toBe('Monochrom')
  expect(de['kinds.group']).toBe('Gruppe')
  expect(de['shapes.drop']).toBe('Tropfen')
  expect(de['stickers.kinds.line']).toBe('Linien')
  expect(de['toolbar.flip']).toBe('Spiegeln')
  expect(de['tools.headOpen']).toBe('Offen')
  expect(de['audio.tracks.kinds.upload']).toBe('Hochgeladene Datei')
})
