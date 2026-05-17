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
    type: fiber
    speed: 10000
    status: up
    traffic: high
    direction: bidirectional
  - id: link-sw2-db02
    from: {device: core-sw02, interface: gi1/0/48}
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

/* ====== RENDERING ====== */
function render(){
  $("#layer-networks").innerHTML = "";
  $("#layer-connections").innerHTML = "";
  $("#layer-elements").innerHTML = "";
  // overlays/packets not cleared here
  ensureArrowMarkers();
  Cfg.ensure();
  for(const n of App.config.networks) renderNetwork(n);
  for(const c of App.config.connections) renderConnection(c);
  renderVpcOverlay();
  for(const d of App.config.devices) renderDevice(d);
  for(const s of App.config.servers) renderServer(s);
  applyViewBox();
}

function applyViewBox(){
  const v = App.view;
  const svg = $("#svg");
  const w = svg.clientWidth || 1200;
  const h = svg.clientHeight || 800;
  const vbW = w / v.scale;
  const vbH = h / v.scale;
  svg.setAttribute("viewBox", `${v.x} ${v.y} ${vbW} ${vbH}`);
}

function renderNetwork(n){
  const g = ce("g", {
    "class":"element network",
    "data-kind":"network", "data-id":n.id,
    "transform":`translate(${n.x||0},${n.y||0})`
  }, $("#layer-networks"));
  const kind = n.kind || (n.type === "vxlan" || n.type === "vpn-overlay" ? "virtual" : "physical");
  ce("rect", {
    "class":"body network-rect kind-"+kind,
    x:0, y:0, width:n.width||300, height:n.height||200,
    rx:6, ry:6,
    fill: n.color || "rgba(100,150,250,0.08)"
  }, g);
  const lblParts = [n.label || n.id];
  if(n.cidr) lblParts.push(n.cidr);
  if(n.cidr_v6) lblParts.push(n.cidr_v6);
  const lbl = lblParts.join("  ·  ");
  ce("text", { "class":"network-label", x:10, y:18, text:lbl }, g);
  // VLAN badge
  let badgeX = 10;
  if(n.vlan_id!==undefined && n.vlan_id!==null){
    ce("rect", { x:badgeX, y:24, width:60, height:14, rx:7, ry:7,
      fill:"rgba(88,166,255,0.15)", stroke:"var(--accent)", "stroke-width":0.5 }, g);
    ce("text", { x:badgeX+30, y:31, text:"VLAN "+n.vlan_id,
      "text-anchor":"middle","dominant-baseline":"middle",
      "font-size":"9","fill":"var(--accent)","font-family":"monospace" }, g);
    badgeX += 66;
  }
  // Physical/Virtual badge
  ce("rect", { "class":"net-kind-badge-bg "+kind, x:badgeX, y:24, width:48, height:14 }, g);
  ce("text", { "class":"net-kind-badge "+kind, x:badgeX+24, y:31, text: kind==="physical"?"PHY":"VRT" }, g);
  if(App.selected && App.selected.kind==="network" && App.selected.id===n.id){
    g.classList.add("selected");
    addResizeHandles(g, n.width||300, n.height||200);
  }
  attachElementHandlers(g, "network", n.id);
}

/* ====== INTERFACE PORT POSITIONING & RENDERING ====== */
function autoPortType(speed){
  if(!speed) return "rj45";
  if(speed >= 100000) return "qsfp28";
  if(speed >= 40000) return "qsfp-plus";
  if(speed >= 10000) return "sfp-plus";
  if(speed >= 1000) return "rj45";
  return "rj45";
}
function portTypeKey(iface){
  return (iface.port_type || autoPortType(iface.speed||1000))
    .toLowerCase().replace(/\+/g,"-plus").replace(/[^a-z0-9-]/g,"-");
}
function portTypeLabel(iface){
  const t = portTypeKey(iface);
  return ({
    "rj45":"RJ45","sfp":"SFP","sfp-plus":"SFP+",
    "qsfp":"QSFP","qsfp-plus":"QSFP+","qsfp28":"QSFP28",
    "console":"CON","mgmt":"MGMT"
  })[t] || t.toUpperCase();
}
function portTypeShape(iface){
  const t = portTypeKey(iface);
  if(t.startsWith("sfp") || t.startsWith("qsfp")) return "trapezoid";
  if(t === "console" || t === "mgmt") return "circle";
  return "rect";
}

// Compute port positions in local coords (relative to element top-left)
// Servers: ports on top edge; Devices: ports on bottom edge. Split to opposite edge if many.
function computePortPositions(obj, kind){
  const w = obj.width || (kind==="server"?130:120);
  const h = obj.height || (kind==="server"?65:70);
  const ifs = obj.interfaces || [];
  const portW = 20, portH = 10;     // bigger ports for full type labels
  const inset = 6;
  const result = new Array(ifs.length);
  if(!ifs.length) return result;

  function buildPos(side, offset){
    offset = Math.max(0, Math.min(1, offset));
    let x, y, outX, outY, cx, cy;
    if(side === "top"){
      const usable = Math.max(20, w - inset*2);
      cx = inset + usable * offset;
      x = cx - portW/2;
      y = -portH + 3;
      outX = cx;
      outY = -portH + 3;
      cy = y + portH/2;
    } else if(side === "bottom"){
      const usable = Math.max(20, w - inset*2);
      cx = inset + usable * offset;
      x = cx - portW/2;
      y = h - 3;
      outX = cx;
      outY = h + portH - 3;
      cy = y + portH/2;
    } else if(side === "left"){
      const usable = Math.max(20, h - inset*2);
      cy = inset + usable * offset;
      // For vertical sides, swap port dimensions: tall rect
      y = cy - portW/2;
      x = -portH + 3;
      outX = -portH + 3;
      outY = cy;
      cx = x + portH/2;
      return { x, y, w: portH, h: portW, side, cx, cy, outX, outY };
    } else if(side === "right"){
      const usable = Math.max(20, h - inset*2);
      cy = inset + usable * offset;
      y = cy - portW/2;
      x = w - 3;
      outX = w + portH - 3;
      outY = cy;
      cx = x + portH/2;
      return { x, y, w: portH, h: portW, side, cx, cy, outX, outY };
    }
    return { x, y, w: portW, h: portH, side, cx, cy, outX, outY };
  }

  // Separate explicitly-positioned and auto interfaces
  const autoIdxs = [];
  const explicitOnSide = { top:[], bottom:[], left:[], right:[] };
  for(let i = 0; i < ifs.length; i++){
    const pp = ifs[i].port_position;
    if(pp && pp.side && (pp.offset !== undefined)){
      explicitOnSide[pp.side] = explicitOnSide[pp.side] || [];
      explicitOnSide[pp.side].push({ i, off: pp.offset });
      result[i] = buildPos(pp.side, pp.offset);
      result[i].ifaceIdx = i;
      result[i].explicit = true;
    } else {
      autoIdxs.push(i);
    }
  }

  // Auto-layout remaining: distribute across primary side (and opposite if too many)
  const primarySide = (kind === "server") ? "top" : "bottom";
  const oppositeSide = (kind === "server") ? "bottom" : "top";
  const usableW = Math.max(20, w - inset*2);
  const maxPerEdge = Math.max(1, Math.floor(usableW / (portW + 4)));

  let topN, botN;
  if(autoIdxs.length <= maxPerEdge){
    if(primarySide === "top"){ topN = autoIdxs.length; botN = 0; }
    else { topN = 0; botN = autoIdxs.length; }
  } else {
    const half = Math.ceil(autoIdxs.length / 2);
    if(primarySide === "top"){ topN = half; botN = autoIdxs.length - half; }
    else { botN = half; topN = autoIdxs.length - half; }
  }

  function placeAuto(startK, count, side){
    if(count === 0) return;
    for(let k = 0; k < count; k++){
      const offset = count === 1 ? 0.5 : (k + 0.5) / count;
      const ifIdx = autoIdxs[startK + k];
      result[ifIdx] = buildPos(side, offset);
      result[ifIdx].ifaceIdx = ifIdx;
    }
  }
  placeAuto(0, topN, "top");
  placeAuto(topN, botN, "bottom");

  return result;
}

function renderPorts(g, obj, kind){
  const positions = computePortPositions(obj, kind);
  for(let i = 0; i < positions.length; i++){
    const p = positions[i];
    if(!p) continue;
    const iface = obj.interfaces[i];
    const typeKey = portTypeKey(iface);
    const status = iface.status || "up";
    const linked = (App.config.connections||[]).some(c=>
      ((c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===iface.id) ||
       (c.to && (c.to.device===obj.id||c.to.server===obj.id) && c.to.interface===iface.id))
    );
    const cls = "iface-port port-"+typeKey + (linked?" linked":"") + (status==="down"?" down":"");
    const shape = portTypeShape(iface);

    // Draw port shape
    if(shape === "trapezoid"){
      const indent = 2;
      let pts;
      if(p.side === "bottom"){
        pts = `${p.x+indent},${p.y} ${p.x+p.w-indent},${p.y} ${p.x+p.w},${p.y+p.h} ${p.x},${p.y+p.h}`;
      } else if(p.side === "top"){
        pts = `${p.x},${p.y} ${p.x+p.w},${p.y} ${p.x+p.w-indent},${p.y+p.h} ${p.x+indent},${p.y+p.h}`;
      } else if(p.side === "left"){
        pts = `${p.x},${p.y+indent} ${p.x+p.w},${p.y} ${p.x+p.w},${p.y+p.h} ${p.x},${p.y+p.h-indent}`;
      } else { // right
        pts = `${p.x},${p.y} ${p.x+p.w},${p.y+indent} ${p.x+p.w},${p.y+p.h-indent} ${p.x},${p.y+p.h}`;
      }
      ce("polygon", { "class": cls, points: pts }, g);
    } else if(shape === "circle"){
      ce("circle", { "class": cls, cx:p.cx, cy:p.cy, r: Math.min(p.w,p.h)/2 }, g);
    } else {
      ce("rect", { "class": cls, x:p.x, y:p.y, width:p.w, height:p.h, rx:1.5 }, g);
    }

    // Full type label (RJ45, SFP+, QSFP28, etc) - inside the port if it fits horizontally
    const typeBadge = portTypeLabel(iface);
    // For horizontal ports (top/bottom) put full label inside; for vertical (left/right) put outside
    if(p.side === "top" || p.side === "bottom"){
      ce("text", { "class":"port-type-badge", x:p.cx, y:p.cy+0.5, text: typeBadge }, g);
    } else {
      // Vertical port - small dot inside, type label outside
      ce("circle", { fill:"#fff", cx:p.cx, cy:p.cy, r:1.5, "pointer-events":"none" }, g);
    }

    // Interface ID label OUTSIDE port (e.g. "gi1/0/1", "eth0")
    let lblX, lblY, lblAnchor = "middle", lblBaseline = "middle";
    const pad = 4;
    if(p.side === "bottom"){
      lblX = p.cx; lblY = p.y + p.h + pad + 5; lblBaseline = "hanging";
    } else if(p.side === "top"){
      lblX = p.cx; lblY = p.y - pad; lblBaseline = "auto";
    } else if(p.side === "left"){
      lblX = p.x - pad; lblY = p.cy; lblAnchor = "end"; lblBaseline = "middle";
    } else { // right
      lblX = p.x + p.w + pad; lblY = p.cy; lblAnchor = "start"; lblBaseline = "middle";
    }
    const lbl = ce("text", { "class":"iface-port-label", x:lblX, y:lblY, text:iface.id }, g);
    lbl.setAttribute("text-anchor", lblAnchor);
    lbl.setAttribute("dominant-baseline", lblBaseline);

    // Type label outside port (in addition to inside) for left/right sides
    if(p.side === "left" || p.side === "right"){
      let tlX, tlY;
      if(p.side === "left"){ tlX = p.x - pad; tlY = p.cy + 9; }
      else { tlX = p.x + p.w + pad; tlY = p.cy + 9; }
      const tl = ce("text", { "class":"iface-port-type", x:tlX, y:tlY, text:typeBadge }, g);
      tl.setAttribute("text-anchor", p.side === "left" ? "end" : "start");
    }

    // Hit area (extends out from port for easier clicking + dragging)
    let hitX, hitY, hitW, hitH;
    if(p.side === "top" || p.side === "bottom"){
      hitX = p.x - 3; hitY = p.y - 3; hitW = p.w + 6; hitH = p.h + 18;
      if(p.side === "top") hitY = p.y - 16;
    } else {
      hitX = p.x - 3; hitY = p.y - 3; hitW = p.w + 18; hitH = p.h + 6;
      if(p.side === "left") hitX = p.x - 16;
    }
    const hit = ce("rect", {
      "class":"iface-port-hit",
      x:hitX, y:hitY, width:hitW, height:hitH
    }, g);
    hit.addEventListener("mouseenter",(e)=>showTooltip(e, formatPortTooltip(iface)));
    hit.addEventListener("mouseleave",hideTooltip);
    hit.addEventListener("mousemove",moveTooltip);
    hit.addEventListener("mousedown",(e)=>{
      if(e.button !== 0) return;
      if(App.connectMode) return;
      e.stopPropagation();
      // Begin port drag - update port_position on move
      dragState = {
        mode: "port",
        obj, kind,
        ifaceIdx: i,
        moved: false,
        origPos: iface.port_position ? JSON.parse(JSON.stringify(iface.port_position)) : null
      };
    });
    hit.addEventListener("click",(e)=>{
      e.stopPropagation();
      if(!dragState || !dragState.moved){
        selectElement(kind, obj.id); openPropertyPanel();
      }
    });
  }
  return positions;
}

function formatPortTooltip(iface){
  const t = portTypeLabel(iface);
  let s = `Interface: ${iface.id}\n`;
  s += `Type: ${t}\n`;
  if(iface.ip) s += `IPv4: ${iface.ip}\n`;
  if(iface.ipv6) s += `IPv6: ${iface.ipv6}\n`;
  if(iface.mac) s += `MAC: ${iface.mac}\n`;
  if(iface.speed) s += `Speed: ${iface.speed >= 1000 ? (iface.speed/1000)+"G" : iface.speed+"M"}\n`;
  if(iface.network) s += `Network: ${iface.network}\n`;
  s += `Status: ${iface.status||"up"}`;
  return s;
}

// Draw visible bonding bracket connecting bonded ports — works for ports on any side
function renderBondOverlay(g, obj, kind){
  if(!obj.bonding || !obj.bonding.enabled) return;
  const members = obj.bonding.members || [];
  if(members.length < 2) return;
  const positions = computePortPositions(obj, kind);
  const memberPositions = [];
  for(const mid of members){
    const idx = (obj.interfaces||[]).findIndex(i=>i.id===mid);
    if(idx >= 0 && positions[idx]) memberPositions.push(positions[idx]);
  }
  if(memberPositions.length < 2) return;
  const w = obj.width || (kind==="server"?130:120);
  const h = obj.height || (kind==="server"?65:70);
  // Convergence point: center of body
  const conv = { x: w/2, y: h/2 };
  // For each port, find its "inner" point (the body-side of the port) and draw a path to convergence
  for(const p of memberPositions){
    let inner;
    if(p.side === "bottom") inner = { x:p.cx, y:p.y };
    else if(p.side === "top") inner = { x:p.cx, y:p.y + p.h };
    else if(p.side === "left") inner = { x:p.x + p.w, y:p.cy };
    else inner = { x:p.x, y:p.cy };
    // L-shape route from inner to convergence
    ce("path", { "class":"bond-link",
      d: `M ${inner.x} ${inner.y} L ${inner.x} ${conv.y} L ${conv.x} ${conv.y}` }, g);
  }
  // Bond label at convergence
  const bondLbl = (obj.bonding.bond_name||"bond0") + (obj.bonding.mode ? " ["+(obj.bonding.mode.replace("active-backup","A/B"))+"]" : "");
  const lblW = bondLbl.length * 5.5 + 10;
  ce("rect", { "class":"bond-label-bg", x: conv.x - lblW/2, y: conv.y - 7, width: lblW, height: 14, rx:7, ry:7 }, g);
  ce("text", { "class":"bond-label", x: conv.x, y: conv.y, text: bondLbl }, g);
}

// vPC peer-link: drawn as overlay between two devices that are vPC-paired
function renderVpcOverlay(){
  // Render on the connections layer (overlays drawn after connections so they appear above)
  const layer = $("#layer-connections");
  const drawn = new Set();
  for(const d of (App.config.devices||[])){
    if(!d.vpc || !d.vpc.enabled || !d.vpc.peer) continue;
    const peerId = d.vpc.peer;
    if(drawn.has(d.id+"-"+peerId) || drawn.has(peerId+"-"+d.id)) continue;
    drawn.add(d.id+"-"+peerId);
    const peer = Cfg.byId("devices", peerId);
    if(!peer) continue;
    // Draw line between centers, slightly above
    const cx1 = (d.x||0) + (d.width||120)/2;
    const cy1 = (d.y||0) + (d.height||70)/2;
    const cx2 = (peer.x||0) + (peer.width||120)/2;
    const cy2 = (peer.y||0) + (peer.height||70)/2;
    const g = ce("g", { class:"vpc-overlay" }, layer);
    ce("line", { "class":"vpc-link", x1:cx1, y1:cy1, x2:cx2, y2:cy2 }, g);
    const mx = (cx1+cx2)/2, my = (cy1+cy2)/2;
    const lblText = "vPC-"+(d.vpc.domain || 1);
    const lblW = lblText.length * 6 + 10;
    ce("rect", { "class":"vpc-label-bg", x: mx-lblW/2, y: my-8, width: lblW, height:16, rx:8, ry:8 }, g);
    ce("text", { "class":"vpc-label", x: mx, y: my, text: lblText }, g);
  }
}

function drawDeviceIcon(g, type, w, h){
  const cx = w/2, cy = (h-14)/2 + 4;
  switch(type){
    case "router":
      ce("circle", { cx, cy, r:13, fill:"rgba(88,166,255,0.2)", stroke:"var(--accent)","stroke-width":1.5 }, g);
      ce("path", { d:`M ${cx-9} ${cy} L ${cx+9} ${cy} M ${cx} ${cy-9} L ${cx} ${cy+9} M ${cx-9} ${cy} L ${cx-5} ${cy-3} M ${cx-9} ${cy} L ${cx-5} ${cy+3} M ${cx+9} ${cy} L ${cx+5} ${cy-3} M ${cx+9} ${cy} L ${cx+5} ${cy+3} M ${cx} ${cy-9} L ${cx-3} ${cy-5} M ${cx} ${cy-9} L ${cx+3} ${cy-5} M ${cx} ${cy+9} L ${cx-3} ${cy+5} M ${cx} ${cy+9} L ${cx+3} ${cy+5}`,
        stroke:"var(--accent)","stroke-width":1.3, fill:"none","stroke-linecap":"round" }, g);
      break;
    case "l3switch":
      ce("rect", { x:cx-17, y:cy-11, width:34, height:22, rx:3, ry:3,
        fill:"rgba(163,113,247,0.2)", stroke:"var(--purple)","stroke-width":1.5 }, g);
      ce("path", { d:`M ${cx-12} ${cy-5} L ${cx-2} ${cy-5} L ${cx-5} ${cy-8} M ${cx-2} ${cy-5} L ${cx-5} ${cy-2}`,
        stroke:"var(--purple)","stroke-width":1.3, fill:"none","stroke-linecap":"round" }, g);
      ce("path", { d:`M ${cx+12} ${cy+5} L ${cx+2} ${cy+5} L ${cx+5} ${cy+8} M ${cx+2} ${cy+5} L ${cx+5} ${cy+2}`,
        stroke:"var(--purple)","stroke-width":1.3, fill:"none","stroke-linecap":"round" }, g);
      break;
    case "l2switch":
      ce("rect", { x:cx-17, y:cy-9, width:34, height:18, rx:3, ry:3,
        fill:"rgba(57,197,207,0.18)", stroke:"var(--cyan)","stroke-width":1.5 }, g);
      for(let i=0;i<5;i++) ce("rect", { x:cx-14+i*6, y:cy-2, width:3, height:4,
        fill:"var(--cyan)","stroke":"none" }, g);
      break;
    case "firewall":
      ce("path", { d:`M ${cx} ${cy-14} L ${cx-13} ${cy-9} L ${cx-13} ${cy-1} Q ${cx-13} ${cy+9} ${cx} ${cy+13} Q ${cx+13} ${cy+9} ${cx+13} ${cy-1} L ${cx+13} ${cy-9} Z`,
        fill:"rgba(248,81,73,0.2)", stroke:"var(--red)","stroke-width":1.5 }, g);
      ce("path", { d:`M ${cx-3} ${cy-7} Q ${cx+1} ${cy-3} ${cx-1} ${cy+1} Q ${cx+3} ${cy} ${cx+4} ${cy+5} Q ${cx+6} ${cy-1} ${cx+3} ${cy-6} Q ${cx+1} ${cy-3} ${cx-3} ${cy-7} Z`,
        fill:"var(--orange)", stroke:"var(--red)","stroke-width":0.8 }, g);
      break;
    case "loadbalancer":
      ce("circle", { cx, cy, r:12, fill:"rgba(63,185,80,0.15)", stroke:"var(--green)","stroke-width":1.5 }, g);
      ce("path", { d:`M ${cx-8} ${cy-5} L ${cx} ${cy} L ${cx-8} ${cy+5} M ${cx} ${cy} L ${cx+8} ${cy-5} M ${cx} ${cy} L ${cx+8} ${cy+5}`,
        stroke:"var(--green)","stroke-width":1.4, fill:"none","stroke-linecap":"round","stroke-linejoin":"round" }, g);
      break;
    case "waf":
      ce("path", { d:`M ${cx} ${cy-13} L ${cx-12} ${cy-9} L ${cx-12} ${cy+1} Q ${cx-12} ${cy+9} ${cx} ${cy+13} Q ${cx+12} ${cy+9} ${cx+12} ${cy+1} L ${cx+12} ${cy-9} Z`,
        fill:"rgba(163,113,247,0.2)", stroke:"var(--purple)","stroke-width":1.5 }, g);
      ce("text", { x:cx, y:cy+1, text:"W","text-anchor":"middle","dominant-baseline":"middle",
        "font-size":"11","fill":"var(--purple)","font-weight":"700","font-family":"monospace" }, g);
      break;
    default:
      ce("rect", { x:cx-12, y:cy-10, width:24, height:20, rx:3, ry:3,
        fill:"rgba(140,140,140,0.2)", stroke:"var(--grey)","stroke-width":1.5 }, g);
  }
}

function renderDevice(d){
  const g = ce("g", {
    "class":"element device status-"+(d.status||"running"),
    "data-kind":"device","data-id":d.id,
    "transform":`translate(${d.x||0},${d.y||0})`
  }, $("#layer-elements"));
  const w = d.width||120, h = d.height||70;
  ce("rect", { "class":"body device-body", x:0, y:0, width:w, height:h, rx:6, ry:6 }, g);
  drawDeviceIcon(g, d.type, w, h);
  ce("text", { "class":"element-label", x:w/2, y:h-7, text:d.label||d.id }, g);
  renderStatusLed(g, w-9, 9, d.status);
  // Interface ports (bottom edge for devices)
  renderPorts(g, d, "device");
  // Bonding bracket (if applicable)
  renderBondOverlay(g, d, "device");
  if(App.selected && App.selected.kind==="device" && App.selected.id===d.id){
    g.classList.add("selected");
    addResizeHandles(g, w, h);
  }
  attachElementHandlers(g, "device", d.id);
}

function drawServerIcon(g, type, x, y){
  if(type === "container"){
    ce("rect", { x:x-2, y:y-2, width:14, height:11, rx:1.5, ry:1.5,
      fill:"rgba(57,197,207,0.3)", stroke:"var(--cyan)","stroke-width":0.9 }, g);
    ce("rect", { x:x-1, y:y-1, width:5, height:2.5, fill:"var(--cyan)" }, g);
    ce("rect", { x:x+5, y:y-1, width:5, height:2.5, fill:"var(--cyan)" }, g);
    ce("rect", { x:x-1, y:y+3, width:11, height:2, fill:"var(--cyan)","opacity":0.7 }, g);
  } else if(type === "virtual"){
    ce("path", { d:`M ${x-2} ${y+6} Q ${x-4} ${y+6} ${x-4} ${y+3} Q ${x-4} ${y} ${x-1} ${y} Q ${x+1} ${y-3} ${x+5} ${y-1} Q ${x+9} ${y-2} ${x+10} ${y+2} Q ${x+13} ${y+4} ${x+10} ${y+6} Z`,
      fill:"rgba(88,166,255,0.25)", stroke:"var(--accent)","stroke-width":0.9 }, g);
    ce("text", { x:x+5, y:y+4, text:"VM","text-anchor":"middle","dominant-baseline":"middle",
      "font-size":"6.5","fill":"var(--accent)","font-weight":"700","font-family":"monospace","pointer-events":"none" }, g);
  } else {
    ce("rect", { x, y, width:12, height:11, rx:1, ry:1,
      fill:"rgba(140,140,140,0.3)", stroke:"var(--text-dim)","stroke-width":0.9 }, g);
    for(let i=0;i<3;i++){
      ce("rect", { x:x+1.5, y:y+1.5+i*3, width:9, height:1.8,
        fill:"rgba(255,255,255,0.18)" }, g);
      ce("circle", { cx:x+10.5, cy:y+2.4+i*3, r:0.5, fill:"var(--green)" }, g);
    }
  }
}

