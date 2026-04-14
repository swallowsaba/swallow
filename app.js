(function(){
'use strict';
// === YAML Parser ===
function parseYAML(t){const r={zones:[],nodes:[],connections:[]};let s=null,it=null;for(const l of t.split('\n')){const tr=l.trim();if(!tr||tr[0]==='#')continue;const ind=l.search(/\S/);if(ind===0&&tr.endsWith(':')){const k=tr.slice(0,-1).trim();if(k in r)s=k;it=null;continue}if(!s)continue;if(tr.startsWith('- ')){it={};r[s].push(it);const kv=tr.slice(2).trim();if(kv&&kv.includes(':')){const ci=kv.indexOf(':'),k=kv.slice(0,ci).trim(),v=kv.slice(ci+1).trim();if(k)it[k]=pv(v)}continue}if(it&&tr.includes(':')){const ci=tr.indexOf(':'),k=tr.slice(0,ci).trim(),v=tr.slice(ci+1).trim();if(k)it[k]=pv(v)}}return r}
function pv(s){if(s===''||s==null)return'';if((s[0]==='"'&&s.endsWith('"'))||(s[0]==="'"&&s.endsWith("'")))return s.slice(1,-1);if(s[0]==='['&&s.endsWith(']')){const i=s.slice(1,-1).trim();return i?i.split(',').map(x=>pv(x.trim())):[]}if(s==='true')return!0;if(s==='false')return!1;if(s==='null')return null;if(/^-?\d+(\.\d+)?$/.test(s))return+s;return s}
function serYAML(d){let y='';for(const s of['zones','nodes','connections']){const items=d[s];if(!items||!items.length)continue;y+=s+':\n';for(const item of items){let f=!0;for(const k of Object.keys(item)){y+=(f?'  - ':'    ')+k+': '+sv(item[k])+'\n';f=!1}}y+='\n'}return y.trimEnd()+'\n'}
function sv(v){if(v==null)return'';if(typeof v==='boolean')return v?'true':'false';if(typeof v==='number')return''+v;if(Array.isArray(v))return'['+v.map(sv).join(', ')+']';const s=''+v;if(s.includes('#')||s.includes(':')||s.includes('"')||s.includes("'")||s.includes(',')||s.includes('[')||s.includes(']')||s.startsWith(' ')||s.endsWith(' ')||s==='true'||s==='false'||s==='null'||/^-?\d+(\.\d+)?$/.test(s))return'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';return s}

// === Protocol Colors (defaults) ===
const PC={HTTP:'#27ae60',HTTPS:'#2ecc71',SSH:'#e67e22',TCP:'#3498db',UDP:'#9b59b6',DNS:'#1abc9c',FTP:'#e74c3c',SMTP:'#f1c40f',RDP:'#e91e63',ICMP:'#00bcd4',default:'#95a5a6'};
function pcol(c){if(c.color)return c.color;return c.protocol?(PC[c.protocol.toUpperCase()]||PC.default):PC.default}

// === State ===
let S={zones:[],nodes:[],connections:[]},sel=null,cm=null;
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const yamlEd=$('yaml-editor'),svgC=$('svg-canvas'),svgCont=$('svg-container'),lZ=$('lZ'),lC=$('lC'),lN=$('lN'),resH=$('resize-handle'),lPanel=$('left-panel');
function mk(t,a){const e=document.createElementNS(NS,t);if(a)for(const[k,v]of Object.entries(a))e.setAttribute(k,v);return e}
let vb={x:-50,y:-50,w:1200,h:800},isPan=!1,ps={x:0,y:0},pvs={x:0,y:0},panSc={a:1,d:1},drag=null;
function aVB(){svgC.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`)}
function s2s(cx,cy){const ctm=svgC.getScreenCTM();if(!ctm)return{x:cx,y:cy};const inv=ctm.inverse();return{x:inv.a*cx+inv.c*cy+inv.e,y:inv.b*cx+inv.d*cy+inv.f}}
// Get SVG center of visible area
function viewCenter(){const r=svgCont.getBoundingClientRect();return s2s(r.left+r.width/2,r.top+r.height/2)}

// === Color helpers ===
function zLabelCol(col){if(!col)return'#aaa';const rm=col.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);if(rm)return`rgba(${rm[1]},${rm[2]},${rm[3]},0.9)`;if(col[0]==='#')return col;return col}
function zStrokeCol(col){if(!col)return'#aaa';const rm=col.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);if(rm)return`rgba(${rm[1]},${rm[2]},${rm[3]},0.6)`;if(col[0]==='#'){const n=parseInt(col.slice(1),16);return`rgba(${(n>>16)&0xff},${(n>>8)&0xff},${n&0xff},0.6)`}return col}
function nodeStroke(col){if(!col)return'rgba(0,0,0,0.3)';const rm=col.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);if(rm){const r=Math.max(0,+rm[1]-30),g=Math.max(0,+rm[2]-30),b=Math.max(0,+rm[3]-30);return`rgba(${r},${g},${b},0.8)`}if(col[0]==='#'){const n=parseInt(col.slice(1),16);return'#'+((Math.max(0,(n>>16)-30)<<16)|(Math.max(0,((n>>8)&0xff)-30)<<8)|Math.max(0,(n&0xff)-30)).toString(16).padStart(6,'0')}return col}
function r2h(c){if(!c)return null;if(c[0]==='#')return c.length===7?c:null;const m=c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);if(m)return'#'+[m[1],m[2],m[3]].map(x=>(+x).toString(16).padStart(2,'0')).join('');return null}
// Extract alpha from color string (rgba→alpha, hex→1)
function getAlpha(c){if(!c)return 1;const m=c.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);return m?parseFloat(m[1]):1}
// Combine hex color (#rrggbb) + alpha (0-1) → rgba string
function hexAlphaToRgba(hex,a){if(!hex||hex[0]!=='#')return hex;const n=parseInt(hex.slice(1),16);return`rgba(${(n>>16)&0xff}, ${(n>>8)&0xff}, ${n&0xff}, ${a})`}
// Generate color field HTML with alpha slider
function colorFieldHtml(label,pickP,textP,alphaP,colorVal){
  const hx=r2h(colorVal)||'#888888';const al=Math.round(getAlpha(colorVal)*100);
  return`<div class="ppf"><label class="ppl">${label}</label><div class="ppcr"><input type="color" class="ppci" data-p="${pickP}" value="${hx}"><input class="ppi ppct" data-p="${textP}" value="${esc(colorVal||'')}"></div><div class="pp-alpha"><label>A</label><input type="range" data-p="${alphaP}" min="0" max="100" value="${al}"><span data-p="${alphaP}-val">${(al/100).toFixed(2)}</span></div></div>`;
}

// === Zone hierarchy ===
function getChildZones(zid){return S.zones.filter(z=>z.parent===zid)}
function getAllDescZones(zid){const r=[];const q=[zid];while(q.length){const c=q.shift();const k=S.zones.filter(z=>z.parent===c);for(const z of k){r.push(z);q.push(z.id)}}return r}
function getAllDescNodes(zid){const ids=new Set([zid]);getAllDescZones(zid).forEach(z=>ids.add(z.id));return S.nodes.filter(n=>ids.has(n.zone))}
function zoneSortOrder(){const sorted=[],vis=new Set();function v(z){if(vis.has(z.id))return;if(z.parent){const p=S.zones.find(pz=>pz.id===z.parent);if(p&&!vis.has(p.id))v(p)}vis.add(z.id);sorted.push(z)}S.zones.forEach(z=>v(z));return sorted}
function aFitUp(zid){aFit(zid);const z=S.zones.find(z=>z.id===zid);if(z&&z.parent)aFitUp(z.parent)}

// === Lookup entity (node or zone) for connections ===
function findEntity(id){
  const n=S.nodes.find(n=>n.id===id);
  if(n)return{x:+n.x||0,y:+n.y||0,w:+n.width||140,h:+n.height||60};
  const z=S.zones.find(z=>z.id===id);
  if(z)return{x:+z.x||0,y:+z.y||0,w:+z.width||400,h:+z.height||300};
  return null;
}
// All selectable targets for connections
function allTargets(){
  const r=[];
  S.nodes.forEach(n=>r.push({id:n.id,label:n.label||n.id,type:'node'}));
  S.zones.forEach(z=>r.push({id:z.id,label:(z.label||z.id)+' [zone]',type:'zone'}));
  return r;
}

// === Render ===
function render(){rZones();rNodes();rConns();uInfo()}

// Four corner handles for a rect
function addCornerHandles(g,x,y,w,h,type,id){
  const hs=10;
  const corners=[
    {cls:'rh rh-tl',cx:x,cy:y,dir:'tl'},
    {cls:'rh rh-tr',cx:x+w-hs,cy:y,dir:'tr'},
    {cls:'rh rh-bl',cx:x,cy:y+h-hs,dir:'bl'},
    {cls:'rh rh-br',cx:x+w-hs,cy:y+h-hs,dir:'br'}
  ];
  for(const c of corners){
    const rr=mk('rect',{class:c.cls,x:c.cx,y:c.cy,width:hs,height:hs,'data-r':type,'data-id':id,'data-dir':c.dir});
    g.appendChild(rr);
  }
}

function rZones(){lZ.innerHTML='';const ordered=zoneSortOrder();for(const z of ordered){
  const g=mk('g',{class:'zone-group','data-id':z.id});
  const x=+z.x||0,y=+z.y||0,w=+z.width||400,h=+z.height||300,col=z.color||'rgba(100,100,255,0.15)';
  const sc=zStrokeCol(col),lc=z.textColor||zLabelCol(col);
  const iS=sel&&sel.t==='z'&&sel.id===z.id;
  g.appendChild(mk('rect',{class:'zone-rect'+(iS?' sel':''),x,y,width:w,height:h,fill:col,stroke:iS?'#fff':sc}));
  const lb=mk('text',{class:'zone-label',x:x+12,y:y+24,fill:lc});lb.textContent=z.label||z.id;g.appendChild(lb);
  addCornerHandles(g,x,y,w,h,'z',z.id);
  g.addEventListener('mousedown',e=>onZD(e,z.id));
  g.addEventListener('dblclick',e=>{e.stopPropagation();selZ(z.id)});
  lZ.appendChild(g);
}}

function rNodes(){lN.innerHTML='';for(const n of S.nodes){
  const g=mk('g',{class:'node-group','data-id':n.id});
  const x=+n.x||0,y=+n.y||0,w=+n.width||140,h=+n.height||60,col=n.color||'rgba(52,152,219,0.8)';
  const iS=sel&&sel.t==='n'&&sel.id===n.id;
  g.appendChild(mk('rect',{class:'node-rect'+(iS?' sel':''),x,y,width:w,height:h,fill:col,stroke:iS?'#fff':nodeStroke(col)}));
  const lb=mk('text',{class:'node-label',x:x+w/2,y:y+h/2,'text-anchor':'middle','dominant-baseline':'central',fill:n.textColor||'#fff'});
  lb.textContent=n.label||n.id;g.appendChild(lb);
  addCornerHandles(g,x,y,w,h,'n',n.id);
  g.addEventListener('mousedown',e=>onND(e,n.id));
  g.addEventListener('dblclick',e=>{e.stopPropagation();selN(n.id)});
  lN.appendChild(g);
}}

function rConns(){
  lC.innerHTML='';const defs=svgC.querySelector('defs');defs.innerHTML='';
  // Collect unique colors and create markers
  const usedCols=new Set();
  for(const c of S.connections)usedCols.add(pcol(c));
  for(const col of usedCols){
    const mid='a-'+col.replace(/[^a-fA-F0-9]/g,'');
    const m=mk('marker',{id:mid,viewBox:'0 0 10 7',refX:'10',refY:'3.5',markerWidth:'8',markerHeight:'6',orient:'auto-start-reverse',fill:col});
    m.appendChild(mk('path',{d:'M 0 0 L 10 3.5 L 0 7 z'}));defs.appendChild(m);
  }
  const pairMap={};
  for(let i=0;i<S.connections.length;i++){const c=S.connections[i];const fs=Array.isArray(c.from)?c.from:[c.from],ts=Array.isArray(c.to)?c.to:[c.to];
  for(const f of fs)for(const t of ts){const pk=[f,t].sort().join('::');if(!pairMap[pk])pairMap[pk]=[];pairMap[pk].push({fi:f,ti:t,c,idx:i})}}
  const labels=[],cps=[],eps=[];
  for(const pk of Object.keys(pairMap)){const group=pairMap[pk];for(let gi=0;gi<group.length;gi++){const{fi,ti,c,idx}=group[gi];
  const autoOff=group.length>1?(gi-(group.length-1)/2)*40:0;
  const totalOff=autoOff+(+c.bend||0);
  const res=dConnLine(fi,ti,c,idx,totalOff);if(res){cps.push(res.cp);if(res.eps)eps.push(...res.eps);if(res.label)labels.push(res.label)}}}
  resolveLabels(labels);
  for(const lb of labels){const tl=lb.tw;lC.appendChild(mk('rect',{class:'conn-bg',x:lb.x-tl/2,y:lb.y-9,width:tl,height:18}));const t=mk('text',{class:'conn-lbl',x:lb.x,y:lb.y,'text-anchor':'middle','dominant-baseline':'central',fill:lb.col});t.textContent=lb.text;lC.appendChild(t)}
  for(const cp of cps)lC.appendChild(cp);
  for(const ep of eps)lC.appendChild(ep);
}

function dConnLine(fid,tid,c,idx,offset){
  const fe=findEntity(fid),te=findEntity(tid);if(!fe||!te)return null;
  const fcx=fe.x+fe.w/2,fcy=fe.y+fe.h/2,tcx=te.x+te.w/2,tcy=te.y+te.h/2;
  const col=pcol(c),mid='a-'+col.replace(/[^a-fA-F0-9]/g,'');
  const iS=sel&&sel.t==='c'&&sel.idx===idx;
  const ddx=tcx-fcx,ddy=tcy-fcy,len=Math.sqrt(ddx*ddx+ddy*ddy)||1;
  const nnx=-ddy/len,nny=ddx/len;
  const cg=mk('g',{class:'conn-group'});
  let lx,ly,fpx,fpy,tpx,tpy;
  if(offset===0){
    const fp=eI(fcx,fcy,fe.w,fe.h,tcx,tcy),tp=eI(tcx,tcy,te.w,te.h,fcx,fcy);
    fpx=fp.x;fpy=fp.y;tpx=tp.x;tpy=tp.y;
    cg.appendChild(mk('line',{class:'conn-hit',x1:fp.x,y1:fp.y,x2:tp.x,y2:tp.y}));
    const ln=mk('line',{class:'conn-line'+(iS?' sel':''),x1:fp.x,y1:fp.y,x2:tp.x,y2:tp.y,stroke:col,'marker-end':`url(#${mid})`});
    if(c.bidirectional)ln.setAttribute('marker-start',`url(#${mid})`);cg.appendChild(ln);
    lx=(fp.x+tp.x)/2;ly=(fp.y+tp.y)/2;
  }else{
    const cpx=(fcx+tcx)/2+nnx*offset,cpy=(fcy+tcy)/2+nny*offset;
    const fp=eI(fcx,fcy,fe.w,fe.h,cpx,cpy),tp=eI(tcx,tcy,te.w,te.h,cpx,cpy);
    fpx=fp.x;fpy=fp.y;tpx=tp.x;tpy=tp.y;
    const d=`M ${fp.x} ${fp.y} Q ${cpx} ${cpy} ${tp.x} ${tp.y}`;
    cg.appendChild(mk('path',{class:'conn-hit',d}));
    const ln=mk('path',{class:'conn-line'+(iS?' sel':''),d,stroke:col,'marker-end':`url(#${mid})`});
    if(c.bidirectional)ln.setAttribute('marker-start',`url(#${mid})`);cg.appendChild(ln);
    lx=0.25*fp.x+0.5*cpx+0.25*tp.x;ly=0.25*fp.y+0.5*cpy+0.25*tp.y;
  }
  cg.addEventListener('click',e=>{e.stopPropagation();selC(idx)});
  // Bend control point (above label)
  const cpx_vis=lx,cpy_vis=ly-18;
  const cp=mk('circle',{class:'conn-cp'+(iS?' active':''),cx:cpx_vis,cy:cpy_vis,r:6});
  cp.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();
    sel={t:'c',idx};
    const pt=s2s(e.clientX,e.clientY);
    drag={t:'cb',idx,sx:pt.x,sy:pt.y,fcx,fcy,tcx,tcy,nnx,nny,origBend:+c.bend||0};
  });
  // Endpoint circles for reconnection (from/to)
  const epFrom=mk('circle',{class:'conn-ep'+(iS?' active':''),cx:fpx,cy:fpy,r:5});
  epFrom.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();
    sel={t:'c',idx};drag={t:'ep',idx,end:'from',sx:e.clientX,sy:e.clientY};
  });
  const epTo=mk('circle',{class:'conn-ep'+(iS?' active':''),cx:tpx,cy:tpy,r:5});
  epTo.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();
    sel={t:'c',idx};drag={t:'ep',idx,end:'to',sx:e.clientX,sy:e.clientY};
  });
  lC.appendChild(cg);
  const lt=(c.protocol||'')+(c.port?':'+c.port:'');
  if(!lt)return{cp,eps:[epFrom,epTo],label:null};
  return{cp,eps:[epFrom,epTo],label:{x:lx,y:ly,text:lt,col,tw:lt.length*6.5+10,th:18}};
}

