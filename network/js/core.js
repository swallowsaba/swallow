// NetSim — core utilities, YAML, state, IP/MAC, undo/redo
"use strict";

/* ====== UTILITIES ====== */
var $ = (s,r)=>(r||document).querySelector(s);
var $$ = (s,r)=>Array.from((r||document).querySelectorAll(s));
var NS = "http://www.w3.org/2000/svg";
var ce = (tag,attrs,parent)=>{const el=document.createElementNS(NS,tag);if(attrs)for(const k in attrs){if(k==="text")el.textContent=attrs[k];else el.setAttribute(k,attrs[k]);}if(parent)parent.appendChild(el);return el;};
var ch = (tag,attrs,parent)=>{const el=document.createElement(tag);if(attrs)for(const k in attrs){if(k==="text")el.textContent=attrs[k];else if(k==="html")el.innerHTML=attrs[k];else if(k==="on")for(const e in attrs[k])el.addEventListener(e,attrs[k][e]);else if(k==="style")Object.assign(el.style,attrs[k]);else el.setAttribute(k,attrs[k]);}if(parent)parent.appendChild(el);return el;};
var clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
var uid = (p)=>p+"-"+Math.random().toString(36).slice(2,8);
var pad2 = n=>n<10?"0"+n:""+n;
var pad3 = n=>n<10?"00"+n:n<100?"0"+n:""+n;
var nowStamp = ()=>{const d=new Date();return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;};
var escapeHtml = s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