function renderServer(s){
  const g = ce("g", {
    "class":"element server status-"+(s.status||"running"),
    "data-kind":"server","data-id":s.id,
    "transform":`translate(${s.x||0},${s.y||0})`
  }, $("#layer-elements"));
  const w = s.width||130, h = s.height||65;
  ce("rect", { "class":"body server-body", x:0, y:0, width:w, height:h, rx:6, ry:6 }, g);
  drawServerIcon(g, s.type, 9, 9);
  ce("text", { "class":"element-label", x:w/2, y:16, text:s.label||s.id, "font-size":"11" }, g);
  ce("text", { "class":"element-sublabel", x:w/2, y:28, text:s.os||"" }, g);

  // Services
  const services = (App.config.services||[]).filter(sv=>sv.server===s.id);
  const startY = h - 16;
  const colCount = Math.max(1, Math.floor((w-12)/22));
  for(let i=0; i<services.length; i++){
    const sv = services[i];
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const x = 6 + col*22;
    const y = startY - row*14;
    renderServiceMini(g, sv, x, y, 20, 12);
  }

  renderStatusLed(g, w-9, 9, s.status);
  // Interface ports (top edge for servers)
  renderPorts(g, s, "server");
  // Bonding bracket
  renderBondOverlay(g, s, "server");

  if(App.selected && App.selected.kind==="server" && App.selected.id===s.id){
    g.classList.add("selected");
    addResizeHandles(g, w, h);
  }
  attachElementHandlers(g, "server", s.id);
}

function renderServiceMini(parent, sv, x, y, w, h){
  const g = ce("g", {
    "class":"svc-mini "+(sv.status||"running"),
    "data-kind":"service","data-id":sv.id,
    "transform":`translate(${x},${y})`
  }, parent);
  ce("rect", { "class":"svc-rect", x:0, y:0, width:w, height:h, rx:3, ry:3 }, g);
  ce("text", { "class":"svc-mini-label", x:w/2, y:h/2+0.5, text:serviceAbbr(sv) }, g);
  g.addEventListener("mouseenter", (e)=>showTooltip(e, formatServiceTooltip(sv)));
  g.addEventListener("mouseleave", hideTooltip);
  g.addEventListener("mousemove", moveTooltip);
  g.addEventListener("click", (e)=>{ e.stopPropagation(); selectElement("service", sv.id); });
  g.addEventListener("contextmenu", (e)=>{ e.preventDefault(); e.stopPropagation(); showContextMenu(e,"service",sv.id); });
  g.addEventListener("dblclick", (e)=>{ e.stopPropagation(); selectElement("service", sv.id); openPropertyPanel(); });
}

function serviceAbbr(sv){
  if(sv.label){
    const w = sv.label.replace(/[^A-Za-z0-9]/g,"");
    if(w.length>=3) return w.slice(0,3).toUpperCase();
    if(w.length>0) return (w.toUpperCase()+"···").slice(0,3);
  }
  const m = {
    reverse_proxy:"RP", forward_proxy:"FP", web_server:"WEB",
    app_server:"APP", database:"DB", cache:"CCH", mq:"MQ",
    dns:"DNS", dhcp:"DHC", monitoring:"MON", logging:"LOG",
    vpn_server:"VPN", custom:"SVC"
  };
  return m[sv.type] || "SVC";
}

function formatServiceTooltip(sv){
  let s = `${sv.label||sv.id}\n`;
  s += `Type: ${sv.type}\n`;
  s += `Port: ${sv.port||"-"} (${sv.protocol||"-"})\n`;
  s += `Status: ${sv.status||"running"}\n`;
  if(sv.depends_on && sv.depends_on.length) s += `Depends: ${sv.depends_on.join(", ")}`;
  return s;
}

function renderStatusLed(g, x, y, status){
  status = status || "running";
  ce("circle", { cx:x, cy:y, r:4.5, fill:"var(--bg)", stroke:"var(--border)","stroke-width":0.5 }, g);
  ce("circle", { "class":"led-"+status, cx:x, cy:y, r:3 }, g);
}

function addResizeHandles(g, w, h){
  ce("rect", { "class":"handle", "data-handle":"se", x:w-5, y:h-5, width:9, height:9 }, g);
}

// Build arrow markers in SVG <defs> for each used color
function ensureArrowMarkers(){
  const defs = $("#svg-defs"); if(!defs) return;
  defs.innerHTML = "";
  const colors = {
    "ethernet":"var(--green)","fiber":"var(--yellow)","trunk":"var(--cyan)",
    "port-channel":"var(--purple)","vpn":"var(--purple)","vxlan":"var(--cyan)"
  };
  for(const [k, col] of Object.entries(colors)){
    const m = ce("marker", {
      id:"arrow-"+k, viewBox:"0 0 10 10", refX:"9", refY:"5",
      markerWidth:"7", markerHeight:"7", orient:"auto-start-reverse",
      fill: col
    }, defs);
    ce("path", { d:"M 0 0 L 10 5 L 0 10 z" }, m);
  }
}

// Compute polyline path through optional waypoints/bend
function buildConnectionPath(a, b, conn){
  // waypoints (array of {x,y}) take precedence; else bend
  const wp = Array.isArray(conn.waypoints) ? conn.waypoints : null;
  if(wp && wp.length){
    // polyline: a -> wp[0] -> wp[1] -> ... -> b
    const points = [a, ...wp, b];
    return {
      pathD: "M " + points.map(p=>`${p.x} ${p.y}`).join(" L "),
      points,
      labelPos: pickLabelPos(points)
    };
  }
  const bend = +conn.bend || 0;
  if(bend){
    // Quadratic curve perpendicular to line by `bend` pixels
    const dx = b.x-a.x, dy = b.y-a.y, len = Math.hypot(dx,dy)||1;
    const nx = -dy/len, ny = dx/len;
    const cx = (a.x+b.x)/2 + nx*bend;
    const cy = (a.y+b.y)/2 + ny*bend;
    return {
      pathD: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
      points: [a, {x:cx,y:cy}, b],
      labelPos: { x: 0.25*a.x + 0.5*cx + 0.25*b.x, y: 0.25*a.y + 0.5*cy + 0.25*b.y }
    };
  }
  return {
    pathD: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
    points: [a, b],
    labelPos: { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }
  };
}
function pickLabelPos(points){
  // Pick midpoint of the longest segment
  let best=null, bestLen=-1;
  for(let i=0;i<points.length-1;i++){
    const dx = points[i+1].x - points[i].x;
    const dy = points[i+1].y - points[i].y;
    const len = Math.hypot(dx,dy);
    if(len > bestLen){ bestLen=len; best = {x:(points[i].x+points[i+1].x)/2, y:(points[i].y+points[i+1].y)/2}; }
  }
  return best || points[0];
}

// Spawn moving arrow blips that travel continuously along the connection path
function spawnFlowBlips(g, c, type, pathId, traffic, direction){
  // Number of blips and animation duration by traffic level
  const config = {
    low:    { count: 1, dur: 4.0 },
    medium: { count: 2, dur: 2.4 },
    high:   { count: 3, dur: 1.0 }
  }[traffic] || { count: 1, dur: 3.0 };

  function makeBlip(reverse, beginOffset){
    const blip = ce("polygon", {
      "class": "flow-blip col-"+type,
      points: "-6,-4 7,0 -6,4"
    }, g);
    const motion = ce("animateMotion", {
      dur: config.dur + "s",
      begin: beginOffset.toFixed(2) + "s",
      repeatCount: "indefinite",
      rotate: "auto"
    }, blip);
    if(reverse){
      motion.setAttribute("keyPoints", "1;0");
      motion.setAttribute("keyTimes", "0;1");
      motion.setAttribute("calcMode", "linear");
    }
    const mp = ce("mpath", {}, motion);
    mp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + pathId);
    mp.setAttribute("href", "#" + pathId);
  }

  for(let i=0; i<config.count; i++){
    const begin = (config.dur * i / config.count);
    if(direction === "forward" || direction === "bidirectional"){
      makeBlip(false, begin);
    }
    if(direction === "backward" || direction === "bidirectional"){
      makeBlip(true, begin + (direction==="bidirectional" ? config.dur/(config.count*2) : 0));
    }
  }
}

function renderConnection(c){
  if(!c.from || !c.to) return;
  const a = resolveEndpoint(c.from);
  const b = resolveEndpoint(c.to);
  if(!a||!b) return;
  const status = c.status || "up";
  const traffic = c.traffic || "idle";
  const direction = c.direction || "forward"; // forward | backward | bidirectional
  const type = c.type || "ethernet";
  const built = buildConnectionPath(a, b, c);
  const cls = "conn "+type+(status==="down"?" down":"")+(status==="flapping"?" flapping":"")+" lvl-"+traffic;

  const g = ce("g", { "class":"conn-group","data-kind":"connection","data-id":c.id }, $("#layer-connections"));

  // Hit area (transparent fat line for easier clicking)
  ce("path", { "class":"conn-hit", d: built.pathD, stroke:"transparent", "stroke-width":"14", fill:"none" }, g);

  // Base line - with an id so animateMotion can reference it
  const pathId = "conn-path-" + c.id.replace(/[^a-zA-Z0-9_-]/g,"_");
  const line = ce("path", { id: pathId, "class": cls, d: built.pathD, fill:"none" }, g);
  // Arrowhead markers based on direction
  if(status !== "down"){
    const mid = "url(#arrow-"+type+")";
    if(direction === "forward" || direction === "bidirectional"){
      line.setAttribute("marker-end", mid);
    }
    if(direction === "backward" || direction === "bidirectional"){
      line.setAttribute("marker-start", mid);
    }
  }

  // Trunk: parallel line below (2 lines)
  if(type === "trunk"){
    const off = buildOffsetPath(built.points, 4);
    if(off) ce("path", { "class": cls, d: off, fill:"none" }, g);
  } else if(type === "port-channel"){
    const o1 = buildOffsetPath(built.points, 4);
    const o2 = buildOffsetPath(built.points, -4);
    if(o1) ce("path", { "class": cls, d: o1, fill:"none" }, g);
    if(o2) ce("path", { "class": cls, d: o2, fill:"none" }, g);
  }

  // Traffic flow overlay (animated dash, persistent)
  if(status === "up" && traffic !== "idle"){
    const dirCls = direction === "backward" ? "dir-bwd" : "dir-fwd";
    ce("path", { "class": `traffic-flow lvl-${traffic} col-${type} ${dirCls}`, d: built.pathD, fill:"none" }, g);
    if(direction === "bidirectional"){
      // Add a second flow in the reverse direction with slight offset visual cue
      ce("path", { "class": `traffic-flow lvl-${traffic} col-${type} dir-bwd`, d: built.pathD, fill:"none", style:"opacity:0.5" }, g);
    }
    // === Moving arrow blips travel along the path ===
    spawnFlowBlips(g, c, type, pathId, traffic, direction);
  }

  // Speed label + traffic indicator
  const midX = built.labelPos.x, midY = built.labelPos.y;
  let lbl = "";
  if(c.speed) lbl += (c.speed >= 1000 ? (c.speed/1000)+"G" : c.speed+"M");
  if(traffic !== "idle"){
    const trafLbl = {low:"低", medium:"中", high:"高"}[traffic]||"";
    if(trafLbl) lbl += (lbl?" · ":"") + trafLbl;
  }
  if(lbl){
    const lblW = Math.max(28, lbl.length * 6 + 8);
    ce("rect", { x:midX-lblW/2, y:midY-7, width:lblW, height:12, rx:3, ry:3,
      fill:"var(--bg)", stroke:"var(--border)","stroke-width":0.5,"pointer-events":"none" }, g);
    ce("text", { "class":"conn-label", x:midX, y:midY+0.5, "dominant-baseline":"middle", text:lbl }, g);
  }

  // VPN lock icon
  if(type === "vpn"){
    ce("circle", { cx:midX, cy:midY-16, r:6, fill:"var(--purple)", stroke:"#fff","stroke-width":1 }, g);
    ce("path", { d:`M ${midX-2} ${midY-18} L ${midX-2} ${midY-16} M ${midX+2} ${midY-18} L ${midX+2} ${midY-16} M ${midX-3} ${midY-16} L ${midX+3} ${midY-16} L ${midX+3} ${midY-13} L ${midX-3} ${midY-13} Z`,
      stroke:"#fff","stroke-width":1, fill:"none","pointer-events":"none" }, g);
  }

  // Waypoint handles (when connection is selected)
  const isSelected = App.selected && App.selected.kind==="connection" && App.selected.id===c.id;
  if(isSelected){
    // Show bend control point at label position
    const bendHandle = ce("circle", {
      "class":"waypoint-handle bend-handle",
      cx: midX, cy: midY, r: 6
    }, g);
    bendHandle.addEventListener("mousedown", (e)=>onBendHandleMouseDown(e, c));
    bendHandle.addEventListener("contextmenu", (e)=>{ e.preventDefault(); e.stopPropagation(); });

    // Show waypoints (if any) with drag/delete
    if(Array.isArray(c.waypoints)){
      for(let i=0;i<c.waypoints.length;i++){
        const wp = c.waypoints[i];
        const h = ce("circle", { "class":"waypoint-handle", cx:wp.x, cy:wp.y, r:5 }, g);
        h.addEventListener("mousedown",(e)=>onWaypointMouseDown(e, c, i));
        h.addEventListener("dblclick",(e)=>{
          e.stopPropagation(); pushUndo();
          c.waypoints.splice(i,1);
          if(!c.waypoints.length) delete c.waypoints;
          renderAndSync();
          toast("Waypointを削除", "ok");
        });
        h.addEventListener("contextmenu",(e)=>{
          e.preventDefault(); e.stopPropagation(); pushUndo();
          c.waypoints.splice(i,1);
          if(!c.waypoints.length) delete c.waypoints;
          renderAndSync();
          toast("Waypointを削除", "ok");
        });
      }
    }
    // Show "add waypoint" handles at midpoints of each segment
    const segPts = built.points;
    for(let i=0;i<segPts.length-1;i++){
      const mx = (segPts[i].x+segPts[i+1].x)/2;
      const my = (segPts[i].y+segPts[i+1].y)/2;
      // Skip if too close to existing bend/waypoint handle
      if(Math.hypot(mx-midX, my-midY) < 14) continue;
      const ah = ce("circle", { "class":"waypoint-add", cx:mx, cy:my, r:4 }, g);
      ah.addEventListener("mousedown",(e)=>onAddWaypointMouseDown(e, c, i, mx, my));
    }
  }

  // Event handlers on the group
  g.addEventListener("click", (e)=>{ e.stopPropagation(); selectElement("connection", c.id); });
  g.addEventListener("contextmenu", (e)=>{ e.preventDefault(); e.stopPropagation(); showContextMenu(e,"connection",c.id); });
  g.addEventListener("dblclick", (e)=>{ e.stopPropagation(); selectElement("connection", c.id); openPropertyPanel(); });
}

// For trunk/port-channel: build parallel offset path  
function buildOffsetPath(points, offset){
  if(points.length < 2) return null;
  const out = [];
  for(let i=0;i<points.length;i++){
    let nx=0, ny=0, cnt=0;
    if(i>0){
      const dx=points[i].x-points[i-1].x, dy=points[i].y-points[i-1].y;
      const l=Math.hypot(dx,dy)||1;
      nx += -dy/l; ny += dx/l; cnt++;
    }
    if(i<points.length-1){
      const dx=points[i+1].x-points[i].x, dy=points[i+1].y-points[i].y;
      const l=Math.hypot(dx,dy)||1;
      nx += -dy/l; ny += dx/l; cnt++;
    }
    if(cnt){ nx/=cnt; ny/=cnt; }
    out.push({ x: points[i].x + nx*offset, y: points[i].y + ny*offset });
  }
  return "M " + out.map(p=>`${p.x} ${p.y}`).join(" L ");
}

// Drag bend handle (between endpoints) — adjusts connection.bend
function onBendHandleMouseDown(e, c){
  e.preventDefault(); e.stopPropagation();
  const a = resolveEndpoint(c.from), b = resolveEndpoint(c.to);
  if(!a||!b) return;
  const dx = b.x-a.x, dy=b.y-a.y, len = Math.hypot(dx,dy)||1;
  const nx = -dy/len, ny = dx/len;
  dragState = {
    mode:"bend", c, a, b, nx, ny,
    moved:false
  };
}

// Drag existing waypoint
function onWaypointMouseDown(e, c, idx){
  e.preventDefault(); e.stopPropagation();
  dragState = { mode:"waypoint", c, idx, moved:false };
}

// Click "add waypoint" handle at segment midpoint — creates a waypoint and starts dragging
function onAddWaypointMouseDown(e, c, segIdx, mx, my){
  e.preventDefault(); e.stopPropagation();
  pushUndo();
  if(!Array.isArray(c.waypoints)) c.waypoints = [];
  // Insert waypoint at segIdx position
  // For a path like [from, wp0, wp1, ..., to], segIdx i corresponds to inserting at index i
  c.waypoints.splice(segIdx, 0, { x: Math.round(mx), y: Math.round(my) });
  renderAndSync();
  dragState = { mode:"waypoint", c, idx: segIdx, moved:false };
}

function resolveEndpoint(ep){
  if(!ep) return null;
  let obj=null, kind=null;
  if(ep.device){ obj = Cfg.byId("devices", ep.device); kind="device"; }
  else if(ep.server){ obj = Cfg.byId("servers", ep.server); kind="server"; }
  if(!obj) return null;
  const w = obj.width || (kind==="server"?130:120);
  const h = obj.height || (kind==="server"?65:70);
  // If interface specified, return port outer position
  if(ep.interface){
    const idx = (obj.interfaces||[]).findIndex(i=>i.id === ep.interface);
    if(idx >= 0){
      const pp = computePortPositions(obj, kind);
      if(pp[idx]){
        return {
          x: (obj.x||0) + pp[idx].outX,
          y: (obj.y||0) + pp[idx].outY,
          kind, obj,
          port: pp[idx]
        };
      }
    }
  }
  return { x: (obj.x||0)+w/2, y: (obj.y||0)+h/2, kind, obj };
}

/* ====== INTERACTION ====== */
let dragState = null;

function attachElementHandlers(g, kind, id){
  g.addEventListener("mousedown", (e)=>onElMouseDown(e, kind, id));
  g.addEventListener("click", (e)=>{
    e.stopPropagation();
    if(App.connectMode){ handleConnectClick(kind, id); }
    else { selectElement(kind, id); }
  });
  g.addEventListener("dblclick", (e)=>{ e.stopPropagation(); selectElement(kind, id); openPropertyPanel(); });
  g.addEventListener("contextmenu", (e)=>{ e.preventDefault(); e.stopPropagation(); showContextMenu(e, kind, id); });
}

function onElMouseDown(e, kind, id){
  if(e.button !== 0) return;
  if(App.connectMode) return;
  const t = e.target;
  if(t.classList && t.classList.contains("handle")){
    e.stopPropagation();
    const obj = Cfg.byId(kindToCol(kind), id);
    if(!obj) return;
    dragState = {
      mode:"resize", kind, id, obj,
      startW: obj.width || 120, startH: obj.height || 70,
      startSX: e.clientX, startSY: e.clientY
    };
    return;
  }
  if(kind === "connection") return;
  e.stopPropagation();
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  const pt = svgPoint(e);
  dragState = {
    mode:"move", kind, id, obj,
    startX: obj.x||0, startY: obj.y||0,
    startSX: pt.x, startSY: pt.y, moved:false
  };
}

function svgPoint(e){
  const svg = $("#svg");
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const ctm = svg.getScreenCTM();
  if(!ctm) return { x:e.clientX, y:e.clientY };
  return pt.matrixTransform(ctm.inverse());
}

function getContainedElements(network){
  const nx=network.x||0, ny=network.y||0;
  const nw=network.width||300, nh=network.height||200;
  const out=[];
  for(const d of (App.config.devices||[])){
    const dx=d.x||0, dy=d.y||0;
    if(dx>=nx && dy>=ny && dx+(d.width||120)<=nx+nw && dy+(d.height||70)<=ny+nh)
      out.push({kind:"device",obj:d});
  }
  for(const s of (App.config.servers||[])){
    const sx=s.x||0, sy=s.y||0;
    if(sx>=nx && sy>=ny && sx+(s.width||130)<=nx+nw && sy+(s.height||65)<=ny+nh)
      out.push({kind:"server",obj:s});
  }
  return out;
}

function onMouseMove(e){
  if(!dragState) return;
  if(dragState.mode === "port"){
    const pt = svgPoint(e);
    const obj = dragState.obj;
    const w = obj.width || (dragState.kind==="server"?130:120);
    const h = obj.height || (dragState.kind==="server"?65:70);
    const localX = pt.x - (obj.x||0);
    const localY = pt.y - (obj.y||0);
    // Determine closest side
    const distTop = Math.max(0, localY);
    const distBottom = Math.max(0, h - localY);
    const distLeft = Math.max(0, localX);
    const distRight = Math.max(0, w - localX);
    const m = Math.min(distTop, distBottom, distLeft, distRight);
    let side, offset;
    if(m === distTop){ side = "top"; offset = clamp(localX/w, 0, 1); }
    else if(m === distBottom){ side = "bottom"; offset = clamp(localX/w, 0, 1); }
    else if(m === distLeft){ side = "left"; offset = clamp(localY/h, 0, 1); }
    else { side = "right"; offset = clamp(localY/h, 0, 1); }
    const iface = obj.interfaces[dragState.ifaceIdx];
    iface.port_position = { side, offset: +offset.toFixed(3) };
    dragState.moved = true;
    render();
    return;
  }
  if(dragState.mode === "bend"){
    const pt = svgPoint(e);
    const c = dragState.c;
    const a = dragState.a, b = dragState.b;
    const mx = (a.x+b.x)/2, my=(a.y+b.y)/2;
    const vx = pt.x - mx, vy = pt.y - my;
    // Project onto normal
    const proj = vx*dragState.nx + vy*dragState.ny;
    c.bend = Math.round(proj);
    if(Math.abs(c.bend) < 4) delete c.bend;
    dragState.moved = true;
    render();
    return;
  }
  if(dragState.mode === "waypoint"){
    const pt = svgPoint(e);
    const c = dragState.c;
    if(Array.isArray(c.waypoints) && c.waypoints[dragState.idx]){
      c.waypoints[dragState.idx].x = Math.round(pt.x);
      c.waypoints[dragState.idx].y = Math.round(pt.y);
      dragState.moved = true;
      render();
    }
    return;
  }
  if(dragState.mode === "move"){
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startSX;
    const dy = pt.y - dragState.startSY;
    if(Math.abs(dx)>2 || Math.abs(dy)>2) dragState.moved = true;
    const newX = dragState.startX + dx;
    const newY = dragState.startY + dy;
    if(dragState.kind === "network"){
      if(!dragState.contained){
        dragState.contained = getContainedElements(dragState.obj).map(c=>({
          kind:c.kind, id:c.obj.id, sx:c.obj.x||0, sy:c.obj.y||0
        }));
      }
      dragState.obj.x = newX; dragState.obj.y = newY;
      for(const c of dragState.contained){
        const co = Cfg.byId(kindToCol(c.kind), c.id);
        if(co){ co.x = c.sx + dx; co.y = c.sy + dy; }
      }
    } else {
      dragState.obj.x = newX; dragState.obj.y = newY;
    }
    render();
  } else if(dragState.mode === "resize"){
    const obj = dragState.obj;
    const dx = (e.clientX - dragState.startSX) / App.view.scale;
    const dy = (e.clientY - dragState.startSY) / App.view.scale;
    obj.width = Math.max(40, dragState.startW + dx);
    obj.height = Math.max(30, dragState.startH + dy);
    render();
  } else if(dragState.mode === "pan"){
    const dx = (e.clientX - dragState.startSX) / App.view.scale;
    const dy = (e.clientY - dragState.startSY) / App.view.scale;
    App.view.x = dragState.startVX - dx;
    App.view.y = dragState.startVY - dy;
    applyViewBox();
  }
}

function onMouseUp(){
  if(!dragState) return;
  if(dragState.mode === "port"){
    if(dragState.moved){
      pushUndo();
      syncYamlFromConfig();
      const iface = dragState.obj.interfaces[dragState.ifaceIdx];
      toast(`${iface.id}: ${iface.port_position.side}側に配置`, "ok");
      if(App.selected && App.selected.kind === dragState.kind && App.selected.id === dragState.obj.id){
        openPropertyPanel();
      }
    }
    dragState = null;
    return;
  }
  if(dragState.mode === "bend" || dragState.mode === "waypoint"){
    if(dragState.moved){ pushUndo(); syncYamlFromConfig(); render(); }
    dragState = null;
    return;
  }
  const wasMoving = (dragState.mode === "move" && dragState.moved) || dragState.mode === "resize";
  if(wasMoving){
    if(dragState.kind === "device" || dragState.kind === "server"){
      autoFitNetworkForElement(dragState.obj);
    }
    pushUndo();
    syncYamlFromConfig();
    render();
  } else if(dragState.mode === "pan"){
    $("#svg").classList.remove("panning");
  }
  dragState = null;
}

