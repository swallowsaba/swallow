(function(){
'use strict';
function parseYAML(t){const r={zones:[],nodes:[],connections:[]};let s=null,it=null;for(const l of t.split('\n')){const tr=l.trim();if(!tr||tr[0]==='#')continue;const ind=l.search(/\S/);if(ind===0&&tr.endsWith(':')){const k=tr.slice(0,-1).trim();if(k in r)s=k;it=null;continue}if(!s)continue;if(tr.startsWith('- ')){it={};r[s].push(it);const kv=tr.slice(2).trim();if(kv&&kv.includes(':')){const ci=kv.indexOf(':'),k=kv.slice(0,ci).trim(),v=kv.slice(ci+1).trim();if(k)it[k]=pv(v)}continue}if(it&&tr.includes(':')){const ci=tr.indexOf(':'),k=tr.slice(0,ci).trim(),v=tr.slice(ci+1).trim();if(k)it[k]=pv(v)}}return r}
function pv(s){if(s===''||s==null)return'';if((s[0]==='"'&&s.endsWith('"'))||(s[0]==="'"&&s.endsWith("'")))return s.slice(1,-1);if(s[0]==='['&&s.endsWith(']')){const i=s.slice(1,-1).trim();return i?i.split(',').map(x=>pv(x.trim())):[]}if(s==='true')return!0;if(s==='false')return!1;if(s==='null')return null;if(/^-?\d+(\.\d+)?$/.test(s))return+s;return s}
function serYAML(d){let y='';for(const s of['zones','nodes','connections']){const items=d[s];if(!items||!items.length)continue;y+=s+':\n';for(const item of items){let f=!0;for(const k of Object.keys(item)){y+=(f?'  - ':'    ')+k+': '+sv(item[k])+'\n';f=!1}}y+='\n'}return y.trimEnd()+'\n'}
function sv(v){if(v==null)return'';if(typeof v==='boolean')return v?'true':'false';if(typeof v==='number')return''+v;if(Array.isArray(v))return'['+v.map(sv).join(', ')+']';const s=''+v;if(s.includes('#')||s.includes(':')||s.includes('"')||s.includes("'")||s.includes(',')||s.includes('[')||s.includes(']')||s.startsWith(' ')||s.endsWith(' ')||s==='true'||s==='false'||s==='null'||/^-?\d+(\.\d+)?$/.test(s))return'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';return s}
const PC={HTTP:'#27ae60',HTTPS:'#2ecc71',SSH:'#e67e22',TCP:'#3498db',UDP:'#9b59b6',DNS:'#1abc9c',FTP:'#e74c3c',SMTP:'#f1c40f',RDP:'#e91e63',ICMP:'#00bcd4',default:'#95a5a6'};
function pcol(p){return p?(PC[p.toUpperCase()]||PC.default):PC.default}
let S={zones:[],nodes:[],connections:[]},sel=null,cm=null;
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const yamlEd=$('yaml-editor'),svgC=$('svg-canvas'),svgCont=$('svg-container'),lZ=$('lZ'),lC=$('lC'),lN=$('lN'),resH=$('resize-handle'),lPanel=$('left-panel');
function mk(t,a){const e=document.createElementNS(NS,t);if(a)for(const[k,v]of Object.entries(a))e.setAttribute(k,v);return e}
let vb={x:-50,y:-50,w:1200,h:800},isPan=!1,ps={x:0,y:0},pvs={x:0,y:0},drag=null;
function aVB(){svgC.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`)}
function s2s(cx,cy){const r=svgCont.getBoundingClientRect();return{x:vb.x+(cx-r.left)*vb.w/r.width,y:vb.y+(cy-r.top)*vb.h/r.height}}
function render(){rZones();rNodes();rConns();uInfo()}
// Derive a visible label/stroke color from zone color
function zLabelCol(col){
  if(!col)return'#aaa';
  // rgba → increase alpha
  const rm=col.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if(rm)return`rgba(${rm[1]},${rm[2]},${rm[3]},0.9)`;
  // hex → return as-is (full opacity, used for stroke/label)
  if(col[0]==='#')return col;
  return col;
}
function zStrokeCol(col){
  if(!col)return'#aaa';
  const rm=col.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if(rm)return`rgba(${rm[1]},${rm[2]},${rm[3]},0.6)`;
  if(col[0]==='#'){
    // Make slightly transparent for stroke
    const n=parseInt(col.slice(1),16),r=(n>>16)&0xff,g=(n>>8)&0xff,b=n&0xff;
    return`rgba(${r},${g},${b},0.6)`;
  }
  return col;
}
// === Zone hierarchy helpers ===
function getChildZones(zid){return S.zones.filter(z=>z.parent===zid)}
function getAllDescZones(zid){
  const result=[];const q=[zid];
  while(q.length){const cur=q.shift();const kids=S.zones.filter(z=>z.parent===cur);for(const k of kids){result.push(k);q.push(k.id)}}
  return result;
}
function getAllDescNodes(zid){
  const zids=new Set([zid]);getAllDescZones(zid).forEach(z=>zids.add(z.id));
  return S.nodes.filter(n=>zids.has(n.zone));
}
function zoneSortOrder(){
  // Topological sort: parents before children
  const sorted=[],visited=new Set();
  function visit(z){if(visited.has(z.id))return;if(z.parent){const p=S.zones.find(pz=>pz.id===z.parent);if(p&&!visited.has(p.id))visit(p)}visited.add(z.id);sorted.push(z)}
  S.zones.forEach(z=>visit(z));return sorted;
}
function aFitUp(zid){
  // Auto-fit zone, then recurse to parent
  aFit(zid);
  const z=S.zones.find(z=>z.id===zid);
  if(z&&z.parent)aFitUp(z.parent);
}
function rZones(){lZ.innerHTML='';const ordered=zoneSortOrder();for(const z of ordered){const g=mk('g',{class:'zone-group','data-id':z.id});const x=+z.x||0,y=+z.y||0,w=+z.width||400,h=+z.height||300,col=z.color||'rgba(100,100,255,0.15)';const sc=zStrokeCol(col);const lc=z.textColor||zLabelCol(col);const iS=sel&&sel.t==='z'&&sel.id===z.id;g.appendChild(mk('rect',{class:'zone-rect'+(iS?' sel':''),x,y,width:w,height:h,fill:col,stroke:iS?'#fff':sc}));const lb=mk('text',{class:'zone-label',x:x+12,y:y+24,fill:lc});lb.textContent=z.label||z.id;g.appendChild(lb);g.appendChild(mk('rect',{class:'rh',x:x+w-12,y:y+h-12,width:12,height:12,'data-r':'z','data-id':z.id}));g.addEventListener('mousedown',e=>onZD(e,z.id));g.addEventListener('dblclick',e=>{e.stopPropagation();selZ(z.id)});lZ.appendChild(g)}}
function rNodes(){lN.innerHTML='';for(const n of S.nodes){const g=mk('g',{class:'node-group','data-id':n.id});const x=+n.x||0,y=+n.y||0,w=+n.width||140,h=+n.height||60,col=n.color||'#3498db';const iS=sel&&sel.t==='n'&&sel.id===n.id;g.appendChild(mk('rect',{class:'node-rect'+(iS?' sel':''),x,y,width:w,height:h,fill:col,stroke:iS?'#fff':dk(col,30)}));const lb=mk('text',{class:'node-label',x:x+w/2,y:y+h/2,'text-anchor':'middle','dominant-baseline':'central'});lb.textContent=n.label||n.id;g.appendChild(lb);g.appendChild(mk('rect',{class:'rh',x:x+w-10,y:y+h-10,width:10,height:10,'data-r':'n','data-id':n.id}));g.addEventListener('mousedown',e=>onND(e,n.id));g.addEventListener('dblclick',e=>{e.stopPropagation();selN(n.id)});lN.appendChild(g)}}
function rConns(){lC.innerHTML='';const defs=svgC.querySelector('defs');defs.innerHTML='';const used=new Set();for(const c of S.connections)used.add(pcol(c.protocol));for(const col of used){const mid='a-'+col.replace('#','');const m=mk('marker',{id:mid,viewBox:'0 0 10 7',refX:'10',refY:'3.5',markerWidth:'8',markerHeight:'6',orient:'auto-start-reverse',fill:col});m.appendChild(mk('path',{d:'M 0 0 L 10 3.5 L 0 7 z'}));defs.appendChild(m)}
// Group connections by node pair to detect overlaps
const pairMap={};for(let i=0;i<S.connections.length;i++){const c=S.connections[i];const fs=Array.isArray(c.from)?c.from:[c.from],ts=Array.isArray(c.to)?c.to:[c.to];for(const f of fs)for(const t of ts){const pk=[f,t].sort().join('::');if(!pairMap[pk])pairMap[pk]=[];pairMap[pk].push({fi:f,ti:t,c,idx:i})}}
// Phase 1: draw lines and collect label info + control points
const labels=[],cps=[];
for(const pk of Object.keys(pairMap)){const group=pairMap[pk];for(let gi=0;gi<group.length;gi++){const{fi,ti,c,idx}=group[gi];
const autoOff=group.length>1?(gi-(group.length-1)/2)*40:0;
const userBend=+c.bend||0;
const totalOff=autoOff+userBend;
const res=dConnLine(fi,ti,c,idx,totalOff);if(res){cps.push(res.cp);if(res.label)labels.push(res.label)}}}
// Phase 2: resolve label collisions then draw
resolveLabels(labels);
for(const lb of labels){const tl=lb.tw;lC.appendChild(mk('rect',{class:'conn-bg',x:lb.x-tl/2,y:lb.y-9,width:tl,height:18}));const t=mk('text',{class:'conn-lbl',x:lb.x,y:lb.y,'text-anchor':'middle','dominant-baseline':'central',fill:lb.col});t.textContent=lb.text;lC.appendChild(t)}
// Phase 3: control points on top of everything
for(const cp of cps)lC.appendChild(cp)}
// Draw only the line/path + control point, return label position info
function dConnLine(fid,tid,c,idx,offset){const fn=S.nodes.find(n=>n.id===fid),tn=S.nodes.find(n=>n.id===tid);if(!fn||!tn)return null;const fx=+fn.x||0,fy=+fn.y||0,fw=+fn.width||140,fh=+fn.height||60,tx=+tn.x||0,ty=+tn.y||0,tw=+tn.width||140,th=+tn.height||60;const fcx=fx+fw/2,fcy=fy+fh/2,tcx=tx+tw/2,tcy=ty+th/2;const col=pcol(c.protocol),mid='a-'+col.replace('#',''),iS=sel&&sel.t==='c'&&sel.idx===idx;
const ddx=tcx-fcx,ddy=tcy-fcy,len=Math.sqrt(ddx*ddx+ddy*ddy)||1;
const nnx=-ddy/len,nny=ddx/len;
// Wrap in group for hover
const cg=mk('g',{class:'conn-group'});
let lx,ly,cpx_vis,cpy_vis;
if(offset===0){
  const fp=eI(fcx,fcy,fw,fh,tcx,tcy),tp=eI(tcx,tcy,tw,th,fcx,fcy);
  const hit=mk('line',{class:'conn-hit',x1:fp.x,y1:fp.y,x2:tp.x,y2:tp.y});hit.addEventListener('click',e=>{e.stopPropagation();selC(idx)});cg.appendChild(hit);
  const ln=mk('line',{class:'conn-line'+(iS?' sel':''),x1:fp.x,y1:fp.y,x2:tp.x,y2:tp.y,stroke:col,'marker-end':`url(#${mid})`});if(c.bidirectional)ln.setAttribute('marker-start',`url(#${mid})`);ln.addEventListener('click',e=>{e.stopPropagation();selC(idx)});cg.appendChild(ln);
  lx=(fp.x+tp.x)/2;ly=(fp.y+tp.y)/2;
  cpx_vis=lx;cpy_vis=ly-18;
}else{
  const cpx=(fcx+tcx)/2+nnx*offset,cpy=(fcy+tcy)/2+nny*offset;
  const fp=eI(fcx,fcy,fw,fh,cpx,cpy),tp=eI(tcx,tcy,tw,th,cpx,cpy);
  const d=`M ${fp.x} ${fp.y} Q ${cpx} ${cpy} ${tp.x} ${tp.y}`;
  const hit=mk('path',{class:'conn-hit',d});hit.addEventListener('click',e=>{e.stopPropagation();selC(idx)});cg.appendChild(hit);
  const ln=mk('path',{class:'conn-line'+(iS?' sel':''),d,stroke:col,'marker-end':`url(#${mid})`});if(c.bidirectional)ln.setAttribute('marker-start',`url(#${mid})`);ln.addEventListener('click',e=>{e.stopPropagation();selC(idx)});cg.appendChild(ln);
  lx=0.25*fp.x+0.5*cpx+0.25*tp.x;ly=0.25*fp.y+0.5*cpy+0.25*tp.y;
  cpx_vis=lx;cpy_vis=ly-18;
}
// Draggable control point - returned, not appended (will be added on top layer)
const cp=mk('circle',{class:'conn-cp'+(iS?' active':''),cx:cpx_vis,cy:cpy_vis,r:6});
cp.addEventListener('mousedown',e=>{
  e.stopPropagation();e.preventDefault();
  sel={t:'c',idx};render();spC(idx);
  const pt=s2s(e.clientX,e.clientY);
  drag={t:'cb',idx,sx:pt.x,sy:pt.y,
    fcx,fcy,tcx,tcy,nnx,nny,
    origBend:+c.bend||0};
});
lC.appendChild(cg);
const lt=(c.protocol||'')+(c.port?':'+c.port:'');
if(!lt)return{cp,label:null};
const textW=lt.length*6.5+10;
return{cp,label:{x:lx,y:ly,text:lt,col,tw:textW,th:18}}}
// Push overlapping labels apart
function resolveLabels(labels){
  const maxIter=20;
  for(let iter=0;iter<maxIter;iter++){
    let moved=false;
    for(let i=0;i<labels.length;i++){
      for(let j=i+1;j<labels.length;j++){
        const a=labels[i],b=labels[j];
        const ow=Math.min(a.x+a.tw/2,b.x+b.tw/2)-Math.max(a.x-a.tw/2,b.x-b.tw/2);
        const oh=Math.min(a.y+a.th/2,b.y+b.th/2)-Math.max(a.y-a.th/2,b.y-b.th/2);
        if(ow>0&&oh>0){
          // Overlapping — push apart vertically
          const shift=oh/2+2;
          if(a.y<=b.y){a.y-=shift;b.y+=shift}else{a.y+=shift;b.y-=shift}
          moved=true;
        }
      }
    }
    if(!moved)break;
  }
}
function eI(cx,cy,w,h,tx,ty){const dx=tx-cx,dy=ty-cy;if(!dx&&!dy)return{x:cx,y:cy};const t=Math.abs(dx)*(h/2)>Math.abs(dy)*(w/2)?(w/2)/Math.abs(dx):(h/2)/Math.abs(dy);return{x:cx+dx*t,y:cy+dy*t}}
function dk(hex,a){if(!hex||hex[0]!=='#')return hex;const n=parseInt(hex.slice(1),16);return'#'+((Math.max(0,(n>>16)-a)<<16)|(Math.max(0,((n>>8)&0xff)-a)<<8)|Math.max(0,(n&0xff)-a)).toString(16).padStart(6,'0')}

// Selection
function clrSel(){sel=null;cPP();render()}
function selZ(id){if(cm)return;sel={t:'z',id};render();spZ(id)}
function selN(id){if(cm){if(!cm.from){cm.from=id;$('cbanner').textContent='接続先ノードをクリック (from: '+id+')';render();const g=lN.querySelector(`[data-id="${id}"]`);if(g){const r=g.querySelector('.node-rect');if(r){r.setAttribute('stroke','#d29922');r.setAttribute('stroke-width','4')}}}else{S.connections.push({from:cm.from,to:id,protocol:'TCP',port:80,bidirectional:!1});xCM();sync();render();selC(S.connections.length-1);toast('接続を追加しました')}return}sel={t:'n',id};render();spN(id)}
function selC(idx){if(cm)return;sel={t:'c',idx};render();spC(idx)}

// Props panel
function oPP(){$('pp').classList.add('open')}function cPP(){$('pp').classList.remove('open')}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}
function r2h(c){if(!c)return null;if(c[0]==='#')return c.length===7?c:c.length===4?'#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]:null;const m=c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);if(m)return'#'+[m[1],m[2],m[3]].map(x=>(+x).toString(16).padStart(2,'0')).join('');return null}

function spZ(id){const z=S.zones.find(z=>z.id===id);if(!z)return;$('ppt').textContent='Zone 設定';const tcVal=z.textColor||zLabelCol(z.color||'');
  // Build parent zone options (exclude self and descendants to prevent circular)
  const descIds=new Set(getAllDescZones(id).map(d=>d.id));descIds.add(id);
  const pzOpts=S.zones.filter(pz=>!descIds.has(pz.id)).map(pz=>`<option value="${esc(pz.id)}"${z.parent===pz.id?' selected':''}>${esc(pz.label||pz.id)}</option>`).join('');
  $('ppb').innerHTML=`
<div class="ppf"><label class="ppl">ID</label><input class="ppi" data-p="id" value="${esc(z.id)}"></div>
<div class="ppf"><label class="ppl">Label</label><input class="ppi" data-p="label" value="${esc(z.label||'')}"></div>
<div class="ppf"><label class="ppl">Parent Zone (親ゾーン)</label><select class="pps" data-p="parent"><option value="">(なし / ルート)</option>${pzOpts}</select></div>
<div class="ppf"><label class="ppl">Color (背景)</label><div class="ppcr"><input type="color" class="ppci" data-p="cpick" value="${r2h(z.color)||'#6464ff'}"><input class="ppi ppct" data-p="color" value="${esc(z.color||'')}"></div></div>
<div class="ppf"><label class="ppl">Text Color (文字色)</label><div class="ppcr"><input type="color" class="ppci" data-p="tcpick" value="${r2h(tcVal)||'#ffffff'}"><input class="ppi ppct" data-p="textColor" value="${esc(z.textColor||'')}"></div></div>
<div class="ppr"><div class="ppf"><label class="ppl">X</label><input class="ppi" type="number" data-p="x" value="${+z.x||0}"></div><div class="ppf"><label class="ppl">Y</label><input class="ppi" type="number" data-p="y" value="${+z.y||0}"></div></div>
<div class="ppr"><div class="ppf"><label class="ppl">Width</label><input class="ppi" type="number" data-p="width" value="${+z.width||400}"></div><div class="ppf"><label class="ppl">Height</label><input class="ppi" type="number" data-p="height" value="${+z.height||300}"></div></div>`;
$('ppa').innerHTML='<button class="ppdel" id="ppd">このゾーンを削除</button>';bZ(id);oPP()}

function spN(id){const n=S.nodes.find(n=>n.id===id);if(!n)return;const zo=S.zones.map(z=>`<option value="${esc(z.id)}"${n.zone===z.id?' selected':''}>${esc(z.label||z.id)}</option>`).join('');$('ppt').textContent='Node 設定';$('ppb').innerHTML=`
<div class="ppf"><label class="ppl">ID</label><input class="ppi" data-p="id" value="${esc(n.id)}"></div>
<div class="ppf"><label class="ppl">Label</label><input class="ppi" data-p="label" value="${esc(n.label||'')}"></div>
<div class="ppf"><label class="ppl">Color</label><div class="ppcr"><input type="color" class="ppci" data-p="cpick" value="${n.color||'#3498db'}"><input class="ppi ppct" data-p="color" value="${esc(n.color||'')}"></div></div>
<div class="ppf"><label class="ppl">Zone</label><select class="pps" data-p="zone"><option value="">(なし)</option>${zo}</select></div>
<div class="ppr"><div class="ppf"><label class="ppl">X</label><input class="ppi" type="number" data-p="x" value="${+n.x||0}"></div><div class="ppf"><label class="ppl">Y</label><input class="ppi" type="number" data-p="y" value="${+n.y||0}"></div></div>
<div class="ppr"><div class="ppf"><label class="ppl">Width</label><input class="ppi" type="number" data-p="width" value="${+n.width||140}"></div><div class="ppf"><label class="ppl">Height</label><input class="ppi" type="number" data-p="height" value="${+n.height||60}"></div></div>`;
$('ppa').innerHTML='<button class="ppdel" id="ppd">このノードを削除</button>';bN(id);oPP()}

function spC(idx){const c=S.connections[idx];if(!c)return;const no=S.nodes.map(n=>`<option value="${esc(n.id)}">${esc(n.label||n.id)}</option>`).join('');$('ppt').textContent='Connection 設定';$('ppb').innerHTML=`
<div class="ppf"><label class="ppl">From</label><select class="pps" data-p="from">${no}</select></div>
<div class="ppf"><label class="ppl">To</label><select class="pps" data-p="to">${no}</select></div>
<div class="ppr"><div class="ppf"><label class="ppl">Protocol</label><input class="ppi" data-p="protocol" value="${esc(c.protocol||'')}"></div><div class="ppf"><label class="ppl">Port</label><input class="ppi" type="number" data-p="port" value="${+c.port||0}"></div></div>
<div class="ppf"><label class="ppl">Bend (線の曲がり)</label><input class="ppi" type="number" data-p="bend" value="${+c.bend||0}" step="10"></div>
<div class="ppchk"><input type="checkbox" class="ppchki" id="ppbd" data-p="bidirectional" ${c.bidirectional?'checked':''}><label class="ppchkl" for="ppbd">双方向</label></div>`;
const fSel=$('ppb').querySelector('[data-p="from"]'),tSel=$('ppb').querySelector('[data-p="to"]');
if(fSel)fSel.value=Array.isArray(c.from)?c.from[0]:c.from||'';
if(tSel)tSel.value=Array.isArray(c.to)?c.to[0]:c.to||'';
$('ppa').innerHTML='<button class="ppdel" id="ppd">この接続を削除</button>';bC(idx);oPP()}

function bZ(id){$('ppb').querySelectorAll('.ppi,.pps,.ppci').forEach(inp=>{inp.addEventListener('input',()=>{const z=S.zones.find(z=>z.id===id);if(!z)return;const p=inp.dataset.p;if(p==='cpick'){const ti=$('ppb').querySelector('[data-p="color"]');if(ti)ti.value=inp.value;z.color=inp.value}else if(p==='tcpick'){const ti=$('ppb').querySelector('[data-p="textColor"]');if(ti)ti.value=inp.value;z.textColor=inp.value}else if(p==='parent'){z.parent=inp.value||undefined;if(!inp.value)delete z.parent;else aFitUp(inp.value)}else if(p==='id'){const old=z.id;z.id=inp.value;
  // Update node zone refs
  S.nodes.forEach(n=>{if(n.zone===old)n.zone=inp.value});
  // Update child zone parent refs
  S.zones.forEach(cz=>{if(cz.parent===old)cz.parent=inp.value});
  sel.id=inp.value}else if('x y width height'.includes(p)){z[p]=+inp.value||0;if(z.parent)aFitUp(z.parent)}else{z[p]=inp.value;if(p==='textColor'&&!inp.value)delete z.textColor}sync();render()})});$('ppd').addEventListener('click',()=>{
  // On delete: orphan child zones and nodes
  S.zones.forEach(cz=>{if(cz.parent===id)delete cz.parent});
  S.zones=S.zones.filter(z=>z.id!==id);
  S.nodes.forEach(n=>{if(n.zone===id)delete n.zone});
  clrSel();sync();render();toast('ゾーンを削除しました')})}
function bN(id){$('ppb').querySelectorAll('.ppi,.pps,.ppci').forEach(inp=>{inp.addEventListener('input',()=>{const n=S.nodes.find(n=>n.id===id);if(!n)return;const p=inp.dataset.p;if(p==='cpick'){const ti=$('ppb').querySelector('[data-p="color"]');if(ti)ti.value=inp.value;n.color=inp.value}else if(p==='id'){const old=n.id;n.id=inp.value;S.connections.forEach(c=>{if(c.from===old)c.from=inp.value;if(c.to===old)c.to=inp.value;if(Array.isArray(c.from))c.from=c.from.map(f=>f===old?inp.value:f);if(Array.isArray(c.to))c.to=c.to.map(t=>t===old?inp.value:t)});sel.id=inp.value}else if(p==='zone'){n.zone=inp.value||undefined;if(!inp.value)delete n.zone}else if('x y width height'.includes(p)){n[p]=+inp.value||0;if(n.zone)aFitUp(n.zone)}else n[p]=inp.value;sync();render()})});$('ppd').addEventListener('click',()=>{S.connections=S.connections.filter(c=>{const fs=Array.isArray(c.from)?c.from:[c.from],ts=Array.isArray(c.to)?c.to:[c.to];return!fs.includes(id)&&!ts.includes(id)});S.nodes=S.nodes.filter(n=>n.id!==id);clrSel();sync();render();toast('ノードを削除しました')})}
function bC(idx){$('ppb').querySelectorAll('.ppi,.pps,.ppchki').forEach(inp=>{const ev=inp.type==='checkbox'?'change':'input';inp.addEventListener(ev,()=>{const c=S.connections[idx];if(!c)return;const p=inp.dataset.p;if(p==='bidirectional')c.bidirectional=inp.checked;else if(p==='port')c.port=+inp.value||0;else if(p==='bend'){c.bend=+inp.value||0;if(c.bend===0)delete c.bend}else c[p]=inp.value;sync();render()})});$('ppd').addEventListener('click',()=>{S.connections.splice(idx,1);clrSel();sync();render();toast('接続を削除しました')})}

// Add
function addZ(){xCM();const id='zone-'+(S.zones.length+1),cx=vb.x+vb.w/2-200,cy=vb.y+vb.h/2-150;const cols=['rgba(231,76,60,0.15)','rgba(46,204,113,0.15)','rgba(52,152,219,0.15)','rgba(155,89,182,0.15)','rgba(241,196,15,0.15)'];S.zones.push({id,label:'New Zone',color:cols[S.zones.length%cols.length],x:Math.round(cx),y:Math.round(cy),width:400,height:300});sync();render();selZ(id);toast('ゾーンを追加しました')}
function addN(){xCM();const id='node-'+(S.nodes.length+1),cx=vb.x+vb.w/2-70,cy=vb.y+vb.h/2-30;const cols=['#3498db','#2ecc71','#e74c3c','#f39c12','#9b59b6','#1abc9c','#e67e22'];S.nodes.push({id,label:'New Node',color:cols[S.nodes.length%cols.length],x:Math.round(cx),y:Math.round(cy),width:140,height:60});sync();render();selN(id);toast('ノードを追加しました')}
function eCM(){if(S.nodes.length<2){toast('ノードが2つ以上必要です',1);return}cm={from:null};$('cbanner').textContent='接続モード: 接続元ノードをクリック';$('cbanner').classList.add('show');svgCont.classList.add('conn-mode');cPP();sel=null;render();$('btn-ac').classList.add('active-m')}
function xCM(){cm=null;$('cbanner').classList.remove('show');svgCont.classList.remove('conn-mode');$('btn-ac').classList.remove('active-m')}

// Zone/Node drag
function onZD(e,id){const tgt=e.target;if(tgt.classList.contains('rh')&&tgt.dataset.r==='z'){e.stopPropagation();e.preventDefault();const z=S.zones.find(z=>z.id===id);if(!z)return;const pt=s2s(e.clientX,e.clientY);drag={t:'rz',id,sx:pt.x,sy:pt.y,ow:+z.width||400,oh:+z.height||300};sel={t:'z',id};spZ(id);render();return}if(tgt.closest('.node-group'))return;if(tgt.closest('.zone-group')&&tgt.closest('.zone-group').dataset.id!==id)return;e.stopPropagation();e.preventDefault();if(cm)return;const z=S.zones.find(z=>z.id===id);if(!z)return;const pt=s2s(e.clientX,e.clientY);
  // Collect all descendant zones
  const descZ=getAllDescZones(id).map(cz=>({id:cz.id,x:+cz.x||0,y:+cz.y||0}));
  // Collect direct nodes + all descendant nodes
  const allNodes=getAllDescNodes(id).map(n=>({id:n.id,x:+n.x||0,y:+n.y||0}));
  drag={t:'z',id,sx:pt.x,sy:pt.y,ox:+z.x||0,oy:+z.y||0,cn:allNodes,cz:descZ};sel={t:'z',id};spZ(id);render()}
function onND(e,id){const tgt=e.target;if(tgt.classList.contains('rh')&&tgt.dataset.r==='n'){e.stopPropagation();e.preventDefault();const n=S.nodes.find(n=>n.id===id);if(!n)return;const pt=s2s(e.clientX,e.clientY);drag={t:'rn',id,sx:pt.x,sy:pt.y,ow:+n.width||140,oh:+n.height||60};if(!cm){sel={t:'n',id};spN(id);render()}return}e.stopPropagation();e.preventDefault();if(cm){selN(id);return}const n=S.nodes.find(n=>n.id===id);if(!n)return;const pt=s2s(e.clientX,e.clientY);drag={t:'n',id,sx:pt.x,sy:pt.y,ox:+n.x||0,oy:+n.y||0};sel={t:'n',id};spN(id);render()}
function onMM(e){if(drag){e.preventDefault();const pt=s2s(e.clientX,e.clientY),dx=pt.x-drag.sx,dy=pt.y-drag.sy;if(drag.t==='z'&&drag.cn){const z=S.zones.find(z=>z.id===drag.id);if(!z)return;z.x=Math.round(drag.ox+dx);z.y=Math.round(drag.oy+dy);
  // Move child zones
  if(drag.cz)for(const co of drag.cz){const cz=S.zones.find(z=>z.id===co.id);if(cz){cz.x=Math.round(co.x+dx);cz.y=Math.round(co.y+dy)}}
  // Move nodes
  for(const co of drag.cn){const n=S.nodes.find(n=>n.id===co.id);if(n){n.x=Math.round(co.x+dx);n.y=Math.round(co.y+dy)}}
  // Auto-fit parent
  if(z.parent)aFitUp(z.parent);
  render()}else if(drag.t==='n'){const n=S.nodes.find(n=>n.id===drag.id);if(!n)return;n.x=Math.round(drag.ox+dx);n.y=Math.round(drag.oy+dy);if(n.zone)aFitUp(n.zone);render()}else if(drag.t==='rz'){const z=S.zones.find(z=>z.id===drag.id);if(!z)return;z.width=Math.max(100,Math.round(drag.ow+dx));z.height=Math.max(60,Math.round(drag.oh+dy));if(z.parent)aFitUp(z.parent);render()}else if(drag.t==='rn'){const n=S.nodes.find(n=>n.id===drag.id);if(!n)return;n.width=Math.max(60,Math.round(drag.ow+dx));n.height=Math.max(30,Math.round(drag.oh+dy));if(n.zone)aFitUp(n.zone);render()}else if(drag.t==='cb'){
  // Connection bend drag: project mouse position onto perpendicular
  const c=S.connections[drag.idx];if(!c)return;
  const mx=(drag.fcx+drag.tcx)/2,my=(drag.fcy+drag.tcy)/2;
  // Vector from midpoint to current mouse position
  const vx=pt.x-mx,vy=pt.y-my;
  // Project onto perpendicular direction (nnx,nny)
  const proj=vx*drag.nnx+vy*drag.nny;
  c.bend=Math.round(proj);
  if(c.bend===0)delete c.bend;
  render();
}}else if(isPan){e.preventDefault();const r=svgCont.getBoundingClientRect();vb.x=pvs.x-(e.clientX-ps.x)*vb.w/r.width;vb.y=pvs.y-(e.clientY-ps.y)*vb.h/r.height;aVB()}}
function onMU(){if(drag){sync();if(sel){if(sel.t==='z')spZ(sel.id);else if(sel.t==='n')spN(sel.id);else if(sel.t==='c')spC(sel.idx)}drag=null}if(isPan){isPan=!1;svgCont.classList.remove('panning')}}
function aFit(zid){const z=S.zones.find(z=>z.id===zid);if(!z)return;
  const cn=S.nodes.filter(n=>n.zone===zid);
  const cz=getChildZones(zid);
  if(!cn.length&&!cz.length)return;
  const pd=40,tp=50;let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  for(const n of cn){const nx=+n.x||0,ny=+n.y||0,nw=+n.width||140,nh=+n.height||60;a=Math.min(a,nx);b=Math.min(b,ny);c=Math.max(c,nx+nw);d=Math.max(d,ny+nh)}
  for(const ch of cz){const cx=+ch.x||0,cy=+ch.y||0,cw=+ch.width||400,ch2=+ch.height||300;a=Math.min(a,cx);b=Math.min(b,cy);c=Math.max(c,cx+cw);d=Math.max(d,cy+ch2)}
  const zx=+z.x||0,zy=+z.y||0,zw=+z.width||400,zh=+z.height||300;
  z.x=Math.round(Math.min(zx,a-pd));z.y=Math.round(Math.min(zy,b-tp));
  z.width=Math.round(Math.max(zx+zw,c+pd)-z.x);z.height=Math.round(Math.max(zy+zh,d+pd)-z.y)}
function onCD(e){if(cm&&!e.target.closest('.node-group')){xCM();render();return}if(e.target===svgC||e.target===$('svg-world')||['lZ','lC','lN'].includes(e.target.id)){if(!e.target.closest('.zone-group')&&!e.target.closest('.node-group'))clrSel();e.preventDefault();isPan=!0;ps.x=e.clientX;ps.y=e.clientY;pvs.x=vb.x;pvs.y=vb.y;svgCont.classList.add('panning')}}
function onWh(e){e.preventDefault();const r=svgCont.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,f=e.deltaY>0?1.1:0.9;const bx=vb.x+(mx/r.width)*vb.w,by=vb.y+(my/r.height)*vb.h;vb.w=Math.max(200,Math.min(10000,vb.w*f));vb.h=Math.max(150,Math.min(7500,vb.h*f));vb.x=bx-(mx/r.width)*vb.w;vb.y=by-(my/r.height)*vb.h;aVB();uInfo()}
function fitV(){if(!S.zones.length&&!S.nodes.length){vb={x:-50,y:-50,w:1200,h:800};aVB();return}let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const z of S.zones){a=Math.min(a,+z.x||0);b=Math.min(b,+z.y||0);c=Math.max(c,(+z.x||0)+(+z.width||400));d=Math.max(d,(+z.y||0)+(+z.height||300))}for(const n of S.nodes){a=Math.min(a,+n.x||0);b=Math.min(b,+n.y||0);c=Math.max(c,(+n.x||0)+(+n.width||140));d=Math.max(d,(+n.y||0)+(+n.height||60))}const p=60;vb.x=a-p;vb.y=b-p;vb.w=(c-a)+p*2;vb.h=(d-b)+p*2;const cr=svgCont.getBoundingClientRect(),ac=cr.width/cr.height,av=vb.w/vb.h;if(av>ac){const nh=vb.w/ac;vb.y-=(nh-vb.h)/2;vb.h=nh}else{const nw=vb.h*ac;vb.x-=(nw-vb.w)/2;vb.w=nw}aVB();uInfo()}
function sync(){yamlEd.value=serYAML(S)}
function applyY(){try{const p=parseYAML(yamlEd.value);S.zones=p.zones||[];S.nodes=p.nodes||[];S.connections=p.connections||[];clrSel();render();toast('反映しました')}catch(e){toast('YAML解析エラー: '+e.message,1)}}
function loadF(){$('file-input').click()}
function onFS(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{yamlEd.value=ev.target.result;applyY();fitV();toast('読み込みました')};r.readAsText(f);e.target.value=''}
function saveF(){sync();const b=new Blob([yamlEd.value],{type:'text/yaml'}),u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='infrastructure.yaml';a.click();URL.revokeObjectURL(u);toast('保存しました')}
let isDark=!0;function togTh(){isDark=!isDark;document.documentElement.classList.toggle('light',!isDark);$('ti').innerHTML=isDark?'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>':'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';render()}
let tt=null;function toast(m,er){const t=$('toast');t.textContent=m;t.classList.toggle('err',!!er);t.classList.add('show');if(tt)clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2500)}
let isRP=!1;function uInfo(){const zm=Math.round((1200/vb.w)*100);$('canvas-info').textContent=`Zoom:${zm}% | N:${S.nodes.length} Z:${S.zones.length} C:${S.connections.length}`}

