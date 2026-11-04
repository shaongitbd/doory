// One-time extraction of simple object-property labels and page titles.
import ts from 'typescript'
import fs from 'node:fs'
const root = new URL('../src/', import.meta.url)
const english = JSON.parse(fs.readFileSync(new URL('i18n/en.json', root)))
const names = new Set(['label','title','description','placeholder','heading','subtitle','caption','message','hint','legend','lead','emptyText','emptyTitle'])
const files=[]
function collect(dir) {
 for (const item of fs.readdirSync(new URL(dir,root),{withFileTypes:true})) {
  const file=`${dir}/${item.name}`
  if(item.isDirectory()) collect(file)
  else if(item.name.endsWith('.tsx') && !item.name.includes('.test.')) files.push(file)
 }
}
for(const dir of ['pages','features','app'])collect(dir)
let total=0
for(const file of files){
 const url=new URL(file,root);let text=fs.readFileSync(url,'utf8');const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const edits=[]
 function add(n){const value=n.text;if(!/[a-zA-Z]/.test(value)||value.length<2||/^[A-Z0-9 /_-]{1,8}$/.test(value))return;english[`app.${value}`]=value;edits.push({start:n.getStart(source),end:n.end,value})}
 function visit(n){
  if(ts.isPropertyAssignment(n)&&names.has(n.name.getText(source))&&ts.isStringLiteral(n.initializer))add(n.initializer)
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['usePageTitle'].includes(n.expression.text)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))add(n.arguments[0])
  ts.forEachChild(n,visit)
 }
 visit(source)
 if(!edits.length)continue
 for(const e of edits.sort((a,b)=>b.start-a.start)) text=text.slice(0,e.start)+`msg(${JSON.stringify(e.value)})`+text.slice(e.end)
 if(!text.includes("import { msg } from '@/i18n/catalog'"))text=`import { msg } from '@/i18n/catalog'\n`+text
 fs.writeFileSync(url,text);total+=edits.length;console.log(file,edits.length)
}
fs.writeFileSync(new URL('i18n/en.json',root),JSON.stringify(Object.fromEntries(Object.entries(english).sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n')
console.log('Extracted property strings',total,'total',Object.keys(english).length)