function autoFitNetworkForElement(elObj){
  const cx = (elObj.x||0) + (elObj.width||130)/2;
  const cy = (elObj.y||0) + (elObj.height||65)/2;
  for(const n of (App.config.networks||[])){
    const nx=n.x||0, ny=n.y||0;
    const nw=n.width||300, nh=n.height||200;
    if(cx>=nx && cx<=nx+nw && cy>=ny && cy<=ny+nh){
      const ex2 = (elObj.x||0) + (elObj.width||130);
      const ey2 = (elObj.y||0) + (elObj.height||65);
      if(elObj.x < nx+6){ const oldX=n.x; n.x = elObj.x-10; n.width = (oldX+nw) - n.x; }
      if(elObj.y < ny+6){ const oldY=n.y; n.y = elObj.y-10; n.height = (oldY+nh) - n.y; }
      if(ex2 > nx+nw-6){ n.width = ex2 - n.x + 10; }
      if(ey2 > ny+nh-6){ n.height = ey2 - n.y + 10; }
      return;
    }
  }
}

function onSvgMouseDown(e){
  if(App.connectMode){
    if(e.target === $("#svg")) cancelConnectMode();
    return;
  }
  if(e.button === 0 && e.target === $("#svg")){
    selectElement(null, null);
    dragState = {
      mode:"pan",
      startSX:e.clientX, startSY:e.clientY,
      startVX:App.view.x, startVY:App.view.y
    };
    $("#svg").classList.add("panning");
  } else if(e.button === 1){
    e.preventDefault();
    dragState = {
      mode:"pan",
      startSX:e.clientX, startSY:e.clientY,
      startVX:App.view.x, startVY:App.view.y
    };
    $("#svg").classList.add("panning");
  }
}

function onSvgWheel(e){
  e.preventDefault();
  const delta = -e.deltaY * 0.0012;
  const oldScale = App.view.scale;
  const newScale = clamp(oldScale * (1 + delta), 0.1, 5);
  const pt = svgPoint(e);
  App.view.x = pt.x - (pt.x - App.view.x) * (oldScale / newScale);
  App.view.y = pt.y - (pt.y - App.view.y) * (oldScale / newScale);
  App.view.scale = newScale;
  $("#zoom-slider").value = Math.round(newScale*100);
  $("#zoom-val").textContent = Math.round(newScale*100)+"%";
  applyViewBox();
}

function selectElement(kind, id){
  App.selected = (kind && id) ? { kind, id } : null;
  render();
  if(App.selected) openPropertyPanel();
  else closePropertyPanel();
}

function handleConnectClick(kind, id){
  if(kind !== "device" && kind !== "server"){
    Log.warn("接続はデバイス/サーバ間で作成可能です");
    return;
  }
  if(App.connectMode.step === 1){
    App.connectMode.from = { kind, id };
    App.connectMode.step = 2;
    $("#status-msg").textContent = `From: ${id} → 接続先を選択 (ESCでキャンセル)`;
    Log.info(`接続元: ${kind} ${id}`);
  } else {
    if(App.connectMode.from.kind === kind && App.connectMode.from.id === id){
      Log.warn("同じ要素には接続できません");
      return;
    }
    addConnection(App.connectMode.from, { kind, id });
    cancelConnectMode();
  }
}
function cancelConnectMode(){
  App.connectMode = null;
  $("#svg").classList.remove("connecting");
  $("#status-msg").textContent = "";
}

function addConnection(from, to){
  const fromObj = Cfg.byId(kindToCol(from.kind), from.id);
  const toObj = Cfg.byId(kindToCol(to.kind), to.id);
  if(!fromObj || !toObj) return;
  const fromIf = (fromObj.interfaces&&fromObj.interfaces[0]) ? fromObj.interfaces[0].id : "eth0";
  const toIf = (toObj.interfaces&&toObj.interfaces[0]) ? toObj.interfaces[0].id : "eth0";
  const fk = from.kind === "device" ? "device" : "server";
  const tk = to.kind === "device" ? "device" : "server";
  pushUndo();
  Cfg.ensure();
  App.config.connections.push({
    id: uid("link"),
    from: { [fk]: from.id, interface: fromIf },
    to:   { [tk]: to.id, interface: toIf },
    type: "ethernet", speed: 1000, status: "up"
  });
  syncYamlFromConfig();
  render();
  updateStatusBar();
  Log.info(`接続を追加: ${from.id} ↔ ${to.id}`);
}

/* ====== CONTEXT MENU ====== */
function showContextMenu(e, kind, id){
  const menu = $("#ctx-menu"); menu.innerHTML = "";
  const items = getContextItems(kind, id);
  for(const it of items){
    if(it.sep){ ch("div",{class:"ctx-sep"},menu); continue; }
    const d = ch("div", {
      class:"ctx-item"+(it.disabled?" disabled":""),
      html:`<span class="icon">${it.icon||""}</span><span>${escapeHtml(it.label)}</span>`
    }, menu);
    if(!it.disabled){
      d.addEventListener("click", ()=>{ hideContextMenu(); it.action(); });
    }
  }
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";
  menu.classList.remove("hidden");
  setTimeout(()=>{
    const r = menu.getBoundingClientRect();
    if(r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 6) + "px";
    if(r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 6) + "px";
  }, 0);
}
function hideContextMenu(){ $("#ctx-menu").classList.add("hidden"); }

function getContextItems(kind, id){
  if(kind === "device" || kind === "server"){
    const obj = Cfg.byId(kindToCol(kind), id);
    if(!obj) return [];
    const items = [
      { icon:"▶", label:"起動", action:()=>setStatus(kind,id,"running"), disabled: obj.status==="running" },
      { icon:"⏹", label:"停止", action:()=>setStatus(kind,id,"stopped"), disabled: obj.status==="stopped" },
      { icon:"⚠", label:"障害発生", action:()=>setStatus(kind,id,"error") },
      { icon:"🔧", label:"メンテナンスモード", action:()=>setStatus(kind,id,"maintenance") },
      { sep:true },
      { icon:"💻", label:"CLI コンソール", action:()=>openCliConsole(kind, id) }
    ];
    if(kind === "device" && (obj.type==="router"||obj.type==="l3switch"||obj.type==="firewall")){
      items.push({ icon:"📋", label:"ルーティングテーブル", action:()=>showRoutingTable(id) });
    }
    items.push({ icon:"📋", label:"ARPテーブル", action:()=>showArpTable(kind,id) });
    items.push({ icon:"📋", label:"インターフェース一覧", action:()=>showInterfaces(kind,id) });
    items.push({ sep:true });
    items.push({ icon:"➕", label:"インターフェース追加...", action:()=>promptAddInterface(kind, id) });
    items.push({ icon:"✏", label:"インターフェース管理...", action:()=>openInterfaceManager(kind, id) });
    if(kind === "server" || (kind === "device" && (obj.type === "l3switch" || obj.type === "l2switch"))){
      items.push({ icon:"🔗", label: (obj.bonding && obj.bonding.enabled) ? "ボンディング設定 (有効)" : "ボンディング設定 (無効)",
        action:()=>openBondingDialog(kind, id) });
    }
    if(kind === "device" && (obj.type === "l3switch" || obj.type === "l2switch")){
      items.push({ icon:"🟣", label: (obj.vpc && obj.vpc.enabled) ? "vPC設定 (有効)" : "vPC設定 (無効)",
        action:()=>openVpcDialog(id) });
    }
    items.push({ sep:true });
    items.push({ icon:"🔍", label:"このデバイスからPing", action:()=>promptPing(kind,id) });
    items.push({ icon:"🛰", label:"Traceroute", action:()=>promptTraceroute(kind,id) });
    items.push({ sep:true });
    items.push({ icon:"⚙", label:"プロパティ", action:()=>{ selectElement(kind,id); openPropertyPanel(); } });
    items.push({ icon:"🗑", label:"削除", action:()=>deleteElement(kind,id) });
    return items;
  }
  if(kind === "service"){
    const obj = Cfg.byId("services", id);
    if(!obj) return [];
    return [
      { icon:"▶", label:"起動", action:()=>setStatus(kind,id,"running"), disabled: obj.status==="running" },
      { icon:"⏹", label:"停止", action:()=>setStatus(kind,id,"stopped"), disabled: obj.status==="stopped" },
      { icon:"⚠", label:"障害発生", action:()=>setStatus(kind,id,"error") },
      { sep:true },
      { icon:"📋", label:"設定表示", action:()=>showServiceConfig(id) },
      { icon:"🔍", label:"依存関係ツリー", action:()=>showDependencyTree(id) },
      { sep:true },
      { icon:"⚙", label:"プロパティ", action:()=>{ selectElement(kind,id); openPropertyPanel(); } },
      { icon:"🗑", label:"削除", action:()=>deleteElement(kind,id) }
    ];
  }
  if(kind === "connection"){
    const obj = Cfg.byId("connections", id);
    if(!obj) return [];
    return [
      { icon:"🔌", label:"リンクアップ", action:()=>setConnStatus(id,"up"), disabled: obj.status==="up" },
      { icon:"✂", label:"リンクダウン", action:()=>setConnStatus(id,"down"), disabled: obj.status==="down" },
      { icon:"⚡", label: obj.status==="flapping"?"フラッピング停止":"フラッピング開始",
        action:()=>setConnStatus(id, obj.status==="flapping"?"up":"flapping") },
      { sep:true },
      { icon:"📈", label:"通信量を設定...",
        action:()=>showTrafficLevelMenu(id) },
      { icon:"↔", label:"方向切替",
        action:()=>cycleDirection(id) },
      { icon:"⤳", label:"直角ルーティング自動生成",
        action:()=>{ pushUndo(); autoOrthogonalWaypoints(obj); renderAndSync(); toast("直角ルーティング生成","ok"); } },
      { icon:"━", label:"Waypointをクリア",
        action:()=>{ pushUndo(); delete obj.waypoints; delete obj.bend; renderAndSync(); toast("Waypoint削除","ok"); },
        disabled: !((obj.waypoints && obj.waypoints.length) || obj.bend) },
      { sep:true },
      { icon:"📡", label:"パケットキャプチャ",
        action:()=>openPacketCapture(id) },
      { sep:true },
      { icon:"⚙", label:"プロパティ", action:()=>{ selectElement("connection",id); openPropertyPanel(); } },
      { icon:"🗑", label:"削除", action:()=>deleteElement("connection",id) }
    ];
  }
  if(kind === "network"){
    return [
      { icon:"⚙", label:"プロパティ", action:()=>{ selectElement(kind,id); openPropertyPanel(); } },
      { icon:"🗑", label:"削除", action:()=>deleteElement(kind,id) }
    ];
  }
  return [];
}

function showTrafficLevelMenu(connId){
  const c = Cfg.byId("connections", connId); if(!c) return;
  openDialog(`通信量設定 — ${connId}`, (body)=>{
    ch("p",{text:"通信量レベルで線の太さとアニメーション速度が変化します。", style:{margin:"0 0 10px 0",fontSize:"12px",color:"var(--text-dim)"}}, body);
    const f = ch("div",{class:"field"},body);
    ch("label",{text:"通信量"},f);
    const sel = ch("select",{},f);
    for(const lvl of ["idle","low","medium","high"]){
      const o = ch("option",{value:lvl,text:lvl},sel);
      if((c.traffic||"idle")===lvl) o.selected = true;
    }
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"適用", primary:true, action:()=>{
          pushUndo(); c.traffic = sel.value;
          closeDialog(); renderAndSync(); toast(`通信量: ${c.traffic}`, "ok");
        }}
      ]
    };
  });
}
function cycleDirection(connId){
  const c = Cfg.byId("connections", connId); if(!c) return;
  pushUndo();
  const cur = c.direction || "forward";
  c.direction = { forward:"backward", backward:"bidirectional", bidirectional:"forward" }[cur];
  renderAndSync();
  toast(`方向: ${c.direction}`, "ok");
}

/* ====== STATUS CHANGE & PROPAGATION ====== */
function setStatus(kind, id, newStatus){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  const old = obj.status || "running";
  if(old === newStatus) return;
  pushUndo();
  obj.status = newStatus;
  Log.info(`${kind} ${id}: status ${old} → ${newStatus}`);
  propagateStatusChange(kind, id, newStatus);
  syncYamlFromConfig();
  render();
  updateStatusBar();
  if(App.selected && App.selected.kind === kind && App.selected.id === id) openPropertyPanel();
}

function setConnStatus(id, status){
  const c = Cfg.byId("connections", id);
  if(!c) return;
  pushUndo();
  const old = c.status || "up";
  c.status = status;
  Log.info(`Connection ${id}: ${old} → ${status}`);
  syncYamlFromConfig(); render(); updateStatusBar();
}

function propagateStatusChange(kind, id, newStatus){
  if(newStatus === "running"){
    recoverDependencies(kind, id);
    return;
  }
  if(kind === "service"){
    rippleAt(id);
    cascadeServiceFailure(id, new Set());
  } else if(kind === "server" || kind === "device"){
    if(kind === "server"){
      for(const sv of (App.config.services||[])){
        if(sv.server === id && sv.status === "running"){
          sv.status = "error";
          Log.error(`Service ${sv.id} (${sv.label||""}) → error: host ${id} ${newStatus}`);
          cascadeServiceFailure(sv.id, new Set());
        }
      }
    }
    for(const c of (App.config.connections||[])){
      const a = c.from && (c.from.device===id||c.from.server===id);
      const b = c.to && (c.to.device===id||c.to.server===id);
      if((a||b) && c.status === "up"){
        c.status = "down";
        Log.warn(`Link ${c.id} down (endpoint ${id} ${newStatus})`);
      }
    }
    if(kind === "device"){
      for(const rt of (App.config.routing_tables||[])){
        if(rt.device === id){
          for(const r of (rt.routes||[])){
            if(r.status === "active") r.status = "inactive";
          }
        }
      }
    }
    for(const v of (App.config.vpn_tunnels||[])){
      if((v.endpoints||[]).some(ep => ep.device === id)){
        if(v.status === "established"){
          v.status = "down";
          Log.warn(`VPN tunnel ${v.id} DOWN (endpoint ${id})`);
        }
      }
    }
    rippleAt(id);
  }
}

function cascadeServiceFailure(srvId, visited){
  if(visited.has(srvId)) return;
  visited.add(srvId);
  for(const sv of (App.config.services||[])){
    if(sv.id === srvId) continue;
    if((sv.depends_on||[]).includes(srvId)){
      if(sv.status === "running"){
        sv.status = "error";
        Log.error(`Service ${sv.id} → error: dependency ${srvId} unavailable`);
        cascadeServiceFailure(sv.id, visited);
      }
    }
  }
}

function recoverDependencies(kind, id){
  if(kind === "server" || kind === "device"){
    for(const c of (App.config.connections||[])){
      const a = c.from && (c.from.device===id||c.from.server===id);
      const b = c.to && (c.to.device===id||c.to.server===id);
      if((a||b) && c.status === "down"){
        c.status = "up";
        Log.info(`Link ${c.id} restored`);
      }
    }
    if(kind === "device"){
      for(const rt of (App.config.routing_tables||[])){
        if(rt.device === id){
          for(const r of (rt.routes||[])){
            if(r.status === "inactive") r.status = "active";
          }
        }
      }
    }
    for(const v of (App.config.vpn_tunnels||[])){
      if((v.endpoints||[]).some(ep => ep.device === id)){
        if(v.status === "down"){
          v.status = "established";
          Log.info(`VPN tunnel ${v.id} re-established`);
        }
      }
    }
  }
  // recheck services
  let changed = true;
  while(changed){
    changed = false;
    for(const sv of (App.config.services||[])){
      if(sv.status === "error"){
        const deps = sv.depends_on || [];
        const ok = deps.every(d=>{
          const x = Cfg.byId("services", d);
          return x && x.status === "running";
        });
        const host = Cfg.byId("servers", sv.server);
        const hostOk = !host || host.status === "running";
        if(ok && hostOk){
          sv.status = "running";
          Log.info(`Service ${sv.id} recovered`);
          changed = true;
        }
      }
    }
  }
}

function rippleAt(id){
  const r = Cfg.findAny(id) ? findElementCenter(id) : findServiceCenter(id);
  if(!r) return;
  const ripple = ce("circle", { "class":"ripple", cx:r.x, cy:r.y, r:8 }, $("#layer-overlays"));
  setTimeout(()=>ripple.remove(), 950);
}
function findElementCenter(id){
  const r = Cfg.findAny(id);
  if(!r) return findServiceCenter(id);
  const o = r.obj;
  return { x:(o.x||0)+(o.width||100)/2, y:(o.y||0)+(o.height||60)/2 };
}
function findServiceCenter(id){
  const sv = Cfg.byId("services", id);
  if(!sv) return null;
  const host = Cfg.byId("servers", sv.server);
  if(!host) return null;
  return { x:(host.x||0)+(host.width||130)/2, y:(host.y||0)+(host.height||65)/2 };
}

function deleteElement(kind, id){
  pushUndo();
  if(kind === "server" || kind === "device"){
    App.config.services = (App.config.services||[]).filter(sv => sv.server !== id);
    App.config.connections = (App.config.connections||[]).filter(c=>
      !(c.from && (c.from.device===id||c.from.server===id)) &&
      !(c.to && (c.to.device===id||c.to.server===id))
    );
    App.config.routing_tables = (App.config.routing_tables||[]).filter(r=>r.device!==id);
    App.config.policies = (App.config.policies||[]).filter(p=>p.device!==id);
  }
  if(kind === "service"){
    for(const sv of (App.config.services||[])){
      if(sv.depends_on) sv.depends_on = sv.depends_on.filter(d=>d!==id);
    }
  }
  Cfg.removeById(kindToCol(kind), id);
  selectElement(null, null);
  syncYamlFromConfig(); render(); updateStatusBar(); refreshScenarioSelect();
  Log.info(`${kind} ${id} 削除`);
}

/* ====== TOOLTIP ====== */
function showTooltip(e, text){
  const t = $("#tooltip");
  t.textContent = text;
  t.classList.remove("hidden");
  moveTooltip(e);
}
function moveTooltip(e){
  const t = $("#tooltip");
  t.style.left = (e.clientX + 12) + "px";
  t.style.top = (e.clientY + 12) + "px";
}
function hideTooltip(){ $("#tooltip").classList.add("hidden"); }

/* ====== ZOOM/FIT ====== */
function fitView(){
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const all = [
    ...(App.config.networks||[]),
    ...(App.config.devices||[]),
    ...(App.config.servers||[])
  ];
  if(!all.length){
    App.view = { x:0, y:0, scale:1 };
    applyViewBox();
    return;
  }
  for(const o of all){
    const x=o.x||0, y=o.y||0;
    const w=o.width||100, h=o.height||60;
    if(x<minX) minX=x;
    if(y<minY) minY=y;
    if(x+w>maxX) maxX=x+w;
    if(y+h>maxY) maxY=y+h;
  }
  const pad = 30;
  minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
  const cw = $("#svg").clientWidth || 1200;
  const chh = $("#svg").clientHeight || 800;
  const sx = cw / (maxX-minX);
  const sy = chh / (maxY-minY);
  App.view.scale = clamp(Math.min(sx, sy), 0.1, 5);
  App.view.x = minX;
  App.view.y = minY;
  $("#zoom-slider").value = Math.round(App.view.scale*100);
  $("#zoom-val").textContent = Math.round(App.view.scale*100)+"%";
  applyViewBox();
}

/* ====== STATUS BAR & SCENARIO SELECT ====== */
function updateStatusBar(){
  const all = [...(App.config.devices||[]), ...(App.config.servers||[]), ...(App.config.services||[])];
  const c = { running:0, stopped:0, error:0, maintenance:0 };
  for(const x of all){
    const s = x.status || "running";
    c[s] = (c[s]||0)+1;
  }
  $("#stat-running").textContent = c.running;
  $("#stat-stopped").textContent = c.stopped;
  $("#stat-error").textContent = c.error;
  $("#stat-maint").textContent = c.maintenance;
  $("#stat-devices").textContent = (App.config.devices||[]).length;
  $("#stat-servers").textContent = (App.config.servers||[]).length;
  $("#stat-services").textContent = (App.config.services||[]).length;
  $("#stat-connections").textContent = (App.config.connections||[]).length;
}

function refreshScenarioSelect(){
  const sel = $("#scenario-select");
  const prev = sel.value;
  sel.innerHTML = "";
  const scs = App.config.scenarios || [];
  if(!scs.length){
    ch("option", { text:"(シナリオなし)", value:"" }, sel);
  }
  for(const s of scs){
    ch("option", { value:s.id, text:s.label||s.id }, sel);
  }
  if(prev && scs.find(s=>s.id===prev)) sel.value = prev;
}

/* ====== PROPERTY PANEL ====== */
function openPropertyPanel(){
  const p = $("#prop-panel");
  if(!App.selected){ p.classList.add("hidden"); return; }
  p.classList.remove("hidden");
  const { kind, id } = App.selected;
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj){ p.classList.add("hidden"); return; }
  $("#ph-title").textContent = `${kindLabel(kind)}: ${obj.label||id}`;
  renderPropertyForm(kind, obj);
}
function closePropertyPanel(){ $("#prop-panel").classList.add("hidden"); }

function renderPropertyForm(kind, obj){
  const body = $("#ph-body"); body.innerHTML = "";
  // ID closure
  let cid = obj.id;
  addField(body, "ID", "text", cid, (v)=>{
    if(!v || v===cid) return;
    renameId(kind, cid, v);
    cid = v;
  });
  addField(body, "ラベル", "text", obj.label||"", (v)=>{ obj.label = v; renderAndSync(); });
  if(kind !== "connection"){
    addSelectField(body, "ステータス", ["running","stopped","error","maintenance"], obj.status||"running",
      (v)=>{ setStatus(kind, cid, v); });
  }
  if(kind === "network" || kind === "device" || kind === "server"){
    const row = ch("div", { class:"field-grid" }, body);
    addField(row, "X", "number", obj.x||0, v=>{ obj.x = +v; renderAndSync(); });
    addField(row, "Y", "number", obj.y||0, v=>{ obj.y = +v; renderAndSync(); });
    addField(row, "W", "number", obj.width||120, v=>{ obj.width = +v; renderAndSync(); });
    addField(row, "H", "number", obj.height||70, v=>{ obj.height = +v; renderAndSync(); });
  }
  if(kind === "network") renderNetworkProps(body, obj);
  if(kind === "device") renderDeviceProps(body, obj);
  if(kind === "server") renderServerProps(body, obj);
  if(kind === "service") renderServiceProps(body, obj);
  if(kind === "connection") renderConnectionProps(body, obj);

  const row = ch("div", { class:"btn-row" }, body);
  ch("button", { text:"削除", class:"del", on:{ click:()=>deleteElement(kind, cid) } }, row);
}

function renderAndSync(){ syncYamlFromConfig(); render(); updateStatusBar(); }

function addField(parent, label, type, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const inp = ch("input", { type, value: value==null ? "" : String(value) }, f);
  inp.addEventListener("change", ()=>onChange(inp.value));
  return inp;
}
function addTextareaField(parent, label, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const ta = ch("textarea", { rows:4 }, f);
  ta.value = value || "";
  ta.addEventListener("change", ()=>onChange(ta.value));
  return ta;
}
function addSelectField(parent, label, options, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const sel = ch("select", {}, f);
  for(const o of options){
    const opt = ch("option", { value:o, text:o }, sel);
    if(o === value) opt.selected = true;
  }
  sel.addEventListener("change", ()=>onChange(sel.value));
  return sel;
}
function addCheckbox(parent, label, checked, onChange){
  const f = ch("div", { class:"field" }, parent);
  const lab = ch("label", { style:{display:"flex",gap:"6px",alignItems:"center",cursor:"pointer"} }, f);
  const cb = ch("input", { type:"checkbox" }, lab);
  if(checked) cb.checked = true;
  ch("span", { text:label }, lab);
  cb.addEventListener("change", ()=>onChange(cb.checked));
  return cb;
}
function addColorField(parent, label, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const wrap = ch("div", { class:"color-field" }, f);
  let r=100, g=150, b=250, a=0.15;
  if(value){
    const m = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
    if(m){ r=+m[1]; g=+m[2]; b=+m[3]; a = m[4]!==undefined ? +m[4] : 1; }
  }
  const toHex = n => n.toString(16).padStart(2,"0");
  const color = ch("input", { type:"color", value:"#"+toHex(r)+toHex(g)+toHex(b) }, wrap);
  const alpha = ch("input", { type:"range", min:"0", max:"1", step:"0.05" }, wrap);
  alpha.value = a;
  const text = ch("input", { type:"text", value: value || `rgba(${r},${g},${b},${a})` }, wrap);
  function update(){
    const h = color.value;
    const rr=parseInt(h.slice(1,3),16), gg=parseInt(h.slice(3,5),16), bb=parseInt(h.slice(5,7),16);
    const aa = parseFloat(alpha.value);
    const v = `rgba(${rr},${gg},${bb},${aa})`;
    text.value = v;
    onChange(v);
  }
  color.addEventListener("input", update);
  alpha.addEventListener("input", update);
  text.addEventListener("change", ()=>onChange(text.value));
}

