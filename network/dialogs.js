// NetSim — property panel, dialogs (CLI, pcap, scenarios, MAC audit, comm sim, templates, anim toggle)
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
        ip:"", network:"", mac: genUniqueMac(), speed:1000, port_type:"rj45", status:"up"
      });
      renderAndSync(); openPropertyPanel();
      toast(`Interface ${nextId} を追加 (MAC自動生成)`, "ok");
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
    let ip = "", ipv6 = "", network = "", mac = genUniqueMac(), speed = 1000, port_type = "rj45";
    addField(body, "IPv4 / CIDR (任意)", "text", "", v=>ip=v);
    addField(body, "IPv6 / CIDR (任意)", "text", "", v=>ipv6=v);
    const nf = ch("div",{class:"field"},body);
    ch("label",{text:"Network"},nf);
    const nSel = ch("select",{},nf);
    ch("option",{value:"",text:"-- 未割当 --"},nSel);
    for(const n of allNets) ch("option",{value:n,text:n},nSel);
    nSel.addEventListener("change",()=>network=nSel.value);
    addField(body, "MAC (自動生成済 - 編集可)", "text", mac, v=>mac=v);
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
      } else if(sub === "mac" || (sub === "mac-address-table") || (sub === "mac" && (args[2]||"") === "address-table")){
        if(kind !== "device"){ println("% MAC address-table is only available on switches/devices","cli-err"); return; }
        const entries = buildMacTable(obj);
        if(!entries.length){ println("(MAC address-table is empty)"); return; }
        println("          Mac Address Table");
        println("-------------------------------------------");
        println("VLAN    Mac Address          Type        Port");
        println("----    -----------------    --------    ------------");
        for(const e of entries){
          println(
            String(e.vlan||"--").padEnd(8) +
            (e.mac||"-").padEnd(21) +
            (e.type||"DYNAMIC").padEnd(12) +
            (e.port||"-")
          );
        }
        println("");
        println(`Total Mac Addresses for this criterion: ${entries.length}`);
      } else if(sub === "lldp" && (args[2]||"").toLowerCase() === "neighbors"){
        const entries = buildLldpNeighbors(obj);
        if(!entries.length){ println("(No LLDP neighbors)"); return; }
        println("Capability codes:");
        println("    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device");
        println("    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other");
        println("");
        println("Device ID                Local Intf      Hold-time   Capability   Port ID");
        println("---------------------    ------------    --------    ----------   ------------");
        for(const e of entries){
          println(
            (e.neighborLabel||e.neighbor||"-").padEnd(25) +
            (e.localPort||"-").padEnd(16) +
            "120         " +
            (e.cap||"BR").padEnd(13) +
            (e.remotePort||"-")
          );
        }
        println("");
        println(`Total entries displayed: ${entries.length}`);
      } else if(sub === "cdp" && (args[2]||"").toLowerCase() === "neighbors"){
        // Cisco's CDP — same data as LLDP for simulation
        const entries = buildLldpNeighbors(obj);
        if(!entries.length){ println("(No CDP neighbors)"); return; }
        println("Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge");
        println("                  S - Switch, H - Host, I - IGMP, r - Repeater");
        println("");
        println("Device ID        Local Intf     Holdtme    Capability   Platform   Port ID");
        for(const e of entries){
          println(
            (e.neighborLabel||e.neighbor||"-").padEnd(17) +
            (e.localPort||"-").padEnd(15) +
            "150        " +
            (e.cap||"S").padEnd(13) +
            "NetSim     " +
            (e.remotePort||"-")
          );
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
/* ====== COMMUNICATION SIMULATOR (interactive 2-point reachability test) ====== */
function openCommSimulator(){
  Cfg.ensure();
  openDialog("🎯 通信シミュレーション", (body)=>{
    ch("p", {
      text:"任意の送信元と宛先を選んで疎通性を確認します。ルーティング不備・ダウン・FW遮断・MAC重複などの原因を全て可視化します。",
      style:{margin:"0 0 10px 0", fontSize:"11px", color:"var(--text-dim)", lineHeight:"1.5"}
    }, body);

    const endpoints = [];
    for(const d of (App.config.devices||[])) endpoints.push({ id:d.id, label:`(device) ${d.label||d.id}`, ips: elementAllAddresses("device", d.id) });
    for(const s of (App.config.servers||[])) endpoints.push({ id:s.id, label:`(server) ${s.label||s.id}`, ips: elementAllAddresses("server", s.id) });
    for(const sv of (App.config.services||[])){
      const host = Cfg.byId("servers", sv.server);
      if(host) endpoints.push({ id:sv.id, label:`(service) ${sv.label||sv.id} on ${sv.server}`, ips: elementAllAddresses("server", sv.server), serviceFor: host.id });
    }

    function buildSelect(label, defaultKey){
      const f = ch("div",{class:"field"},body);
      ch("label",{text:label},f);
      const sel = ch("select",{},f);
      ch("option",{value:"",text:"-- 選択 --"},sel);
      for(const e of endpoints){
        const o = ch("option",{value:e.id,text:e.label},sel);
      }
      return sel;
    }
    const fromSel = buildSelect("送信元 (From)");
    const toSel = buildSelect("宛先 (To)");

    const row = ch("div",{class:"field-grid"},body);
    const protoF = ch("div",{class:"field"},row);
    ch("label",{text:"Protocol"},protoF);
    const protoSel = ch("select",{},protoF);
    for(const p of ["icmp","tcp","udp"]){
      const o = ch("option",{value:p,text:p.toUpperCase()},protoSel);
      if(p==="icmp") o.selected = true;
    }
    const portF = ch("div",{class:"field"},row);
    ch("label",{text:"Port (TCP/UDP)"},portF);
    const portIn = ch("input",{type:"number",value:"80"},portF);

    const famF = ch("div",{class:"field"},body);
    ch("label",{text:"アドレスファミリー"},famF);
    const famSel = ch("select",{},famF);
    for(const [v,l] of [["auto","自動 (送信元から)"],["v4","IPv4 強制"],["v6","IPv6 強制"]]){
      ch("option",{value:v,text:l},famSel);
    }

    const result = ch("div", { style:{ marginTop:"10px" } }, body);

    function showResult(p, srcRes, dstRes, dstIp){
      result.innerHTML = "";
      ch("h4", {text:`結果 — ${srcRes.obj.id} → ${dstRes.obj.id} (${dstIp})`, style:{margin:"0 0 6px 0",fontSize:"12px"}}, result);
      const res = ch("div", { class:"sim-result "+(p.ok?"ok":"fail") }, result);
      if(p.ok){
        ch("span", {text:"✓ 疎通成功 — "+(p.path.length)+"ホップで到達"}, res);
      } else {
        ch("span", {text:"✗ 疎通失敗 — "+(p.reason||"unknown")}, res);
      }
      // Hop list
      const list = ch("div", { class:"sim-hop-list" }, result);
      for(let i=0; i<p.path.length; i++){
        const hop = p.path[i];
        const isFail = !p.ok && i === p.path.length - 1;
        const row = ch("div", { class:"sim-hop "+(isFail?"hop-fail":"hop-ok") }, list);
        ch("div", { class:"hop-num", text:String(i+1) }, row);
        const obj = Cfg.byId(kindToCol(hop.kind), hop.id);
        const ip4 = elementPrimaryIp(hop.kind, hop.id, "v4");
        const ip6 = elementPrimaryIp(hop.kind, hop.id, "v6");
        const ips = [ip4,ip6].filter(Boolean).join(" / ") || "?";
        ch("span", { text:`${hop.kind}: ${hop.id}`, style:{fontWeight:"600",minWidth:"180px"} }, row);
        ch("span", { text:ips, style:{color:"var(--text-mute)"} }, row);
        if(obj && obj.status && obj.status !== "running"){
          ch("span", { text:`[${obj.status}]`, style:{color:"var(--red)",marginLeft:"auto",fontWeight:"700"} }, row);
        }
      }
      // Suggested fixes for common failures
      if(!p.ok){
        const reason = p.reason || "";
        const hints = ch("div", { style:{ marginTop:"6px",fontSize:"11px",color:"var(--orange)",padding:"6px",background:"rgba(245,158,11,0.1)",borderRadius:"3px",borderLeft:"3px solid var(--orange)" } }, result);
        if(reason.match(/No Route/i)){
          ch("div", {text:"💡 ヒント: 通過機器のルーティングテーブルに該当宛先のルートがありません。Static Routeを追加するかDefault Routeを設定してください。"}, hints);
        } else if(reason.match(/BLOCKED|firewall|deny/i)){
          ch("div", {text:"💡 ヒント: ファイアウォール ポリシーで遮断されました。該当機器のポリシーを確認 (右クリック → CLI → show policy)。"}, hints);
        } else if(reason.match(/no.*gateway/i)){
          ch("div", {text:"💡 ヒント: ゲートウェイが未設定です。送信元のプロパティで設定してください。"}, hints);
        } else if(reason.match(/stopped|down|error/i)){
          ch("div", {text:"💡 ヒント: 経路上の機器/インターフェースがダウン中です。状態を [running] / [up] にしてください。"}, hints);
        } else if(reason.match(/loop/i)){
          ch("div", {text:"💡 ヒント: ルーティングループが検出されました。ルーティングテーブルを確認してください。"}, hints);
        } else if(reason.match(/no egress/i)){
          ch("div", {text:"💡 ヒント: 出力リンクが見つかりません。接続が正しく構成されているか確認してください。"}, hints);
        }
      }
      // Animation: show packet flowing
      if(p.path && p.path.length >= 2){
        animatePacket(p.path, !p.ok, ()=>{});
      }
    }

    return {
      buttons:[
        { text:"閉じる", action: closeDialog },
        { text:"▶ シミュレーション実行", primary:true, action:()=>{
          const fromId = fromSel.value, toId = toSel.value;
          if(!fromId || !toId){ toast("送信元・宛先を選択してください","err"); return; }
          if(fromId === toId){ toast("送信元と宛先が同じです","warn"); return; }
          const srcRes = resolveScenarioEndpoint(fromId);
          const dstRes = resolveScenarioEndpoint(toId);
          if(!srcRes || !dstRes){ toast("オブジェクトが見つかりません","err"); return; }

          let srcKind = srcRes.kind, srcObj = srcRes.obj;
          if(srcKind === "service"){
            const host = Cfg.byId("servers", srcRes.obj.server);
            if(!host){ toast("サービスのホストが見つかりません","err"); return; }
            srcObj = host; srcKind = "server";
          } else if(srcKind === "network"){
            const dev = (App.config.devices||[]).find(d=>(d.interfaces||[]).some(i=>i.network===srcRes.obj.id));
            if(!dev){ toast(`ネットワーク ${srcRes.obj.id} に機器がありません`,"err"); return; }
            srcKind="device"; srcObj=dev;
          }

          let dstIp = null, dstKind = dstRes.kind;
          const fam = famSel.value;
          if(dstKind === "service"){
            dstIp = elementPrimaryIp("server", dstRes.obj.server, fam==="auto"?null:fam);
          } else {
            dstIp = elementPrimaryIp(dstKind, dstRes.obj.id, fam==="auto"?null:fam);
          }
          if(!dstIp){ toast(`宛先IP (${fam}) が取得できません`,"err"); return; }

          // === Suppress toasts so errors only show in this dialog ===
          App.suppressToast = true;
          const proto = protoSel.value;
          const port = +portIn.value || 80;
          const p = computePath(srcKind, srcObj, dstIp, proto, port);
          showResult(p, srcRes, dstRes, dstIp);
          setTimeout(()=>{ App.suppressToast = false; }, 100);
        }}
      ]
    };
  });
}

/* ====== TOPOLOGY TEMPLATES (spine-leaf, etc) ====== */
const TOPOLOGY_TEMPLATES = [
  { id:"spine-leaf", icon:"🌳", title:"スパイン・リーフ",
    desc:"データセンタ向け2層トポロジー。ボーダー(任意)→スパイン→リーフ→ホスト の構成。",
    builder: buildSpineLeaf },
  { id:"3tier", icon:"🏛", title:"3層構造 (Core/Agg/Access)",
    desc:"伝統的なキャンパス向けアーキテクチャ。コア→集約→アクセス→ホスト。",
    builder: build3Tier },
  { id:"hub-spoke", icon:"☀", title:"ハブ&スポーク",
    desc:"中央ルータ1台に複数の支社/拠点が接続される構成。",
    builder: buildHubSpoke }
];

function openTopologyTemplates(){
  openDialog("📐 トポロジーテンプレート", (body)=>{
    ch("p",{
      text:"テンプレートを選択すると、現在の構成にデバイス/サーバ/接続が追加されます。既存の要素は変更されません。",
      style:{margin:"0 0 12px 0",fontSize:"11px",color:"var(--text-dim)",lineHeight:"1.5"}
    },body);
    for(const tpl of TOPOLOGY_TEMPLATES){
      const card = ch("div",{class:"tpl-card"},body);
      ch("div",{class:"tpl-ico",text:tpl.icon},card);
      const info = ch("div",{class:"tpl-info"},card);
      ch("div",{class:"tpl-title",text:tpl.title},info);
      ch("div",{class:"tpl-desc",text:tpl.desc},info);
      card.addEventListener("click",()=>{
        closeDialog();
        openTemplateOptions(tpl);
      });
    }
    return { buttons:[{ text:"閉じる", action:closeDialog }] };
  });
}

function openTemplateOptions(tpl){
  openDialog(`📐 ${tpl.title} — オプション`, (body)=>{
    let opts = {};
    if(tpl.id === "spine-leaf"){
      opts = { borders: 1, spines: 2, leaves: 4, hosts_per_leaf: 2, prefix:"sl", base_x: 1100, base_y: 50 };
      addField(body, "Border (ボーダー) 台数", "number", opts.borders, v=>opts.borders=Math.max(0,+v));
      addField(body, "Spine 台数",   "number", opts.spines,  v=>opts.spines=Math.max(1,+v));
      addField(body, "Leaf 台数",    "number", opts.leaves,  v=>opts.leaves=Math.max(1,+v));
      addField(body, "Leaf あたりホスト数", "number", opts.hosts_per_leaf, v=>opts.hosts_per_leaf=Math.max(0,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"sl");
    } else if(tpl.id === "3tier"){
      opts = { cores: 2, agg: 2, access: 4, hosts_per_access: 2, prefix:"t3", base_x: 1100, base_y: 50 };
      addField(body, "Core 台数",   "number", opts.cores, v=>opts.cores=Math.max(1,+v));
      addField(body, "Aggregation 台数", "number", opts.agg, v=>opts.agg=Math.max(1,+v));
      addField(body, "Access 台数", "number", opts.access, v=>opts.access=Math.max(1,+v));
      addField(body, "Access あたりホスト数", "number", opts.hosts_per_access, v=>opts.hosts_per_access=Math.max(0,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"t3");
    } else if(tpl.id === "hub-spoke"){
      opts = { spokes: 4, hosts_per_spoke: 1, prefix:"hs", base_x: 1100, base_y: 50 };
      addField(body, "支社 (Spoke) 台数", "number", opts.spokes, v=>opts.spokes=Math.max(1,+v));
      addField(body, "支社あたりホスト数", "number", opts.hosts_per_spoke, v=>opts.hosts_per_spoke=Math.max(0,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"hs");
    }
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"生成", primary:true, action:()=>{
          pushUndo();
          const stats = tpl.builder(opts);
          closeDialog();
          renderAndSync();
          toast(`${tpl.title} 生成完了: 機器+${stats.devices}, サーバ+${stats.servers}, 接続+${stats.links}`, "ok");
          fitView && fitView();
        }}
      ]
    };
  });
}

function buildSpineLeaf(opts){
  const { borders, spines, leaves, hosts_per_leaf, prefix, base_x, base_y } = opts;
  const stats = { devices:0, servers:0, links:0 };
  const devW = 130, devH = 70, srvW = 110, srvH = 60;
  const xSpacing = 180, ySpacing = 130;

  // Layer Y coords
  const yBorder = base_y;
  const ySpine  = base_y + ySpacing;
  const yLeaf   = base_y + ySpacing * 2;
  const yHost   = base_y + ySpacing * 3 + 30;

  // Create borders
  const borderIds = [];
  for(let i=0; i<borders; i++){
    const id = `${prefix}-border${i+1}`;
    const cx = base_x + (i+0.5) * xSpacing - devW/2;
    App.config.devices.push({
      id, label:`Border ${i+1}`, type:"router", role:"border", status:"running",
      x: cx, y: yBorder, width: devW, height: devH,
      interfaces: Array.from({length: spines}, (_,j)=>({
        id:`eth${j+1}`, ip:"", network:"", mac: genUniqueMac(),
        speed: 40000, port_type:"qsfp-plus", status:"up"
      }))
    });
    borderIds.push(id);
    stats.devices++;
  }

  // Create spines
  const spineIds = [];
  for(let i=0; i<spines; i++){
    const id = `${prefix}-spine${i+1}`;
    const totalW = spines * xSpacing;
    const startX = base_x + (xSpacing*Math.max(borders,leaves) - totalW)/2;
    const cx = startX + i * xSpacing;
    App.config.devices.push({
      id, label:`Spine ${i+1}`, type:"l3switch", role:"spine", status:"running",
      x: cx, y: ySpine, width: devW, height: devH,
      interfaces: [
        ...borderIds.map((_,j)=>({ id:`bord${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" })),
        ...Array.from({length: leaves}, (_,j)=>({ id:`leaf${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" }))
      ]
    });
    spineIds.push(id);
    stats.devices++;
  }

  // Create leaves
  const leafIds = [];
  for(let i=0; i<leaves; i++){
    const id = `${prefix}-leaf${i+1}`;
    const totalW = leaves * xSpacing;
    const startX = base_x + (xSpacing*Math.max(borders,leaves) - totalW)/2;
    const cx = startX + i * xSpacing;
    App.config.devices.push({
      id, label:`Leaf ${i+1}`, type:"l3switch", role:"leaf", status:"running",
      x: cx, y: yLeaf, width: devW, height: devH,
      interfaces: [
        ...spineIds.map((_,j)=>({ id:`spine${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" })),
        ...Array.from({length: hosts_per_leaf}, (_,j)=>({ id:`gi1/0/${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" }))
      ]
    });
    leafIds.push(id);
    stats.devices++;
  }

  // Create hosts
  for(let i=0; i<leaves; i++){
    for(let j=0; j<hosts_per_leaf; j++){
      const sid = `${prefix}-host${i+1}-${j+1}`;
      const totalW = leaves * hosts_per_leaf * (srvW + 20);
      const startX = base_x + (xSpacing*Math.max(borders,leaves) - totalW)/2;
      const cx = startX + (i*hosts_per_leaf + j) * (srvW + 20);
      App.config.servers.push({
        id: sid, label:`Host ${i+1}-${j+1}`, type:"virtual",
        os:"Linux", cpu:2, memory:2048, status:"running",
        x: cx, y: yHost, width: srvW, height: srvH,
        interfaces:[{ id:"eth0", ip:"", network:"", mac: genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" }]
      });
      stats.servers++;
    }
  }

  // Create connections: border ↔ each spine (full)
  for(const bid of borderIds){
    for(let si=0; si<spineIds.length; si++){
      const sid = spineIds[si];
      const linkId = `${bid}--${sid}`;
      App.config.connections.push({
        id: linkId,
        from: { device: bid, interface: `eth${si+1}` },
        to:   { device: sid, interface: `bord${borderIds.indexOf(bid)+1}` },
        type: "fiber", speed: 40000, status:"up",
        traffic:"medium", direction:"bidirectional"
      });
      stats.links++;
    }
  }
  // spine ↔ each leaf (full mesh — the spine-leaf signature)
  for(let si=0; si<spineIds.length; si++){
    const sid = spineIds[si];
    for(let li=0; li<leafIds.length; li++){
      const lid = leafIds[li];
      const linkId = `${sid}--${lid}`;
      App.config.connections.push({
        id: linkId,
        from: { device: sid, interface: `leaf${li+1}` },
        to:   { device: lid, interface: `spine${si+1}` },
        type: "fiber", speed: 40000, status:"up",
        traffic:"low", direction:"bidirectional"
      });
      stats.links++;
    }
  }
  // leaf ↔ hosts
  for(let li=0; li<leafIds.length; li++){
    for(let j=0; j<hosts_per_leaf; j++){
      const lid = leafIds[li];
      const sid = `${prefix}-host${li+1}-${j+1}`;
      App.config.connections.push({
        id: `${lid}--${sid}`,
        from: { device: lid, interface: `gi1/0/${j+1}` },
        to:   { server: sid, interface: "eth0" },
        type: "fiber", speed: 10000, status:"up",
        traffic:"idle", direction:"bidirectional"
      });
      stats.links++;
    }
  }
  return stats;
}

function build3Tier(opts){
  const { cores, agg, access, hosts_per_access, prefix, base_x, base_y } = opts;
  const stats = { devices:0, servers:0, links:0 };
  const devW = 130, devH = 70, srvW = 110, srvH = 60;
  const xSp = 180, ySp = 130;
  const coreIds = [], aggIds = [], accIds = [];
  // Cores
  for(let i=0;i<cores;i++){
    const id = `${prefix}-core${i+1}`;
    App.config.devices.push({
      id, label:`Core ${i+1}`, type:"l3switch", role:"core", status:"running",
      x: base_x + i*xSp, y: base_y, width: devW, height: devH,
      interfaces: Array.from({length: agg},(_,j)=>({ id:`agg${j+1}`, mac:genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" }))
    });
    coreIds.push(id); stats.devices++;
  }
  // Agg
  for(let i=0;i<agg;i++){
    const id = `${prefix}-agg${i+1}`;
    App.config.devices.push({
      id, label:`Agg ${i+1}`, type:"l3switch", role:"aggregation", status:"running",
      x: base_x + i*xSp, y: base_y+ySp, width: devW, height: devH,
      interfaces: [
        ...coreIds.map((_,j)=>({ id:`core${j+1}`, mac:genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" })),
        ...Array.from({length: access},(_,j)=>({ id:`acc${j+1}`, mac:genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" }))
      ]
    });
    aggIds.push(id); stats.devices++;
  }
  // Access
  for(let i=0;i<access;i++){
    const id = `${prefix}-acc${i+1}`;
    App.config.devices.push({
      id, label:`Access ${i+1}`, type:"l2switch", role:"access", status:"running",
      x: base_x + i*xSp, y: base_y+ySp*2, width: devW, height: devH,
      interfaces: [
        ...aggIds.map((_,j)=>({ id:`agg${j+1}`, mac:genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" })),
        ...Array.from({length: hosts_per_access},(_,j)=>({ id:`gi1/0/${j+1}`, mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }))
      ]
    });
    accIds.push(id); stats.devices++;
  }
  // Hosts
  for(let i=0;i<access;i++){
    for(let j=0;j<hosts_per_access;j++){
      const sid = `${prefix}-h${i+1}-${j+1}`;
      App.config.servers.push({
        id: sid, label:`Host ${i+1}-${j+1}`, type:"virtual",
        os:"Linux", status:"running",
        x: base_x + (i*hosts_per_access+j)*(srvW+10), y: base_y+ySp*3+20,
        width: srvW, height: srvH,
        interfaces:[{ id:"eth0", mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }]
      });
      stats.servers++;
    }
  }
  // Links: core ↔ agg (full mesh)
  for(let ci=0;ci<coreIds.length;ci++) for(let ai=0;ai<aggIds.length;ai++){
    App.config.connections.push({ id:`${coreIds[ci]}--${aggIds[ai]}`,
      from:{device:coreIds[ci], interface:`agg${ai+1}`}, to:{device:aggIds[ai], interface:`core${ci+1}`},
      type:"fiber", speed:40000, status:"up", traffic:"low", direction:"bidirectional" });
    stats.links++;
  }
  // Agg ↔ Access (full mesh)
  for(let ai=0;ai<aggIds.length;ai++) for(let ki=0;ki<accIds.length;ki++){
    App.config.connections.push({ id:`${aggIds[ai]}--${accIds[ki]}`,
      from:{device:aggIds[ai], interface:`acc${ki+1}`}, to:{device:accIds[ki], interface:`agg${ai+1}`},
      type:"fiber", speed:10000, status:"up", traffic:"idle", direction:"bidirectional" });
    stats.links++;
  }
  // Access ↔ Hosts
  for(let ki=0;ki<accIds.length;ki++) for(let j=0;j<hosts_per_access;j++){
    App.config.connections.push({ id:`${accIds[ki]}--${prefix}-h${ki+1}-${j+1}`,
      from:{device:accIds[ki], interface:`gi1/0/${j+1}`}, to:{server:`${prefix}-h${ki+1}-${j+1}`, interface:"eth0"},
      type:"ethernet", speed:1000, status:"up", traffic:"idle", direction:"bidirectional" });
    stats.links++;
  }
  return stats;
}

function buildHubSpoke(opts){
  const { spokes, hosts_per_spoke, prefix, base_x, base_y } = opts;
  const stats = { devices:0, servers:0, links:0 };
  const hubId = `${prefix}-hub`;
  App.config.devices.push({
    id: hubId, label:"Hub Router", type:"router", role:"hub", status:"running",
    x: base_x + (spokes*180)/2 - 65, y: base_y, width: 130, height: 70,
    interfaces: Array.from({length: spokes},(_,i)=>({ id:`spoke${i+1}`, mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }))
  });
  stats.devices++;
  for(let i=0;i<spokes;i++){
    const sid = `${prefix}-spoke${i+1}`;
    App.config.devices.push({
      id: sid, label:`Spoke ${i+1}`, type:"router", role:"spoke", status:"running",
      x: base_x + i*180, y: base_y + 150, width: 130, height: 70,
      interfaces: [
        { id:"wan", mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" },
        ...Array.from({length: hosts_per_spoke},(_,j)=>({ id:`lan${j+1}`, mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }))
      ]
    });
    stats.devices++;
    App.config.connections.push({ id:`${hubId}--${sid}`,
      from:{device:hubId, interface:`spoke${i+1}`}, to:{device:sid, interface:"wan"},
      type:"ethernet", speed:1000, status:"up", traffic:"low", direction:"bidirectional" });
    stats.links++;
    for(let j=0;j<hosts_per_spoke;j++){
      const hsid = `${prefix}-h${i+1}-${j+1}`;
      App.config.servers.push({
        id: hsid, label:`H${i+1}-${j+1}`, type:"virtual",
        os:"Linux", status:"running",
        x: base_x + i*180 + j*120, y: base_y + 280,
        width: 110, height: 60,
        interfaces:[{ id:"eth0", mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }]
      });
      stats.servers++;
      App.config.connections.push({ id:`${sid}--${hsid}`,
        from:{device:sid, interface:`lan${j+1}`}, to:{server:hsid, interface:"eth0"},
        type:"ethernet", speed:1000, status:"up", traffic:"idle", direction:"bidirectional" });
      stats.links++;
    }
  }
  return stats;
}

/* ====== MAC AUDIT DIALOG ====== */
/* ====== ANIMATION TOGGLE ====== */
function toggleAnimations(){
  App.animationsEnabled = !App.animationsEnabled;
  if(typeof localStorage !== "undefined")
    localStorage.setItem("netsim-animations", App.animationsEnabled?"on":"off");
  document.body.classList.toggle("no-animations", !App.animationsEnabled);
  updateAnimToggleUI();
  render();
  toast(`アニメーション ${App.animationsEnabled?"有効":"無効"}`, "ok");
}
function updateAnimToggleUI(){
  const btn = $("#btn-anim-toggle");
  if(!btn) return;
  const ico = btn.querySelector(".ico"), lbl = btn.querySelector(".lbl");
  if(ico) ico.textContent = App.animationsEnabled ? "⏸" : "▶";
  if(lbl) lbl.textContent = App.animationsEnabled ? "アニメOFF" : "アニメON";
  btn.classList.toggle("primary", !App.animationsEnabled);
  btn.title = App.animationsEnabled
    ? "アニメーションを停止 (CPU軽量化)"
    : "アニメーションを再開";
}

function openMacAudit(){
  const cols = findMacCollisions();
  const missing = [];
  for(const d of (App.config.devices||[])) for(const i of (d.interfaces||[])){
    if(!i.mac) missing.push({ kind:"device", id:d.id, iface:i.id });
  }
  for(const s of (App.config.servers||[])) for(const i of (s.interfaces||[])){
    if(!i.mac) missing.push({ kind:"server", id:s.id, iface:i.id });
  }
  openDialog(`🔍 MAC アドレス監査`, (body)=>{
    // Summary
    const summary = ch("div", {
      style:{display:"flex",gap:"12px",marginBottom:"10px",fontSize:"12px"}
    }, body);
    ch("div",{ html:`<strong style="color:${cols.length?'var(--red)':'var(--green)'}">${cols.length}</strong> 件のMAC重複`, style:{padding:"4px 8px",background:"var(--bg2)",borderRadius:"3px"} },summary);
    ch("div",{ html:`<strong style="color:${missing.length?'var(--orange)':'var(--green)'}">${missing.length}</strong> 件の未割当`, style:{padding:"4px 8px",background:"var(--bg2)",borderRadius:"3px"} },summary);

    if(cols.length){
      ch("h4",{text:"⚠ MAC アドレス重複 (フレーム配送に問題が発生する可能性)",style:{margin:"10px 0 6px",fontSize:"12px",color:"var(--red)"}},body);
      for(const c of cols){
        const row = ch("div",{
          style:{background:"rgba(248,81,73,0.1)",border:"1px solid var(--red)",borderRadius:"4px",padding:"6px 8px",marginBottom:"4px"}
        },body);
        ch("div",{
          html:`<code style="color:var(--red);font-weight:700">${escapeHtml(c.mac)}</code> が ${c.locations.length} 個のIFで重複:`,
          style:{fontSize:"11px",marginBottom:"3px"}
        },row);
        for(const loc of c.locations){
          ch("div",{
            text: `  • ${loc.kind}/${loc.id}/${loc.iface}`,
            style:{fontSize:"10px",fontFamily:"var(--mono)",color:"var(--text-dim)",paddingLeft:"10px"}
          },row);
        }
      }
    }

    if(missing.length){
      ch("h4",{text:"未割当のMAC",style:{margin:"10px 0 6px",fontSize:"12px",color:"var(--orange)"}},body);
      const list = ch("div",{style:{maxHeight:"160px",overflowY:"auto",fontSize:"11px",fontFamily:"var(--mono)"}},body);
      for(const m of missing){
        const row = ch("div",{
          style:{display:"flex",alignItems:"center",gap:"6px",padding:"3px 6px",borderBottom:"1px dashed var(--border)"}
        },list);
        ch("span",{text:`${m.kind}/${m.id}/${m.iface}`,style:{flex:"1"}},row);
      }
    }

    if(!cols.length && !missing.length){
      ch("div",{
        text:"✓ 問題なし — すべてのインターフェースに固有のMACアドレスが割り当てられています。",
        style:{padding:"12px",textAlign:"center",color:"var(--green)",fontWeight:"600"}
      },body);
    }

    return {
      buttons:[
        ...(missing.length ? [{ text:"未割当を全て自動生成", primary:true, action:()=>{
          pushUndo();
          for(const m of missing){
            const obj = Cfg.byId(kindToCol(m.kind), m.id);
            if(!obj) continue;
            const iface = obj.interfaces.find(i=>i.id===m.iface);
            if(iface) iface.mac = genUniqueMac();
          }
          renderAndSync();
          toast(`${missing.length} 件のMACを自動生成`, "ok");
          closeDialog();
        }}] : []),
        ...(cols.length ? [{ text:"重複を解消 (再生成)", action:()=>{
          pushUndo();
          let n = 0;
          for(const c of cols){
            // Keep first, regen rest
            for(let i=1;i<c.locations.length;i++){
              const loc = c.locations[i];
              const obj = Cfg.byId(kindToCol(loc.kind), loc.id);
              if(!obj) continue;
              const iface = obj.interfaces.find(x=>x.id===loc.iface);
              if(iface){ iface.mac = genUniqueMac(); n++; }
            }
          }
          renderAndSync();
          toast(`${n} 件のMACを再生成`, "ok");
          closeDialog();
        }}] : []),
        { text:"閉じる", action: closeDialog }
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

