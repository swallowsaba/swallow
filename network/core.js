// NetSim — core utilities, YAML, state, IP/MAC, undo/redo
"use strict";

/* ====== UTILITIES ====== */
const $ = (s,r)=>(r||document).querySelector(s);
const $$ = (s,r)=>Array.from((r||document).querySelectorAll(s));
const NS = "http://www.w3.org/2000/svg";
const ce = (tag,attrs,parent)=>{const el=document.createElementNS(NS,tag);if(attrs)for(const k in attrs){if(k==="text")el.textContent=attrs[k];else el.setAttribute(k,attrs[k]);}if(parent)parent.appendChild(el);return el;};
const ch = (tag,attrs,parent)=>{const el=document.createElement(tag);if(attrs)for(const k in attrs){if(k==="text")el.textContent=attrs[k];else if(k==="html")el.innerHTML=attrs[k];else if(k==="on")for(const e in attrs[k])el.addEventListener(e,attrs[k][e]);else if(k==="style")Object.assign(el.style,attrs[k]);else el.setAttribute(k,attrs[k]);}if(parent)parent.appendChild(el);return el;};
const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const uid = (p)=>p+"-"+Math.random().toString(36).slice(2,8);
const pad2 = n=>n<10?"0"+n:""+n;
const pad3 = n=>n<10?"00"+n:n<100?"0"+n:""+n;
const nowStamp = ()=>{const d=new Date();return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;};
const escapeHtml = s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

/* ====== TOAST ====== */
let _toastTimer = null;
function toast(msg, kind){
  if(App && App.suppressToast) return;  // suppression flag (e.g. during sim)
  const t = $("#toast"); if(!t) return;
  t.classList.remove("err","warn","ok","hidden","show");
  if(kind === "err") t.classList.add("err");
  else if(kind === "warn") t.classList.add("warn");
  else if(kind === "ok") t.classList.add("ok");
  t.textContent = msg;
  // force reflow then show
  void t.offsetWidth;
  t.classList.add("show");
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>{
    t.classList.remove("show");
  }, 2800);
}