function resolveLabels(labels){for(let iter=0;iter<20;iter++){let moved=!1;for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];const ow=Math.min(a.x+a.tw/2,b.x+b.tw/2)-Math.max(a.x-a.tw/2,b.x-b.tw/2);const oh=Math.min(a.y+a.th/2,b.y+b.th/2)-Math.max(a.y-a.th/2,b.y-b.th/2);if(ow>0&&oh>0){const s=oh/2+2;if(a.y<=b.y){a.y-=s;b.y+=s}else{a.y+=s;b.y-=s}moved=!0}}if(!moved)break}}
function eI(cx,cy,w,h,tx,ty){const dx=tx-cx,dy=ty-cy;if(!dx&&!dy)return{x:cx,y:cy};const t=Math.abs(dx)*(h/2)>Math.abs(dy)*(w/2)?(w/2)/Math.abs(dx):(h/2)/Math.abs(dy);return{x:cx+dx*t,y:cy+dy*t}}

// === Selection ===
function clrSel(){sel=null;cPP();render()}
function selZ(id){if(cm)return;sel={t:'z',id};render();spZ(id)}
function selN(id){
  if(cm){handleConnSel(id);return}
  sel={t:'n',id};render();spN(id);
}
function selC(idx){if(cm)return;sel={t:'c',idx};render();spC(idx)}
// Connection mode: select node or zone
function handleConnSel(id){
  if(!cm.from){cm.from=id;$('cbanner').textContent='接続先をクリック (from: '+id+')';render()}
  else{pushUndo();S.connections.push({from:cm.from,to:id,protocol:'TCP',port:80,bidirectional:!1});xCM();sync();render();selC(S.connections.length-1);toast('接続を追加しました')}
}