const DY=`zones:
  - id: dmz
    label: DMZ
    color: "rgba(231, 76, 60, 0.12)"
    x: 30
    y: 40
    width: 680
    height: 320
  - id: web
    label: Web Servers
    color: "rgba(52, 152, 219, 0.15)"
    parent: dmz
    x: 250
    y: 90
    width: 440
    height: 240
  - id: internal
    label: Internal LAN
    color: "rgba(46, 204, 113, 0.12)"
    x: 30
    y: 410
    width: 680
    height: 250
  - id: db-zone
    label: Database
    color: "rgba(241, 196, 15, 0.15)"
    parent: internal
    x: 360
    y: 460
    width: 330
    height: 170

nodes:
  - id: firewall
    label: Firewall
    color: "#e74c3c"
    zone: dmz
    x: 60
    y: 160
    width: 140
    height: 60
  - id: web01
    label: Web-01
    color: "#3498db"
    zone: web
    x: 280
    y: 130
    width: 130
    height: 55
  - id: web02
    label: Web-02
    color: "#2980b9"
    zone: web
    x: 440
    y: 130
    width: 130
    height: 55
  - id: lb
    label: Load Balancer
    color: "#9b59b6"
    zone: web
    x: 350
    y: 240
    width: 140
    height: 55
  - id: app-server
    label: App Server
    color: "#2ecc71"
    zone: internal
    x: 60
    y: 500
    width: 140
    height: 60
  - id: db-primary
    label: DB Primary
    color: "#f39c12"
    zone: db-zone
    x: 390
    y: 500
    width: 130
    height: 55
  - id: db-replica
    label: DB Replica
    color: "#e67e22"
    zone: db-zone
    x: 540
    y: 500
    width: 130
    height: 55

connections:
  - from: firewall
    to: lb
    protocol: HTTPS
    port: 443
    bidirectional: false
  - from: lb
    to: web01
    protocol: HTTP
    port: 80
    bidirectional: false
  - from: lb
    to: web02
    protocol: HTTP
    port: 80
    bidirectional: false
  - from: web01
    to: app-server
    protocol: HTTP
    port: 8080
    bidirectional: false
  - from: web02
    to: app-server
    protocol: HTTP
    port: 8080
    bidirectional: false
  - from: app-server
    to: db-primary
    protocol: TCP
    port: 5432
    bidirectional: false
  - from: db-primary
    to: db-replica
    protocol: TCP
    port: 5432
    bidirectional: false
  - from: firewall
    to: app-server
    protocol: SSH
    port: 22
    bidirectional: true
`;

