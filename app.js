const CATS=["Food","Groceries","Transport","Rent & Bills","Shopping","Health","Entertainment","Travel","Education","Other"];
const $=id=>document.getElementById(id);
const ls={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let local=ls.get("sd_items",[]);
let cloudItems=[];
let cfg=Object.assign({key:"",model:"gemini-2.5-flash",fb:""},ls.get("sd_cfg",{}));
let user=null,migrated=false,showHidden=false;
const inr=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const setStatus=t=>$("status").textContent=t||"";
const setSync=t=>$("sync").textContent=t||"";
const all=()=>[...(user?cloudItems:local)].sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0));
const live=()=>all().filter(i=>!i.archived);

$("key").value=cfg.key;$("model").value=cfg.model;$("fb").value=cfg.fb;
if(!cfg.key)$("settings").open=true;

$("saveKey").onclick=()=>{
  const fbChanged=$("fb").value.trim()!==cfg.fb;
  cfg={key:$("key").value.trim(),model:$("model").value.trim()||"gemini-2.5-flash",fb:$("fb").value.trim()};
  ls.set("sd_cfg",cfg);
  if(user&&cfg.key)window.cloud.putSettings({geminiKey:cfg.key,model:cfg.model}).catch(e=>setSync("Couldn't save key to Firestore: "+e.message));
  if(fbChanged){location.reload();return}
  $("settings").open=false;
};