/* ====== YAML PARSER/SERIALIZER ====== */
const YAML = (() => {
  function parse(text){
    const raw = text.split(/\r?\n/);
    const lines = [];
    for(let i=0;i<raw.length;i++){
      let l = raw[i];
      let out="",inStr=false,sc="";
      for(let j=0;j<l.length;j++){
        const c=l[j];
        if(inStr){out+=c;if(c===sc&&l[j-1]!=="\\")inStr=false;}
        else{if(c==='"'||c==="'"){inStr=true;sc=c;out+=c;}
          else if(c==="#")break;
          else out+=c;}
      }
      if(!out.trim()){lines.push({blank:true,indent:0});continue;}
      const indent = out.length - out.trimStart().length;
      lines.push({blank:false,indent,text:out.trimStart().trimEnd(),raw:out.trimEnd()});
    }
    while(lines.length && lines[0].blank) lines.shift();
    while(lines.length && lines[lines.length-1].blank) lines.pop();
    if(!lines.length) return {};
    const ctx = {lines, idx:0};
    return parseBlock(ctx, 0);
  }
  function peek(ctx){while(ctx.idx<ctx.lines.length && ctx.lines[ctx.idx].blank) ctx.idx++; return ctx.lines[ctx.idx];}
  function consume(ctx){while(ctx.idx<ctx.lines.length && ctx.lines[ctx.idx].blank) ctx.idx++; return ctx.lines[ctx.idx++];}
  function parseBlock(ctx, baseIndent){
    const first = peek(ctx);
    if(!first || first.indent < baseIndent) return null;
    if(first.text.startsWith("- ") || first.text === "-"){
      const arr = [];
      const listIndent = first.indent;
      while(true){
        const l = peek(ctx);
        if(!l || l.indent < listIndent) break;
        if(l.indent > listIndent) break;
        if(!l.text.startsWith("- ") && l.text !== "-") break;
        consume(ctx);
        const after = l.text === "-" ? "" : l.text.slice(2);
        if(after === ""){
          const v = parseBlock(ctx, listIndent + 2);
          arr.push(v);
        } else if(findColon(after) >= 0 && !isInline(after)){
          const obj = {};
          parseKeyVal(after, obj, ctx, listIndent + 2);
          while(true){
            const l2 = peek(ctx);
            if(!l2 || l2.indent < listIndent + 2) break;
            if(l2.indent === listIndent + 2 && !l2.text.startsWith("- ")){
              consume(ctx);
              parseKeyVal(l2.text, obj, ctx, listIndent + 2);
            } else break;
          }
          arr.push(obj);
        } else {
          arr.push(parseScalar(after));
        }
      }
      return arr;
    } else {
      const obj = {};
      while(true){
        const l = peek(ctx);
        if(!l || l.indent < baseIndent) break;
        if(l.indent > baseIndent) break;
        consume(ctx);
        parseKeyVal(l.text, obj, ctx, baseIndent);
      }
      return obj;
    }
  }
  function parseKeyVal(text, obj, ctx, indent){
    const ci = findColon(text);
    if(ci < 0) return;
    let key = text.slice(0,ci).trim();
    let val = text.slice(ci+1).trim();
    if((key[0]==='"'&&key[key.length-1]==='"')||(key[0]==="'"&&key[key.length-1]==="'")) key=key.slice(1,-1);
    if(val === ""){
      const nxt = peek(ctx);
      if(nxt && nxt.indent > indent){
        const sub = parseBlock(ctx, nxt.indent);
        obj[key] = sub;
      } else obj[key] = null;
    } else {
      obj[key] = parseScalar(val);
    }
  }
  function findColon(s){
    let depth=0, inStr=false, sc="";
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(inStr){if(c===sc&&s[i-1]!=="\\")inStr=false;continue;}
      if(c==='"'||c==="'"){inStr=true;sc=c;continue;}
      if(c==="{"||c==="[") depth++;
      else if(c==="}"||c==="]") depth--;
      else if(c===":"&&depth===0){
        if(i===s.length-1 || /\s/.test(s[i+1])) return i;
      }
    }
    return -1;
  }
  function isInline(s){
    s=s.trim();
    if(!s) return true;
    if(s[0]==="{"||s[0]==="[") return true;
    return false;
  }
  function parseScalar(s){
    s = s.trim();
    if(s==="" || s==="null" || s==="~") return null;
    if(s==="true") return true;
    if(s==="false") return false;
    if(s[0]==="["&&s[s.length-1]==="]") return parseInlineArr(s);
    if(s[0]==="{"&&s[s.length-1]==="}") return parseInlineObj(s);
    if((s[0]==='"'&&s[s.length-1]==='"')||(s[0]==="'"&&s[s.length-1]==="'")) return s.slice(1,-1);
    if(/^-?\d+$/.test(s)) return parseInt(s,10);
    if(/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    return s;
  }
  function splitTL(s, delim){
    const out=[];let cur="",depth=0,inStr=false,sc="";
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(inStr){cur+=c;if(c===sc&&s[i-1]!=="\\")inStr=false;continue;}
      if(c==='"'||c==="'"){inStr=true;sc=c;cur+=c;continue;}
      if(c==="{"||c==="[") {depth++;cur+=c;continue;}
      if(c==="}"||c==="]") {depth--;cur+=c;continue;}
      if(c===delim && depth===0){out.push(cur);cur="";continue;}
      cur+=c;
    }
    if(cur.length) out.push(cur);
    return out;
  }
  function parseInlineArr(s){
    const inner = s.slice(1,-1).trim();
    if(!inner) return [];
    return splitTL(inner,",").map(x=>parseScalar(x.trim()));
  }
  function parseInlineObj(s){
    const inner = s.slice(1,-1).trim();
    if(!inner) return {};
    const obj = {};
    for(const it of splitTL(inner,",")){
      const ci = findColon(it);
      if(ci<0) continue;
      let k = it.slice(0,ci).trim();
      const v = it.slice(ci+1).trim();
      if((k[0]==='"'&&k[k.length-1]==='"')||(k[0]==="'"&&k[k.length-1]==="'")) k=k.slice(1,-1);
      obj[k] = parseScalar(v);
    }
    return obj;
  }

  function isPlainObj(v){return v!==null && typeof v==="object" && !Array.isArray(v);}
  function needsQuotes(s){
    if(typeof s!=="string") return false;
    if(s==="") return true;
    if(/^[a-zA-Z_][a-zA-Z0-9_\-\/\.\:]*$/.test(s)) return false;
    if(/[:#\[\]\{\},&\*!|>'"%@`]/.test(s)) return true;
    if(/^\s|\s$/.test(s)) return true;
    return false;
  }
  function scalar(v){
    if(v===null||v===undefined) return "null";
    if(typeof v==="boolean") return v?"true":"false";
    if(typeof v==="number") return ""+v;
    if(typeof v==="string"){if(needsQuotes(v)) return '"'+v.replace(/"/g,'\\"')+'"'; return v;}
    return JSON.stringify(v);
  }
  function inlineify(v){
    if(Array.isArray(v)){
      if(v.every(x=>x===null||typeof x!=="object")) return "["+v.map(scalar).join(", ")+"]";
      if(v.every(x=>isPlainObj(x)&&Object.values(x).every(y=>y===null||typeof y!=="object")))
        return "["+v.map(inlineify).join(", ")+"]";
      return null;
    }
    if(isPlainObj(v)){
      if(Object.values(v).every(y=>y===null||typeof y!=="object"))
        return "{"+Object.entries(v).map(([k,vv])=>`${k}: ${scalar(vv)}`).join(", ")+"}";
      return null;
    }
    return scalar(v);
  }
  function stringify(obj){return serBlk(obj,0);}
  function serBlk(obj, indent){
    const ind = " ".repeat(indent);
    let out = "";
    if(Array.isArray(obj)){
      if(obj.length===0) return ind+"[]\n";
      for(const item of obj){
        if(isPlainObj(item)){
          const entries = Object.entries(item);
          if(entries.length===0){out += ind+"- {}\n"; continue;}
          let first = true;
          for(const [k,v] of entries){
            if(first){
              if(Array.isArray(v)){
                const inl = inlineify(v);
                if(inl!==null) out += ind+"- "+k+": "+inl+"\n";
                else if(v.length===0) out += ind+"- "+k+": []\n";
                else {out += ind+"- "+k+":\n"; out += serBlk(v, indent+4);}
              } else if(isPlainObj(v)){
                const inl = inlineify(v);
                if(inl!==null) out += ind+"- "+k+": "+inl+"\n";
                else {out += ind+"- "+k+":\n"; out += serBlk(v, indent+4);}
              } else {
                out += ind+"- "+k+": "+scalar(v)+"\n";
              }
              first = false;
            } else {
              if(Array.isArray(v)){
                const inl = inlineify(v);
                if(inl!==null) out += ind+"  "+k+": "+inl+"\n";
                else if(v.length===0) out += ind+"  "+k+": []\n";
                else {out += ind+"  "+k+":\n"; out += serBlk(v, indent+4);}
              } else if(isPlainObj(v)){
                const inl = inlineify(v);
                if(inl!==null) out += ind+"  "+k+": "+inl+"\n";
                else {out += ind+"  "+k+":\n"; out += serBlk(v, indent+4);}
              } else {
                out += ind+"  "+k+": "+scalar(v)+"\n";
              }
            }
          }
        } else if(Array.isArray(item)){
          const inl = inlineify(item);
          if(inl!==null) out += ind+"- "+inl+"\n";
          else {out += ind+"-\n"; out += serBlk(item, indent+2);}
        } else {
          out += ind+"- "+scalar(item)+"\n";
        }
      }
      return out;
    }
    if(isPlainObj(obj)){
      const entries = Object.entries(obj);
      if(entries.length===0) return ind+"{}\n";
      for(const [k,v] of entries){
        if(Array.isArray(v)){
          const inl = inlineify(v);
          if(inl!==null) out += ind+k+": "+inl+"\n";
          else if(v.length===0) out += ind+k+": []\n";
          else {out += ind+k+":\n"; out += serBlk(v, indent+2);}
        } else if(isPlainObj(v)){
          const inl = inlineify(v);
          if(inl!==null) out += ind+k+": "+inl+"\n";
          else {out += ind+k+":\n"; out += serBlk(v, indent+2);}
        } else {
          out += ind+k+": "+scalar(v)+"\n";
        }
      }
      return out;
    }
    return ind+scalar(obj)+"\n";
  }
  return { parse, stringify };
})();

/* ====== DEFAULT YAML ====== */
const DEFAULT_YAML = `networks:
  - id: external
    label: External Network
    type: subnet
    kind: physical
    cidr: 203.0.113.0/24
    color: "rgba(231,76,60,0.10)"
    x: 20
    y: 20
    width: 900
    height: 160
  - id: dmz
    label: DMZ (VLAN100)
    type: vlan
    kind: physical
    cidr: 10.1.0.0/24
    gateway: 10.1.0.1
    cidr_v6: "2001:db8:1::/64"
    gateway_v6: "2001:db8:1::1"
    vlan_id: 100
    color: "rgba(52,152,219,0.12)"
    x: 20
    y: 210
    width: 900
    height: 280
  - id: internal
    label: Internal (VLAN200)
    type: vlan
    kind: physical
    cidr: 10.2.0.0/24
    gateway: 10.2.0.1
    vlan_id: 200
    color: "rgba(46,204,113,0.10)"
    x: 20
    y: 520
    width: 480
    height: 300
  - id: db-segment
    label: DB Segment (VLAN300)
    type: vlan
    kind: physical
    cidr: 10.3.0.0/24
    gateway: 10.3.0.1
    cidr_v6: "2001:db8:3::/64"
    gateway_v6: "2001:db8:3::1"
    vlan_id: 300
    color: "rgba(241,196,15,0.12)"
    x: 510
    y: 560
    width: 410
    height: 230
  - id: overlay-vxlan
    label: Overlay (VXLAN — IPv6 only)
    type: vpn-overlay
    kind: virtual
    cidr_v6: "fd00:99::/48"
    gateway_v6: "fd00:99::1"
    color: "rgba(163,113,247,0.08)"
    x: 20
    y: 840
    width: 900
    height: 120

devices:
  - id: fw01
    label: Edge Firewall
    type: firewall
    model: Palo Alto PA-3260
    status: running
    x: 420
    y: 60
    width: 130
    height: 70
    interfaces:
      - id: eth1
        ip: 203.0.113.1/24
        network: external
        mac: "aa:00:00:00:00:01"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: eth2
        ip: 10.1.0.1/24
        ipv6: "2001:db8:1::1/64"
        network: dmz
        mac: "aa:00:00:00:00:02"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: mgmt
        ip: 192.168.99.1/24
        network: ""
        mac: "aa:00:00:00:00:ff"
        speed: 1000
        port_type: mgmt
        status: up
  - id: core-sw01
    label: Core L3 Switch
    type: l3switch
    model: Cisco Nexus 9300
    status: running
    x: 420
    y: 250
    width: 200
    height: 70
    interfaces:
      - id: gi1/0/1
        ip: 10.1.0.2/24
        ipv6: "2001:db8:1::2/64"
        network: dmz
        mac: "bb:00:00:00:00:01"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: gi1/0/2
        ip: 10.1.0.4/24
        network: dmz
        mac: "bb:00:00:00:00:05"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: gi1/0/24
        ip: 10.2.0.1/24
        network: internal
        mac: "bb:00:00:00:00:02"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: gi1/0/25
        ip: 10.2.0.3/24
        network: internal
        mac: "bb:00:00:00:00:06"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: gi1/0/48
        ip: 10.3.0.1/24
        ipv6: "2001:db8:3::1/64"
        network: db-segment
        mac: "bb:00:00:00:00:03"
        speed: 40000
        port_type: qsfp-plus
        status: up
      - id: peer-link
        ip: 10.255.0.1/30
        network: ""
        mac: "bb:00:00:00:00:04"
        speed: 40000
        port_type: qsfp-plus
        status: up
    vpc:
      enabled: true
      peer: core-sw02
      domain: 1
      keepalive: 10.255.0.1
  - id: core-sw02
    label: Core L3 Switch 2
    type: l3switch
    model: Cisco Nexus 9300
    status: running
    x: 660
    y: 250
    width: 200
    height: 70
    interfaces:
      - id: gi1/0/1
        ip: 10.1.0.3/24
        network: dmz
        mac: "bc:00:00:00:00:01"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: gi1/0/2
        ip: 10.1.0.5/24
        network: dmz
        mac: "bc:00:00:00:00:05"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: gi1/0/24
        ip: 10.2.0.2/24
        network: internal
        mac: "bc:00:00:00:00:02"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: gi1/0/48
        ip: 10.3.0.2/24
        network: db-segment
        mac: "bc:00:00:00:00:03"
        speed: 40000
        port_type: qsfp-plus
        status: up
      - id: gi1/0/49
        ip: 10.3.0.4/24
        network: db-segment
        mac: "bc:00:00:00:00:07"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: peer-link
        ip: 10.255.0.2/30
        network: ""
        mac: "bc:00:00:00:00:04"
        speed: 40000
        port_type: qsfp-plus
        status: up
    vpc:
      enabled: true
      peer: core-sw01
      domain: 1
      keepalive: 10.255.0.2

servers:
  - id: web01
    label: Web-01
    type: virtual
    os: Ubuntu 24.04
    cpu: 4
    memory: 8192
    status: running
    x: 100
    y: 380
    width: 130
    height: 65
    interfaces:
      - id: eth0
        ip: 10.1.0.10/24
        ipv6: "2001:db8:1::10/64"
        network: dmz
        mac: "de:ad:00:00:01:01"
        speed: 1000
        port_type: rj45
        status: up
    gateway: 10.1.0.1
    gateway_v6: "2001:db8:1::1"
  - id: web02
    label: Web-02
    type: virtual
    os: Ubuntu 24.04
    cpu: 4
    memory: 8192
    status: running
    x: 750
    y: 380
    width: 130
    height: 65
    interfaces:
      - id: eth0
        ip: 10.1.0.11/24
        network: dmz
        mac: "de:ad:00:00:01:02"
        speed: 1000
        port_type: rj45
        status: up
    gateway: 10.1.0.1
  - id: app01
    label: App-01
    type: virtual
    os: RHEL 9
    cpu: 8
    memory: 16384
    status: running
    x: 100
    y: 640
    width: 130
    height: 65
    interfaces:
      - id: eth0
        ip: 10.2.0.10/24
        network: internal
        mac: "de:ad:00:00:02:01"
        speed: 1000
        port_type: rj45
        status: up
    gateway: 10.2.0.1
  - id: app02
    label: App-02
    type: virtual
    os: RHEL 9
    cpu: 8
    memory: 16384
    status: running
    x: 300
    y: 640
    width: 130
    height: 65
    interfaces:
      - id: eth0
        ip: 10.2.0.11/24
        network: internal
        mac: "de:ad:00:00:02:02"
        speed: 1000
        port_type: rj45
        status: up
    gateway: 10.2.0.1
  - id: db01
    label: DB Primary
    type: physical
    os: Ubuntu 22.04
    cpu: 16
    memory: 65536
    status: running
    x: 560
    y: 640
    width: 150
    height: 70
    interfaces:
      - id: eth0
        ip: 10.3.0.10/24
        ipv6: "2001:db8:3::10/64"
        network: db-segment
        mac: "de:ad:00:00:03:01"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: eth1
        ip: 10.3.0.11/24
        ipv6: "2001:db8:3::11/64"
        network: db-segment
        mac: "de:ad:00:00:03:02"
        speed: 10000
        port_type: sfp-plus
        status: up
    bonding:
      enabled: true
      mode: active-backup
      bond_name: bond0
      members: [eth0, eth1]
      primary: eth0
      bond_ip: 10.3.0.10/24
      bond_ipv6: "2001:db8:3::10/64"
    gateway: 10.3.0.1
    gateway_v6: "2001:db8:3::1"
  - id: db02
    label: DB Replica
    type: physical
    os: Ubuntu 22.04
    cpu: 16
    memory: 65536
    status: running
    x: 750
    y: 640
    width: 150
    height: 70
    interfaces:
      - id: eth0
        ip: 10.3.0.20/24
        network: db-segment
        mac: "de:ad:00:00:03:03"
        speed: 10000
        port_type: sfp-plus
        status: up
    gateway: 10.3.0.1

services:
  - id: nginx-web01
    label: Nginx
    type: reverse_proxy
    server: web01
    status: running
    port: 443
    protocol: HTTPS
    config:
      upstream: [tomcat-app01, tomcat-app02]
      method: round-robin
    depends_on: [tomcat-app01, tomcat-app02]
  - id: nginx-web02
    label: Nginx
    type: reverse_proxy
    server: web02
    status: running
    port: 443
    protocol: HTTPS
    config:
      upstream: [tomcat-app01, tomcat-app02]
      method: round-robin
    depends_on: [tomcat-app01, tomcat-app02]
  - id: tomcat-app01
    label: Tomcat
    type: app_server
    server: app01
    status: running
    port: 8080
    protocol: HTTP
    config:
      runtime: Java 21
      workers: 200
    depends_on: [pg-primary]
  - id: tomcat-app02
    label: Tomcat
    type: app_server
    server: app02
    status: running
    port: 8080
    protocol: HTTP
    config:
      runtime: Java 21
      workers: 200
    depends_on: [pg-primary]
  - id: pg-primary
    label: PostgreSQL
    type: database
    server: db01
    status: running
    port: 5432
    protocol: TCP
    config:
      engine: PostgreSQL 16
      role: primary
      replication_to: [pg-replica]
    depends_on: []
  - id: pg-replica
    label: PostgreSQL
    type: database
    server: db02
    status: running
    port: 5432
    protocol: TCP
    config:
      engine: PostgreSQL 16
      role: replica
    depends_on: [pg-primary]

connections:
  - id: link-fw-sw
    from: {device: fw01, interface: eth2}
    to: {device: core-sw01, interface: gi1/0/1}
    type: fiber
    speed: 10000
    status: up
    traffic: high
    direction: bidirectional
  - id: link-sw1-sw2-peer
    from: {device: core-sw01, interface: peer-link}
    to: {device: core-sw02, interface: peer-link}
    type: port-channel
    speed: 40000
    status: up
    traffic: medium
    direction: bidirectional
  - id: link-sw1-web01
    from: {device: core-sw01, interface: gi1/0/1}
    to: {server: web01, interface: eth0}
    type: ethernet
    speed: 1000
    status: up
    traffic: medium
    direction: bidirectional
  - id: link-sw2-web02
    from: {device: core-sw02, interface: gi1/0/1}
    to: {server: web02, interface: eth0}
    type: ethernet
    speed: 1000
    status: up
    traffic: medium
    direction: bidirectional
  - id: link-sw1-app01
    from: {device: core-sw01, interface: gi1/0/24}
    to: {server: app01, interface: eth0}
    type: ethernet
    speed: 1000
    status: up
    traffic: medium
    direction: bidirectional
  - id: link-sw1-app02
    from: {device: core-sw01, interface: gi1/0/25}
    to: {server: app02, interface: eth0}
    type: ethernet
    speed: 1000
    status: up
    traffic: low
    direction: bidirectional
  - id: link-sw1-db01
    from: {device: core-sw01, interface: gi1/0/48}
    to: {server: db01, interface: eth0}
    type: port-channel
    speed: 10000
    status: up
    traffic: high
    direction: bidirectional
    vpc_id: 10
  - id: link-sw2-db01-bond
    from: {device: core-sw02, interface: gi1/0/48}
    to: {server: db01, interface: eth1}
    type: port-channel
    speed: 10000
    status: up
    traffic: low
    direction: bidirectional
    vpc_id: 10
  - id: link-sw2-db02
    from: {device: core-sw02, interface: gi1/0/49}
    to: {server: db02, interface: eth0}
    type: fiber
    speed: 10000
    status: up
    traffic: low
    direction: forward

routing_tables:
  - device: fw01
    routes:
      - destination: 0.0.0.0/0
        next_hop: 203.0.113.254
        interface: eth1
        metric: 1
        type: static
        status: active
      - destination: 10.1.0.0/24
        next_hop: 0.0.0.0
        interface: eth2
        metric: 0
        type: connected
        status: active
      - destination: 10.2.0.0/24
        next_hop: 10.1.0.2
        interface: eth2
        metric: 10
        type: static
        status: active
      - destination: 10.3.0.0/24
        next_hop: 10.1.0.2
        interface: eth2
        metric: 10
        type: static
        status: active
  - device: core-sw01
    routes:
      - destination: 0.0.0.0/0
        next_hop: 10.1.0.1
        interface: gi1/0/1
        metric: 1
        type: static
        status: active
      - destination: 10.1.0.0/24
        next_hop: 0.0.0.0
        interface: gi1/0/1
        metric: 0
        type: connected
        status: active
      - destination: 10.2.0.0/24
        next_hop: 0.0.0.0
        interface: gi1/0/24
        metric: 0
        type: connected
        status: active
      - destination: 10.3.0.0/24
        next_hop: 0.0.0.0
        interface: gi1/0/48
        metric: 0
        type: connected
        status: active
  - device: core-sw02
    routes:
      - destination: 0.0.0.0/0
        next_hop: 10.255.0.1
        interface: peer-link
        metric: 5
        type: static
        status: active
      - destination: 10.1.0.0/24
        next_hop: 0.0.0.0
        interface: gi1/0/1
        metric: 0
        type: connected
        status: active
      - destination: 10.2.0.0/24
        next_hop: 0.0.0.0
        interface: gi1/0/24
        metric: 0
        type: connected
        status: active
      - destination: 10.3.0.0/24
        next_hop: 0.0.0.0
        interface: gi1/0/48
        metric: 0
        type: connected
        status: active

policies:
  - device: fw01
    rules:
      - id: allow-https-in
        action: allow
        src: 0.0.0.0/0
        dst: 10.1.0.0/24
        protocol: tcp
        dst_port: 443
        log: true
        status: enabled
      - id: allow-internal
        action: allow
        src: 10.0.0.0/8
        dst: 10.0.0.0/8
        protocol: any
        log: false
        status: enabled
      - id: deny-all
        action: deny
        src: 0.0.0.0/0
        dst: 0.0.0.0/0
        protocol: any
        log: true
        status: enabled

scenarios:
  - id: web-access
    label: 外部→Web閲覧フロー
    steps:
      - from: external
        to: nginx-web01
        protocol: HTTPS
        port: 443
        description: クライアントがHTTPSアクセス
      - from: nginx-web01
        to: tomcat-app01
        protocol: HTTP
        port: 8080
        description: Nginxがリバプロでバックエンドへ
      - from: tomcat-app01
        to: pg-primary
        protocol: TCP
        port: 5432
        description: AppがDBに問い合わせ
  - id: db-replication
    label: DBレプリケーション
    steps:
      - from: pg-primary
        to: pg-replica
        protocol: TCP
        port: 5432
        description: WALストリーミングレプリケーション
`;

/* ====== APP STATE ====== */
const App = {
  config: {},
  selected: null,
  view: { x:0, y:0, scale:1 },
  undoStack: [],
  redoStack: [],
  simulation: { running:false, paused:false, speed:1, rafId:null, abort:false },
  connectMode: null,
  logs: [],
  logFilters: { info:true, warn:true, error:true },
  animationsEnabled: (typeof localStorage !== "undefined" && localStorage.getItem("netsim-animations")) !== "off",
  suppressToast: false,
};

const Cfg = {
  c(){ return App.config; },
  ensure(){
    const c = App.config;
    for(const k of ["networks","devices","servers","services","connections","routing_tables","vpn_tunnels","policies","scenarios"])
      if(!Array.isArray(c[k])) c[k] = [];
  },
  byId(kind,id){ return (this.c()[kind]||[]).find(x=>x.id===id); },
  removeById(kind,id){
    const arr = this.c()[kind]||[];
    const i = arr.findIndex(x=>x.id===id);
    if(i>=0) arr.splice(i,1);
  },
  findAny(id){
    if(!id) return null;
    for(const kind of ["devices","servers","services","networks"]){
      const e = (this.c()[kind]||[]).find(x=>x.id===id);
      if(e) return { kind: kind.slice(0,-1), obj:e };
    }
    return null;
  }
};
const kindToCol = (k)=>({network:"networks",device:"devices",server:"servers",service:"services",connection:"connections"})[k];
const kindLabel = (k)=>({device:"デバイス",server:"サーバ",service:"サービス",connection:"接続",network:"ネットワーク"})[k]||k;

/* ====== LOG ====== */
const Log = {
  add(level, msg){
    const entry = { ts: nowStamp(), level, msg };
    App.logs.push(entry);
    if(App.logs.length > 500) App.logs.shift();
    this.render(entry);
  },
  info(m){ this.add("info", m); },
  warn(m){ this.add("warn", m); },
  error(m){ this.add("error", m); },
  render(entry){
    if(!App.logFilters[entry.level]) return;
    const body = $("#log-body"); if(!body) return;
    const div = ch("div", { class:"log-entry "+entry.level });
    div.innerHTML = `<span class="ts">[${entry.ts}]</span> <span class="lvl">[${entry.level.toUpperCase()}]</span> ${escapeHtml(entry.msg)}`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  },
  refresh(){
    const body = $("#log-body"); body.innerHTML = "";
    for(const e of App.logs) this.render(e);
  },
  clear(){ App.logs = []; $("#log-body").innerHTML = ""; }
};

/* ====== IP UTILS (IPv4 + IPv6 dual-stack) ====== */
function ipFamily(ip){
  if(!ip) return null;
  const a = String(ip).split("/")[0];
  if(a.includes(":")) return "v6";
  if(a.includes(".")) return "v4";
  return null;
}
function ipOnly(s){ return s ? String(s).split("/")[0] : null; }
function ipToInt(ip){
  // IPv4 only — for compatibility with old callers
  if(!ip) return 0;
  ip = ipOnly(ip);
  if(!ip || ip.includes(":")) return 0;
  const p = ip.split(".").map(n=>parseInt(n,10));
  if(p.length!==4 || p.some(x=>isNaN(x))) return 0;
  return ((p[0]<<24)>>>0)+((p[1]<<16)>>>0)+((p[2]<<8)>>>0)+p[3];
}
function cidrBits(cidr){
  if(!cidr) return 0;
  const p = String(cidr).split("/");
  if(p.length === 2) return parseInt(p[1],10);
  // No /N specified — default by family
  return ipFamily(cidr) === "v6" ? 128 : 32;
}
function expandIPv6(ip){
  // Expand "::" and return array of 8 lowercased hex groups
  if(!ip) return null;
  ip = String(ip).split("/")[0].toLowerCase();
  if(!ip.includes(":")) return null;
  // IPv4-mapped (e.g. ::ffff:1.2.3.4) — convert tail
  const v4match = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if(v4match){
    const v4 = v4match[2].split(".").map(n=>parseInt(n,10));
    if(v4.length === 4){
      const hi = ((v4[0]<<8)|v4[1]).toString(16);
      const lo = ((v4[2]<<8)|v4[3]).toString(16);
      ip = v4match[1] + hi + ":" + lo;
    }
  }
  // Split on "::"
  let parts;
  if(ip.includes("::")){
    const halves = ip.split("::");
    if(halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if(missing < 0) return null;
    parts = [...left, ...new Array(missing).fill("0"), ...right];
  } else {
    parts = ip.split(":");
  }
  if(parts.length !== 8) return null;
  // Normalize each group: hex 1-4 chars
  const out = [];
  for(const p of parts){
    if(!/^[0-9a-f]{1,4}$/.test(p)) return null;
    out.push(p);
  }
  return out;
}
function ipv6ToBigInt(ip){
  const groups = expandIPv6(ip);
  if(!groups) return null;
  let n = 0n;
  for(const g of groups) n = (n << 16n) | BigInt(parseInt(g, 16));
  return n;
}
function inSubnet(ip, cidr){
  if(!ip||!cidr) return false;
  const ipFam = ipFamily(ip);
  const cidrFam = ipFamily(cidr);
  if(ipFam !== cidrFam) return false;
  const bits = cidrBits(cidr);
  if(ipFam === "v4"){
    if(bits === 0) return true;
    if(bits < 0 || bits > 32) return false;
    const mask = ((0xffffffff << (32-bits)) >>> 0);
    return (ipToInt(ip) & mask) === (ipToInt(cidr) & mask);
  }
  if(ipFam === "v6"){
    if(bits === 0) return true;
    if(bits < 0 || bits > 128) return false;
    const a = ipv6ToBigInt(ip);
    const b = ipv6ToBigInt(cidr);
    if(a == null || b == null) return false;
    const shift = BigInt(128 - bits);
    return (a >> shift) === (b >> shift);
  }
  return false;
}
// Return all addresses (v4 and v6) on an interface as array of "ip/cidr" strings
function ifaceAddresses(iface){
  if(!iface) return [];
  const a = [];
  if(iface.ip) a.push(iface.ip);
  if(iface.ipv6) a.push(iface.ipv6);
  return a;
}
// Pick first address on an interface matching the family ("v4" or "v6")
function ifaceAddrByFamily(iface, family){
  for(const a of ifaceAddresses(iface)){
    if(ipFamily(a) === family) return a;
  }
  return null;
}
// Return all addresses on an element (handling bonding)
function elementAllAddresses(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return [];
  const out = [];
  // Bonded IP can be v4 or v6
  if(obj.bonding && obj.bonding.enabled){
    if(obj.bonding.bond_ip) out.push(obj.bonding.bond_ip);
    if(obj.bonding.bond_ipv6) out.push(obj.bonding.bond_ipv6);
    // Plus IPs on non-bond interfaces
    const members = new Set(obj.bonding.members||[]);
    for(const i of (obj.interfaces||[])){
      if(members.has(i.id)) continue;
      out.push(...ifaceAddresses(i));
    }
  } else {
    for(const i of (obj.interfaces||[])){
      out.push(...ifaceAddresses(i));
    }
  }
  return out;
}

/* ====== MAC ADDRESS UTILS ====== */
// Generate a random locally-administered unicast MAC (QEMU/KVM style 52:54:00 prefix)
function genMacAddress(){
  const r = ()=> Math.floor(Math.random()*256).toString(16).padStart(2,"0");
  return `52:54:00:${r()}:${r()}:${r()}`;
}
function normalizeMac(m){
  return m ? String(m).toLowerCase().replace(/-/g,":").replace(/\s+/g,"") : "";
}
function collectUsedMacs(){
  const set = new Set();
  for(const d of (App.config.devices||[])){
    for(const i of (d.interfaces||[])){ if(i.mac) set.add(normalizeMac(i.mac)); }
  }
  for(const s of (App.config.servers||[])){
    for(const i of (s.interfaces||[])){ if(i.mac) set.add(normalizeMac(i.mac)); }
  }
  return set;
}
function genUniqueMac(){
  const used = collectUsedMacs();
  let m = genMacAddress();
  let tries = 0;
  while(used.has(normalizeMac(m)) && tries < 200){ m = genMacAddress(); tries++; }
  return m;
}
// Detect MAC collisions across all interfaces. Returns array of { mac, locations: [{kind,id,iface}, ...] }
function findMacCollisions(){
  const map = {};
  function record(mac, location){
    if(!mac) return;
    const k = normalizeMac(mac);
    if(!k) return;
    map[k] = map[k] || [];
    map[k].push(location);
  }
  for(const d of (App.config.devices||[]))
    for(const i of (d.interfaces||[]))
      record(i.mac, { kind:"device", id:d.id, iface:i.id });
  for(const s of (App.config.servers||[]))
    for(const i of (s.interfaces||[]))
      record(i.mac, { kind:"server", id:s.id, iface:i.id });
  const cols = [];
  for(const k in map) if(map[k].length > 1) cols.push({ mac:k, locations: map[k] });
  return cols;
}
// Is an interface in a MAC collision?
function ifaceHasMacCollision(obj, ifaceId){
  if(!obj) return false;
  const me = (obj.interfaces||[]).find(i=>i.id===ifaceId);
  if(!me || !me.mac) return false;
  const mk = normalizeMac(me.mac);
  let count = 0;
  for(const d of (App.config.devices||[])){
    for(const i of (d.interfaces||[])){
      if(normalizeMac(i.mac||"") === mk) count++;
      if(count > 1) return true;
    }
  }
  for(const s of (App.config.servers||[])){
    for(const i of (s.interfaces||[])){
      if(normalizeMac(i.mac||"") === mk) count++;
      if(count > 1) return true;
    }
  }
  return false;
}

/* ====== UNDO/REDO ====== */
function pushUndo(){
  App.undoStack.push(JSON.stringify(App.config));
  if(App.undoStack.length>50) App.undoStack.shift();
  App.redoStack = [];
}
function undo(){
  if(!App.undoStack.length) return;
  App.redoStack.push(JSON.stringify(App.config));
  App.config = JSON.parse(App.undoStack.pop());
  Cfg.ensure();
  syncYamlFromConfig(); render(); updateStatusBar(); refreshScenarioSelect();
  if(App.selected) openPropertyPanel();
  Log.info("Undo");
}
function redo(){
  if(!App.redoStack.length) return;
  App.undoStack.push(JSON.stringify(App.config));
  App.config = JSON.parse(App.redoStack.pop());
  Cfg.ensure();
  syncYamlFromConfig(); render(); updateStatusBar(); refreshScenarioSelect();
  if(App.selected) openPropertyPanel();
  Log.info("Redo");
}

/* ====== YAML SYNC ====== */
function syncConfigFromYaml(){
  try{
    const txt = $("#yaml-editor").value;
    const parsed = YAML.parse(txt) || {};
    App.config = parsed;
    Cfg.ensure();
    $("#yaml-status").style.color = "var(--green)";
    $("#yaml-status").textContent = "●";
    return true;
  } catch(e){
    $("#yaml-status").style.color = "var(--red)";
    $("#yaml-status").textContent = "✗";
    Log.error("YAML parse error: "+e.message);
    return false;
  }
}
function syncYamlFromConfig(){
  $("#yaml-editor").value = YAML.stringify(App.config);
}