function init(){
  yamlEd.value=DY;applyY();aVB();setTimeout(fitV,50);
  $('btn-load').addEventListener('click',loadF);$('btn-apply').addEventListener('click',applyY);
  $('btn-save').addEventListener('click',saveF);$('btn-fit').addEventListener('click',fitV);
  $('btn-theme').addEventListener('click',togTh);$('btn-az').addEventListener('click',addZ);
  $('btn-an').addEventListener('click',addN);$('btn-ac').addEventListener('click',()=>{cm?xCM():eCM()});
  $('file-input').addEventListener('change',onFS);$('ppc').addEventListener('click',clrSel);
  svgC.addEventListener('mousedown',onCD);svgCont.addEventListener('wheel',onWh,{passive:!1});
  document.addEventListener('mousemove',e=>{onMM(e);if(isRP){lPanel.style.width=Math.max(200,Math.min(700,e.clientX))+'px'}});
  document.addEventListener('mouseup',()=>{onMU();if(isRP){isRP=!1;resH.classList.remove('active');document.body.style.cursor='';document.body.style.userSelect=''}});
  resH.addEventListener('mousedown',e=>{e.preventDefault();isRP=!0;resH.classList.add('active');document.body.style.cursor='col-resize';document.body.style.userSelect='none'});
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveF()}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();applyY()}
    if(e.key==='Escape'){if(cm)xCM();clrSel();render()}
    if(e.key==='Delete'&&sel){
      if(sel.t==='z'){const id=sel.id;S.zones=S.zones.filter(z=>z.id!==id);S.nodes.forEach(n=>{if(n.zone===id)delete n.zone});clrSel();sync();render();toast('削除しました')}
      else if(sel.t==='n'){const id=sel.id;S.connections=S.connections.filter(c=>{const f=Array.isArray(c.from)?c.from:[c.from],t=Array.isArray(c.to)?c.to:[c.to];return!f.includes(id)&&!t.includes(id)});S.nodes=S.nodes.filter(n=>n.id!==id);clrSel();sync();render();toast('削除しました')}
      else if(sel.t==='c'){S.connections.splice(sel.idx,1);clrSel();sync();render();toast('削除しました')}
    }
  });
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