/* ---------- Firestore ---------- */
function fbConfig(){
  let s=cfg.fb;if(!s)return null;
  const m=s.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})/);
  if(m)s=m[1];
  const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a<0||b<a)return null;
  s=s.slice(a,b+1);
  try{return JSON.parse(s)}catch(e){}
  try{return JSON.parse(s.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g,'$1"$2":').replace(/'/g,'"').replace(/,\s*}/g,'}'))}catch(e){return null}
}
function startCloud(tries=0){
  if(!cfg.fb){setSync("Local mode: data stays in this browser. Paste a Firebase config to sync with Firestore.");return}
  if(!window.cloud){if(tries<50)return setTimeout(()=>startCloud(tries+1),200);setSync("Couldn't load Firebase. Serve this folder over http://localhost (python3 -m http.server 8000) and check your connection.");return}
  const c=fbConfig();if(!c){setSync("That Firebase config doesn't look valid.");return}
  try{window.cloud.init(c,onCloudItems,onCloudUser);setSync("Firebase ready. Sign in to sync.")}catch(e){setSync(e.message)}
}
function onCloudUser(u,err){
  user=u;
  $("login").hidden=!!u;$("logout").hidden=!u;
  $("pill").textContent=u?"synced · "+(u.email||"signed in"):"local mode";
  $("pill").classList.toggle("on",!!u);
  if(err)setSync("Firestore error: "+err.message+" (check your security rules)");
  else setSync(u?"Signed in as "+(u.email||u.uid)+". Entries are saved to Firestore and never deleted.":"Sign in to sync with Firestore.");
  if(u&&!err)loadCloudSettings();
  render();
}
async function loadCloudSettings(){
  try{
    const s=await window.cloud.getSettings();
    if(s&&s.geminiKey){
      cfg.key=s.geminiKey;if(s.model)cfg.model=s.model;
      $("key").value=cfg.key;$("model").value=cfg.model;
      ls.set("sd_cfg",cfg);
      $("settings").open=false;
    }else if(cfg.key){
      window.cloud.putSettings({geminiKey:cfg.key,model:cfg.model}).catch(()=>{});
    }
  }catch(e){setSync("Couldn't read settings from Firestore: "+e.message+" (update your rules)")}
}
function onCloudItems(list){
  cloudItems=list;
  if(!migrated){
    migrated=true;
    const ids=new Set(list.map(i=>i.id));
    const missing=local.filter(i=>!ids.has(i.id));
    missing.forEach(i=>window.cloud.put(i).catch(()=>{}));
    if(missing.length)setStatus(`Uploaded ${missing.length} local entr${missing.length==1?"y":"ies"} to Firestore.`);
  }
  render();
}
$("login").onclick=async()=>{
  if(location.protocol==="file:"){setSync("Google sign-in doesn't work from a file. In this folder run: python3 -m http.server 8000, then open http://localhost:8000");return}
  if(!window.cloud||!cfg.fb){setSync("Save a valid Firebase config first.");return}
  try{await window.cloud.login()}catch(e){setSync(e.message)}
};
$("logout").onclick=()=>window.cloud.logout();

/* ---------- storage (never deletes) ---------- */
function upsert(it){
  if(user){window.cloud.put(it).catch(e=>setStatus(e.message))}
  else{
    const i=local.findIndex(x=>x.id===it.id);
    if(i>=0)local[i]=it;else local.unshift(it);
    ls.set("sd_items",local);render();
  }
}

/* ---------- Gemini ---------- */
async function gemini(parts,json){
  if(!cfg.key){$("settings").open=true;throw new Error("Add your Gemini API key in Settings first.")}
  const body={contents:[{parts}]};
  if(cfg.model.startsWith("gemini-2.5-")||json){
    body.generationConfig={};
    if(cfg.model.startsWith("gemini-2.5-"))body.generationConfig.thinkingConfig={thinkingBudget:0};
    if(json)body.generationConfig.responseMimeType="application/json";
  }
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json();
  if(!r.ok)throw new Error(d.error?.message||"Gemini request failed");
  const t=d.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  if(!t)throw new Error("Gemini returned nothing.");
  return t;
}
const PARSE_PROMPT=()=>`Today is ${today()}. Extract every expense from the input. Currency is INR unless stated otherwise.
Return ONLY a JSON array. Each item: {"amount":number,"merchant":string,"category":one of ${JSON.stringify(CATS)},"date":"YYYY-MM-DD" (resolve words like yesterday relative to today),"note":short string,"verdict":"worth"|"meh"|"regret"}.
For verdict, use what the user said if present, otherwise your honest guess (essentials=worth, impulse/subscriptions unused=regret, otherwise meh).`;

function addParsed(text){
  const arr=JSON.parse(text.replace(/^```json|```$/g,"").trim());
  const list=Array.isArray(arr)?arr:[arr];
  let n=0;
  for(const e of list){
    const amount=Number(e.amount);
    if(!isFinite(amount)||amount<=0)continue;
    upsert({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),amount,merchant:e.merchant||"",category:CATS.includes(e.category)?e.category:"Other",date:/^\d{4}-\d{2}-\d{2}$/.test(e.date)?e.date:today(),note:e.note||"",verdict:["worth","meh","regret"].includes(e.verdict)?e.verdict:"meh",archived:false,createdAt:Date.now()});
    n++;
  }
  return n;
}
$("parse").onclick=async()=>{
  const t=$("txt").value.trim();if(!t)return;
  $("parse").disabled=true;setStatus("Thinking…");
  try{const n=addParsed(await gemini([{text:PARSE_PROMPT()+"\n\nInput:\n"+t}],true));setStatus(`Added ${n} entr${n==1?"y":"ies"}.`);$("txt").value=""}
  catch(e){setStatus(e.message)}
  $("parse").disabled=false;
};
$("scanBtn").onclick=()=>$("scan").click();
$("scan").onchange=async ev=>{
  const f=ev.target.files[0];if(!f)return;
  setStatus("Reading receipt…");
  try{
    const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f)});
    const t=await gemini([{text:PARSE_PROMPT()+"\n\nThe input is a photo of a receipt. Return ONE item for the total paid (merchant = shop name), unless it is clearly multiple separate purchases."},{inline_data:{mime_type:f.type||"image/jpeg",data:b64}}],true);
    setStatus(`Added ${addParsed(t)} from receipt.`);
  }catch(e){setStatus(e.message)}
  ev.target.value="";
};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
$("mic").onclick=()=>{
  if(!SR){setStatus("Voice input isn't supported in this browser.");return}
  const r=new SR();r.lang="en-IN";r.onresult=e=>{$("txt").value=(($("txt").value+" ")+e.results[0][0].transcript).trim()};
  r.onerror=()=>setStatus("Mic error.");r.onend=()=>setStatus("");setStatus("Listening…");r.start();
};
function compactRecent(n){return live().slice(0,n).map(({amount,merchant,category,date,verdict,note})=>[amount,merchant,category,date,verdict,note])}
$("mirror").onclick=async()=>{
  if(live().length<3){$("mirrorOut").textContent="Log at least 3 expenses first.";return}
  $("mirror").disabled=true;$("mirrorOut").textContent="Looking in the mirror…";
  try{$("mirrorOut").textContent=await gemini([{text:`You are "Money Mirror", a witty but kind friend reviewing an INR spending diary (today ${today()}). Give: (1) a two-line money personality with a playful title, (2) three specific observations with real amounts and merchants, especially regrets, (3) one small practical tweak for next week. Plain text, under 180 words. Rows are [amount, merchant, category, date, verdict, note].\n\n${JSON.stringify(compactRecent(80))}`}])}
  catch(e){$("mirrorOut").textContent=e.message}
  $("mirror").disabled=false;
};
$("ask").onclick=async()=>{
  const q=$("q").value.trim();if(!q)return;
  $("ask").disabled=true;$("askOut").textContent="…";
  try{$("askOut").textContent=await gemini([{text:`Answer using only this INR expense data. Today is ${today()}. Calculate accurately; show totals. If the data cannot answer, say so. Be brief. Rows are [amount, merchant, category, date, verdict, note].\n\nData: ${JSON.stringify(compactRecent(500))}\n\nQuestion: ${q}`}])}
  catch(e){$("askOut").textContent=e.message}
  $("ask").disabled=false;
};

