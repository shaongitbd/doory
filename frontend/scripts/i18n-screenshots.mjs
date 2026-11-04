import { chromium } from '@playwright/test'
import fs from 'node:fs'
const base='http://127.0.0.1:5197'
const dest='/Users/dongsjoa/.hermes/xiaoyaner/work/doory-eval-20261104/i18n-qa'
fs.mkdirSync(dest,{recursive:true})
const browser=await chromium.launch({headless:true})
for(const locale of ['zh-CN','zh-TW']) for(const [viewportName,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1})
 await context.addInitScript(l=>{localStorage.setItem('doory.locale',l)},locale)
 const page=await context.newPage()
 for(const [name,url] of [['landing','/'],['dashboard','/dashboard'],['editor','/create']]) {
  try {
   await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:20000})
   await page.waitForTimeout(1600)
   if(name==='editor') {
    const button=page.getByRole('button',{name:/custom|自定义|自訂|创建|建立|create|start|开始/i}).first()
    if(await button.count()) await button.click({timeout:2000}).catch(()=>{})
    await page.waitForTimeout(900)
   }
   const path=`${dest}/${name}-${locale}-${viewportName}.png`
   await page.screenshot({path,fullPage:true,timeout:15000})
   const metrics=await page.evaluate(()=>({lang:document.documentElement.lang,width:document.documentElement.scrollWidth,viewport:window.innerWidth,text:document.body.innerText.slice(0,220),path:location.pathname}))
   console.log(path,JSON.stringify(metrics))
  } catch(e){console.log('FAILED',name,locale,viewportName,String(e).slice(0,180))}
 }
 await context.close()
}
await browser.close()