// === Props Panel ===
function oPP(){$('pp').classList.add('open')}
function cPP(){$('pp').classList.remove('open')}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}

function spZ(id){const z=S.zones.find(z=>z.id===id);if(!z)return;$('ppt').textContent='Zone 設定';
  const tcVal=z.textColor||zLabelCol(z.color||'');
  const descIds=new Set(getAllDescZones(id).map(d=>d.id));descIds.add(id);
  const pzOpts=S.zones.filter(pz=>!descIds.has(pz.id)).map(pz=>`<option value="${esc(pz.id)}"${z.parent===pz.id?' selected':''}>${esc(pz.label||pz.id)}</option>`).join('');
  $('ppb').innerHTML=`
<div class="ppf"><label class="ppl">ID</label><input class="ppi" data-p="id" value="${esc(z.id)}"></div>
<div class="ppf"><label class="ppl">Label</label><input class="ppi" data-p="label" value="${esc(z.label||'')}"></div>
<div class="ppf"><label class="ppl">Parent Zone</label><select class="pps" data-p="parent"><option value="">(なし)</option>${pzOpts}</select></div>
${colorFieldHtml('Color','cpick','color','calpha',z.color||'')}
${colorFieldHtml('Text Color','tcpick','textColor','tcalpha',tcVal)}
<div class="ppr"><div class="ppf"><label class="ppl">X</label><input class="ppi" type="number" data-p="x" value="${+z.x||0}"></div><div class="ppf"><label class="ppl">Y</label><input class="ppi" type="number" data-p="y" value="${+z.y||0}"></div></div>
<div class="ppr"><div class="ppf"><label class="ppl">W</label><input class="ppi" type="number" data-p="width" value="${+z.width||400}"></div><div class="ppf"><label class="ppl">H</label><input class="ppi" type="number" data-p="height" value="${+z.height||300}"></div></div>`;
$('ppa').innerHTML='<button class="ppdel" id="ppd">削除</button>';bZ(id);oPP()}