/* ====== TOAST ====== */
var _toastTimer = null;
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
var YAML = (() => {
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
var DEFAULT_YAML = `networks:
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
        network: db-segment
        mac: "de:ad:00:00:03:01"
        speed: 10000
        port_type: sfp-plus
        status: up
      - id: eth1
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
var App = {
  config: {},
  selected: null,
  view: { x:0, y:0, scale:1 },
  undoStack: [],
  redoStack: [],
  simulation: { running:false, paused:false, speed:1, rafId:null, abort:false },
  connectMode: null,
  logs: [],
  commLogs: [],
  activeLogTab: "comm",
  logFilters: { info:true, warn:true, error:true },
  animationsEnabled: (typeof localStorage !== "undefined" && localStorage.getItem("netsim-animations")) !== "off",
  suppressToast: false,
  autoActions: [],   // 自動対応アクション履歴: [{ts, type, what, from, to, detail}]
};

var Cfg = {
  c(){ return App.config; },
  ensure(){
    const c = App.config;
    for(const k of ["networks","devices","servers","services","connections","routing_tables","vpn_tunnels","policies","scenarios","annotations"])
      if(!Array.isArray(c[k])) c[k] = [];
    // Ensure bond virtual interface exists whenever bonding is enabled
    for(const arr of [c.devices, c.servers]){
      if(!arr) continue;
      for(const obj of arr){
        if(obj && obj.bonding && obj.bonding.enabled){
          if(typeof ensureBond0Interface === "function") ensureBond0Interface(obj);
        }
      }
    }
    // Ensure ALL interfaces on ALL servers and devices have a MAC address
    // (real NICs always have MAC; without one, ARP/STP/MAC tables can't function).
    for(const arr of [(c.devices||[]), (c.servers||[])]){
      for(const obj of arr){
        for(const i of (obj.interfaces||[])){
          if(!i.mac && typeof genUniqueMac==="function") i.mac = genUniqueMac();
        }
      }
    }
    // Migrate legacy embedded hypervisor VMs into real server objects (VM-as-server)
    if(typeof migrateLegacyVms === "function"){
      for(const s of (c.servers||[]).slice()){
        if(s && s.hypervisor && Array.isArray(s.hypervisor.vms) && s.hypervisor.vms.length){
          migrateLegacyVms(s);
        }
      }
    }
    // Ensure correct AWS hierarchy: regions[] each holding azs[] + vpcs[].
    // VPCs stay reachable via aws.vpcs (flat mirror) for backward-compat with the rest of the code.
    if(typeof ensureAwsHierarchy === "function") ensureAwsHierarchy();
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
var kindToCol = (k)=>({network:"networks",device:"devices",server:"servers",service:"services",connection:"connections",annotation:"annotations"})[k];
var kindLabel = (k)=>({device:"デバイス",server:"サーバ",service:"サービス",connection:"接続",network:"ネットワーク"})[k]||k;

/* ====== AWS HIERARCHY (Region > AZ + VPC; Subnet belongs to VPC and AZ) ====== */
// Standard AWS regions with their AZ suffixes.
var AWS_REGION_CATALOG = [
  {id:"ap-northeast-1", name:"東京",        azSuffixes:["a","c","d"]},
  {id:"ap-northeast-2", name:"ソウル",      azSuffixes:["a","b","c"]},
  {id:"ap-northeast-3", name:"大阪",        azSuffixes:["a","b","c"]},
  {id:"ap-southeast-1", name:"シンガポール", azSuffixes:["a","b","c"]},
  {id:"ap-southeast-2", name:"シドニー",    azSuffixes:["a","b","c"]},
  {id:"us-east-1",      name:"北バージニア", azSuffixes:["a","b","c","d","e","f"]},
  {id:"us-east-2",      name:"オハイオ",    azSuffixes:["a","b","c"]},
  {id:"us-west-1",      name:"北カリフォルニア", azSuffixes:["a","b","c"]},
  {id:"us-west-2",      name:"オレゴン",    azSuffixes:["a","b","c","d"]},
  {id:"eu-west-1",      name:"アイルランド", azSuffixes:["a","b","c"]},
  {id:"eu-west-2",      name:"ロンドン",    azSuffixes:["a","b","c"]},
  {id:"eu-central-1",   name:"フランクフルト", azSuffixes:["a","b","c"]}
];
function awsRegionInfo(id){ return AWS_REGION_CATALOG.find(r=>r.id===id) || null; }
function awsDefaultAzs(regionId){
  const info = awsRegionInfo(regionId);
  if(info) return info.azSuffixes.slice(0,2).map(s=>regionId+s); // default: first 2 AZs
  return [regionId+"a", regionId+"c"];
}
// Ensure App.config.aws has the correct hierarchy. Migrates the legacy flat aws.vpcs[]
// (where each VPC had a `region` string and subnets had `az`) into aws.regions[].
function ensureAwsHierarchy(){
  const c = App.config;
  if(!c.aws) c.aws = {};
  const aws = c.aws;
  if(!Array.isArray(aws.regions)) aws.regions = [];
  // Legacy: VPCs sitting directly on aws.vpcs → fold them into their region.
  const legacyVpcs = Array.isArray(aws.vpcs) ? aws.vpcs : [];
  for(const vpc of legacyVpcs){
    const regionId = vpc.region || "ap-northeast-1";
    let region = aws.regions.find(r=>r.id===regionId);
    if(!region){
      const info = awsRegionInfo(regionId);
      region = { id:regionId, name:(info?info.name:regionId), azs:[], vpcs:[] };
      aws.regions.push(region);
    }
    if(!region.vpcs.includes(vpc)) region.vpcs.push(vpc);
    // collect AZs referenced by this VPC's subnets into the region's az list
    for(const sn of (vpc.subnets||[])){
      if(sn.az && !region.azs.includes(sn.az)) region.azs.push(sn.az);
    }
  }
  // Make sure each region has at least its default AZs; dedup AZ lists.
  for(const region of aws.regions){
    if(!Array.isArray(region.azs)) region.azs = [];
    region.azs = region.azs.filter((az,i)=>region.azs.indexOf(az)===i);  // dedup
    if(!region.azs.length) region.azs = awsDefaultAzs(region.id);
    if(!Array.isArray(region.vpcs)) region.vpcs = [];
  }
  // Merge any duplicate region entries (same id) into one.
  const seen = {};
  const merged = [];
  for(const region of aws.regions){
    if(seen[region.id]){
      const tgt = seen[region.id];
      for(const az of (region.azs||[])) if(!tgt.azs.includes(az)) tgt.azs.push(az);
      for(const v of (region.vpcs||[])) if(!tgt.vpcs.includes(v)) tgt.vpcs.push(v);
    } else { seen[region.id]=region; merged.push(region); }
  }
  aws.regions = merged;
  // Rebuild the flat mirror aws.vpcs (used widely by the rest of the codebase).
  const flat = [];
  for(const region of aws.regions){
    for(const vpc of region.vpcs){
      vpc.region = region.id;            // keep region pointer in sync
      if(!flat.includes(vpc)) flat.push(vpc);
    }
  }
  aws.vpcs = flat;
}
// Find the region object that owns a given VPC (by name or object).
function awsRegionOfVpc(vpcOrName){
  const aws = App.config.aws; if(!aws || !aws.regions) return null;
  const name = (typeof vpcOrName === "string") ? vpcOrName : (vpcOrName && vpcOrName.name);
  for(const r of aws.regions){ if((r.vpcs||[]).some(v=>v.name===name)) return r; }
  return null;
}
// Add a new region (with default AZs). Returns the region.
function awsAddRegion(regionId){
  ensureAwsHierarchy();
  const aws = App.config.aws;
  if(aws.regions.some(r=>r.id===regionId)){ return aws.regions.find(r=>r.id===regionId); }
  const info = awsRegionInfo(regionId);
  const region = { id:regionId, name:(info?info.name:regionId), azs:awsDefaultAzs(regionId), vpcs:[] };
  aws.regions.push(region);
  return region;
}



/* ====== LOG ====== */
var Log = {
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

/* ====== COMMUNICATION LOG — the MAIN log: packet flows, ping, sim results ====== */
var CommLog = {
  add(status, msg, detail){
    const entry = { ts: nowStamp(), status, msg, detail: detail||"" };
    App.commLogs = App.commLogs || [];
    App.commLogs.push(entry);
    if(App.commLogs.length > 500) App.commLogs.shift();
    this.render(entry);
  },
  ok(m, d){ this.add("ok", m, d); },
  blocked(m, d){ this.add("blocked", m, d); },
  info(m, d){ this.add("info", m, d); },
  render(entry){
    const body = $("#comm-log-body"); if(!body) return;
    const div = ch("div", { class:"log-entry comm-"+entry.status });
    const icon = entry.status==="ok" ? "✅" : (entry.status==="blocked" ? "⛔" : "•");
    const lvl = entry.status==="ok" ? "OK" : (entry.status==="blocked" ? "BLOCKED" : "INFO");
    let html = `<span class="ts">[${entry.ts}]</span> <span class="lvl">${icon} [${lvl}]</span> ${escapeHtml(entry.msg)}`;
    if(entry.detail) html += ` <span class="path-arrow">${escapeHtml(entry.detail)}</span>`;
    div.innerHTML = html;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  },
  refresh(){
    const body = $("#comm-log-body"); if(!body) return;
    body.innerHTML = "";
    for(const e of (App.commLogs||[])) this.render(e);
  },
  clear(){ App.commLogs = []; const b=$("#comm-log-body"); if(b) b.innerHTML = ""; }
};
// Format a computePath result as a one-line communication-log entry
function logCommResult(srcLabel, dstLabel, proto, port, res){
  const portTxt = port!=null ? (":"+port) : "";
  const flow = `${srcLabel} → ${dstLabel}${portTxt} (${(proto||"ip").toUpperCase()})`;
  // Show the ARP resolution exchange that preceded this flow, if any
  const arp = (res && res.arpLog) || App._lastArpLog;
  if(arp && arp.length){
    for(const line of arp) CommLog.info("  "+line);
  }
  App._lastArpLog = null;
  if(res && res.ok){
    const ids = (res.path||[]).map(p=>p.id);
    const hops = ids.filter((x,i)=>i===0||x!==ids[i-1]).join(" → ");
    let extra = "";
    if(res.k8s) extra = ` [K8s ${res.k8s.service}→Pod ${res.k8s.pod}]`;
    else if(res.portInfo) extra = ` [${res.portInfo}]`;
    CommLog.ok(flow, `経路: ${hops}${extra}`);
  } else {
    const where = res && res.blockedAt ? ` @${res.blockedAt.id}` : "";
    CommLog.blocked(flow + where, res ? (res.reason||"到達不可") : "到達不可");
    // Beginner-friendly diagnosis: WHY it failed and HOW to fix it
    if(typeof diagnoseCommError === "function"){
      const dx = diagnoseCommError(res);
      if(dx){
        CommLog.info("  💡 原因: " + dx.cause);
        for(const step of (dx.fix||[])) CommLog.info("     → 対処: " + step);
      }
    }
  }
}
// Map a failed communication result to a plain-language cause + concrete remediation steps.
function diagnoseCommError(res){
  if(!res || res.ok) return null;
  const r = String(res.reason||"");
  if(res.sfp || /SFP|光モジュール|CRC/.test(r)){
    return { cause:"SFP/光トランシーバの劣化で、リンクはUPでもCRCエラーが多発し断続的にフレームが破棄されています。",
      fix:["該当インターフェースのSFP/光モジュール・光ファイバを交換する。",
           "ポートのエラーカウンタ(CRC/input errors)を確認し、劣化箇所を特定する。",
           "ラボでは対象インターフェースの『SFP劣化』を解除すると回復します。"] };
  }
  if(res.directConnect || /Direct Connect|専用線/.test(r)){
    return { cause:"AWS Direct Connect(専用線)がダウンし、オンプレミスからVPC内リソースへ到達できません。",
      fix:["Direct Connect回線/ルータの状態を確認し復旧する(冗長DXやVPN backupがあれば切替)。",
           "ラボではDirect Connectを『復旧』するとVPCへ再到達できます。"] };
  }
  if(res.ipConflict || /IPアドレス競合|重複/.test(r)){
    return { cause:"同一ネットワーク内でIPアドレスが重複しており、宛先(または送信元)が一意に定まりません。",
      fix:["重複している機器のどちらかのIPを別の未使用アドレスに変更する。",
           "各機器のプロパティ→インターフェースでIPを確認(⚠IP重複バッジが目印)。",
           "DHCP運用なら固定IPの重複予約がないか確認する。"] };
  }
  if(res.macFlap || /ARP解決失敗|フラッピング|ストーム/.test(r)){
    return { cause:"L2ループ等によるブロードキャストストームでARPが通らず、宛先MACを解決できません。",
      fix:["冗長リンクのどちらかを外す、またはSTPを有効化してループを解消する。",
           "該当スイッチでBPDU Guardを有効化し、ループポートをerr-disableさせる。",
           "上部の異常バナーで発生源スイッチを特定し、そのリンク構成を見直す。"] };
  }
  if(/is (down|stopped|maintenance|err-disabled)|停止|ダウン/.test(r)){
    return { cause:"経路上の機器またはインターフェースがダウン/停止しています。",
      fix:["該当機器のステータスを running(起動) に変更する。",
           "リンクやインターフェースの status を up にする。"] };
  }
  if(/ファイアウォール|FW|ポリシー|denied|ACL/.test(r)){
    return { cause:"ファイアウォール/ACLポリシーで通信が拒否されています(暗黙のdenyを含む)。",
      fix:["該当機器の🛡ファイアウォールポリシーに許可ルールを追加する。",
           "送信元/宛先/ポート/プロトコルがルールに一致しているか確認する。",
           "ルールは上から順に評価され、最後は暗黙のdenyである点に注意。"] };
  }
  if(/セキュリティグループ|security group|SG/.test(r)){
    return { cause:"AWSセキュリティグループのインバウンド許可が無いため拒否されています。",
      fix:["☁AWS管理で対象VPCのセキュリティグループに、許可するポート/送信元を追加する。",
           "EC2のSG割り当て(サーバのAWS配置)が正しいか確認する。"] };
  }
  if(/ルート|route|到達不可|no route|gateway|GW/.test(r)){
    return { cause:"宛先への経路(ルーティング)が無いか、デフォルトGWが未設定です。",
      fix:["送信元/宛先が異なるサブネットなら、間にルータ/L3SWがあり経路が通っているか確認する。",
           "各セグメントのデフォルトゲートウェイ設定と、ルータのルーティングを確認する。",
           "途中の接続(ケーブル)が繋がっているか図で確認する。"] };
  }
  if(/ポート|port .* closed|listen/.test(r)){
    return { cause:"宛先で対象ポートが待ち受けていません(サービス未起動/ポート不一致)。",
      fix:["宛先サーバの🔌ポートで、該当ポートをlistenに追加する。",
           "通信テストのポート番号が、サービスの待ち受けポートと一致しているか確認する。"] };
  }
  return { cause:"経路上のいずれかの段階で通信がブロックされました。",
    fix:["通信ログの @機器名 でブロック箇所を特定する。",
         "その機器の状態・ポリシー・ルーティング・接続を順に確認する。"] };
}

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

/* ====== NAMED SEGMENTS — give a name to one or more CIDRs (v4/v6) ======
 * App.config.segments = [{ name, cidrs:["10.1.0.0/24","2001:db8:1::/64"], color, description }]
 * Rules (FW / ACL / PBR) can reference a segment NAME instead of a raw CIDR.
 */
function resolveSegmentCidrs(ref){
  if(!ref) return [];
  const segs = (App.config && App.config.segments) || [];
  const seg = segs.find(s=>s.name===ref);
  if(seg) return seg.cidrs || [];
  return [ref]; // not a known segment → treat as a literal CIDR/IP
}
// True if ip falls within the referenced segment-name or CIDR. "any"/0.0.0.0/0/::/0 → always true
function matchRef(ip, ref){
  if(!ref || ref==="any" || ref==="0.0.0.0/0" || ref==="::/0") return true;
  if(!ip) return true;
  const cidrs = resolveSegmentCidrs(ref);
  if(!cidrs.length) return true;
  for(const c of cidrs){
    if(c==="any" || c==="0.0.0.0/0" || c==="::/0") return true;
    if(inSubnet(ip, c)) return true;
  }
  return false;
}
// Which named segment(s) an IP belongs to (for display)
function segmentsForIp(ip){
  const out = [];
  for(const s of ((App.config&&App.config.segments)||[])){
    for(const c of (s.cidrs||[])){ if(inSubnet(ip,c)){ out.push(s.name); break; } }
  }
  return out;
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

/* ====== Bond virtual interface management ======
 * When bonding is enabled, ensure a virtual bond interface (bond0 by default) exists
 * in the interfaces[] list. This virtual iface holds the bond IP and represents the
 * logical bonded interface visible in `show interfaces`, OS-level routing, etc.
 * Physical members keep their port_type/MAC; the virtual bond does not have a port_type.
 */
// A VM is a full server object pinned to a hypervisor host via server.host.
function isVmServer(s){ return !!(s && s.host); }
function vmServersOf(hostId){ return (App.config.servers||[]).filter(s=>s.host===hostId); }
// Migrate legacy embedded hypervisor.vms (plain objects) into real server objects (once).
function migrateLegacyVms(host){
  if(!host || !host.hypervisor || !Array.isArray(host.hypervisor.vms)) return;
  const legacy = host.hypervisor.vms;
  if(!legacy.length) return;
  App.config.servers = App.config.servers || [];
  for(const vm of legacy){
    // already migrated? skip if a server with this name+host exists
    if((App.config.servers||[]).some(s=>s.host===host.id && (s.label===vm.name||s.id===vm.name))) continue;
    const id = uid("vm");
    const iface = { id:"eth0", status:"up" };
    if(vm.ip) iface.ip = (vm.ip.indexOf("/")>=0?vm.ip:(vm.ip+"/24"));
    App.config.servers.push({
      id, label: vm.name||id, host: host.id, vm:true, type:"virtual",
      os: vm.os||"linux", status: (vm.power==="off"?"stopped":"running"),
      power: vm.power||"on", vcpu: vm.vcpu||2, ram_gb: vm.ram_gb||4,
      portgroup: vm.portgroup||"", x:(host.x||0)+160, y:(host.y||0)+80, width:130, height:65,
      interfaces:[iface], gateway: vm.gateway||""
    });
  }
  host.hypervisor.vms = []; // now sourced from server objects
}

function ensureBond0Interface(obj){
  if(!obj || !obj.bonding || !obj.bonding.enabled) return null;
  const bondName = obj.bonding.bond_name || "bond0";
  obj.interfaces = obj.interfaces || [];
  // Clear IPs from physical members — IP belongs to the logical bond only
  for(const mid of (obj.bonding.members||[])){
    const m = obj.interfaces.find(i => i.id === mid);
    if(m){
      // If bond_ip not yet set, adopt the first member's IP as the bond IP
      if(!obj.bonding.bond_ip && m.ip) obj.bonding.bond_ip = m.ip;
      if(!obj.bonding.bond_ipv6 && m.ipv6) obj.bonding.bond_ipv6 = m.ipv6;
      m.ip = "";
      m.ipv6 = "";
    }
  }
  let bondIf = obj.interfaces.find(i => i.id === bondName);
  if(!bondIf){
    bondIf = {
      id: bondName,
      virtual: true,
      type: "bond",
      mac: genUniqueMac(),
      ip: obj.bonding.bond_ip || "",
      ipv6: obj.bonding.bond_ipv6 || "",
      status: "up",
      speed: 0,
      port_type: "bond",
      bond_members: (obj.bonding.members||[]).slice()
    };
    obj.interfaces.push(bondIf);
  } else {
    if(obj.bonding.bond_ip !== undefined) bondIf.ip = obj.bonding.bond_ip;
    if(obj.bonding.bond_ipv6 !== undefined) bondIf.ipv6 = obj.bonding.bond_ipv6;
    bondIf.bond_members = (obj.bonding.members||[]).slice();
    bondIf.virtual = true;
    bondIf.type = "bond";
  }
  return bondIf;
}
// Effective bond status: UP if any up member exists
// A bond member is USABLE only if its interface is up AND it has a working physical
// cable (a connection exists whose peer endpoint and link are up). A member with no
// cable, or a down cable, cannot carry traffic and must not count as a live member.
function bondMemberUsable(obj, mid){
  const m = (obj.interfaces||[]).find(i=>i.id===mid);
  if(!m || (m.status||"up") !== "up") return false;
  // find a connection attached to this member
  for(const c of (App.config.connections||[])){
    let mineEp=null, peerEp=null;
    if(c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===mid){ mineEp=c.from; peerEp=c.to; }
    else if(c.to && (c.to.device===obj.id||c.to.server===obj.id) && c.to.interface===mid){ mineEp=c.to; peerEp=c.from; }
    if(!mineEp || !peerEp) continue;
    // explicit cable down?
    if(c.status === "down") continue;
    // peer device/server must be running
    const peerObj = peerEp.device ? Cfg.byId("devices", peerEp.device) : (peerEp.server ? Cfg.byId("servers", peerEp.server) : null);
    if(!peerObj) continue;
    if(peerObj.status && peerObj.status !== "running" && peerObj.status !== "up") continue;
    // peer interface must be up (if specified)
    if(peerEp.interface){
      const pif = (peerObj.interfaces||[]).find(i=>i.id===peerEp.interface);
      if(pif && (pif.status||"up") !== "up") continue;
    }
    return true; // found at least one working cable on this member
  }
  return false; // interface up but no working cable → not usable
}

function bondEffectiveStatus(obj){
  if(!obj || !obj.bonding || !obj.bonding.enabled) return null;
  const members = obj.bonding.members || [];
  if(!members.length) return "down";
  const usable = members.filter(mid=>bondMemberUsable(obj, mid));
  if(usable.length === members.length) return "up";
  if(usable.length === 0) return "down";
  return "degraded"; // some usable, some not
}

function bondActiveMember(obj){
  if(!obj || !obj.bonding || !obj.bonding.enabled) return null;
  const mode = obj.bonding.mode || "active-backup";
  const members = obj.bonding.members || [];
  // active-backup: prefer the primary if it is usable (iface up AND cable working)
  if(mode === "active-backup"){
    const prim = obj.bonding.primary || members[0];
    if(bondMemberUsable(obj, prim)) return prim;
  }
  // All modes: first usable member as the representative carrier
  for(const mid of members){
    if(bondMemberUsable(obj, mid)) return mid;
  }
  return null; // no usable member → bond is down
}
// Which bond member is currently "active" (for active-backup) — primary if up, else first up member
function bondActiveMember(obj){
  if(!obj || !obj.bonding || !obj.bonding.enabled) return null;
  const mode = obj.bonding.mode || "active-backup";
  const members = obj.bonding.members || [];
  if(mode === "active-backup"){
    const prim = obj.bonding.primary || members[0];
    if(bondMemberUsable(obj, prim)) return prim;
  }
  for(const mid of members){
    if(bondMemberUsable(obj, mid)) return mid;
  }
  return null;
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
  $("#yaml-editor").value = YAML.stringify(awsCleanForYaml(App.config));
}
// Produce a config copy whose AWS section shows ONLY the canonical hierarchy
// (aws.regions[].vpcs[].subnets[]). The flat `aws.vpcs` mirror and internal
// layout fields (_pos/_pad/_size) are stripped so the YAML matches the real
// "Region > AZ + VPC > Subnet" structure and isn't confusing.
function awsCleanForYaml(config){
  let clone;
  try { clone = JSON.parse(JSON.stringify(config)); } catch(e){ return config; }
  if(clone && clone.aws){
    const aws = clone.aws;
    delete aws.vpcs;       // internal flat mirror — rebuilt on load by ensureAwsHierarchy()
    delete aws._pos; delete aws._pad; delete aws._minSize;
    for(const region of (aws.regions||[])){
      delete region._pos; delete region._size; delete region._seedPos;
      for(const vpc of (region.vpcs||[])){
        delete vpc._pos; delete vpc._pad; delete vpc._size; delete vpc._azLayout; delete vpc._seedPos;
        for(const sn of (vpc.subnets||[])){ delete sn._pos; delete sn._size; delete sn._seed; }
      }
    }
    // If there are no regions but a legacy flat list existed, keep it visible
    if((!aws.regions || !aws.regions.length) && config.aws.vpcs && config.aws.vpcs.length){
      aws.vpcs = JSON.parse(JSON.stringify(config.aws.vpcs));
    }
  }
  return clone;
}