function renderNetworkProps(body, obj){
  addSelectField(body, "種別 (Type)", ["vlan","vpc","subnet","vpn-overlay"], obj.type||"subnet",
    v=>{
      obj.type=v;
      // Auto-derive kind if not explicitly set
      if(!obj._kindManual){
        obj.kind = (v === "vxlan" || v === "vpn-overlay") ? "virtual" : "physical";
      }
      renderAndSync();
    });
  addSelectField(body, "ネットワーク種別 (Physical/Virtual)",
    ["physical","virtual"],
    obj.kind || (obj.type==="vxlan"||obj.type==="vpn-overlay"?"virtual":"physical"),
    v=>{ obj.kind = v; obj._kindManual = true; renderAndSync(); toast(`Network kind: ${v}`, "ok"); });
  addField(body, "IPv4 CIDR", "text", obj.cidr||"", v=>{ obj.cidr=v; renderAndSync(); });
  addField(body, "IPv4 Gateway", "text", obj.gateway||"", v=>{ obj.gateway=v; renderAndSync(); });
  addField(body, "IPv6 CIDR", "text", obj.cidr_v6||"", v=>{ obj.cidr_v6=v; renderAndSync(); });
  addField(body, "IPv6 Gateway", "text", obj.gateway_v6||"", v=>{ obj.gateway_v6=v; renderAndSync(); });
  addField(body, "VLAN ID", "number", obj.vlan_id==null?"":obj.vlan_id, v=>{ obj.vlan_id = v?+v:null; renderAndSync(); });
  addColorField(body, "色", obj.color||"rgba(100,150,250,0.15)", v=>{ obj.color=v; renderAndSync(); });
}

function renderDeviceProps(body, obj){
  addSelectField(body, "種別", ["router","l3switch","l2switch","firewall","loadbalancer","waf"], obj.type||"router",
    v=>{ obj.type=v; renderAndSync(); openPropertyPanel(); });
  addField(body, "Model", "text", obj.model||"", v=>{ obj.model=v; renderAndSync(); });
  renderInterfaceTable(body, obj, "device");
  // NAT
  const sec2 = ch("div", { class:"sub-section" }, body);
  ch("h4", { text:"NAT設定" }, sec2);
  const nat = obj.nat || {};
  addCheckbox(sec2, "有効", !!nat.enabled, v=>{ obj.nat=obj.nat||{}; obj.nat.enabled=v; renderAndSync(); });
  addField(sec2, "Inside (カンマ区切)", "text", (nat.inside||[]).join(","),
    v=>{ obj.nat=obj.nat||{}; obj.nat.inside=v.split(",").map(s=>s.trim()).filter(Boolean); renderAndSync(); });
  addField(sec2, "Outside (カンマ区切)", "text", (nat.outside||[]).join(","),
    v=>{ obj.nat=obj.nat||{}; obj.nat.outside=v.split(",").map(s=>s.trim()).filter(Boolean); renderAndSync(); });
}

function renderServerProps(body, obj){
  addSelectField(body, "種別", ["physical","virtual","container"], obj.type||"virtual",
    v=>{ obj.type=v; renderAndSync(); });
  addField(body, "OS", "text", obj.os||"", v=>{ obj.os=v; renderAndSync(); });
  const row = ch("div", { class:"field-grid" }, body);
  addField(row, "CPU", "number", obj.cpu||1, v=>{ obj.cpu=+v; renderAndSync(); });
  addField(row, "Memory (MB)", "number", obj.memory||1024, v=>{ obj.memory=+v; renderAndSync(); });
  addField(body, "Gateway (IPv4)", "text", obj.gateway||"", v=>{ obj.gateway=v; renderAndSync(); });
  addField(body, "Gateway (IPv6)", "text", obj.gateway_v6||"", v=>{ obj.gateway_v6=v; renderAndSync(); });
  renderInterfaceTable(body, obj, "server");
}

function renderServiceProps(body, obj){
  const types = ["web_server","reverse_proxy","forward_proxy","app_server","database","cache","mq","dns","dhcp","monitoring","logging","vpn_server","custom"];
  addSelectField(body, "種別", types, obj.type||"app_server", v=>{ obj.type=v; renderAndSync(); });
  const srvs = (App.config.servers||[]).map(s=>s.id);
  addSelectField(body, "ホストサーバ", srvs, obj.server||"", v=>{ obj.server=v; renderAndSync(); });
  const row = ch("div", { class:"field-grid" }, body);
  addField(row, "ポート", "number", obj.port||80, v=>{ obj.port=+v; renderAndSync(); });
  addField(row, "プロトコル", "text", obj.protocol||"TCP", v=>{ obj.protocol=v; renderAndSync(); });
  // depends_on
  const sec = ch("div", { class:"sub-section" }, body);
  ch("h4", { text:"依存サービス (depends_on)" }, sec);
  const allSvc = (App.config.services||[]).filter(s=>s.id!==obj.id);
  const sel = new Set(obj.depends_on||[]);
  const list = ch("div", { style:{ maxHeight:"100px", overflowY:"auto" } }, sec);
  if(!allSvc.length) ch("div", { text:"(他のサービスなし)", style:{ color:"var(--text-mute)", fontSize:"11px" } }, list);
  for(const s of allSvc){
    const lab = ch("label", { style:{display:"flex",gap:"4px",alignItems:"center",fontSize:"11px",cursor:"pointer",padding:"2px 0"} }, list);
    const cb = ch("input", { type:"checkbox" }, lab);
    if(sel.has(s.id)) cb.checked = true;
    ch("span", { text: s.id + (s.label?" ("+s.label+")":"") }, lab);
    cb.addEventListener("change", ()=>{
      if(cb.checked) sel.add(s.id); else sel.delete(s.id);
      obj.depends_on = Array.from(sel);
      renderAndSync();
    });
  }
  // config
  const cfgSec = ch("div", { class:"sub-section" }, body);
  ch("h4", { text:"設定 (config)" }, cfgSec);
  const cy = obj.config ? YAML.stringify(obj.config).trim() : "";
  addTextareaField(cfgSec, "YAML形式", cy, v=>{
    try{ obj.config = v.trim() ? YAML.parse(v) : {}; renderAndSync(); }
    catch(e){ Log.error("config parse error: "+e.message); }
  });
}

function renderConnectionProps(body, obj){
  const allEnds = [];
  for(const d of (App.config.devices||[])) allEnds.push({ kind:"device", id:d.id, label:`${d.label||d.id} (device)`, ifs:(d.interfaces||[]).map(i=>i.id) });
  for(const s of (App.config.servers||[])) allEnds.push({ kind:"server", id:s.id, label:`${s.label||s.id} (server)`, ifs:(s.interfaces||[]).map(i=>i.id) });

  function buildEndpointSelectors(label, ep, key){
    ch("div", { class:"field-section-title", text:label }, body);
    const curKind = ep && ep.device ? "device" : "server";
    const curId = ep ? (ep.device || ep.server || "") : "";
    const curIf = ep ? (ep.interface || "") : "";

    const f1 = ch("div", { class:"field" }, body);
    ch("label", { text:"要素" }, f1);
    const sel = ch("select", {}, f1);
    ch("option", { value:"", text:"-- 選択 --" }, sel);
    for(const e of allEnds){
      const o = ch("option", { value: e.kind+":"+e.id, text:e.label }, sel);
      if(e.kind===curKind && e.id===curId) o.selected = true;
    }
    const f2 = ch("div", { class:"field" }, body);
    ch("label", { text:"インターフェース" }, f2);
    const ifSel = ch("select", {}, f2);
    function refreshIfs(){
      ifSel.innerHTML = "";
      const v = sel.value;
      if(!v) return;
      const [k,id] = v.split(":");
      const e = allEnds.find(x=>x.kind===k&&x.id===id);
      if(!e) return;
      for(const i of e.ifs){
        const o = ch("option", { value:i, text:i }, ifSel);
        if(i === curIf) o.selected = true;
      }
    }
    refreshIfs();
    sel.addEventListener("change", ()=>{
      const v = sel.value;
      if(!v) return;
      const [k,id] = v.split(":");
      obj[key] = { [k]:id, interface:"" };
      refreshIfs();
      if(ifSel.options.length){ obj[key].interface = ifSel.value; }
      renderAndSync();
    });
    ifSel.addEventListener("change", ()=>{
      obj[key].interface = ifSel.value;
      renderAndSync();
    });
  }
  buildEndpointSelectors("From", obj.from, "from");
  buildEndpointSelectors("To", obj.to, "to");

  ch("div",{class:"field-section-title", text:"接続設定"}, body);
  addSelectField(body, "種別", ["ethernet","fiber","trunk","port-channel","vpn","vxlan"], obj.type||"ethernet",
    v=>{ obj.type=v; renderAndSync(); });
  addField(body, "Speed (Mbps)", "number", obj.speed||1000, v=>{ obj.speed=+v; renderAndSync(); });
  addSelectField(body, "ステータス", ["up","down","flapping"], obj.status||"up", v=>{ setConnStatus(obj.id, v); });

  ch("div",{class:"field-section-title", text:"通信表示"}, body);
  addSelectField(body, "通信量", ["idle","low","medium","high"], obj.traffic||"idle",
    v=>{ obj.traffic=v; renderAndSync(); toast(`通信量: ${v}`, "ok"); });
  addSelectField(body, "方向", ["forward","backward","bidirectional"], obj.direction||"forward",
    v=>{ obj.direction=v; renderAndSync(); });

  ch("div",{class:"field-section-title", text:"線の屈曲"}, body);
  addField(body, "Bend (湾曲量、±px)", "number", obj.bend||0,
    v=>{ obj.bend=+v; if(!obj.bend) delete obj.bend; renderAndSync(); });
  // Waypoints list
  const sec = ch("div", { class:"sub-section" }, body);
  ch("h4", { text:`Waypoint (直角折り曲げ): ${(obj.waypoints||[]).length}個`,
    style:{margin:"0 0 6px 0"} }, sec);
  ch("div", {
    text:"使い方: 接続を選択すると線上に小さい青い点が表示されます。クリックでwaypointを追加、ドラッグで移動、ダブルクリック/右クリックで削除。",
    style:{ fontSize:"10px", color:"var(--text-mute)", lineHeight:"1.4", marginBottom:"6px" }
  }, sec);
  if(Array.isArray(obj.waypoints) && obj.waypoints.length){
    for(let i=0;i<obj.waypoints.length;i++){
      const wp = obj.waypoints[i];
      const row = ch("div", { class:"field-grid", style:{ alignItems:"end" } }, sec);
      const fx = ch("div",{class:"field"},row);
      ch("label",{text:`#${i+1} X`},fx);
      const inpX = ch("input",{type:"number",value:String(wp.x)},fx);
      inpX.addEventListener("change",()=>{ wp.x=+inpX.value||0; renderAndSync(); });
      const fy = ch("div",{class:"field"},row);
      ch("label",{text:"Y"},fy);
      const inpY = ch("input",{type:"number",value:String(wp.y)},fy);
      inpY.addEventListener("change",()=>{ wp.y=+inpY.value||0; renderAndSync(); });
    }
    ch("button",{
      text:"全てのWaypointを削除",
      style:{ width:"100%",marginTop:"4px",padding:"4px",background:"var(--red-dim)",border:"1px solid var(--red)",color:"#fff",borderRadius:"3px",cursor:"pointer",fontSize:"11px" },
      on:{ click:()=>{ pushUndo(); delete obj.waypoints; renderAndSync(); openPropertyPanel(); toast("Waypoint をリセット","ok"); }}
    }, sec);
  }
  ch("button",{
    text:"+ 直角ルーティングを自動生成",
    style:{ width:"100%",marginTop:"4px",padding:"4px",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",cursor:"pointer",fontSize:"11px" },
    on:{ click:()=>{ pushUndo(); autoOrthogonalWaypoints(obj); renderAndSync(); openPropertyPanel(); toast("直角ルーティング生成","ok"); }}
  }, sec);

  if(obj.type === "trunk"){
    const sec1 = ch("div", { class:"sub-section" }, body);
    ch("h4", { text:"Trunk設定" }, sec1);
    obj.trunk = obj.trunk || {};
    addField(sec1, "Allowed VLANs (カンマ)", "text", (obj.trunk.allowed_vlans||[]).join(","),
      v=>{ obj.trunk.allowed_vlans=v.split(",").map(x=>+x.trim()).filter(x=>!isNaN(x)); renderAndSync(); });
    addField(sec1, "Native VLAN", "number", obj.trunk.native_vlan||1,
      v=>{ obj.trunk.native_vlan=+v; renderAndSync(); });
  }
  if(obj.type === "port-channel"){
    const sec1 = ch("div", { class:"sub-section" }, body);
    ch("h4", { text:"Port-channel設定" }, sec1);
    obj.port_channel = obj.port_channel || {};
    addField(sec1, "ID", "number", obj.port_channel.id||1, v=>{ obj.port_channel.id=+v; renderAndSync(); });
    addField(sec1, "Members (カンマ)", "text", (obj.port_channel.members||[]).join(","),
      v=>{ obj.port_channel.members=v.split(",").map(s=>s.trim()).filter(Boolean); renderAndSync(); });
    addSelectField(sec1, "Protocol", ["lacp","static"], obj.port_channel.protocol||"lacp",
      v=>{ obj.port_channel.protocol=v; renderAndSync(); });
  }
}

function autoOrthogonalWaypoints(c){
  const a = resolveEndpoint(c.from), b = resolveEndpoint(c.to);
  if(!a||!b) return;
  const dx = b.x - a.x, dy = b.y - a.y;
  // Pick mid point on the longer axis
  if(Math.abs(dx) > Math.abs(dy)){
    // Horizontal-first L-shape
    c.waypoints = [
      { x: Math.round(a.x + dx/2), y: Math.round(a.y) },
      { x: Math.round(a.x + dx/2), y: Math.round(b.y) }
    ];
  } else {
    // Vertical-first L-shape
    c.waypoints = [
      { x: Math.round(a.x), y: Math.round(a.y + dy/2) },
      { x: Math.round(b.x), y: Math.round(a.y + dy/2) }
    ];
  }
}

function renderInterfaceTable(body, obj, kind){
  const sec = ch("div", { class:"sub-section" }, body);
  const headerRow = ch("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"} }, sec);
  ch("h4", { text:"インターフェース", style:{margin:0} }, headerRow);
  ch("span", {
    text:`${(obj.interfaces||[]).length} 個`,
    style:{fontSize:"10px",color:"var(--text-mute)",fontFamily:"var(--mono)"}
  }, headerRow);

  ch("div", {
    text:"💡 ポートはオブジェクトのエッジに表示されます。SVG上のポートを直接ドラッグして位置を変更できます。",
    style:{ fontSize:"10px", color:"var(--text-mute)", lineHeight:"1.4",
      marginBottom:"8px", padding:"4px 6px", background:"var(--bg2)",
      borderLeft:"2px solid var(--accent)", borderRadius:"2px" }
  }, sec);

  obj.interfaces = obj.interfaces || [];
  const allNets = (App.config.networks||[]).map(n=>n.id);
  const portTypes = ["rj45","sfp","sfp+","qsfp","qsfp+","qsfp28","console","mgmt"];
  const sides = ["auto","top","bottom","left","right"];

  const fldStyle = { width:"100%", padding:"4px 6px", fontSize:"11px", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:"3px", fontFamily:"var(--mono)" };
  const lblStyle = { fontSize:"10px", color:"var(--text-dim)", display:"block", marginBottom:"1px" };

  for(let i=0; i<obj.interfaces.length; i++){
    const iface = obj.interfaces[i];
    const linked = (App.config.connections||[]).some(c=>
      ((c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===iface.id) ||
       (c.to && (c.to.device===obj.id||c.to.server===obj.id) && c.to.interface===iface.id))
    );
    // Card container
    const card = ch("div", { class:"iface-card "+(linked?"linked":""), style:{
      border:"1px solid var(--border)", borderRadius:"6px",
      padding:"8px", marginBottom:"8px", background:"var(--bg2)",
      borderLeft:"3px solid "+(linked?"var(--green)":"var(--border)")
    }}, sec);

    // Header: type swatch + label + delete
    const hd = ch("div", { style:{display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px"} }, card);
    const tk = portTypeKey(iface);
    const swatchColor = ({
      "rj45":"#5a6470","sfp":"#3b82f6","sfp-plus":"#f59e0b",
      "qsfp":"#a855f7","qsfp-plus":"#a855f7","qsfp28":"#ef4444",
      "console":"#06b6d4","mgmt":"#10b981"
    })[tk] || "#5a6470";
    ch("span", { style:{
      display:"inline-block", width:"14px", height:"10px",
      background: swatchColor, borderRadius:"2px",
      border:"1px solid rgba(0,0,0,0.3)"
    }}, hd);
    ch("span", { text: portTypeLabel(iface) + (linked?" · 接続中":""),
      style:{ fontSize:"10px", color: linked?"var(--green)":"var(--accent)", fontFamily:"var(--mono)", fontWeight:"700" }
    }, hd);
    ch("div", { style:{flex:"1"} }, hd);
    ch("button", {
      text:"× 削除",
      style:{ background:"transparent", border:"1px solid var(--red)",
        color:"var(--red)", padding:"2px 8px", fontSize:"10px",
        cursor:"pointer", borderRadius:"3px" },
      on:{ click:()=>{
        if(!confirm(`Interface "${iface.id}" を削除しますか? (接続も切れます)`)) return;
        pushUndo();
        obj.interfaces.splice(i,1);
        renderAndSync(); openPropertyPanel();
        toast(`Interface ${iface.id} を削除`, "ok");
      }}
    }, hd);

    // Row 1: ID + IP
    const r1 = ch("div", { style:{display:"grid",gridTemplateColumns:"1fr 1.6fr",gap:"6px",marginBottom:"5px"} }, card);
    const r1a = ch("div",{},r1);
    ch("label",{text:"ID",style:lblStyle},r1a);
    const idIn = ch("input",{type:"text",value:iface.id||"",placeholder:"eth0, gi1/0/1...",style:fldStyle},r1a);
    idIn.addEventListener("change",()=>{ iface.id=idIn.value.trim(); renderAndSync(); });
    const r1b = ch("div",{},r1);
    ch("label",{text:"IPv4 / CIDR",style:lblStyle},r1b);
    const ipIn = ch("input",{type:"text",value:iface.ip||"",placeholder:"10.0.0.1/24 (任意)",style:fldStyle},r1b);
    ipIn.addEventListener("change",()=>{ iface.ip=ipIn.value; renderAndSync(); });

    // Row 1.5: IPv6
    const r15 = ch("div", { style:{display:"grid",gridTemplateColumns:"1fr",gap:"6px",marginBottom:"5px"} }, card);
    const r15a = ch("div",{},r15);
    ch("label",{text:"IPv6 / CIDR",style:lblStyle},r15a);
    const ip6In = ch("input",{type:"text",value:iface.ipv6||"",placeholder:"2001:db8::1/64 (任意 — IPv4と併用可)",style:fldStyle},r15a);
    ip6In.addEventListener("change",()=>{ iface.ipv6=ip6In.value; renderAndSync(); });

    // Row 2: Network + MAC
    const r2 = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"5px"}},card);
    const r2a = ch("div",{},r2);
    ch("label",{text:"Network",style:lblStyle},r2a);
    const nSel = ch("select",{style:fldStyle},r2a);
    ch("option",{value:"",text:"-- 未割当 --"},nSel);
    for(const n of allNets){
      const o = ch("option",{value:n,text:n},nSel);
      if(n===iface.network) o.selected = true;
    }
    nSel.addEventListener("change",()=>{ iface.network=nSel.value; renderAndSync(); });
    const r2b = ch("div",{},r2);
    ch("label",{text:"MAC",style:lblStyle},r2b);
    const macIn = ch("input",{type:"text",value:iface.mac||"",placeholder:"aa:bb:cc:dd:ee:ff",style:fldStyle},r2b);
    macIn.addEventListener("change",()=>{ iface.mac=macIn.value; renderAndSync(); });

    // Row 3: Port type + Speed + Status
    const r3 = ch("div",{style:{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr",gap:"6px",marginBottom:"5px"}},card);
    const r3a = ch("div",{},r3);
    ch("label",{text:"ポート種別",style:lblStyle},r3a);
    const pSel = ch("select",{style:fldStyle},r3a);
    const cur = iface.port_type || autoPortType(iface.speed||1000);
    for(const p of portTypes){
      const o = ch("option",{value:p,text:p.toUpperCase()},pSel);
      if(p===cur) o.selected = true;
    }
    pSel.addEventListener("change",()=>{ iface.port_type=pSel.value; renderAndSync(); });
    const r3b = ch("div",{},r3);
    ch("label",{text:"Speed (Mbps)",style:lblStyle},r3b);
    const spIn = ch("input",{type:"number",value:String(iface.speed||1000),style:fldStyle},r3b);
    spIn.addEventListener("change",()=>{ iface.speed=+spIn.value||1000; renderAndSync(); });
    const r3c = ch("div",{},r3);
    ch("label",{text:"状態",style:lblStyle},r3c);
    const stSel = ch("select",{style:fldStyle},r3c);
    for(const s of ["up","down","err-disabled"]){
      const o = ch("option",{value:s,text:s},stSel);
      if(s===(iface.status||"up")) o.selected = true;
    }
    stSel.addEventListener("change",()=>{ iface.status=stSel.value; renderAndSync(); });

    // Row 4: Port position (side + offset)
    const r4 = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 2fr",gap:"6px",marginTop:"4px",padding:"6px 6px 4px",background:"var(--bg3)",borderRadius:"3px",border:"1px dashed var(--border)"}},card);
    const r4a = ch("div",{},r4);
    ch("label",{text:"ポート配置",style:{ fontSize:"10px", color:"var(--accent)", display:"block", marginBottom:"1px", fontWeight:"700" }},r4a);
    const sideSel = ch("select",{style:fldStyle},r4a);
    const curSide = iface.port_position ? iface.port_position.side : "auto";
    for(const s of sides){
      const lbl2 = ({auto:"自動",top:"上",bottom:"下",left:"左",right:"右"})[s];
      const o = ch("option",{value:s,text:lbl2},sideSel);
      if(s===curSide) o.selected = true;
    }
    sideSel.addEventListener("change",()=>{
      pushUndo();
      if(sideSel.value === "auto"){
        delete iface.port_position;
      } else {
        iface.port_position = { side: sideSel.value, offset: (iface.port_position && iface.port_position.offset) || 0.5 };
      }
      renderAndSync(); openPropertyPanel();
    });
    const r4b = ch("div",{},r4);
    const offLblText = ()=>`位置オフセット: ${iface.port_position ? Math.round((iface.port_position.offset||0.5)*100) : 50}%`;
    const offLbl = ch("label",{text:offLblText(),style:lblStyle},r4b);
    const offIn = ch("input",{
      type:"range", min:"0", max:"1", step:"0.05",
      value: iface.port_position ? String(iface.port_position.offset||0.5) : "0.5",
      style:{ width:"100%", accentColor:"var(--accent)" }
    },r4b);
    offIn.disabled = !iface.port_position;
    offIn.addEventListener("input",()=>{
      if(!iface.port_position) return;
      iface.port_position.offset = +offIn.value;
      offLbl.textContent = offLblText();
      render();
    });
    offIn.addEventListener("change",()=>{
      if(iface.port_position){ pushUndo(); syncYamlFromConfig(); }
    });
  }

  ch("button", {
    text:"＋ インターフェース追加",
    style:{ width:"100%", marginTop:"6px", padding:"6px 8px",
      background:"var(--bg3)", border:"1px dashed var(--accent)",
      color:"var(--accent)", borderRadius:"4px", cursor:"pointer",
      fontSize:"11px", fontWeight:"600" },
    on:{ click:()=>{
      pushUndo();
      const num = obj.interfaces.length;
      let nextId = "eth"+num;
      const existing = new Set(obj.interfaces.map(i=>i.id));
      while(existing.has(nextId)){ nextId = "eth"+(parseInt(nextId.slice(3),10)+1); }
      obj.interfaces.push({
        id: nextId,
        ip:"", network:"", mac:"", speed:1000, port_type:"rj45", status:"up"
      });
      renderAndSync(); openPropertyPanel();
      toast(`Interface ${nextId} を追加`, "ok");
    }}
  }, sec);

  // === Bonding section ===
  renderBondingSection(body, obj, kind);
  // === vPC section (switches only) ===
  if(kind === "device" && (obj.type === "l3switch" || obj.type === "l2switch")){
    renderVpcSection(body, obj);
  }
}

function renderBondingSection(parent, obj, kind){
  const sec = ch("div", { class:"sub-section", style:{ marginTop:"10px" } }, parent);
  obj.bonding = obj.bonding || {};
  const enabled = !!obj.bonding.enabled;
  const headerRow = ch("div",{
    style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px",
      padding:"6px 8px",background:enabled?"rgba(6,182,212,0.12)":"var(--bg2)",
      borderRadius:"5px",border:"1px solid "+(enabled?"var(--cyan)":"var(--border)")}
  },sec);
  const leftHd = ch("div",{style:{display:"flex",alignItems:"center",gap:"8px"}},headerRow);
  ch("span",{text:"🔗",style:{fontSize:"14px"}},leftHd);
  ch("h4",{text:"NIC ボンディング",style:{margin:0,fontSize:"12px",color:enabled?"var(--cyan)":"var(--text)"}},leftHd);
  const tgWrap = ch("label",{
    style:{display:"flex",alignItems:"center",gap:"4px",cursor:"pointer",fontSize:"11px"}
  },headerRow);
  const tg = ch("input",{type:"checkbox"},tgWrap);
  tg.checked = enabled;
  ch("span",{text: enabled ? "有効" : "無効",style:{color:enabled?"var(--cyan)":"var(--text-mute)",fontFamily:"var(--mono)"}},tgWrap);
  tg.addEventListener("change",()=>{
    pushUndo();
    obj.bonding.enabled = tg.checked;
    if(tg.checked){
      if(!obj.bonding.bond_name) obj.bonding.bond_name = "bond0";
      if(!obj.bonding.mode) obj.bonding.mode = "active-backup";
      if(!obj.bonding.members || !obj.bonding.members.length){
        obj.bonding.members = (obj.interfaces||[]).slice(0,Math.min(2,(obj.interfaces||[]).length)).map(i=>i.id);
      }
      if(!obj.bonding.primary && obj.bonding.members.length) obj.bonding.primary = obj.bonding.members[0];
    }
    renderAndSync(); openPropertyPanel();
    toast(`ボンディング ${tg.checked?"有効化":"無効化"}`, "ok");
  });

  if(!enabled){
    ch("div",{
      text:"チェックボックスを有効にすると、複数のインターフェースを束ねて可視化されます (LACP/active-backup/balance-rr 等)。",
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"6px 4px",lineHeight:"1.4"}
    },sec);
    return;
  }

  const ifs = obj.interfaces || [];
  const fldStyle = { width:"100%", padding:"4px 6px", fontSize:"11px", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:"3px", fontFamily:"var(--mono)" };
  const lblStyle = { fontSize:"10px", color:"var(--text-dim)", display:"block", marginBottom:"1px" };

  const row1 = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:"6px",marginBottom:"6px"}},sec);
  const r1a = ch("div",{},row1);
  ch("label",{text:"Bond名",style:lblStyle},r1a);
  const nameIn = ch("input",{type:"text",value:obj.bonding.bond_name||"bond0",style:fldStyle},r1a);
  nameIn.addEventListener("change",()=>{ obj.bonding.bond_name=nameIn.value||"bond0"; renderAndSync(); });
  const r1b = ch("div",{},row1);
  ch("label",{text:"モード",style:lblStyle},r1b);
  const modeSel = ch("select",{style:fldStyle},r1b);
  const modes = [
    { v:"active-backup", l:"active-backup (Mode 1)" },
    { v:"balance-rr",    l:"balance-rr (Mode 0)" },
    { v:"balance-xor",   l:"balance-xor (Mode 2)" },
    { v:"broadcast",     l:"broadcast (Mode 3)" },
    { v:"802.3ad",       l:"802.3ad LACP (Mode 4)" },
    { v:"balance-tlb",   l:"balance-tlb (Mode 5)" },
    { v:"balance-alb",   l:"balance-alb (Mode 6)" }
  ];
  for(const m of modes){
    const o = ch("option",{value:m.v,text:m.l},modeSel);
    if(m.v===(obj.bonding.mode||"active-backup")) o.selected = true;
  }
  modeSel.addEventListener("change",()=>{ obj.bonding.mode=modeSel.value; renderAndSync(); openPropertyPanel(); });

  ch("label",{text:`メンバーインターフェース (${(obj.bonding.members||[]).length}個選択中)`,
    style:{ ...lblStyle, marginTop:"4px" }},sec);
  const memList = ch("div",{
    style:{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",
      padding:"4px",maxHeight:"110px",overflowY:"auto"}
  },sec);
  if(!ifs.length){
    ch("div",{text:"(インターフェースなし — 上で追加してください)",
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"4px"}},memList);
  } else {
    for(const iface of ifs){
      const row = ch("label",{
        style:{ display:"flex", alignItems:"center", gap:"6px", padding:"3px 4px", fontSize:"11px", cursor:"pointer", borderRadius:"2px" }
      },memList);
      const cb = ch("input",{type:"checkbox"},row);
      cb.checked = (obj.bonding.members||[]).includes(iface.id);
      ch("span",{text:iface.id,style:{fontFamily:"var(--mono)",fontWeight:"600",minWidth:"70px"}},row);
      ch("span",{text:iface.ip||"(no IP)",style:{color:"var(--text-mute)",fontSize:"10px",fontFamily:"var(--mono)"}},row);
      cb.addEventListener("change",()=>{
        obj.bonding.members = obj.bonding.members || [];
        if(cb.checked){
          if(!obj.bonding.members.includes(iface.id)) obj.bonding.members.push(iface.id);
        } else {
          obj.bonding.members = obj.bonding.members.filter(x=>x!==iface.id);
          if(obj.bonding.primary === iface.id) obj.bonding.primary = obj.bonding.members[0]||"";
        }
        renderAndSync(); openPropertyPanel();
      });
    }
  }

  const showPrimary = (obj.bonding.mode||"active-backup") === "active-backup";
  const row3 = ch("div",{style:{display:"grid",gridTemplateColumns: showPrimary?"1fr 1.5fr":"1fr",gap:"6px",marginTop:"6px"}},sec);
  if(showPrimary){
    const r3a = ch("div",{},row3);
    ch("label",{text:"Primary Member",style:lblStyle},r3a);
    const pSel = ch("select",{style:fldStyle},r3a);
    for(const m of (obj.bonding.members||[])){
      const o = ch("option",{value:m,text:m},pSel);
      if(m===obj.bonding.primary) o.selected = true;
    }
    pSel.addEventListener("change",()=>{ obj.bonding.primary=pSel.value; renderAndSync(); });
  }
  const r3b = ch("div",{},row3);
  ch("label",{text:"Bond IPv4 (例: 10.0.0.10/24)",style:lblStyle},r3b);
  const bipIn = ch("input",{type:"text",value:obj.bonding.bond_ip||"",placeholder:"10.0.0.10/24",style:fldStyle},r3b);
  bipIn.addEventListener("change",()=>{ obj.bonding.bond_ip=bipIn.value; renderAndSync(); });
  // Bond IPv6 row
  const r3c = ch("div",{style:{marginTop:"6px"}},sec);
  ch("label",{text:"Bond IPv6 (例: 2001:db8::10/64)",style:lblStyle},r3c);
  const b6In = ch("input",{type:"text",value:obj.bonding.bond_ipv6||"",placeholder:"2001:db8::10/64",style:fldStyle},r3c);
  b6In.addEventListener("change",()=>{ obj.bonding.bond_ipv6=b6In.value; renderAndSync(); });
}