function spN(id){const n=S.nodes.find(n=>n.id===id);if(!n)return;$('ppt').textContent='Node 設定';
  const zo=S.zones.map(z=>`<option value="${esc(z.id)}"${n.zone===z.id?' selected':''}>${esc(z.label||z.id)}</option>`).join('');
  $('ppb').innerHTML=`
<div class="ppf"><label class="ppl">ID</label><input class="ppi" data-p="id" value="${esc(n.id)}"></div>
<div class="ppf"><label class="ppl">Label</label><input class="ppi" data-p="label" value="${esc(n.label||'')}"></div>
${colorFieldHtml('Color','cpick','color','calpha',n.color||'')}
${colorFieldHtml('Font Color','tcpick','textColor','tcalpha',n.textColor||'#ffffff')}
<div class="ppf"><label class="ppl">Zone</label><select class="pps" data-p="zone"><option value="">(なし)</option>${zo}</select></div>
<div class="ppr"><div class="ppf"><label class="ppl">X</label><input class="ppi" type="number" data-p="x" value="${+n.x||0}"></div><div class="ppf"><label class="ppl">Y</label><input class="ppi" type="number" data-p="y" value="${+n.y||0}"></div></div>
<div class="ppr"><div class="ppf"><label class="ppl">W</label><input class="ppi" type="number" data-p="width" value="${+n.width||140}"></div><div class="ppf"><label class="ppl">H</label><input class="ppi" type="number" data-p="height" value="${+n.height||60}"></div></div>`;
$('ppa').innerHTML='<button class="ppdel" id="ppd">削除</button>';bN(id);oPP()}