/* ---------- render ---------- */
function render(){
  const L=live(),ym=today().slice(0,7);
  const mon=L.filter(i=>i.date.startsWith(ym));
  $("monthLabel").textContent=new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  $("monthTotal").textContent=inr(mon.reduce((s,i)=>s+i.amount,0));

  const sums={worth:0,meh:0,regret:0};mon.forEach(i=>sums[i.verdict]=(sums[i.verdict]||0)+i.amount);
  $("split").innerHTML=[["worth","Worth it","var(--good)"],["meh","Meh","var(--meh)"],["regret","Regret","var(--bad)"]].map(([k,l,c])=>`<div><strong style="color:${c}">${inr(sums[k])}</strong><span class="mute">${l}</span></div>`).join("");

  const byCat={};mon.forEach(i=>byCat[i.category]=(byCat[i.category]||0)+i.amount);
  const ent=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);const max=ent[0]?.[1]||1;
  $("cats").innerHTML=ent.length?ent.map(([c,v])=>`<div class="bar"><b>${esc(c)}</b><i style="width:${Math.max(4,v/max*60)}%"></i><span>${inr(v)}</span></div>`).join(""):'<div class="mute">Nothing logged this month yet.</div>';

  const days=[];for(let d=13;d>=0;d--){const dt=new Date();dt.setDate(dt.getDate()-d);days.push(dt.toISOString().slice(0,10))}
  const ds=days.map(d=>L.filter(i=>i.date===d).reduce((s,i)=>s+i.amount,0));const dm=Math.max(...ds,1);
  $("days").innerHTML=ds.map((v,i)=>`<div title="${days[i]}: ${inr(v)}" style="height:${v/dm*100}%"></div>`).join("");

  const rows=showHidden?all():L;
  $("showHidden").textContent=showHidden?"Hide hidden":"Show hidden";
  $("ledger").innerHTML=rows.length?rows.map(i=>`<div class="ent ${i.archived?"gone":""}"><div><strong>${esc(i.merchant||i.category)}</strong> <button class="link" data-arc="${esc(i.id)}">${i.archived?"restore":"hide"}</button><br><span class="chip">${esc(i.date)}</span><span class="chip">${esc(i.category)}</span><span class="chip v ${i.verdict}" data-v="${esc(i.id)}">${i.verdict==="worth"?"worth it":i.verdict}</span><span class="mute">${esc(i.note)}</span></div><div class="amt">${inr(i.amount)}</div></div>`).join(""):'<div class="mute">No entries yet. Type something above.</div>';
}
$("ledger").onclick=e=>{
  const v=e.target.dataset.v,a=e.target.dataset.arc;
  const find=id=>all().find(i=>i.id===id);
  if(v){const it=find(v);if(!it)return;const o=["worth","meh","regret"];upsert({...it,verdict:o[(o.indexOf(it.verdict)+1)%3]})}
  if(a){const it=find(a);if(!it)return;upsert({...it,archived:!it.archived})}
};
$("showHidden").onclick=()=>{showHidden=!showHidden;render()};
$("csv").onclick=()=>{
  const rows=[["date","amount","merchant","category","verdict","note","hidden"],...all().map(i=>[i.date,i.amount,i.merchant,i.category,i.verdict,i.note,i.archived?"yes":""])];
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="spend-diary.csv";a.click();
};
render();
startCloud();