function renderVpcSection(parent, obj){
  const sec = ch("div", { class:"sub-section", style:{ marginTop:"10px" } }, parent);
  obj.vpc = obj.vpc || {};
  const enabled = !!obj.vpc.enabled;
  const headerRow = ch("div",{
    style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px",
      padding:"6px 8px",background:enabled?"rgba(163,113,247,0.12)":"var(--bg2)",
      borderRadius:"5px",border:"1px solid "+(enabled?"var(--purple)":"var(--border)")}
  },sec);
  const leftHd = ch("div",{style:{display:"flex",alignItems:"center",gap:"8px"}},headerRow);
  ch("span",{text:"🟣",style:{fontSize:"14px"}},leftHd);
  ch("h4",{text:"vPC (Virtual Port-Channel)",style:{margin:0,fontSize:"12px",color:enabled?"var(--purple)":"var(--text)"}},leftHd);
  const tgWrap = ch("label",{style:{ display:"flex", alignItems:"center", gap:"4px", cursor:"pointer", fontSize:"11px" }},headerRow);
  const tg = ch("input",{type:"checkbox"},tgWrap);
  tg.checked = enabled;
  ch("span",{text: enabled ? "有効" : "無効",style:{color:enabled?"var(--purple)":"var(--text-mute)",fontFamily:"var(--mono)"}},tgWrap);
  tg.addEventListener("change",()=>{
    pushUndo();
    obj.vpc.enabled = tg.checked;
    if(tg.checked){
      if(!obj.vpc.domain) obj.vpc.domain = 1;
    }
    renderAndSync(); openPropertyPanel();
    toast(`vPC ${tg.checked?"有効化":"無効化"}`, "ok");
  });
  if(!enabled){
    ch("div",{
      text:"vPCを有効化すると2台のスイッチがピアとして表示され、紫色のpeer-linkが描画されます。",
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"6px 4px",lineHeight:"1.4"}
    },sec);
    return;
  }
  const fldStyle = { width:"100%", padding:"4px 6px", fontSize:"11px", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:"3px", fontFamily:"var(--mono)" };
  const lblStyle = { fontSize:"10px", color:"var(--text-dim)", display:"block", marginBottom:"1px" };
  const allSwitches = (App.config.devices||[]).filter(d=>d.id !== obj.id && (d.type==="l3switch"||d.type==="l2switch"));
  const row = ch("div",{style:{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr",gap:"6px"}},sec);
  const r1 = ch("div",{},row);
  ch("label",{text:"Peer Device",style:lblStyle},r1);
  const pSel = ch("select",{style:fldStyle},r1);
  ch("option",{value:"",text:"-- 選択 --"},pSel);
  for(const sw of allSwitches){
    const o = ch("option",{value:sw.id,text:sw.id+(sw.label?" ("+sw.label+")":"")},pSel);
    if(sw.id===obj.vpc.peer) o.selected = true;
  }
  pSel.addEventListener("change",()=>{
    obj.vpc.peer = pSel.value;
    const peer = Cfg.byId("devices", pSel.value);
    if(peer){
      peer.vpc = peer.vpc || {};
      peer.vpc.enabled = true;
      peer.vpc.peer = obj.id;
      peer.vpc.domain = obj.vpc.domain || 1;
    }
    renderAndSync();
  });
  const r2 = ch("div",{},row);
  ch("label",{text:"Domain ID",style:lblStyle},r2);
  const dIn = ch("input",{type:"number",value:String(obj.vpc.domain||1),style:fldStyle},r2);
  dIn.addEventListener("change",()=>{ obj.vpc.domain=+dIn.value||1; renderAndSync(); });
  const r3 = ch("div",{},row);
  ch("label",{text:"Keepalive IP",style:lblStyle},r3);
  const kIn = ch("input",{type:"text",value:obj.vpc.keepalive||"",placeholder:"10.255.0.1",style:fldStyle},r3);
  kIn.addEventListener("change",()=>{ obj.vpc.keepalive=kIn.value; renderAndSync(); });
}

function renameId(kind, oldId, newId){
  const col = kindToCol(kind);
  const arr = App.config[col] || [];
  if(arr.some(x => x.id === newId && x.id !== oldId)){
    Log.warn(`ID "${newId}" は既に使用されています`);
    return;
  }
  const obj = Cfg.byId(col, oldId);
  if(!obj) return;
  pushUndo();
  obj.id = newId;
  // update references
  if(kind === "server"){
    for(const sv of (App.config.services||[])) if(sv.server===oldId) sv.server = newId;
    for(const c of (App.config.connections||[])){
      if(c.from && c.from.server===oldId) c.from.server = newId;
      if(c.to && c.to.server===oldId) c.to.server = newId;
    }
  } else if(kind === "device"){
    for(const c of (App.config.connections||[])){
      if(c.from && c.from.device===oldId) c.from.device = newId;
      if(c.to && c.to.device===oldId) c.to.device = newId;
    }
    for(const rt of (App.config.routing_tables||[])) if(rt.device===oldId) rt.device = newId;
    for(const p of (App.config.policies||[])) if(p.device===oldId) p.device = newId;
    for(const v of (App.config.vpn_tunnels||[])){
      for(const ep of (v.endpoints||[])) if(ep.device===oldId) ep.device = newId;
    }
  } else if(kind === "service"){
    for(const sv of (App.config.services||[])){
      if(sv.depends_on) sv.depends_on = sv.depends_on.map(x=> x===oldId ? newId : x);
      if(sv.config && sv.config.upstream)
        sv.config.upstream = sv.config.upstream.map(x=> x===oldId ? newId : x);
      if(sv.config && sv.config.replication_to)
        sv.config.replication_to = sv.config.replication_to.map(x=> x===oldId ? newId : x);
    }
    for(const sc of (App.config.scenarios||[])){
      for(const st of (sc.steps||[])){
        if(st.from === oldId) st.from = newId;
        if(st.to === oldId) st.to = newId;
      }
    }
  } else if(kind === "network"){
    for(const d of [...(App.config.devices||[]), ...(App.config.servers||[])]){
      for(const i of (d.interfaces||[])) if(i.network===oldId) i.network = newId;
    }
  }
  App.selected = { kind, id:newId };
  renderAndSync();
  openPropertyPanel();
}

/* ====== DIALOGS ====== */
function openDialog(title, contentFn){
  const overlay = $("#dialog-overlay");
  const d = $("#dialog");
  d.innerHTML = "";
  ch("h3", { text:title }, d);
  const body = ch("div", {}, d);
  const result = contentFn(body) || {};
  const actions = ch("div", { class:"actions" }, d);
  for(const b of (result.buttons || [{ text:"閉じる", action: closeDialog }])){
    const btn = ch("button", { text:b.text, class: b.primary?"primary":"" }, actions);
    btn.addEventListener("click", b.action);
  }
  overlay.classList.remove("hidden");
}
function closeDialog(){ $("#dialog-overlay").classList.add("hidden"); }

function showRoutingTable(deviceId){
  const rt = (App.config.routing_tables||[]).find(r=>r.device===deviceId);
  openDialog(`Routing Table — ${deviceId}`, (body)=>{
    if(!rt || !rt.routes || !rt.routes.length){
      ch("p", { text:"(no routes defined)" }, body);
      return;
    }
    const tbl = ch("table", {}, body);
    const tr = ch("tr", {}, ch("thead", {}, tbl));
    for(const h of ["Destination","Next Hop","Interface","Metric","Type","Status"]) ch("th", { text:h }, tr);
    const tb = ch("tbody", {}, tbl);
    for(const r of rt.routes){
      const row = ch("tr", {}, tb);
      ch("td", { text:r.destination||"" }, row);
      ch("td", { text:r.next_hop||"" }, row);
      ch("td", { text:r.interface||"" }, row);
      ch("td", { text:String(r.metric==null?"":r.metric) }, row);
      ch("td", { text:r.type||"" }, row);
      const td = ch("td", {}, row);
      ch("span", { class:"tag "+(r.status==="active"?"up":"down"), text:r.status||"active" }, td);
    }
  });
}

function showArpTable(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  openDialog(`ARP Table — ${id}`, (body)=>{
    if(!obj || !obj.interfaces){ ch("p", { text:"(no interfaces)" }, body); return; }
    const tbl = ch("table", {}, body);
    const head = ch("tr", {}, ch("thead", {}, tbl));
    for(const h of ["IP","MAC","Interface"]) ch("th", { text:h }, head);
    const tb = ch("tbody", {}, tbl);
    let count = 0;
    for(const i of obj.interfaces){
      if(!i.ip) continue;
      for(const c of (App.config.connections||[])){
        let me, peer;
        if(c.from && (c.from.device===id||c.from.server===id) && c.from.interface===i.id){ me=c.from; peer=c.to; }
        else if(c.to && (c.to.device===id||c.to.server===id) && c.to.interface===i.id){ me=c.to; peer=c.from; }
        else continue;
        const pk = peer.device ? "device" : "server";
        const pObj = Cfg.byId(kindToCol(pk), peer.device||peer.server);
        if(!pObj) continue;
        const pIf = (pObj.interfaces||[]).find(x=>x.id===peer.interface);
        if(!pIf) continue;
        const row = ch("tr", {}, tb);
        ch("td", { text:(pIf.ip||"").split("/")[0] }, row);
        ch("td", { text:pIf.mac||"-" }, row);
        ch("td", { text:i.id }, row);
        count++;
      }
    }
    if(count === 0) ch("p", { text:"(no ARP entries)", style:{color:"var(--text-mute)"} }, body);
  });
}

function showInterfaces(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  openDialog(`Interfaces — ${id}`, (body)=>{
    if(!obj || !obj.interfaces || !obj.interfaces.length){ ch("p", { text:"(none)" }, body); return; }
    const tbl = ch("table", {}, body);
    const head = ch("tr", {}, ch("thead", {}, tbl));
    for(const h of ["ID","IP","MAC","Speed","Status","Network"]) ch("th", { text:h }, head);
    const tb = ch("tbody", {}, tbl);
    for(const i of obj.interfaces){
      const row = ch("tr", {}, tb);
      ch("td", { text:i.id||"" }, row);
      ch("td", { text:i.ip||"" }, row);
      ch("td", { text:i.mac||"" }, row);
      ch("td", { text:i.speed?(i.speed>=1000?(i.speed/1000)+"G":i.speed+"M"):"" }, row);
      const td = ch("td", {}, row);
      ch("span", { class:"tag "+(i.status==="up"?"up":i.status==="down"?"down":"err"), text:i.status||"up" }, td);
      ch("td", { text:i.network||"" }, row);
    }
  });
}

/* ====== INTERFACE MANAGEMENT DIALOGS (from context menu) ====== */
function promptAddInterface(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  const allNets = (App.config.networks||[]).map(n=>n.id);
  obj.interfaces = obj.interfaces || [];
  const existingIds = new Set(obj.interfaces.map(i=>i.id));
  let nextId = "eth"+obj.interfaces.length;
  while(existingIds.has(nextId)){ nextId = "eth"+(parseInt(nextId.slice(3),10)+1); }

  openDialog(`➕ インターフェース追加 — ${obj.label||id}`, (body)=>{
    addField(body, "ID", "text", nextId, v=>nextId=v.trim());
    let ip = "", ipv6 = "", network = "", mac = "", speed = 1000, port_type = "rj45";
    addField(body, "IPv4 / CIDR (任意)", "text", "", v=>ip=v);
    addField(body, "IPv6 / CIDR (任意)", "text", "", v=>ipv6=v);
    const nf = ch("div",{class:"field"},body);
    ch("label",{text:"Network"},nf);
    const nSel = ch("select",{},nf);
    ch("option",{value:"",text:"-- 未割当 --"},nSel);
    for(const n of allNets) ch("option",{value:n,text:n},nSel);
    nSel.addEventListener("change",()=>network=nSel.value);
    addField(body, "MAC", "text", "", v=>mac=v);
    const row = ch("div",{class:"field-grid"},body);
    addField(row, "Speed (Mbps)", "number", 1000, v=>speed=+v||1000);
    const pf = ch("div",{class:"field"},row);
    ch("label",{text:"ポート種別"},pf);
    const pSel = ch("select",{},pf);
    for(const t of ["rj45","sfp","sfp+","qsfp","qsfp+","qsfp28","console","mgmt"]){
      const o = ch("option",{value:t,text:t.toUpperCase()},pSel);
      if(t === "rj45") o.selected = true;
    }
    pSel.addEventListener("change",()=>port_type=pSel.value);
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"追加", primary:true, action:()=>{
          if(!nextId){ toast("IDは必須です","err"); return; }
          if(existingIds.has(nextId)){ toast(`ID "${nextId}" は既に存在します`,"err"); return; }
          pushUndo();
          const newIf = { id:nextId, mac, speed, port_type, status:"up" };
          if(ip) newIf.ip = ip;
          if(ipv6) newIf.ipv6 = ipv6;
          if(network) newIf.network = network;
          obj.interfaces.push(newIf);
          renderAndSync();
          if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
          closeDialog();
          toast(`Interface ${nextId} を追加`, "ok");
        }}
      ]
    };
  });
}