function spC(idx){const c=S.connections[idx];if(!c)return;$('ppt').textContent='Connection 設定';
  const tgts=allTargets();const opts=tgts.map(t=>`<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
  const cCol=c.color||pcol(c);
  $('ppb').innerHTML=`
<div class="ppf"><label class="ppl">From</label><select class="pps" data-p="from">${opts}</select></div>
<div class="ppf"><label class="ppl">To</label><select class="pps" data-p="to">${opts}</select></div>
<div class="ppr"><div class="ppf"><label class="ppl">Protocol</label><input class="ppi" data-p="protocol" value="${esc(c.protocol||'')}"></div><div class="ppf"><label class="ppl">Port</label><input class="ppi" type="number" data-p="port" value="${+c.port||0}"></div></div>
${colorFieldHtml('Color (矢印色)','ccpick','ccolor','ccalpha',cCol)}
<div class="ppf"><label class="ppl">Bend</label><input class="ppi" type="number" data-p="bend" value="${+c.bend||0}" step="10"></div>
<div class="ppchk"><input type="checkbox" class="ppchki" id="ppbd" data-p="bidirectional" ${c.bidirectional?'checked':''}><label class="ppchkl" for="ppbd">双方向</label></div>`;
  const fS=$('ppb').querySelector('[data-p="from"]'),tS=$('ppb').querySelector('[data-p="to"]');
  if(fS)fS.value=Array.isArray(c.from)?c.from[0]:c.from||'';
  if(tS)tS.value=Array.isArray(c.to)?c.to[0]:c.to||'';
  $('ppa').innerHTML='<button class="ppdel" id="ppd">削除</button>';bC(idx);oPP()}

// === Bind property inputs ===
// Helper: update color from picker+alpha, sync text field
function syncColorField(ppb,pickP,textP,alphaP){
  const pick=ppb.querySelector(`[data-p="${pickP}"]`);
  const txt=ppb.querySelector(`[data-p="${textP}"]`);
  const rng=ppb.querySelector(`[data-p="${alphaP}"]`);
  const valSpan=ppb.querySelector(`[data-p="${alphaP}-val"]`);
  if(!pick||!rng)return null;
  const a=+rng.value/100;
  const rgba=hexAlphaToRgba(pick.value,a);
  if(txt)txt.value=rgba;
  if(valSpan)valSpan.textContent=a.toFixed(2);
  return rgba;
}

function bZ(initId){let cid=initId;const ppb=$('ppb');ppb.querySelectorAll('.ppi,.pps,.ppci,input[type=range]').forEach(inp=>{inp.addEventListener('input',()=>{const z=S.zones.find(z=>z.id===cid);if(!z)return;const p=inp.dataset.p;
  if(p==='cpick'||p==='calpha'){z.color=syncColorField(ppb,'cpick','color','calpha')}
  else if(p==='tcpick'||p==='tcalpha'){z.textColor=syncColorField(ppb,'tcpick','textColor','tcalpha')}
  else if(p==='color'){z.color=inp.value}
  else if(p==='textColor'){z.textColor=inp.value||undefined;if(!inp.value)delete z.textColor}
  else if(p==='parent'){z.parent=inp.value||undefined;if(!inp.value)delete z.parent;else aFitUp(inp.value)}
  else if(p==='id'){const old=z.id;z.id=inp.value;S.nodes.forEach(n=>{if(n.zone===old)n.zone=inp.value});S.zones.forEach(cz=>{if(cz.parent===old)cz.parent=inp.value});S.connections.forEach(c=>{if(c.from===old)c.from=inp.value;if(c.to===old)c.to=inp.value});sel.id=inp.value;cid=inp.value}
  else if('x y width height'.includes(p)){z[p]=+inp.value||0;if(z.parent)aFitUp(z.parent)}
  else z[p]=inp.value;
  sync();render()})});
  $('ppd').addEventListener('click',()=>{pushUndo();S.zones.forEach(cz=>{if(cz.parent===cid)delete cz.parent});S.zones=S.zones.filter(z=>z.id!==cid);S.nodes.forEach(n=>{if(n.zone===cid)delete n.zone});S.connections=S.connections.filter(c=>c.from!==cid&&c.to!==cid);clrSel();sync();render();toast('削除しました')})}

function bN(initId){let cid=initId;const ppb=$('ppb');ppb.querySelectorAll('.ppi,.pps,.ppci,input[type=range]').forEach(inp=>{inp.addEventListener('input',()=>{const n=S.nodes.find(n=>n.id===cid);if(!n)return;const p=inp.dataset.p;
  if(p==='cpick'||p==='calpha'){n.color=syncColorField(ppb,'cpick','color','calpha')}
  else if(p==='tcpick'||p==='tcalpha'){n.textColor=syncColorField(ppb,'tcpick','textColor','tcalpha')}
  else if(p==='color'){n.color=inp.value}
  else if(p==='textColor'){n.textColor=inp.value||undefined;if(!inp.value)delete n.textColor}
  else if(p==='id'){const old=n.id;n.id=inp.value;S.connections.forEach(c=>{if(c.from===old)c.from=inp.value;if(c.to===old)c.to=inp.value;if(Array.isArray(c.from))c.from=c.from.map(f=>f===old?inp.value:f);if(Array.isArray(c.to))c.to=c.to.map(t=>t===old?inp.value:t)});sel.id=inp.value;cid=inp.value}
  else if(p==='zone'){n.zone=inp.value||undefined;if(!inp.value)delete n.zone}
  else if('x y width height'.includes(p)){n[p]=+inp.value||0;if(n.zone)aFitUp(n.zone)}
  else n[p]=inp.value;
  sync();render()})});
  $('ppd').addEventListener('click',()=>{pushUndo();S.connections=S.connections.filter(c=>{const f=Array.isArray(c.from)?c.from:[c.from],t=Array.isArray(c.to)?c.to:[c.to];return!f.includes(cid)&&!t.includes(cid)});S.nodes=S.nodes.filter(n=>n.id!==cid);clrSel();sync();render();toast('削除しました')})}

function bC(idx){const ppb=$('ppb');ppb.querySelectorAll('.ppi,.pps,.ppchki,.ppci,input[type=range]').forEach(inp=>{const ev=inp.type==='checkbox'?'change':'input';inp.addEventListener(ev,()=>{const c=S.connections[idx];if(!c)return;const p=inp.dataset.p;
  if(p==='bidirectional')c.bidirectional=inp.checked;
  else if(p==='port')c.port=+inp.value||0;
  else if(p==='bend'){c.bend=+inp.value||0;if(c.bend===0)delete c.bend}
  else if(p==='ccpick'||p==='ccalpha'){c.color=syncColorField(ppb,'ccpick','ccolor','ccalpha')}
  else if(p==='ccolor'){c.color=inp.value||undefined;if(!inp.value)delete c.color}
  else c[p]=inp.value;
  sync();render()})});
  $('ppd').addEventListener('click',()=>{pushUndo();S.connections.splice(idx,1);clrSel();sync();render();toast('削除しました')})}

// === Add ===
function addZ(){xCM();const id='zone-'+(S.zones.length+1);const vc=viewCenter();
  const cols=['rgba(231,76,60,0.15)','rgba(46,204,113,0.15)','rgba(52,152,219,0.15)','rgba(155,89,182,0.15)','rgba(241,196,15,0.15)'];
  S.zones.push({id,label:'New Zone',color:cols[S.zones.length%cols.length],x:Math.round(vc.x-200),y:Math.round(vc.y-150),width:400,height:300});
  sync();render();selZ(id);toast('ゾーンを追加しました')}
function addN(){xCM();const id='node-'+(S.nodes.length+1);const vc=viewCenter();
  const cols=['rgba(52,152,219,0.8)','rgba(46,204,113,0.8)','rgba(231,76,60,0.8)','rgba(243,156,18,0.8)','rgba(155,89,182,0.8)','rgba(26,188,156,0.8)'];
  S.nodes.push({id,label:'New Node',color:cols[S.nodes.length%cols.length],x:Math.round(vc.x-70),y:Math.round(vc.y-30),width:140,height:60});
  sync();render();selN(id);toast('ノードを追加しました')}
function eCM(){
  const tgts=allTargets();
  if(tgts.length<2){toast('対象が2つ以上必要です',1);return}
  cm={from:null};$('cbanner').textContent='接続モード: 接続元をクリック';$('cbanner').classList.add('show');
  svgCont.classList.add('conn-mode');cPP();sel=null;render();$('btn-ac').classList.add('active-m')}
function xCM(){cm=null;$('cbanner').classList.remove('show');svgCont.classList.remove('conn-mode');$('btn-ac').classList.remove('active-m')}

// === Drag: Zone ===
function onZD(e,id){const tgt=e.target;
  if(tgt.classList.contains('rh')&&tgt.dataset.r==='z'){
    e.stopPropagation();e.preventDefault();const z=S.zones.find(z=>z.id===id);if(!z)return;const pt=s2s(e.clientX,e.clientY);
    drag={t:'rsz',id,dir:tgt.dataset.dir,sx:pt.x,sy:pt.y,ox:+z.x||0,oy:+z.y||0,ow:+z.width||400,oh:+z.height||300};
    sel={t:'z',id};spZ(id);render();return}
  if(tgt.closest('.node-group'))return;
  if(tgt.closest('.zone-group')&&tgt.closest('.zone-group').dataset.id!==id)return;
  e.stopPropagation();e.preventDefault();
  if(cm){handleConnSel(id);return}
  const z=S.zones.find(z=>z.id===id);if(!z)return;const pt=s2s(e.clientX,e.clientY);
  const descZ=getAllDescZones(id).map(cz=>({id:cz.id,x:+cz.x||0,y:+cz.y||0}));
  const allN=getAllDescNodes(id).map(n=>({id:n.id,x:+n.x||0,y:+n.y||0}));
  drag={t:'z',id,sx:pt.x,sy:pt.y,ox:+z.x||0,oy:+z.y||0,cn:allN,cz:descZ};
  sel={t:'z',id};spZ(id);render()}

// === Drag: Node ===
function onND(e,id){const tgt=e.target;
  if(tgt.classList.contains('rh')&&tgt.dataset.r==='n'){
    e.stopPropagation();e.preventDefault();const n=S.nodes.find(n=>n.id===id);if(!n)return;const pt=s2s(e.clientX,e.clientY);
    drag={t:'rsn',id,dir:tgt.dataset.dir,sx:pt.x,sy:pt.y,ox:+n.x||0,oy:+n.y||0,ow:+n.width||140,oh:+n.height||60};
    if(!cm){sel={t:'n',id};spN(id);render()}return}
  e.stopPropagation();e.preventDefault();
  if(cm){handleConnSel(id);return}
  const n=S.nodes.find(n=>n.id===id);if(!n)return;const pt=s2s(e.clientX,e.clientY);
  drag={t:'n',id,sx:pt.x,sy:pt.y,ox:+n.x||0,oy:+n.y||0};sel={t:'n',id};spN(id);render()}

// === Resize logic (four corners) ===
function applyResize(obj,dir,dx,dy,ox,oy,ow,oh,minW,minH){
  let nx=ox,ny=oy,nw=ow,nh=oh;
  if(dir==='br'){nw=Math.max(minW,ow+dx);nh=Math.max(minH,oh+dy)}
  else if(dir==='bl'){const dw=Math.min(dx,ow-minW);nx=ox+dw;nw=ow-dw;nh=Math.max(minH,oh+dy)}
  else if(dir==='tr'){nw=Math.max(minW,ow+dx);const dh=Math.min(dy,oh-minH);ny=oy+dh;nh=oh-dh}
  else if(dir==='tl'){const dw=Math.min(dx,ow-minW);nx=ox+dw;nw=ow-dw;const dh=Math.min(dy,oh-minH);ny=oy+dh;nh=oh-dh}
  obj.x=Math.round(nx);obj.y=Math.round(ny);obj.width=Math.round(nw);obj.height=Math.round(nh);
}

// === Edge panning ===
const EDGE_ZONE=40,EDGE_SPEED=8;
function edgePan(e){
  const r=svgCont.getBoundingClientRect();
  const ctm=svgC.getScreenCTM();if(!ctm)return;const inv=ctm.inverse();
  const spd=EDGE_SPEED*Math.abs(inv.a);
  let moved=!1;
  if(e.clientX-r.left<EDGE_ZONE){vb.x-=spd;moved=!0}
  if(r.right-e.clientX<EDGE_ZONE){vb.x+=spd;moved=!0}
  if(e.clientY-r.top<EDGE_ZONE){vb.y-=spd;moved=!0}
  if(r.bottom-e.clientY<EDGE_ZONE){vb.y+=spd;moved=!0}
  if(moved)aVB();
}

function onMM(e){if(drag){e.preventDefault();
  edgePan(e);
  const pt=s2s(e.clientX,e.clientY),dx=pt.x-drag.sx,dy=pt.y-drag.sy;
  if(drag.t==='z'&&drag.cn){const z=S.zones.find(z=>z.id===drag.id);if(!z)return;z.x=Math.round(drag.ox+dx);z.y=Math.round(drag.oy+dy);
    if(drag.cz)for(const co of drag.cz){const cz=S.zones.find(z=>z.id===co.id);if(cz){cz.x=Math.round(co.x+dx);cz.y=Math.round(co.y+dy)}}
    for(const co of drag.cn){const n=S.nodes.find(n=>n.id===co.id);if(n){n.x=Math.round(co.x+dx);n.y=Math.round(co.y+dy)}}
    if(z.parent)aFitUp(z.parent);render()}
  else if(drag.t==='n'){const n=S.nodes.find(n=>n.id===drag.id);if(!n)return;n.x=Math.round(drag.ox+dx);n.y=Math.round(drag.oy+dy);if(n.zone)aFitUp(n.zone);render()}
  else if(drag.t==='rsz'){const z=S.zones.find(z=>z.id===drag.id);if(!z)return;applyResize(z,drag.dir,dx,dy,drag.ox,drag.oy,drag.ow,drag.oh,100,60);if(z.parent)aFitUp(z.parent);render()}
  else if(drag.t==='rsn'){const n=S.nodes.find(n=>n.id===drag.id);if(!n)return;applyResize(n,drag.dir,dx,dy,drag.ox,drag.oy,drag.ow,drag.oh,60,30);if(n.zone)aFitUp(n.zone);render()}
  else if(drag.t==='cb'){
    const c=S.connections[drag.idx];if(!c)return;
    const mx=(drag.fcx+drag.tcx)/2,my=(drag.fcy+drag.tcy)/2;
    const vx=pt.x-mx,vy=pt.y-my;
    const proj=vx*drag.nnx+vy*drag.nny;
    // Use absolute projection (not delta) since we project mouse pos directly
    c.bend=Math.round(proj);if(c.bend===0)delete c.bend;render()}
  else if(drag.t==='ep'){
    // Endpoint reconnection: just render a visual indicator (handled on mouseup)
    render();
  }
}else if(isPan){e.preventDefault();vb.x=pvs.x-(e.clientX-ps.x)*panSc.a;vb.y=pvs.y-(e.clientY-ps.y)*panSc.d;aVB()}}

function onMU(e){if(drag){
  if(drag.t==='ep'&&e){
    // Find entity under mouse for reconnection
    const pt=s2s(e.clientX,e.clientY);const c=S.connections[drag.idx];
    if(c){
      let hit=null;
      // Check nodes
      for(const n of S.nodes){const nx=+n.x||0,ny=+n.y||0,nw=+n.width||140,nh=+n.height||60;
        if(pt.x>=nx&&pt.x<=nx+nw&&pt.y>=ny&&pt.y<=ny+nh){hit=n.id;break}}
      // Check zones
      if(!hit)for(const z of S.zones){const zx=+z.x||0,zy=+z.y||0,zw=+z.width||400,zh=+z.height||300;
        if(pt.x>=zx&&pt.x<=zx+zw&&pt.y>=zy&&pt.y<=zy+zh){hit=z.id}}
      if(hit){
        const other=drag.end==='from'?c.to:c.from;
        if(hit!==other){c[drag.end]=hit;toast((drag.end==='from'?'始点':'終点')+'を変更しました')}
      }
    }
  }
  pushUndo();sync();
  if(sel){if(sel.t==='z')spZ(sel.id);else if(sel.t==='n')spN(sel.id);else if(sel.t==='c')spC(sel.idx)}
  drag=null}
  if(isPan){isPan=!1;svgCont.classList.remove('panning')}}

function aFit(zid){const z=S.zones.find(z=>z.id===zid);if(!z)return;
  const cn=S.nodes.filter(n=>n.zone===zid),cz=getChildZones(zid);
  if(!cn.length&&!cz.length)return;
  const pd=6,tp=28;let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  for(const n of cn){a=Math.min(a,+n.x||0);b=Math.min(b,+n.y||0);c=Math.max(c,(+n.x||0)+(+n.width||140));d=Math.max(d,(+n.y||0)+(+n.height||60))}
  for(const ch of cz){a=Math.min(a,+ch.x||0);b=Math.min(b,+ch.y||0);c=Math.max(c,(+ch.x||0)+(+ch.width||400));d=Math.max(d,(+ch.y||0)+(+ch.height||300))}
  const zx=+z.x||0,zy=+z.y||0,zw=+z.width||400,zh=+z.height||300;
  z.x=Math.round(Math.min(zx,a-pd));z.y=Math.round(Math.min(zy,b-tp));
  z.width=Math.round(Math.max(zx+zw,c+pd)-z.x);z.height=Math.round(Math.max(zy+zh,d+pd)-z.y)}

// === Pan/Zoom ===
function onCD(e){if(cm&&!e.target.closest('.node-group')&&!e.target.closest('.zone-group')){xCM();render();return}
  if(e.target===svgC||e.target===$('svg-world')||['lZ','lC','lN'].includes(e.target.id)){
    if(!e.target.closest('.zone-group')&&!e.target.closest('.node-group'))clrSel();
    e.preventDefault();isPan=!0;ps.x=e.clientX;ps.y=e.clientY;pvs.x=vb.x;pvs.y=vb.y;
    const ctm=svgC.getScreenCTM();panSc=ctm?{a:ctm.inverse().a,d:ctm.inverse().d}:{a:1,d:1};
    svgCont.classList.add('panning')}}
function onWh(e){e.preventDefault();const anc=s2s(e.clientX,e.clientY),r=svgCont.getBoundingClientRect(),mx=(e.clientX-r.left)/r.width,my=(e.clientY-r.top)/r.height,f=e.deltaY>0?1.1:0.9;vb.w=Math.max(200,Math.min(10000,vb.w*f));vb.h=Math.max(150,Math.min(7500,vb.h*f));vb.x=anc.x-mx*vb.w;vb.y=anc.y-my*vb.h;aVB();uInfo();syncZoomSlider()}

// === Zoom Slider ===
const zoomSlider=$('zoom-slider'),zoomPct=$('zoom-pct');
function syncZoomSlider(){const zm=Math.round((1200/vb.w)*100);zoomSlider.value=zm;zoomPct.textContent=zm+'%'}
function onZoomSlider(){const zm=+zoomSlider.value;const r=svgCont.getBoundingClientRect();
  const cx=vb.x+vb.w/2,cy=vb.y+vb.h/2;
  const aspect=r.width/r.height;
  vb.w=1200*100/zm;vb.h=vb.w/aspect;
  vb.x=cx-vb.w/2;vb.y=cy-vb.h/2;
  aVB();uInfo();zoomPct.textContent=zm+'%'}

function fitV(){if(!S.zones.length&&!S.nodes.length){vb={x:-50,y:-50,w:1200,h:800};aVB();syncZoomSlider();return}
  let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  for(const z of S.zones){a=Math.min(a,+z.x||0);b=Math.min(b,+z.y||0);c=Math.max(c,(+z.x||0)+(+z.width||400));d=Math.max(d,(+z.y||0)+(+z.height||300))}
  for(const n of S.nodes){a=Math.min(a,+n.x||0);b=Math.min(b,+n.y||0);c=Math.max(c,(+n.x||0)+(+n.width||140));d=Math.max(d,(+n.y||0)+(+n.height||60))}
  const p=60;vb.x=a-p;vb.y=b-p;vb.w=(c-a)+p*2;vb.h=(d-b)+p*2;
  const cr=svgCont.getBoundingClientRect(),ac=cr.width/cr.height,av=vb.w/vb.h;
  if(av>ac){const nh=vb.w/ac;vb.y-=(nh-vb.h)/2;vb.h=nh}else{const nw=vb.h*ac;vb.x-=(nw-vb.w)/2;vb.w=nw}
  aVB();syncZoomSlider();uInfo()}

// === Undo/Redo ===
const undoStack=[],redoStack=[];const MAX_UNDO=50;
function snapshot(){return JSON.stringify({zones:S.zones,nodes:S.nodes,connections:S.connections})}
function restoreSnap(snap){const d=JSON.parse(snap);S.zones=d.zones;S.nodes=d.nodes;S.connections=d.connections}
function pushUndo(){undoStack.push(snapshot());if(undoStack.length>MAX_UNDO)undoStack.shift();redoStack.length=0}
function undo(){if(!undoStack.length){toast('これ以上戻せません',1);return}redoStack.push(snapshot());restoreSnap(undoStack.pop());sync();clrSel();render();toast('元に戻しました')}
function redo(){if(!redoStack.length){toast('これ以上進めません',1);return}undoStack.push(snapshot());restoreSnap(redoStack.pop());sync();clrSel();render();toast('やり直しました')}

// === Sync/IO ===
function sync(){yamlEd.value=serYAML(S)}
function applyY(){try{const p=parseYAML(yamlEd.value);S.zones=p.zones||[];S.nodes=p.nodes||[];S.connections=p.connections||[];clrSel();render();toast('反映しました')}catch(e){toast('YAML解析エラー: '+e.message,1)}}
function loadF(){$('file-input').click()}
function onFS(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{yamlEd.value=ev.target.result;applyY();fitV();toast('読み込みました')};r.readAsText(f);e.target.value=''}

// === Save with filename ===
function saveF(){sync();$('save-fname').value='infrastructure.yaml';$('save-dlg').classList.add('open');$('save-fname').focus();$('save-fname').select()}
function doSave(){const fn=$('save-fname').value.trim()||'infrastructure.yaml';$('save-dlg').classList.remove('open');
  const b=new Blob([yamlEd.value],{type:'text/yaml'}),u=URL.createObjectURL(b);
  const a=document.createElement('a');a.href=u;a.download=fn;a.click();URL.revokeObjectURL(u);toast('保存: '+fn)}

// === Theme ===
let isDark=!0;function togTh(){isDark=!isDark;document.documentElement.classList.toggle('light',!isDark);$('ti').innerHTML=isDark?'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>':'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';render()}
let tt=null;function toast(m,er){const t=$('toast');t.textContent=m;t.classList.toggle('err',!!er);t.classList.add('show');if(tt)clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2500)}
let isRP=!1;function uInfo(){const zm=Math.round((1200/vb.w)*100);$('canvas-info').textContent=`N:${S.nodes.length} Z:${S.zones.length} C:${S.connections.length}`}

// === Default YAML ===
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
    color: "rgba(231, 76, 60, 0.8)"
    zone: dmz
    x: 60
    y: 160
    width: 140
    height: 60
  - id: web01
    label: Web-01
    color: "rgba(52, 152, 219, 0.8)"
    zone: web
    x: 280
    y: 130
    width: 130
    height: 55
  - id: web02
    label: Web-02
    color: "rgba(41, 128, 185, 0.8)"
    zone: web
    x: 440
    y: 130
    width: 130
    height: 55
  - id: lb
    label: Load Balancer
    color: "rgba(155, 89, 182, 0.8)"
    zone: web
    x: 350
    y: 240
    width: 140
    height: 55
  - id: app-server
    label: App Server
    color: "rgba(46, 204, 113, 0.8)"
    zone: internal
    x: 60
    y: 500
    width: 140
    height: 60
  - id: db-primary
    label: DB Primary
    color: "rgba(243, 156, 18, 0.8)"
    zone: db-zone
    x: 390
    y: 500
    width: 130
    height: 55
  - id: db-replica
    label: DB Replica
    color: "rgba(230, 126, 34, 0.8)"
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

// === Init ===
function init(){
  yamlEd.value=DY;pushUndo();applyY();aVB();setTimeout(fitV,50);
  $('btn-load').addEventListener('click',loadF);$('btn-apply').addEventListener('click',()=>{pushUndo();applyY()});
  $('btn-save').addEventListener('click',saveF);$('btn-fit').addEventListener('click',fitV);
  $('btn-theme').addEventListener('click',togTh);$('btn-az').addEventListener('click',()=>{pushUndo();addZ()});
  $('btn-an').addEventListener('click',()=>{pushUndo();addN()});$('btn-ac').addEventListener('click',()=>{cm?xCM():eCM()});
  $('btn-undo').addEventListener('click',undo);$('btn-redo').addEventListener('click',redo);
  $('file-input').addEventListener('change',onFS);$('ppc').addEventListener('click',clrSel);
  $('save-ok').addEventListener('click',doSave);$('save-cancel').addEventListener('click',()=>$('save-dlg').classList.remove('open'));
  $('save-fname').addEventListener('keydown',e=>{if(e.key==='Enter')doSave();if(e.key==='Escape')$('save-dlg').classList.remove('open')});
  zoomSlider.addEventListener('input',onZoomSlider);
  svgC.addEventListener('mousedown',onCD);svgCont.addEventListener('wheel',onWh,{passive:!1});
  document.addEventListener('mousemove',e=>{onMM(e);if(isRP)lPanel.style.width=Math.max(200,Math.min(700,e.clientX))+'px'});
  document.addEventListener('mouseup',e=>{onMU(e);if(isRP){isRP=!1;resH.classList.remove('active');document.body.style.cursor='';document.body.style.userSelect=''}});
  resH.addEventListener('mousedown',e=>{e.preventDefault();isRP=!0;resH.classList.add('active');document.body.style.cursor='col-resize';document.body.style.userSelect='none'});
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();return}
    if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();redo();return}
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveF()}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();pushUndo();applyY()}
    if(e.key==='Escape'){if($('save-dlg').classList.contains('open')){$('save-dlg').classList.remove('open');return}if(cm)xCM();clrSel();render()}
    if(e.key==='Delete'&&sel&&!$('save-dlg').classList.contains('open')){
      pushUndo();
      if(sel.t==='z'){const id=sel.id;S.zones.forEach(cz=>{if(cz.parent===id)delete cz.parent});S.zones=S.zones.filter(z=>z.id!==id);S.nodes.forEach(n=>{if(n.zone===id)delete n.zone});S.connections=S.connections.filter(c=>c.from!==id&&c.to!==id);clrSel();sync();render();toast('削除しました')}
      else if(sel.t==='n'){const id=sel.id;S.connections=S.connections.filter(c=>{const f=Array.isArray(c.from)?c.from:[c.from],t=Array.isArray(c.to)?c.to:[c.to];return!f.includes(id)&&!t.includes(id)});S.nodes=S.nodes.filter(n=>n.id!==id);clrSel();sync();render();toast('削除しました')}
      else if(sel.t==='c'){S.connections.splice(sel.idx,1);clrSel();sync();render();toast('削除しました')}
    }
  });
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();