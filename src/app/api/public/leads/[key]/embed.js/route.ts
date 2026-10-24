import { type NextRequest } from 'next/server'
import { appUrl } from '@/lib/env'
import { HONEYPOT_FIELD } from '@/modules/orbit/capture/guard'
import { captureByFormKey } from '@/modules/orbit/capture/settings'

export const runtime = 'nodejs'

/**
 * The script option of the website form: it draws a small form into every
 * `<div data-flowbit-lead-form>` on the page (or fills an existing form with
 * `data-flowbit-lead-form`) and posts it as JSON, with the page's UTM tags.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const capture = await captureByFormKey(key)
  if (!capture) return new Response('/* This Flowbit form is not available. */', { status: 404, headers: { 'content-type': 'application/javascript; charset=utf-8' } })
  const endpoint = appUrl(`/api/public/leads/${key}`)
  const script = `(function(){
var ENDPOINT=${JSON.stringify(endpoint)},HP=${JSON.stringify(HONEYPOT_FIELD)};
function utm(){var q=new URLSearchParams(location.search),o={};["source","medium","campaign","term","content"].forEach(function(k){var v=q.get("utm_"+k);if(v)o["utm_"+k]=v});return o}
function field(name,label,type,required){return '<label style="display:block;margin:0 0 10px">'+label+'<br><input name="'+name+'" type="'+type+'"'+(required?' required':'')+' style="width:100%;padding:8px;box-sizing:border-box"></label>'}
function draw(el){if(el.tagName==="FORM")return el;el.innerHTML='<form>'+field("name","Name","text",true)+field("email","Email","email",false)+field("phone","Phone","tel",false)+field("company","Company","text",false)+'<label style="display:block;margin:0 0 10px">Message<br><textarea name="message" rows="3" style="width:100%;padding:8px;box-sizing:border-box"></textarea></label><input name="'+HP+'" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"><button type="submit">Send</button><p data-flowbit-status></p></form>';return el.querySelector("form")}
function wire(el){var f=draw(el);if(!f||f.__fb)return;f.__fb=1;f.addEventListener("submit",function(e){e.preventDefault();var d=Object.assign({},utm());new FormData(f).forEach(function(v,k){if(typeof v==="string")d[k]=v});var s=f.querySelector("[data-flowbit-status]");fetch(ENDPOINT,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)}).then(function(r){return r.json().then(function(j){if(s)s.textContent=r.ok?j.message:(j.error||"Could not send. Try again.");if(r.ok)f.reset()})}).catch(function(){if(s)s.textContent="Could not send. Check your connection."})})}
function run(){document.querySelectorAll("[data-flowbit-lead-form]").forEach(wire)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();
})();`
  return new Response(script, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } })
}