function openInterfaceManager(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  openDialog(`✏ インターフェース管理 — ${obj.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      ch("p", {
        text:`${(obj.interfaces||[]).length} 個のインターフェース。各行をクリックで詳細編集 (プロパティパネル)。`,
        style:{margin:"0 0 8px 0",fontSize:"11px",color:"var(--text-dim)"}
      }, body);
      const list = ch("div", { style:{maxHeight:"300px",overflowY:"auto",border:"1px solid var(--border)",borderRadius:"4px",padding:"4px"} }, body);
      if(!obj.interfaces || !obj.interfaces.length){
        ch("div",{ text:"(インターフェースなし)", style:{padding:"12px",textAlign:"center",color:"var(--text-mute)"} },list);
      }
      for(let i=0;i<(obj.interfaces||[]).length;i++){
        const iface = obj.interfaces[i];
        const linked = (App.config.connections||[]).some(c=>
          ((c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===iface.id) ||
           (c.to && (c.to.device===obj.id||c.to.server===obj.id) && c.to.interface===iface.id)));
        const row = ch("div",{
          style:{display:"flex",alignItems:"center",gap:"8px",padding:"6px 8px",
            background:"var(--bg2)",borderRadius:"3px",marginBottom:"3px",
            borderLeft:"3px solid "+(linked?"var(--green)":"var(--border)")}
        },list);
        const tk = portTypeKey(iface);
        const sw = ({"rj45":"#5a6470","sfp":"#3b82f6","sfp-plus":"#f59e0b","qsfp":"#a855f7","qsfp-plus":"#a855f7","qsfp28":"#ef4444","console":"#06b6d4","mgmt":"#10b981"})[tk] || "#5a6470";
        ch("span",{style:{width:"14px",height:"10px",background:sw,borderRadius:"2px",display:"inline-block"}},row);
        ch("span",{text:portTypeLabel(iface),style:{fontFamily:"var(--mono)",fontSize:"10px",fontWeight:"700",color:"var(--accent)",minWidth:"60px"}},row);
        ch("span",{text:iface.id,style:{fontFamily:"var(--mono)",fontWeight:"600",minWidth:"80px"}},row);
        ch("span",{text:iface.ip||"(no IP)",style:{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--text-dim)",flex:"1"}},row);
        ch("span",{
          class:"tag "+(iface.status==="up"?"up":iface.status==="down"?"down":"err"),
          text:iface.status||"up",
          style:{fontSize:"9px",padding:"1px 6px",borderRadius:"2px"}
        },row);
        ch("button",{
          text:"編集",
          style:{background:"transparent",border:"1px solid var(--accent)",color:"var(--accent)",padding:"2px 8px",fontSize:"10px",cursor:"pointer",borderRadius:"3px"},
          on:{ click:()=>{
            closeDialog();
            selectElement(kind, id);
            openPropertyPanel();
          }}
        }, row);
        ch("button",{
          text:"×",
          style:{background:"transparent",border:"1px solid var(--red)",color:"var(--red)",padding:"2px 8px",fontSize:"10px",cursor:"pointer",borderRadius:"3px"},
          on:{ click:()=>{
            if(!confirm(`Interface "${iface.id}" を削除しますか? (接続も切れます)`)) return;
            pushUndo();
            obj.interfaces.splice(i,1);
            renderAndSync();
            if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
            refresh();
            toast(`Interface ${iface.id} を削除`, "ok");
          }}
        }, row);
      }
    }
    refresh();
    return {
      buttons:[
        { text:"+ インターフェース追加", action:()=>{ closeDialog(); promptAddInterface(kind, id); }},
        { text:"閉じる", primary:true, action: closeDialog }
      ]
    };
  });
}

function openBondingDialog(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  obj.bonding = obj.bonding || {};
  openDialog(`🔗 ボンディング設定 — ${obj.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      const enabled = !!obj.bonding.enabled;

      // Enable toggle
      const tgF = ch("div",{class:"field",style:{padding:"8px",background:enabled?"rgba(6,182,212,0.12)":"var(--bg2)",borderRadius:"4px",border:"1px solid "+(enabled?"var(--cyan)":"var(--border)")}},body);
      const tgL = ch("label",{style:{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",margin:0}},tgF);
      const tg = ch("input",{type:"checkbox"},tgL);
      tg.checked = enabled;
      ch("span",{text:"NICボンディングを有効化 (複数IFを束ねる)",style:{fontWeight:"700",color:enabled?"var(--cyan)":"var(--text)"}},tgL);
      tg.addEventListener("change",()=>{
        pushUndo();
        obj.bonding.enabled = tg.checked;
        if(tg.checked){
          if(!obj.bonding.bond_name) obj.bonding.bond_name = "bond0";
          if(!obj.bonding.mode) obj.bonding.mode = "active-backup";
          if(!obj.bonding.members || !obj.bonding.members.length){
            obj.bonding.members = (obj.interfaces||[]).slice(0,Math.min(2,(obj.interfaces||[]).length)).map(i=>i.id);
          }
          if(!obj.bonding.primary && obj.bonding.members.length) obj.bonding.primary = obj.bonding.members[0];
        }
        renderAndSync();
        if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
        refresh();
        toast(`ボンディング ${tg.checked?"有効化":"無効化"}`, "ok");
      });

      if(!enabled){
        ch("div",{
          text:"このオブジェクトのインターフェースを2つ以上選択して、active-backup, LACP, balance-rr など各種モードで束ねます。シアン色のリンクで集約点を表示します。",
          style:{fontSize:"11px",color:"var(--text-dim)",padding:"10px",lineHeight:"1.5"}
        },body);
        return;
      }

      // Bond name + mode
      addField(body, "Bond名", "text", obj.bonding.bond_name||"bond0",
        v=>{ obj.bonding.bond_name=v||"bond0"; renderAndSync(); });
      addSelectField(body, "モード",
        ["active-backup","balance-rr","balance-xor","broadcast","802.3ad","balance-tlb","balance-alb"],
        obj.bonding.mode||"active-backup",
        v=>{ obj.bonding.mode=v; renderAndSync(); refresh(); });

      // Members
      const ifs = obj.interfaces || [];
      ch("label",{text:`メンバー (${(obj.bonding.members||[]).length}個選択中)`,
        style:{fontSize:"11px",color:"var(--text-dim)",display:"block",marginTop:"8px",marginBottom:"4px"}},body);
      const memList = ch("div",{
        style:{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",padding:"6px",maxHeight:"160px",overflowY:"auto"}
      },body);
      if(!ifs.length){
        ch("div",{text:"(インターフェースなし)",style:{fontSize:"11px",color:"var(--text-mute)",padding:"4px"}},memList);
      } else {
        for(const iface of ifs){
          const r = ch("label",{
            style:{display:"flex",alignItems:"center",gap:"8px",padding:"4px 6px",fontSize:"12px",cursor:"pointer",borderRadius:"2px"}
          },memList);
          const cb = ch("input",{type:"checkbox"},r);
          cb.checked = (obj.bonding.members||[]).includes(iface.id);
          ch("span",{text:iface.id,style:{fontFamily:"var(--mono)",fontWeight:"600",minWidth:"80px"}},r);
          ch("span",{text:iface.ip||"(no IP)",style:{color:"var(--text-mute)",fontSize:"11px",fontFamily:"var(--mono)"}},r);
          cb.addEventListener("change",()=>{
            obj.bonding.members = obj.bonding.members || [];
            if(cb.checked){
              if(!obj.bonding.members.includes(iface.id)) obj.bonding.members.push(iface.id);
            } else {
              obj.bonding.members = obj.bonding.members.filter(x=>x!==iface.id);
              if(obj.bonding.primary === iface.id) obj.bonding.primary = obj.bonding.members[0]||"";
            }
            renderAndSync();
            if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
            refresh();
          });
        }
      }

      // Primary (active-backup only)
      if((obj.bonding.mode||"active-backup") === "active-backup"){
        addSelectField(body, "Primary Member", obj.bonding.members||[], obj.bonding.primary||"",
          v=>{ obj.bonding.primary=v; renderAndSync(); });
      }
      addField(body, "Bond IP (例: 10.0.0.10/24)", "text", obj.bonding.bond_ip||"",
        v=>{ obj.bonding.bond_ip=v; renderAndSync(); });
    }
    refresh();
    return {
      buttons:[{ text:"閉じる", primary:true, action: closeDialog }]
    };
  });
}

function openVpcDialog(id){
  const obj = Cfg.byId("devices", id);
  if(!obj) return;
  obj.vpc = obj.vpc || {};
  openDialog(`🟣 vPC設定 — ${obj.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      const enabled = !!obj.vpc.enabled;
      const tgF = ch("div",{class:"field",style:{padding:"8px",background:enabled?"rgba(163,113,247,0.12)":"var(--bg2)",borderRadius:"4px",border:"1px solid "+(enabled?"var(--purple)":"var(--border)")}},body);
      const tgL = ch("label",{style:{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",margin:0}},tgF);
      const tg = ch("input",{type:"checkbox"},tgL);
      tg.checked = enabled;
      ch("span",{text:"vPCを有効化 (2台のスイッチをペアにする)",style:{fontWeight:"700",color:enabled?"var(--purple)":"var(--text)"}},tgL);
      tg.addEventListener("change",()=>{
        pushUndo();
        obj.vpc.enabled = tg.checked;
        if(tg.checked && !obj.vpc.domain) obj.vpc.domain = 1;
        renderAndSync();
        if(App.selected && App.selected.kind==="device" && App.selected.id===id) openPropertyPanel();
        refresh();
        toast(`vPC ${tg.checked?"有効化":"無効化"}`,"ok");
      });
      if(!enabled){
        ch("div",{
          text:"vPCを有効化すると2台のスイッチが仮想ペアとして表示され、紫色のpeer-linkが描画されます。",
          style:{fontSize:"11px",color:"var(--text-dim)",padding:"10px",lineHeight:"1.5"}
        },body);
        return;
      }
      const allSwitches = (App.config.devices||[]).filter(d=>d.id !== obj.id && (d.type==="l3switch"||d.type==="l2switch"));
      addSelectField(body, "Peer Device",
        ["",...allSwitches.map(s=>s.id)], obj.vpc.peer||"",
        v=>{
          obj.vpc.peer = v;
          const peer = Cfg.byId("devices", v);
          if(peer){
            peer.vpc = peer.vpc || {};
            peer.vpc.enabled = true;
            peer.vpc.peer = obj.id;
            peer.vpc.domain = obj.vpc.domain || 1;
          }
          renderAndSync();
        });
      addField(body, "Domain ID", "number", obj.vpc.domain||1,
        v=>{ obj.vpc.domain=+v||1; renderAndSync(); });
      addField(body, "Keepalive IP", "text", obj.vpc.keepalive||"",
        v=>{ obj.vpc.keepalive=v; renderAndSync(); });
    }
    refresh();
    return { buttons:[{ text:"閉じる", primary:true, action: closeDialog }] };
  });
}

function showServiceConfig(id){
  const sv = Cfg.byId("services", id);
  if(!sv) return;
  openDialog(`Service Config — ${id}`, (body)=>{
    const pre = ch("pre", {
      style:{ background:"var(--bg)", padding:"10px", borderRadius:"4px", fontSize:"11px",
        margin:"0", overflow:"auto", maxHeight:"400px", color:"var(--text)" }
    }, body);
    pre.textContent = YAML.stringify(sv);
  });
}

function showDependencyTree(id){
  openDialog(`Dependency Tree — ${id}`, (body)=>{
    const root = ch("div", { style:{ fontFamily:"var(--mono)", fontSize:"11px" } }, body);
    const visited = new Set();
    function walk(svId, depth, prefix){
      if(visited.has(svId)){
        ch("div", { text: "  ".repeat(depth) + prefix + svId + "  (循環参照)",
          style:{ color:"var(--orange)" } }, root);
        return;
      }
      visited.add(svId);
      const sv = Cfg.byId("services", svId);
      if(!sv){
        ch("div", { text:"  ".repeat(depth) + prefix + svId + "  (NOT FOUND)",
          style:{ color:"var(--red)" } }, root);
        return;
      }
      const col = sv.status==="running"?"var(--green)":sv.status==="error"?"var(--red)":"var(--grey)";
      ch("div", {
        text:"  ".repeat(depth) + prefix + sv.id + " ("+(sv.label||"")+") - " + (sv.status||"running"),
        style:{ color:col }
      }, root);
      for(const d of (sv.depends_on||[])){
        walk(d, depth+1, "└─ ");
      }
    }
    walk(id, 0, "");
  });
}

/* ====== GNS3-LIKE: CLI CONSOLE ====== */
function openCliConsole(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  const prompt = (obj.label||id).toLowerCase().replace(/[^a-z0-9-]/g,"") + (kind==="device"?"#":"$");
  openDialog(`💻 Console — ${obj.label||id} (${obj.type||kind})`, (body)=>{
    const term = ch("div",{class:"cli-terminal"},body);
    const out = ch("div",{class:"cli-out"},term);
    const inrow = ch("div",{class:"cli-input-row"},term);
    ch("span",{class:"cli-ps",text:prompt+" "},inrow);
    const input = ch("input",{type:"text",autocomplete:"off",spellcheck:"false",placeholder:"help と入力でコマンド一覧"},inrow);
    function println(text, cls){
      const line = ch("div",{text:text},out);
      if(cls) line.className = cls;
      out.scrollTop = out.scrollHeight;
    }
    // Banner
    println(`*** ${obj.label||id} Console ***`, "cli-info");
    println(`Type: ${obj.type||""}  Status: ${obj.status||"running"}`, "cli-info");
    if(obj.model) println(`Model: ${obj.model}`, "cli-info");
    println("Type 'help' for command list.", "cli-info");
    println("");

    // Execute command
    function exec(line){
      println(prompt+" "+line, "cli-cmd");
      const cmd = line.trim();
      if(!cmd) return;
      const args = cmd.split(/\s+/);
      const head = args[0].toLowerCase();
      try {
        cliExec(obj, kind, head, args, println);
      } catch(e){
        println("Error: "+e.message, "cli-err");
      }
    }
    const history = [];
    let hIdx = -1;
    input.addEventListener("keydown",(e)=>{
      if(e.key === "Enter"){
        const v = input.value;
        if(v.trim()) history.push(v);
        hIdx = history.length;
        input.value = "";
        exec(v);
      } else if(e.key === "ArrowUp"){
        e.preventDefault();
        if(history.length){
          hIdx = Math.max(0, hIdx-1);
          input.value = history[hIdx]||"";
        }
      } else if(e.key === "ArrowDown"){
        e.preventDefault();
        if(hIdx < history.length-1){ hIdx++; input.value = history[hIdx]; }
        else { hIdx = history.length; input.value = ""; }
      }
    });
    setTimeout(()=>input.focus(), 50);
    return { buttons:[{ text:"閉じる", action: closeDialog }] };
  });
}

function cliExec(obj, kind, cmd, args, println){
  const id = obj.id;
  const helpText = [
    "Available commands:",
    "  help                          - show this help",
    "  show running-config           - show full configuration",
    "  show interfaces               - list interfaces",
    "  show ip route                 - routing table (devices only)",
    "  show ip interface brief       - interface summary",
    "  show arp                      - ARP cache",
    "  show version                  - device info",
    "  show service                  - services on this server",
    "  show policy                   - FW policies (firewall only)",
    "  ping <ip|host>                - ping a destination",
    "  traceroute <ip|host>          - trace route",
    "  enable/disable interface <id> - bring interface up/down",
    "  shutdown                      - stop this device",
    "  no shutdown                   - start this device",
    "  clear                         - clear screen",
    "  exit                          - close console"
  ];
  switch(cmd){
    case "help":
    case "?":
      for(const l of helpText) println(l);
      return;
    case "clear": {
      const out = println.__out || document.querySelector(".cli-out");
      if(out) out.innerHTML = "";
      return;
    }
    case "exit":
      closeDialog(); return;
    case "show": {
      const sub = (args[1]||"").toLowerCase();
      if(sub === "running-config"){
        println(YAML.stringify(obj));
      } else if(sub === "interfaces" || (sub === "ip" && (args[2]||"").toLowerCase() === "interface")){
        const brief = (args[2]||"").toLowerCase() === "interface" && (args[3]||"").toLowerCase() === "brief";
        if(!obj.interfaces || !obj.interfaces.length){ println("(no interfaces)"); return; }
        if(brief){
          println("Interface          IPv4-Address          IPv6-Address                       Status   Speed");
          println("-----------------  --------------------  ---------------------------------  -------  -------");
          for(const i of obj.interfaces){
            println(
              (i.id||"").padEnd(19) +
              ((i.ip||"-").padEnd(22)) +
              ((i.ipv6||"-").padEnd(35)) +
              ((i.status||"up").padEnd(9)) +
              (i.speed?(i.speed>=1000?(i.speed/1000)+"G":i.speed+"M"):"-")
            );
          }
        } else {
          for(const i of obj.interfaces){
            println(`interface ${i.id}`);
            if(i.ip)   println(`  ip address ${i.ip}`);
            if(i.ipv6) println(`  ipv6 address ${i.ipv6}`);
            if(!i.ip && !i.ipv6) println(`  no ip address`);
            if(i.mac) println(`  mac address ${i.mac}`);
            if(i.network) println(`  network ${i.network}`);
            if(i.speed) println(`  speed ${i.speed}M`);
            println(`  status ${i.status||"up"}`);
          }
        }
      } else if(sub === "ip" && (args[2]||"").toLowerCase() === "route"){
        if(kind !== "device"){ println("(routing only available on devices)","cli-err"); return; }
        const rt = (App.config.routing_tables||[]).find(r=>r.device===id);
        if(!rt || !rt.routes || !rt.routes.length){ println("(no routes)"); return; }
        println("Codes: C - connected, S - static, O - ospf, B - bgp");
        println("");
        for(const r of rt.routes){
          const code = (r.type||"static")[0].toUpperCase();
          const dest = r.destination||"?";
          const via = r.next_hop && r.next_hop !== "0.0.0.0" ? `via ${r.next_hop}` : "directly connected";
          println(`${code}  ${dest.padEnd(20)} ${via}, ${r.interface||""}  [${r.metric||0}]  ${r.status||"active"}`);
        }
      } else if(sub === "arp"){
        const out = println.__out || document.querySelector(".cli-out");
        showArpInline(obj, id, kind, println);
      } else if(sub === "version"){
        println(`${obj.label||id}`);
        if(obj.model) println(`Model: ${obj.model}`);
        if(obj.os) println(`OS: ${obj.os}`);
        if(obj.cpu) println(`CPU: ${obj.cpu} cores`);
        if(obj.memory) println(`Memory: ${obj.memory} MB`);
        println(`Status: ${obj.status||"running"}`);
      } else if(sub === "service" || sub === "services"){
        if(kind !== "server"){ println("(services only on servers)","cli-err"); return; }
        const svcs = (App.config.services||[]).filter(s=>s.server===id);
        if(!svcs.length){ println("(no services)"); return; }
        for(const s of svcs){
          println(`${s.id.padEnd(18)} ${(s.label||"").padEnd(16)} :${s.port||""}/${s.protocol||""}  ${s.status||"running"}`);
        }
      } else if(sub === "policy" || sub === "policies"){
        if(kind !== "device" || obj.type !== "firewall"){ println("(policy only on firewall)","cli-err"); return; }
        const pol = getFwPolicies(id);
        if(!pol || !pol.rules){ println("(no policies)"); return; }
        println("Rule              Action  Src                  Dst                  Proto  Port");
        for(const r of pol.rules){
          println(
            (r.id||"").padEnd(18) +
            (r.action||"").padEnd(8) +
            (r.src||"").padEnd(21) +
            (r.dst||"").padEnd(21) +
            (r.protocol||"any").padEnd(7) +
            (r.dst_port||"-")
          );
        }
      } else {
        println(`Unknown subcommand: ${args.slice(1).join(" ")}`, "cli-err");
      }
      return;
    }
    case "ping": {
      const target = args[1];
      if(!target){ println("Usage: ping <ip|host>", "cli-err"); return; }
      cliPing(obj, kind, target, println);
      return;
    }
    case "traceroute":
    case "trace": {
      const target = args[1];
      if(!target){ println("Usage: traceroute <ip|host>", "cli-err"); return; }
      cliTraceroute(obj, kind, target, println);
      return;
    }
    case "shutdown":
      setStatus(kind, id, "stopped");
      println(`${id} is now stopped`, "cli-info");
      return;
    case "no":
      if((args[1]||"").toLowerCase() === "shutdown"){
        setStatus(kind, id, "running");
        println(`${id} is now running`, "cli-ok");
      } else {
        println("Unknown command", "cli-err");
      }
      return;
    case "enable":
    case "disable": {
      const sub = (args[1]||"").toLowerCase();
      if(sub !== "interface" && sub !== "int"){
        println(`Usage: ${cmd} interface <id>`, "cli-err"); return;
      }
      const ifId = args[2];
      const iface = (obj.interfaces||[]).find(i=>i.id===ifId);
      if(!iface){ println(`Interface ${ifId} not found`, "cli-err"); return; }
      pushUndo();
      iface.status = cmd === "enable" ? "up" : "down";
      renderAndSync();
      println(`Interface ${ifId} is now ${iface.status}`, cmd==="enable"?"cli-ok":"cli-info");
      return;
    }
    default:
      println(`Unknown command: ${cmd}. Type 'help'.`, "cli-err");
  }
}

function cliPing(obj, kind, target, println){
  // Try to resolve target by id, then by IP
  let targetIp = null, targetObj = null;
  let r = Cfg.byId("servers", target) || Cfg.byId("devices", target);
  if(r){ targetObj = r; targetIp = elementPrimaryIp(Cfg.byId("servers",target)?"server":"device", target); }
  else {
    // Try as IP
    targetIp = target;
    for(const x of [...(App.config.servers||[]),...(App.config.devices||[])]){
      if((x.interfaces||[]).some(i=>ipOnly(i.ip)===target)){ targetObj = x; break; }
      if(x.bonding && ipOnly(x.bonding.bond_ip)===target){ targetObj = x; break; }
    }
  }
  if(!targetIp){ println(`Cannot resolve ${target}`, "cli-err"); return; }
  println(`PING ${target} (${targetIp}): 56 data bytes`);
  const path = computePath(kind, obj, targetIp, "icmp", null);
  if(path.ok){
    let i = 0;
    const send = ()=>{
      const t = 1 + Math.floor(Math.random()*4);
      println(`64 bytes from ${targetIp}: icmp_seq=${i} ttl=64 time=${t}.${Math.floor(Math.random()*900+100)} ms`,"cli-ok");
      i++;
      if(i < 4) setTimeout(send, 280);
      else {
        println("");
        println(`--- ${target} ping statistics ---`);
        println("4 packets transmitted, 4 received, 0% packet loss");
      }
    };
    send();
    animatePacket(path.path, false, ()=>{});
  } else {
    let i=0;
    const tryReq = ()=>{
      println(`Request timeout for icmp_seq ${i}`, "cli-err");
      i++;
      if(i<3) setTimeout(tryReq, 300);
      else {
        println("");
        println(`${path.reason}`, "cli-err");
        println(`--- ${target} ping statistics ---`);
        println("3 packets transmitted, 0 received, 100% packet loss");
      }
    };
    tryReq();
    animatePacket(path.path, true, ()=>{});
  }
}

function cliTraceroute(obj, kind, target, println){
  let targetIp = null;
  let r = Cfg.byId("servers", target) || Cfg.byId("devices", target);
  if(r){ targetIp = elementPrimaryIp(Cfg.byId("servers",target)?"server":"device", target); }
  else { targetIp = target; }
  if(!targetIp){ println(`Cannot resolve ${target}`, "cli-err"); return; }
  println(`traceroute to ${target} (${targetIp}), 30 hops max`);
  const path = computePath(kind, obj, targetIp, "icmp", null);
  if(!path.path || path.path.length === 0){ println("(no path)", "cli-err"); return; }
  for(let i=0;i<path.path.length;i++){
    const hop = path.path[i];
    const hopObj = Cfg.byId(kindToCol(hop.kind), hop.id);
    const ip = hopObj ? elementPrimaryIp(hop.kind, hop.id) : "?";
    const t1 = (Math.random()*5+1).toFixed(1);
    const t2 = (Math.random()*5+1).toFixed(1);
    const t3 = (Math.random()*5+1).toFixed(1);
    println(` ${(i+1).toString().padStart(2)} ${(hop.id+" ("+ip+")").padEnd(40)} ${t1} ms  ${t2} ms  ${t3} ms`);
  }
  if(!path.ok){
    println(`${path.reason}`, "cli-err");
  }
  animatePacket(path.path, !path.ok, ()=>{});
}

function showArpInline(obj, id, kind, println){
  if(!obj.interfaces){ println("(no interfaces)"); return; }
  println("Address          HWaddress           Iface");
  let count = 0;
  for(const i of obj.interfaces){
    if(!i.ip) continue;
    for(const c of (App.config.connections||[])){
      let me, peer;
      if(c.from && (c.from.device===id||c.from.server===id) && c.from.interface===i.id){ me=c.from; peer=c.to; }
      else if(c.to && (c.to.device===id||c.to.server===id) && c.to.interface===i.id){ me=c.to; peer=c.from; }
      else continue;
      const pk = peer.device ? "device" : "server";
      const pObj = Cfg.byId(kindToCol(pk), peer.device||peer.server);
      if(!pObj) continue;
      const pIf = (pObj.interfaces||[]).find(x=>x.id===peer.interface);
      if(!pIf) continue;
      println(`${(ipOnly(pIf.ip)||"-").padEnd(17)} ${(pIf.mac||"-").padEnd(19)} ${i.id}`);
      count++;
    }
  }
  if(!count) println("(no entries)");
}

function promptTraceroute(srcKind, srcId){
  const targets = [];
  for(const s of (App.config.servers||[])){
    if(s.id === srcId) continue;
    targets.push({ id:s.id, label:`${s.label||s.id} (${elementPrimaryIp("server",s.id)||"?"})` });
  }
  for(const d of (App.config.devices||[])){
    if(d.id === srcId) continue;
    targets.push({ id:d.id, label:`${d.label||d.id} (${elementPrimaryIp("device",d.id)||"?"})` });
  }
  openDialog("Tracerouteシミュレーション", (body)=>{
    ch("p", { text:`From: ${srcId}`, style:{margin:"0 0 8px 0",fontSize:"12px",color:"var(--text-dim)"} }, body);
    const f = ch("div", { class:"field" }, body);
    ch("label", { text:"Target" }, f);
    const sel = ch("select", {}, f);
    for(const t of targets) ch("option", { value:t.id, text:t.label }, sel);
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"Trace", primary:true, action:()=>{
          const tid = sel.value; closeDialog();
          if(tid){
            const src = Cfg.byId(kindToCol(srcKind), srcId);
            const dst = Cfg.byId("servers", tid) || Cfg.byId("devices", tid);
            if(!src || !dst){ toast("Source/Target not found","err"); return; }
            const dstKind = Cfg.byId("servers", tid) ? "server" : "device";
            const dstIp = elementPrimaryIp(dstKind, tid);
            const p = computePath(srcKind, src, dstIp, "icmp", null);
            Log.info(`Traceroute ${srcId} → ${tid} (${dstIp}):`);
            for(let i=0;i<p.path.length;i++){
              const h = p.path[i];
              const hipv = elementPrimaryIp(h.kind, h.id) || "?";
              Log.info(`  ${i+1}: ${h.id} (${hipv})`);
            }
            if(p.ok){ toast("Traceroute 完了","ok"); animatePacket(p.path, false, ()=>{}); }
            else { Log.error(p.reason); toast("Traceroute 失敗: "+p.reason, "err"); animatePacket(p.path, true, ()=>{}); }
          }
        }}
      ]
    };
  });
}

/* ====== GNS3-LIKE: PACKET CAPTURE ====== */
const PCAP = { sessions: {} };
function openPacketCapture(connId){
  const c = Cfg.byId("connections", connId); if(!c) return;
  // Session for this connection
  let session = PCAP.sessions[connId];
  if(!session){
    session = PCAP.sessions[connId] = { packets:[], running:true };
  }
  const fromObj = c.from.device ? Cfg.byId("devices", c.from.device) : Cfg.byId("servers", c.from.server);
  const toObj = c.to.device ? Cfg.byId("devices", c.to.device) : Cfg.byId("servers", c.to.server);
  openDialog(`📡 Packet Capture — ${connId}`, (body)=>{
    const status = ch("div",{class:"pcap-status"},body);
    ch("span",{class:"pcap-pulse"},status);
    ch("span",{text:"Live Capturing"},status);
    ch("span",{style:{marginLeft:"auto",fontFamily:"var(--mono)",fontSize:"11px"},
      text:`${fromObj?fromObj.id:"?"} ↔ ${toObj?toObj.id:"?"}`},status);

    const log = ch("div",{class:"pcap-log"},body);
    function renderPcap(){
      log.innerHTML = "";
      const head = ch("div",{class:"pcap-row head"},log);
      for(const c of ["Time","Length","Source","Destination","Proto","Port","Info"]){
        ch("div",{text:c},head);
      }
      for(const p of session.packets){
        const row = ch("div",{class:"pcap-row"+(p.dir==="rev"?" dir-rev":"")},log);
        ch("div",{text:p.t},row);
        ch("div",{text:String(p.len||"64")},row);
        ch("div",{text:p.src||"?"},row);
        ch("div",{text:p.dst||"?"},row);
        ch("div",{class:"col-proto",text:p.proto||"-"},row);
        ch("div",{text:String(p.port||"-")},row);
        ch("div",{text:p.info||""},row);
      }
      log.scrollTop = log.scrollHeight;
    }
    renderPcap();

    // Subscribe to packets emitted by simulation/animation
    session._listener = (pkt)=>{
      session.packets.push(pkt);
      if(session.packets.length > 200) session.packets.shift();
      renderPcap();
    };

    // If session has no packets yet, generate sample based on connection traffic level
    if(!session.packets.length && (c.traffic||"idle") !== "idle"){
      const protos = [
        { proto:"HTTP", port:80 }, { proto:"HTTPS", port:443 },
        { proto:"TCP", port:8080 }, { proto:"DNS", port:53 }
      ];
      const cnt = c.traffic==="high"?12 : c.traffic==="medium"?6 : 3;
      const fIp = fromObj && elementPrimaryIp(c.from.device?"device":"server", fromObj.id) || "?";
      const tIp = toObj && elementPrimaryIp(c.to.device?"device":"server", toObj.id) || "?";
      const now = Date.now();
      for(let i=0;i<cnt;i++){
        const pr = protos[Math.floor(Math.random()*protos.length)];
        const fwd = Math.random() > 0.4;
        session.packets.push({
          t: new Date(now - (cnt-i)*200).toTimeString().slice(0,8) + "." + (Math.floor(Math.random()*900+100)),
          len: 64 + Math.floor(Math.random()*1400),
          src: fwd?fIp:tIp,
          dst: fwd?tIp:fIp,
          proto: pr.proto,
          port: pr.port,
          info: fwd ? "→ "+(pr.proto==="DNS"?"Standard query":"data segment") : "← reply",
          dir: fwd?"fwd":"rev"
        });
      }
      renderPcap();
    }
    return {
      buttons:[
        { text:"クリア", action:()=>{ session.packets=[]; renderPcap(); }},
        { text:"閉じる", action:()=>{
          session._listener = null;
          closeDialog();
        }}
      ]
    };
  });
}
function emitPacket(connId, pkt){
  const s = PCAP.sessions[connId];
  if(s && s._listener) s._listener(pkt);
}

/* ====== SCENARIO MANAGER (add/edit/delete scenarios via UI) ====== */
function openScenarioManager(){
  Cfg.ensure();
  openDialog("📋 シナリオ管理", (body)=>{
    ch("p", {
      text:"シナリオはパケットフローのテストです。1つのシナリオは順番に実行される複数のステップ(from→to)で構成されます。",
      style:{margin:"0 0 10px 0",fontSize:"11px",color:"var(--text-dim)",lineHeight:"1.4"}
    }, body);

    const list = ch("div", { class:"scen-list" }, body);

    function refreshList(){
      list.innerHTML = "";
      const scs = App.config.scenarios || [];
      if(!scs.length){
        ch("div",{text:"(シナリオなし - 下のボタンで追加してください)",
          style:{color:"var(--text-mute)",padding:"10px",fontSize:"11px",textAlign:"center"}},list);
      }
      for(let i=0;i<scs.length;i++){
        const s = scs[i];
        const row = ch("div",{class:"scen-row"},list);
        ch("div",{class:"scen-id",
          html: `<strong>${escapeHtml(s.label||s.id)}</strong><br><span style="color:var(--text-mute);font-size:10px">id: ${escapeHtml(s.id)} · ${(s.steps||[]).length}ステップ</span>`
        }, row);
        ch("button",{text:"▶ 実行", class:"run", on:{ click:()=>{ closeDialog(); runScenario(s.id); }}}, row);
        ch("button",{text:"編集", on:{ click:()=>{ closeDialog(); openScenarioEditor(s.id); }}}, row);
        ch("button",{text:"複製", on:{ click:()=>{
          pushUndo();
          const copy = JSON.parse(JSON.stringify(s));
          copy.id = s.id+"-copy";
          let n = 1;
          while(App.config.scenarios.find(x=>x.id===copy.id)){ copy.id = s.id+"-copy"+(++n); }
          App.config.scenarios.push(copy);
          refreshScenarioSelect(); syncYamlFromConfig();
          toast(`複製: ${copy.id}`,"ok"); refreshList();
        }}}, row);
        ch("button",{text:"×", class:"del", on:{ click:()=>{
          if(confirm(`シナリオ "${s.id}" を削除しますか?`)){
            pushUndo();
            App.config.scenarios.splice(i,1);
            refreshScenarioSelect(); syncYamlFromConfig();
            toast(`削除: ${s.id}`,"ok"); refreshList();
          }
        }}}, row);
      }
    }
    refreshList();

    return {
      buttons:[
        { text:"+ 新規シナリオ", primary:true, action:()=>{ closeDialog(); openScenarioEditor(null); }},
        { text:"閉じる", action: closeDialog }
      ]
    };
  });
}

function openScenarioEditor(scenarioId){
  Cfg.ensure();
  const isNew = !scenarioId;
  let sc;
  if(isNew){
    sc = { id: uid("scenario"), label: "New Scenario", steps: [] };
  } else {
    sc = App.config.scenarios.find(s=>s.id===scenarioId);
    if(!sc){ toast("シナリオが見つかりません","err"); return; }
    sc = JSON.parse(JSON.stringify(sc)); // edit a copy
  }

  openDialog(isNew?"📋 新規シナリオ":"📋 シナリオ編集", (body)=>{
    const idF = ch("div",{class:"field"},body);
    ch("label",{text:"ID"},idF);
    const idIn = ch("input",{type:"text",value:sc.id},idF);
    const lblF = ch("div",{class:"field"},body);
    ch("label",{text:"ラベル"},lblF);
    const lblIn = ch("input",{type:"text",value:sc.label||""},lblF);

    ch("div",{class:"field-section-title",text:"ステップ (上から順に実行)"},body);
    const stepsContainer = ch("div",{class:"scen-list"},body);

    // Collect all possible endpoints
    const endpoints = [];
    for(const n of (App.config.networks||[])) endpoints.push({ id:n.id, label:`(network) ${n.label||n.id}` });
    for(const d of (App.config.devices||[])) endpoints.push({ id:d.id, label:`(device) ${d.label||d.id}` });
    for(const s of (App.config.servers||[])) endpoints.push({ id:s.id, label:`(server) ${s.label||s.id}` });
    for(const sv of (App.config.services||[])) endpoints.push({ id:sv.id, label:`(service) ${sv.label||sv.id} on ${sv.server}` });

    function refreshSteps(){
      stepsContainer.innerHTML = "";
      if(!sc.steps.length){
        ch("div",{text:"(ステップなし - 下のボタンで追加)",
          style:{color:"var(--text-mute)",padding:"10px",fontSize:"11px",textAlign:"center"}},stepsContainer);
      }
      for(let i=0;i<sc.steps.length;i++){
        const st = sc.steps[i];
        const g = ch("div",{class:"scen-step-grid"},stepsContainer);

        const fF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:`#${i+1} From`,style:{fontSize:"9px"}},fF);
        const fSel = ch("select",{},fF);
        ch("option",{value:"",text:"--"},fSel);
        for(const e of endpoints){
          const o = ch("option",{value:e.id,text:e.label},fSel);
          if(e.id === st.from) o.selected = true;
        }
        fSel.addEventListener("change",()=>{ st.from = fSel.value; });

        const tF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:"To",style:{fontSize:"9px"}},tF);
        const tSel = ch("select",{},tF);
        ch("option",{value:"",text:"--"},tSel);
        for(const e of endpoints){
          const o = ch("option",{value:e.id,text:e.label},tSel);
          if(e.id === st.to) o.selected = true;
        }
        tSel.addEventListener("change",()=>{ st.to = tSel.value; });

        const pF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:"Protocol",style:{fontSize:"9px"}},pF);
        const pIn = ch("input",{type:"text",value:st.protocol||"TCP"},pF);
        pIn.addEventListener("change",()=>{ st.protocol = pIn.value; });

        const portF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:"Port",style:{fontSize:"9px"}},portF);
        const portIn = ch("input",{type:"number",value:st.port||80},portF);
        portIn.addEventListener("change",()=>{ st.port = +portIn.value; });

        const delBtn = ch("button",{text:"×",
          style:{height:"24px",padding:"0 6px",background:"var(--red-dim)",color:"#fff",border:"1px solid var(--red)",borderRadius:"3px",cursor:"pointer",alignSelf:"end"}},g);
        delBtn.addEventListener("click",()=>{ sc.steps.splice(i,1); refreshSteps(); });

        // Description on its own row underneath
        const descRow = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr",gap:"4px",padding:"0 4px 4px"}},stepsContainer);
        const descF = ch("div",{class:"field",style:{margin:0}},descRow);
        ch("label",{text:"説明",style:{fontSize:"9px"}},descF);
        const descIn = ch("input",{type:"text",value:st.description||"",placeholder:"このステップの説明"},descF);
        descIn.addEventListener("change",()=>{ st.description = descIn.value; });
      }
    }
    refreshSteps();

    ch("button",{
      text:"+ ステップ追加",
      style:{ width:"100%", marginTop:"6px",padding:"6px",background:"var(--bg3)",
        border:"1px dashed var(--accent)",color:"var(--accent)",borderRadius:"4px",cursor:"pointer",fontSize:"11px" },
      on:{ click:()=>{
        sc.steps.push({ from:"", to:"", protocol:"TCP", port:80, description:"" });
        refreshSteps();
      }}
    }, body);

    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"保存", primary:true, action:()=>{
          const newId = idIn.value.trim();
          if(!newId){ toast("IDは必須です","err"); return; }
          if(isNew){
            if(App.config.scenarios.find(s=>s.id===newId)){
              toast(`ID "${newId}" は既に存在します`,"err"); return;
            }
          } else if(newId !== scenarioId){
            // Renaming
            if(App.config.scenarios.find(s=>s.id===newId)){
              toast(`ID "${newId}" は既に存在します`,"err"); return;
            }
          }
          pushUndo();
          sc.id = newId;
          sc.label = lblIn.value.trim() || newId;
          // Filter out incomplete steps
          sc.steps = sc.steps.filter(s=>s.from && s.to);
          if(isNew){
            App.config.scenarios.push(sc);
          } else {
            const idx = App.config.scenarios.findIndex(s=>s.id===scenarioId);
            if(idx>=0) App.config.scenarios[idx] = sc;
          }
          refreshScenarioSelect();
          syncYamlFromConfig();
          closeDialog();
          toast(`シナリオ保存: ${sc.id} (${sc.steps.length}ステップ)`,"ok");
          // Select this scenario in dropdown
          const sel = $("#scenario-select");
          if(sel) sel.value = sc.id;
        }}
      ]
    };
  });
}
function showShortcutHelp(){
  openDialog("⌨ キーボードショートカット", (body)=>{
    const tbl = ch("table",{style:{width:"100%",fontSize:"12px"}},body);
    const rows = [
      ["ファイル",""],
      ["Ctrl+S","YAML保存"],
      ["Ctrl+Enter","YAMLを反映"],
      ["操作",""],
      ["Ctrl+Z","元に戻す (Undo)"],
      ["Ctrl+Y","やり直す (Redo)"],
      ["Delete","選択要素を削除"],
      ["Escape","選択解除/ダイアログ閉じ"],
      ["シミュレーション",""],
      ["Space","シナリオ再生/一時停止"],
      ["F5","選択中シナリオを実行"],
      ["g c","CLIコンソール (要素選択中)"],
      ["g p","Pingプロンプト"],
      ["g t","Traceroute"],
      ["?","このヘルプ"],
      ["表示",""],
      ["F","全体表示 (Fit)"],
      ["+/-","ズームイン/アウト"]
    ];
    for(const [k,v] of rows){
      const tr = ch("tr",{},tbl);
      if(v === ""){
        ch("td",{colspan:"2",text:k,style:{padding:"8px 0 4px",fontSize:"10px",textTransform:"uppercase",color:"var(--accent)",fontWeight:"700",letterSpacing:"0.5px",borderBottom:"1px solid var(--border)"}},tr);
      } else {
        const td1 = ch("td",{style:{padding:"4px 12px",width:"100px"}},tr);
        ch("kbd",{text:k,style:{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"3px",padding:"2px 6px",fontFamily:"var(--mono)",fontSize:"10px",color:"var(--accent)"}},td1);
        ch("td",{text:v,style:{padding:"4px 0",color:"var(--text)"}},tr);
      }
    }
    return { buttons:[{ text:"閉じる", primary:true, action: closeDialog }] };
  });
}

/* ====== SIMULATION ENGINE ====== */
function getRoutingTable(deviceId){
  return (App.config.routing_tables||[]).find(r=>r.device===deviceId);
}
function findRouteFor(deviceId, destIp){
  const rt = getRoutingTable(deviceId);
  if(!rt) return null;
  let best=null, bestBits=-1;
  for(const r of (rt.routes||[])){
    if(r.status!=="active") continue;
    if(!destIp || !r.destination) continue;
    if(inSubnet(destIp, r.destination)){
      const bits = cidrBits(r.destination);
      if(bits > bestBits){ best=r; bestBits=bits; }
    }
  }
  return best;
}
function getFwPolicies(deviceId){
  return (App.config.policies||[]).find(p=>p.device===deviceId);
}
function evaluatePolicy(pol, srcIp, dstIp, proto, dstPort){
  if(!pol || !pol.rules) return { action:"allow" };
  for(const r of pol.rules){
    if(r.status && r.status !== "enabled") continue;
    if(r.src && r.src !== "0.0.0.0/0" && srcIp && !inSubnet(srcIp, r.src)) continue;
    if(r.dst && r.dst !== "0.0.0.0/0" && dstIp && !inSubnet(dstIp, r.dst)) continue;
    if(r.protocol && r.protocol !== "any" && proto && r.protocol.toLowerCase() !== proto.toLowerCase()) continue;
    if(r.dst_port && dstPort && +r.dst_port !== +dstPort) continue;
    return { action: r.action, rule: r };
  }
  return { action:"deny", rule:{ id:"implicit-deny" } };
}

function elementPrimaryIp(kind, id, family){
  // family is optional: "v4" | "v6". If unspecified, prefer v4, fall back to v6.
  if(kind === "service"){
    const sv = Cfg.byId("services", id);
    if(!sv) return null;
    return elementPrimaryIp("server", sv.server, family);
  }
  if(kind === "server" || kind === "device"){
    const obj = Cfg.byId(kindToCol(kind), id);
    if(!obj) return null;
    // Bonded
    if(obj.bonding && obj.bonding.enabled){
      const members = obj.bonding.members || [];
      const upMembers = members.filter(mid=>{
        const m = (obj.interfaces||[]).find(i=>i.id===mid);
        return m && m.status === "up";
      });
      if(upMembers.length > 0){
        if(family === "v6"){
          if(obj.bonding.bond_ipv6) return ipOnly(obj.bonding.bond_ipv6);
          // fall through to interface lookup
        } else if(family === "v4"){
          if(obj.bonding.bond_ip) return ipOnly(obj.bonding.bond_ip);
        } else {
          // No family preference: try v4 first, then v6
          if(obj.bonding.bond_ip) return ipOnly(obj.bonding.bond_ip);
          if(obj.bonding.bond_ipv6) return ipOnly(obj.bonding.bond_ipv6);
        }
      }
    }
    const ifs = (obj.interfaces||[]).filter(i=>i.status==="up");
    const pool = ifs.length ? ifs : (obj.interfaces||[]);
    for(const i of pool){
      if(family === "v6"){
        if(i.ipv6) return ipOnly(i.ipv6);
      } else if(family === "v4"){
        if(i.ip && ipFamily(i.ip) === "v4") return ipOnly(i.ip);
      } else {
        // Prefer v4 then v6
        if(i.ip && ipFamily(i.ip) === "v4") return ipOnly(i.ip);
        if(i.ipv6) return ipOnly(i.ipv6);
      }
    }
    return null;
  }
  if(kind === "network"){
    const n = Cfg.byId("networks", id);
    if(!n) return null;
    if(family === "v6") return n.gateway_v6 || (ipFamily(n.gateway)==="v6"?n.gateway:null);
    if(family === "v4") return ipFamily(n.gateway)==="v4" ? n.gateway : null;
    return n.gateway || n.gateway_v6 || null;
  }
  return null;
}

function resolveScenarioEndpoint(name){
  let o = Cfg.byId("services", name);
  if(o) return { kind:"service", obj:o };
  o = Cfg.byId("servers", name);
  if(o) return { kind:"server", obj:o };
  o = Cfg.byId("devices", name);
  if(o) return { kind:"device", obj:o };
  o = Cfg.byId("networks", name);
  if(o) return { kind:"network", obj:o };
  return null;
}

function findConnectionForIface(elId, ifaceId, visited){
  // Collect all matching connections, then prefer non-visited peers
  const matches = [];
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    if(c.from && (c.from.device===elId||c.from.server===elId) && c.from.interface===ifaceId){
      const pk = c.to.device ? "device" : "server";
      matches.push({ conn:c, peerKind:pk, peerId: c.to.device||c.to.server, peerIf:c.to.interface });
    } else if(c.to && (c.to.device===elId||c.to.server===elId) && c.to.interface===ifaceId){
      const pk = c.from.device ? "device" : "server";
      matches.push({ conn:c, peerKind:pk, peerId: c.from.device||c.from.server, peerIf:c.from.interface });
    }
  }
  if(!matches.length) return null;
  if(visited && visited.size){
    // Prefer peers we haven't visited yet
    const fresh = matches.find(m=>!visited.has(m.peerId));
    if(fresh) return fresh;
  }
  return matches[0];
}

// Find any connection on element's interfaces that leads toward destination
function findEgressLink(elKind, elObj, destIp, visited){
  const destFam = ipFamily(destIp);
  const allLinks = [];
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    let me, peer;
    if(c.from && (c.from.device===elObj.id||c.from.server===elObj.id)){ me=c.from; peer=c.to; }
    else if(c.to && (c.to.device===elObj.id||c.to.server===elObj.id)){ me=c.to; peer=c.from; }
    else continue;
    const myIf = (elObj.interfaces||[]).find(i=>i.id===me.interface);
    if(!myIf || myIf.status !== "up") continue;
    const pk = peer.device ? "device" : "server";
    const peerId = peer.device||peer.server;
    const pObj = Cfg.byId(kindToCol(pk), peerId);
    if(!pObj) continue;
    // Skip already-visited peers to break loops
    if(visited && visited.has(peerId)) continue;
    allLinks.push({ conn:c, myIf, peerKind:pk, peerObj:pObj, peerIf:peer.interface, peerId });
  }
  // 1) Direct hit
  for(const l of allLinks){
    const pIf = (l.peerObj.interfaces||[]).find(i=>i.id===l.peerIf);
    if(pIf){
      for(const addr of ifaceAddresses(pIf)){
        if(ipOnly(addr) === destIp) return l;
      }
    }
    if(l.peerObj.bonding && l.peerObj.bonding.enabled){
      if(ipOnly(l.peerObj.bonding.bond_ip) === destIp) return l;
      if(ipOnly(l.peerObj.bonding.bond_ipv6) === destIp) return l;
    }
    for(const i of (l.peerObj.interfaces||[])){
      for(const addr of ifaceAddresses(i)){
        if(ipOnly(addr) === destIp) return l;
      }
    }
  }
  // 2) Same subnet (matching family)
  for(const l of allLinks){
    for(const addr of ifaceAddresses(l.myIf)){
      if(ipFamily(addr) === destFam && inSubnet(destIp, addr)) return l;
    }
  }
  // 3) First link with at least one address in destination family
  for(const l of allLinks){
    for(const addr of ifaceAddresses(l.myIf)){
      if(ipFamily(addr) === destFam) return l;
    }
  }
  return allLinks[0] || null;
}

function computePath(srcKind, srcObj, destIp, proto, dstPort){
  const center = (o)=>({ x:(o.x||0)+(o.width||(o.interfaces?130:120))/2, y:(o.y||0)+(o.height||65)/2 });
  const path = [];
  path.push({ kind:srcKind, id:srcObj.id, ...center(srcObj) });
  const visited = new Set([srcObj.id]);
  const maxHops = 30;
  let cur = { kind:srcKind, obj:srcObj };
  const destFam = ipFamily(destIp);
  // Pick a source address of matching family (so policies match cleanly)
  const srcIp = elementPrimaryIp(srcKind, srcObj.id, destFam);

  // Helper: does iface have an address (in either family) matching destIp's subnet?
  function ifaceInDestSubnet(i){
    if(!i || i.status !== "up") return false;
    for(const addr of ifaceAddresses(i)){
      if(ipFamily(addr) === destFam && inSubnet(destIp, addr)) return true;
    }
    return false;
  }
  // Helper: does iface have exactly destIp as one of its addresses?
  function ifaceHasDestIp(i){
    if(!i) return false;
    for(const addr of ifaceAddresses(i)){
      if(ipOnly(addr) === destIp) return true;
    }
    return false;
  }

  for(let hop=0; hop<maxHops; hop++){
    const curObj = cur.obj;
    if(curObj.status && curObj.status !== "running"){
      return { ok:false, path, reason: `${cur.kind} ${curObj.id} is ${curObj.status}`, blockedAt:{kind:cur.kind,id:curObj.id} };
    }
    // Arrived check — destIp matches any address on any interface (or the bond addr)
    const bondIp4 = curObj.bonding && curObj.bonding.enabled ? ipOnly(curObj.bonding.bond_ip) : null;
    const bondIp6 = curObj.bonding && curObj.bonding.enabled ? ipOnly(curObj.bonding.bond_ipv6) : null;
    const hasDest = (curObj.interfaces||[]).some(ifaceHasDestIp)
      || bondIp4 === destIp || bondIp6 === destIp;
    if(hasDest && hop > 0){
      return { ok:true, path };
    }

    // Firewall policy at this device
    if(cur.kind === "device" && curObj.type === "firewall" && hop > 0){
      const pol = getFwPolicies(curObj.id);
      if(pol){
        const res = evaluatePolicy(pol, srcIp, destIp, proto, dstPort);
        if(res.action !== "allow"){
          return { ok:false, path,
            reason:`BLOCKED by ${curObj.id} rule ${(res.rule&&res.rule.id)||"implicit-deny"} (${res.action})`,
            blockedAt:{ kind:"device", id:curObj.id } };
        }
      }
    }

    // Find egress link
    let next = null;
    if(cur.kind === "device"){
      const rt = getRoutingTable(curObj.id);
      if(rt){
        const route = findRouteFor(curObj.id, destIp);
        if(route){
          next = findConnectionForIface(curObj.id, route.interface, visited);
          if(!next){
            next = findEgressLink(cur.kind, curObj, destIp, visited);
          }
        } else {
          // No matching route in table (e.g. v6 dest with v4-only routes) — try direct connectivity
          next = findEgressLink(cur.kind, curObj, destIp, visited);
          if(!next){
            return { ok:false, path, reason:`No Route to ${destIp} on ${curObj.id}` };
          }
        }
      } else {
        next = findEgressLink(cur.kind, curObj, destIp, visited);
      }
    } else {
      // server: same subnet => direct, else gateway
      const directIf = (curObj.interfaces||[]).find(ifaceInDestSubnet);
      if(directIf){
        next = findConnectionForIface(curObj.id, directIf.id, visited);
        if(!next) next = findEgressLink(cur.kind, curObj, destIp, visited);
      } else {
        // Need a gateway in the matching family
        const gw = destFam === "v6"
          ? (curObj.gateway_v6 || (ipFamily(curObj.gateway)==="v6" ? curObj.gateway : null))
          : (ipFamily(curObj.gateway)==="v4" ? curObj.gateway : null);
        if(!gw){
          return { ok:false, path, reason:`${curObj.id}: no ${destFam==="v6"?"IPv6":"IPv4"} gateway for ${destIp}` };
        }
        const gwIf = (curObj.interfaces||[]).find(i=>{
          if(i.status !== "up") return false;
          for(const addr of ifaceAddresses(i)){
            if(ipFamily(addr) === destFam && inSubnet(gw, addr)) return true;
          }
          return false;
        });
        if(!gwIf){
          return { ok:false, path, reason:`${curObj.id}: no interface for gateway ${gw}` };
        }
        next = findConnectionForIface(curObj.id, gwIf.id, visited);
        if(!next) next = findEgressLink(cur.kind, curObj, destIp, visited);
      }
    }
    if(!next){
      return { ok:false, path, reason:`${curObj.id}: no egress link` };
    }
    if(visited.has(next.peerId)){
      return { ok:false, path, reason:`routing loop at ${next.peerId}` };
    }
    visited.add(next.peerId);
    const peerObj = (next.peerObj) || Cfg.byId(kindToCol(next.peerKind), next.peerId);
    if(!peerObj){
      return { ok:false, path, reason:`peer ${next.peerId} not found` };
    }
    path.push({ kind:next.peerKind, id:peerObj.id, ...center(peerObj), via:next.conn.id });

    // Check destination reached at peer (both v4 and v6)
    const peerHasDest = (peerObj.interfaces||[]).some(i=>{
      if(i.status !== "up") return false;
      for(const addr of ifaceAddresses(i)){
        if(ipOnly(addr) === destIp) return true;
      }
      return false;
    }) || (peerObj.bonding && peerObj.bonding.enabled && (
      ipOnly(peerObj.bonding.bond_ip) === destIp ||
      ipOnly(peerObj.bonding.bond_ipv6) === destIp
    ));
    if(peerHasDest){
      if(peerObj.status && peerObj.status !== "running"){
        return { ok:false, path, reason:`${peerObj.id} is ${peerObj.status}`, blockedAt:{kind:next.peerKind,id:peerObj.id} };
      }
      return { ok:true, path };
    }

    cur = { kind:next.peerKind, obj:peerObj };
  }
  return { ok:false, path, reason:"max hops exceeded" };
}

function executeStep(step, onComplete){
  const srcRes = resolveScenarioEndpoint(step.from);
  const dstRes = resolveScenarioEndpoint(step.to);
  if(!srcRes){ Log.error(`Step: source "${step.from}" not found`); onComplete(false); return; }
  if(!dstRes){ Log.error(`Step: destination "${step.to}" not found`); onComplete(false); return; }

  let srcKind = srcRes.kind, srcObj = srcRes.obj;
  if(srcKind === "service"){
    const host = Cfg.byId("servers", srcRes.obj.server);
    if(!host){ Log.error(`Service ${srcRes.obj.id} has no host`); onComplete(false); return; }
    srcObj = host; srcKind = "server";
  } else if(srcKind === "network"){
    // pick a device that has interface in this network
    const dev = (App.config.devices||[]).find(d=>(d.interfaces||[]).some(i=>i.network===srcRes.obj.id));
    if(dev){ srcKind="device"; srcObj=dev; }
    else { Log.error(`Network ${srcRes.obj.id}: no device available as source`); onComplete(false); return; }
  }

  let dstIp = null, dstKind = dstRes.kind;
  if(dstKind === "service"){
    const host = Cfg.byId("servers", dstRes.obj.server);
    if(!host){ Log.error(`Service ${dstRes.obj.id} has no host`); onComplete(false); return; }
    dstIp = elementPrimaryIp("server", host.id);
  } else if(dstKind === "server" || dstKind === "device"){
    dstIp = elementPrimaryIp(dstKind, dstRes.obj.id);
  } else if(dstKind === "network"){
    dstIp = dstRes.obj.gateway;
  }
  if(!dstIp){ Log.error(`Step: cannot determine destination IP for ${step.to}`); onComplete(false); return; }

  Log.info(`▸ ${step.from} → ${step.to} (${step.protocol||"?"}:${step.port||"?"})${step.description?" — "+step.description:""}`);

  const path = computePath(srcKind, srcObj, dstIp, step.protocol, step.port);
  if(!path.ok){
    Log.error(`✗ ${path.reason}`);
    animatePacket(path.path, true, ()=>onComplete(false));
    return;
  }
  // service-level check
  if(dstRes.kind === "service" && dstRes.obj.status && dstRes.obj.status !== "running"){
    Log.error(`✗ Connection Refused: service ${dstRes.obj.id} is ${dstRes.obj.status}`);
    animatePacket(path.path, true, ()=>onComplete(false));
    return;
  }
  animatePacket(path.path, false, ()=>{
    Log.info(`✓ 完了: ${step.from} → ${step.to}`);
    onComplete(true);
  });
}

function animatePacket(path, blocked, done){
  if(!path || path.length < 2){ done && done(); return; }
  const speed = App.simulation.speed;
  const layer = $("#layer-packets");
  const color = blocked ? "var(--red)" : "var(--accent)";
  const dot = ce("circle", {
    "class":"packet" + (blocked?" blocked":""),
    cx: path[0].x, cy: path[0].y, r: 6
  }, layer);

  let segIdx = 0;
  let segStart = performance.now();
  const segMs = 600 / speed;
  // Emit a pcap event for the first hop
  if(path[0] && path[0].via) emitPacket(path[0].via, { t:new Date().toTimeString().slice(0,8), src:path[0].id, dst:path[1].id, proto:"sim", port:0, len:64, info:"simulated packet", dir:"fwd" });
  function step(now){
    if(App.simulation.abort){ dot.remove(); done&&done(); return; }
    if(App.simulation.paused){
      segStart = now - 0;
      App.simulation.rafId = requestAnimationFrame(step);
      return;
    }
    const a = path[segIdx], b = path[segIdx+1];
    if(!b){ dot.remove(); done&&done(); return; }
    const t = clamp((now - segStart)/segMs, 0, 1);
    dot.setAttribute("cx", a.x + (b.x - a.x)*t);
    dot.setAttribute("cy", a.y + (b.y - a.y)*t);
    if(t >= 1){
      highlightElement(b.kind, b.id);
      // Emit pcap for this hop's link
      if(b.via){
        emitPacket(b.via, {
          t:new Date().toTimeString().slice(0,8)+"."+(Math.floor(Math.random()*900+100)),
          src:a.id, dst:b.id, proto:"sim", port:0, len:64,
          info: blocked?"BLOCKED":"forwarded",
          dir:"fwd"
        });
      }
      segIdx++;
      segStart = now;
      if(blocked && segIdx === path.length - 1){
        dot.setAttribute("fill", "#f85149");
        const el = findElementGroup(b.kind, b.id);
        if(el){
          el.classList.add("blocked-anim");
          setTimeout(()=>el.classList.remove("blocked-anim"), 700);
        }
        // X mark
        const xg = ce("g", { transform:`translate(${b.x},${b.y})` }, layer);
        ce("line", { "class":"block-x", x1:-9, y1:-9, x2:9, y2:9 }, xg);
        ce("line", { "class":"block-x", x1:9, y1:-9, x2:-9, y2:9 }, xg);
        setTimeout(()=>{ xg.remove(); }, 1500);
        setTimeout(()=>{ dot.remove(); done&&done(); }, 600);
        return;
      }
      if(segIdx >= path.length - 1){
        dot.remove();
        done&&done();
        return;
      }
    }
    App.simulation.rafId = requestAnimationFrame(step);
  }
  App.simulation.rafId = requestAnimationFrame(step);
}

function findElementGroup(kind, id){
  return $(`#layer-elements [data-kind="${kind}"][data-id="${id}"]`);
}
function highlightElement(kind, id){
  const el = findElementGroup(kind, id);
  if(!el) return;
  el.classList.add("passing");
  setTimeout(()=>el.classList.remove("passing"), 500);
}

function runScenario(id){
  const sc = (App.config.scenarios||[]).find(s=>s.id===id);
  if(!sc){ Log.warn("シナリオが見つかりません"); return; }
  if(App.simulation.running){ Log.warn("既に実行中"); return; }
  Log.info(`▶ シナリオ実行: ${sc.label||sc.id}`);
  App.simulation.running = true;
  App.simulation.paused = false;
  App.simulation.abort = false;
  pushUndo();
  let i = 0;
  const steps = sc.steps || [];
  function next(){
    if(App.simulation.abort){
      App.simulation.running = false;
      return;
    }
    if(i >= steps.length){
      Log.info(`■ シナリオ完了: ${sc.label||sc.id}`);
      App.simulation.running = false;
      return;
    }
    executeStep(steps[i++], (ok)=>{
      setTimeout(next, 250 / App.simulation.speed);
    });
  }
  next();
}

function stopSimulation(){
  App.simulation.abort = true;
  App.simulation.running = false;
  App.simulation.paused = false;
  if(App.simulation.rafId){ cancelAnimationFrame(App.simulation.rafId); App.simulation.rafId = null; }
  $("#layer-packets").innerHTML = "";
}

/* ====== PING ====== */
function promptPing(srcKind, srcId){
  const targets = [];
  for(const s of (App.config.servers||[])){
    if(s.id === srcId) continue;
    targets.push({ id:s.id, label:`${s.label||s.id} (${elementPrimaryIp("server",s.id)||"?"})` });
  }
  for(const d of (App.config.devices||[])){
    if(d.id === srcId) continue;
    targets.push({ id:d.id, label:`${d.label||d.id} (${elementPrimaryIp("device",d.id)||"?"})` });
  }
  openDialog("Pingシミュレーション", (body)=>{
    ch("p", { text:`Source: ${srcId}`, style:{margin:"0 0 8px 0", fontSize:"12px", color:"var(--text-dim)"} }, body);
    const f = ch("div", { class:"field" }, body);
    ch("label", { text:"Target" }, f);
    const sel = ch("select", {}, f);
    if(!targets.length) ch("option", { value:"", text:"(対象なし)" }, sel);
    for(const t of targets) ch("option", { value:t.id, text:t.label }, sel);
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"Ping", primary:true, action:()=>{
          const tid = sel.value;
          closeDialog();
          if(tid) doPing(srcKind, srcId, tid);
        }}
      ]
    };
  });
}

function doPing(srcKind, srcId, targetId){
  const srcObj = Cfg.byId(kindToCol(srcKind), srcId);
  if(!srcObj) return;
  let tKind, tObj;
  if((tObj = Cfg.byId("servers", targetId))){ tKind = "server"; }
  else if((tObj = Cfg.byId("devices", targetId))){ tKind = "device"; }
  if(!tObj){ Log.error("Ping: target not found"); return; }
  const dstIp = elementPrimaryIp(tKind, targetId);
  Log.info(`Pinging ${targetId} [${dstIp}] from ${srcId}...`);
  const res = computePath(srcKind, srcObj, dstIp, "icmp", null);
  if(res.ok){
    const t = 1 + Math.floor(Math.random()*4);
    Log.info(`Reply from ${dstIp}: time=${t}ms TTL=64`);
    animatePacket(res.path, false, ()=>{});
  } else {
    Log.error(`PING FAILED: ${res.reason}`);
    animatePacket(res.path, true, ()=>{});
  }
}

/* ====== ADD NEW ELEMENTS ====== */
function addNewNetwork(){
  pushUndo(); Cfg.ensure();
  const id = uid("net");
  App.config.networks.push({
    id, label:"New Network", type:"subnet", cidr:"10.0.0.0/24",
    color:"rgba(88,166,255,0.10)",
    x: App.view.x + 50, y: App.view.y + 50, width:400, height:300
  });
  selectElement("network", id);
  renderAndSync(); refreshScenarioSelect();
  toast("ネットワークを追加: "+id, "ok");
  Log.info("ネットワーク追加: "+id);
}

// Device type picker — floating menu
const DEVICE_TYPES = [
  { type:"router",       label:"ルータ",      icon:"🔵", desc:"L3ルーティング" },
  { type:"l3switch",     label:"L3スイッチ",  icon:"🟣", desc:"L3スイッチング" },
  { type:"l2switch",     label:"L2スイッチ",  icon:"🟦", desc:"L2スイッチング" },
  { type:"firewall",     label:"ファイアウォール", icon:"🛡", desc:"FW/IPS" },
  { type:"loadbalancer", label:"ロードバランサ", icon:"⚖", desc:"L4/L7 LB" },
  { type:"waf",          label:"WAF",         icon:"🟪", desc:"Web ApplicationFW" }
];
function showDeviceTypeMenu(anchorBtn){
  const menu = $("#dev-menu"); menu.innerHTML = "";
  ch("div",{class:"fmenu-title",text:"NW機器を追加 — タイプを選択"},menu);
  for(const dt of DEVICE_TYPES){
    const it = ch("div",{class:"fmenu-item",title:dt.desc},menu);
    ch("span",{class:"fico",text:dt.icon},it);
    ch("div",{style:{display:"flex",flexDirection:"column"}, html:
      `<div style="font-weight:600">${escapeHtml(dt.label)}</div>
       <div style="font-size:10px;opacity:0.8">${escapeHtml(dt.desc)}</div>`},it);
    it.addEventListener("click",()=>{ hideFloatingMenus(); addNewDeviceOfType(dt.type); });
  }
  positionFloating(menu, anchorBtn);
  menu.classList.remove("hidden");
}
function addNewDeviceOfType(type){
  pushUndo(); Cfg.ensure();
  const id = uid(type);
  const def = {
    router:       { label:"New Router",       w:120, h:70, speed:1000,  pt:"rj45",     ifs:[{id:"ge0/0"},{id:"ge0/1"}] },
    l3switch:     { label:"New L3 Switch",    w:140, h:70, speed:10000, pt:"sfp-plus", ifs:[{id:"gi1/0/1"},{id:"gi1/0/2"},{id:"gi1/0/3"},{id:"gi1/0/4"}] },
    l2switch:     { label:"New L2 Switch",    w:140, h:70, speed:1000,  pt:"rj45",     ifs:[{id:"gi1/0/1"},{id:"gi1/0/2"},{id:"gi1/0/3"},{id:"gi1/0/4"}] },
    firewall:     { label:"New Firewall",     w:130, h:70, speed:10000, pt:"sfp-plus", ifs:[{id:"eth1"},{id:"eth2"},{id:"eth3"}] },
    loadbalancer: { label:"New Load Balancer",w:130, h:70, speed:10000, pt:"sfp-plus", ifs:[{id:"ext"},{id:"int"}] },
    waf:          { label:"New WAF",          w:120, h:70, speed:1000,  pt:"rj45",     ifs:[{id:"eth0"}] }
  }[type] || { label:"New Device", w:120, h:70, speed:1000, pt:"rj45", ifs:[{id:"eth0"}] };
  App.config.devices.push({
    id, label:def.label, type, status:"running",
    x: App.view.x + 150, y: App.view.y + 150, width:def.w, height:def.h,
    interfaces: def.ifs.map(i=>({ id:i.id, ip:"", network:"", mac:"", speed:def.speed, port_type:def.pt, status:"up" }))
  });
  selectElement("device", id);
  renderAndSync(); updateStatusBar();
  toast(`${def.label} を追加`, "ok");
  Log.info(`${type} 追加: ${id}`);
}
function addNewDevice(){
  showDeviceTypeMenu($("#btn-add-device"));
}

function addNewServer(){
  pushUndo(); Cfg.ensure();
  const id = uid("srv");
  App.config.servers.push({
    id, label:"New Server", type:"virtual", os:"Linux",
    cpu:2, memory:4096, status:"running",
    x: App.view.x + 200, y: App.view.y + 200, width:130, height:65,
    interfaces:[
      { id:"eth0", ip:"10.0.0.10/24", network:"", mac:"", speed:1000, port_type:"rj45", status:"up" }
    ]
  });
  selectElement("server", id);
  renderAndSync(); updateStatusBar();
  toast("サーバを追加: "+id, "ok");
  Log.info("サーバ追加: "+id);
}

// Service type picker — floating menu with server selector
const SERVICE_TYPES = [
  { type:"web_server",    label:"Web Server",     icon:"🌐", port:80 },
  { type:"reverse_proxy", label:"Reverse Proxy",  icon:"🔁", port:443 },
  { type:"forward_proxy", label:"Forward Proxy",  icon:"🔀", port:3128 },
  { type:"app_server",    label:"App Server",     icon:"⚙",  port:8080 },
  { type:"database",      label:"Database",       icon:"🗄", port:5432 },
  { type:"cache",         label:"Cache",          icon:"⚡", port:6379 },
  { type:"mq",            label:"Message Queue",  icon:"📨", port:5672 },
  { type:"dns",           label:"DNS",            icon:"🔍", port:53 },
  { type:"dhcp",          label:"DHCP",           icon:"📡", port:67 },
  { type:"monitoring",    label:"Monitoring",     icon:"📊", port:9090 },
  { type:"logging",       label:"Logging",        icon:"📋", port:5601 },
  { type:"vpn_server",    label:"VPN Server",     icon:"🔒", port:1194 },
  { type:"custom",        label:"Custom",         icon:"⚪", port:0 }
];
function showServiceTypeMenu(anchorBtn){
  const srvs = App.config.servers || [];
  if(!srvs.length){
    toast("先にサーバを追加してください", "warn");
    return;
  }
  const menu = $("#svc-menu"); menu.innerHTML = "";
  ch("div",{class:"fmenu-title",text:"サービスを追加 — タイプを選択"},menu);
  for(const st of SERVICE_TYPES){
    const it = ch("div",{class:"fmenu-item",title:st.label+" (Port "+st.port+")"},menu);
    ch("span",{class:"fico",text:st.icon},it);
    ch("div",{style:{display:"flex",flexDirection:"column"}, html:
      `<div style="font-weight:600">${escapeHtml(st.label)}</div>
       <div style="font-size:10px;opacity:0.8">Port ${st.port}</div>`},it);
    it.addEventListener("click",()=>{ hideFloatingMenus(); promptServiceServer(st); });
  }
  positionFloating(menu, anchorBtn);
  menu.classList.remove("hidden");
}
function promptServiceServer(svcType){
  const srvs = App.config.servers || [];
  if(srvs.length === 1){
    addNewServiceOnServer(svcType, srvs[0].id);
    return;
  }
  openDialog(`${svcType.label} — ホストサーバを選択`, (body)=>{
    ch("p",{text:`どのサーバにこのサービスを配置しますか?`, style:{margin:"0 0 10px 0",fontSize:"12px",color:"var(--text-dim)"}}, body);
    const f = ch("div",{class:"field"},body);
    ch("label",{text:"ホストサーバ"},f);
    const sel = ch("select",{},f);
    // If a server is currently selected, default to it
    let defaultId = srvs[0].id;
    if(App.selected && App.selected.kind === "server") defaultId = App.selected.id;
    for(const s of srvs){
      const o = ch("option",{value:s.id, text:`${s.label||s.id} (${s.os||""})`}, sel);
      if(s.id === defaultId) o.selected = true;
    }
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"追加", primary:true, action:()=>{ const sid = sel.value; closeDialog(); addNewServiceOnServer(svcType, sid); }}
      ]
    };
  });
}
function addNewServiceOnServer(svcType, serverId){
  pushUndo(); Cfg.ensure();
  const id = uid(svcType.type.split("_")[0]||"svc");
  App.config.services.push({
    id, label: svcType.label, type: svcType.type,
    server: serverId, status:"running",
    port: svcType.port, protocol: svcType.port===443?"HTTPS":(svcType.port===80?"HTTP":"TCP"),
    config:{}, depends_on:[]
  });
  selectElement("service", id);
  renderAndSync(); updateStatusBar();
  toast(`${svcType.label} を ${serverId} に追加`, "ok");
  Log.info(`サービス追加: ${id} on ${serverId}`);
}
function addNewService(){ showServiceTypeMenu($("#btn-add-service")); }

function startConnectMode(){
  App.connectMode = { step:1, from:null };
  $("#svg").classList.add("connecting");
  $("#status-msg").textContent = "接続元を選択してください (ESCでキャンセル)";
  toast("接続元のデバイス/サーバをクリック", "ok");
  Log.info("接続モード開始");
}

/* ====== FLOATING MENU UTILS ====== */
function positionFloating(menu, anchor){
  const r = anchor.getBoundingClientRect();
  menu.style.left = (r.left) + "px";
  menu.style.top = (r.bottom + 4) + "px";
  // Adjust if overflows viewport
  setTimeout(()=>{
    const m = menu.getBoundingClientRect();
    if(m.right > window.innerWidth) menu.style.left = (window.innerWidth - m.width - 8) + "px";
    if(m.bottom > window.innerHeight) menu.style.top = (r.top - m.height - 4) + "px";
  }, 0);
}
function hideFloatingMenus(){
  $("#dev-menu").classList.add("hidden");
  $("#svc-menu").classList.add("hidden");
}

/* ====== INIT / EVENT WIRING ====== */
function init(){
  $("#yaml-editor").value = DEFAULT_YAML;
  syncConfigFromYaml();
  // baseline undo state
  App.undoStack = [];
  App.redoStack = [];

  refreshScenarioSelect();
  updateStatusBar();
  render();
  setTimeout(()=>{ fitView(); }, 60);
  attachEventHandlers();
  Log.info("NetSim 起動完了");
}

function attachEventHandlers(){
  // Toolbar
  $("#btn-load").addEventListener("click", ()=>$("#file-input").click());
  $("#file-input").addEventListener("change", (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      pushUndo();
      $("#yaml-editor").value = r.result;
      if(syncConfigFromYaml()){
        render(); updateStatusBar(); refreshScenarioSelect(); fitView();
        Log.info("YAML読込: "+f.name);
      }
    };
    r.readAsText(f);
    e.target.value = "";
  });

  $("#btn-apply").addEventListener("click", ()=>{
    pushUndo();
    if(syncConfigFromYaml()){
      render(); updateStatusBar(); refreshScenarioSelect();
      Log.info("YAML反映");
    }
  });

  $("#btn-save").addEventListener("click", ()=>{
    const fname = prompt("ファイル名:", "netsim-config.yaml");
    if(!fname) return;
    const txt = $("#yaml-editor").value;
    const blob = new Blob([txt], { type:"text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
    Log.info("保存: "+fname);
  });

  $("#btn-add-network").addEventListener("click", addNewNetwork);
  $("#btn-add-device").addEventListener("click", addNewDevice);
  $("#btn-add-server").addEventListener("click", addNewServer);
  $("#btn-add-service").addEventListener("click", addNewService);
  $("#btn-add-connection").addEventListener("click", startConnectMode);

  $("#btn-sim-play").addEventListener("click", ()=>{
    if(App.simulation.paused){
      App.simulation.paused = false;
      Log.info("シミュレーション再開");
    } else if(!App.simulation.running){
      const sel = $("#scenario-select").value;
      if(sel) runScenario(sel);
    }
  });
  $("#btn-sim-pause").addEventListener("click", ()=>{
    if(App.simulation.running){
      App.simulation.paused = !App.simulation.paused;
      Log.info(App.simulation.paused ? "一時停止" : "再開");
    }
  });
  $("#btn-sim-stop").addEventListener("click", ()=>{
    stopSimulation();
    Log.info("シミュレーション停止");
  });
  $("#sim-speed").addEventListener("change", (e)=>{
    App.simulation.speed = parseFloat(e.target.value);
    Log.info(`シミュレーション速度: x${App.simulation.speed}`);
  });
  $("#btn-run-scenario").addEventListener("click", ()=>{
    const sel = $("#scenario-select").value;
    if(sel) runScenario(sel);
    else toast("シナリオが選択されていません。「管理」から作成してください", "warn");
  });
  const mgr = $("#btn-manage-scenario");
  if(mgr) mgr.addEventListener("click", openScenarioManager);

  $("#btn-undo").addEventListener("click", undo);
  $("#btn-redo").addEventListener("click", redo);
  $("#btn-fit").addEventListener("click", fitView);
  $("#btn-theme").addEventListener("click", ()=>{
    document.documentElement.classList.toggle("light");
  });

  // YAML editor: Ctrl+Enter to apply, autoparse on change (delayed)
  let yamlTimer = null;
  $("#yaml-editor").addEventListener("input", ()=>{
    clearTimeout(yamlTimer);
    yamlTimer = setTimeout(()=>{
      // syntax-check without committing if invalid, but auto-apply on success
      const txt = $("#yaml-editor").value;
      try {
        YAML.parse(txt);
        $("#yaml-status").style.color = "var(--orange)";
        $("#yaml-status").textContent = "● 未反映";
      } catch(e){
        $("#yaml-status").style.color = "var(--red)";
        $("#yaml-status").textContent = "✗ "+e.message.slice(0,40);
      }
    }, 300);
  });

  // Zoom
  $("#zoom-slider").addEventListener("input", (e)=>{
    const v = parseFloat(e.target.value);
    App.view.scale = v / 100;
    $("#zoom-val").textContent = Math.round(v) + "%";
    applyViewBox();
  });
  $("#zoom-in").addEventListener("click", ()=>{
    App.view.scale = clamp(App.view.scale * 1.2, 0.1, 5);
    $("#zoom-slider").value = Math.round(App.view.scale * 100);
    $("#zoom-val").textContent = Math.round(App.view.scale * 100) + "%";
    applyViewBox();
  });
  $("#zoom-out").addEventListener("click", ()=>{
    App.view.scale = clamp(App.view.scale / 1.2, 0.1, 5);
    $("#zoom-slider").value = Math.round(App.view.scale * 100);
    $("#zoom-val").textContent = Math.round(App.view.scale * 100) + "%";
    applyViewBox();
  });

  // SVG events
  const svg = $("#svg");
  svg.addEventListener("mousedown", onSvgMouseDown);
  svg.addEventListener("wheel", onSvgWheel, { passive:false });
  svg.addEventListener("contextmenu", (e)=>{
    if(e.target === svg){ e.preventDefault(); hideContextMenu(); }
  });
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  window.addEventListener("resize", applyViewBox);

  // Click outside ctxmenu to close
  document.addEventListener("click", (e)=>{
    if(!$("#ctx-menu").contains(e.target)) hideContextMenu();
    if(!$("#dev-menu").contains(e.target) && e.target.id !== "btn-add-device") $("#dev-menu").classList.add("hidden");
    if(!$("#svc-menu").contains(e.target) && e.target.id !== "btn-add-service") $("#svc-menu").classList.add("hidden");
  });

  // Property panel close
  $("#ph-close").addEventListener("click", closePropertyPanel);

  // YAML pane resizer
  let yamlResize = null;
  $("#yaml-resize").addEventListener("mousedown", (e)=>{
    yamlResize = { startX: e.clientX, startW: $("#yaml-pane").offsetWidth };
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e)=>{
    if(!yamlResize) return;
    const w = clamp(yamlResize.startW + (e.clientX - yamlResize.startX), 200, window.innerWidth*0.6);
    $("#yaml-pane").style.width = w + "px";
    applyViewBox();
  });
  document.addEventListener("mouseup", ()=>{ if(yamlResize) yamlResize = null; });

  // Log pane
  $("#log-toggle").addEventListener("click", ()=>{
    $("#log-wrap").classList.toggle("collapsed");
    $("#log-toggle").textContent = $("#log-wrap").classList.contains("collapsed") ? "▲" : "▼";
  });
  $("#log-clear").addEventListener("click", ()=>Log.clear());
  for(const lvl of ["info","warn","error"]){
    $(`#log-filter-${lvl}`).addEventListener("click", (e)=>{
      App.logFilters[lvl] = !App.logFilters[lvl];
      e.target.classList.toggle("active", App.logFilters[lvl]);
      Log.refresh();
    });
  }
  // Log resize
  let logResize = null;
  $("#log-resize").addEventListener("mousedown", (e)=>{
    logResize = { startY: e.clientY, startH: $("#log-wrap").offsetHeight };
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e)=>{
    if(!logResize) return;
    const h = clamp(logResize.startH - (e.clientY - logResize.startY), 28, window.innerHeight*0.6);
    $("#log-wrap").style.height = h + "px";
  });
  document.addEventListener("mouseup", ()=>{ if(logResize) logResize = null; });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e)=>{
    // skip when typing in input/textarea (except Ctrl shortcuts)
    const isTyping = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT";

    if(e.ctrlKey || e.metaKey){
      if(e.key === "s" || e.key === "S"){
        e.preventDefault();
        $("#btn-save").click();
      } else if(e.key === "Enter"){
        e.preventDefault();
        $("#btn-apply").click();
      } else if(e.key === "z" || e.key === "Z"){
        if(!isTyping || e.target.id !== "yaml-editor"){
          e.preventDefault(); undo();
        }
      } else if(e.key === "y" || e.key === "Y"){
        if(!isTyping || e.target.id !== "yaml-editor"){
          e.preventDefault(); redo();
        }
      }
      return;
    }
    if(isTyping) return;
    if(e.key === "?" || (e.shiftKey && e.key === "/")){
      e.preventDefault(); showShortcutHelp(); return;
    }
    if(e.key === "f" || e.key === "F"){
      e.preventDefault(); fitView(); return;
    }
    if(e.key === "+" || e.key === "="){
      e.preventDefault(); $("#zoom-in").click(); return;
    }
    if(e.key === "-" || e.key === "_"){
      e.preventDefault(); $("#zoom-out").click(); return;
    }
    if(e.key === "Delete" || e.key === "Backspace"){
      if(App.selected){
        deleteElement(App.selected.kind, App.selected.id);
      }
    } else if(e.key === "Escape"){
      if(!$("#dialog-overlay").classList.contains("hidden")) closeDialog();
      else if(App.connectMode) cancelConnectMode();
      else if(!$("#ctx-menu").classList.contains("hidden")) hideContextMenu();
      else selectElement(null, null);
    } else if(e.key === " "){
      e.preventDefault();
      if(App.simulation.running){
        App.simulation.paused = !App.simulation.paused;
        Log.info(App.simulation.paused ? "一時停止" : "再開");
      } else {
        const sel = $("#scenario-select").value;
        if(sel) runScenario(sel);
      }
    } else if(e.key === "F5"){
      e.preventDefault();
      const sel = $("#scenario-select").value;
      if(sel) runScenario(sel);
    }
  });
}

// Boot
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
