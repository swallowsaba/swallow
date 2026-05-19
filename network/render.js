// NetSim — rendering, ports, interaction, context menu, status bar
/* ====== RENDERING ====== */
function render(){
  $("#layer-networks").innerHTML = "";
  $("#layer-connections").innerHTML = "";
  $("#layer-elements").innerHTML = "";
  const annLayer = $("#layer-annotations");
  if(annLayer) annLayer.innerHTML = "";
  // overlays/packets not cleared here
  ensureArrowMarkers();
  Cfg.ensure();
  for(const n of App.config.networks) renderNetwork(n);
  for(const c of App.config.connections) renderConnection(c);
  renderVpcOverlay();
  for(const d of App.config.devices) renderDevice(d);
  for(const s of App.config.servers) renderServer(s);
  for(const a of (App.config.annotations||[])) renderAnnotation(a);
  if(App.stpVisible) renderStpOverlay();
  applyViewBox();
}

/* ====== STP VISUALIZATION OVERLAY ======
 * Shows root-bridge crowns and blocked-port indicators on the canvas.
 * Toggled by App.stpVisible (default off). Wired to the "STP表示" toolbar button.
 */
function renderStpOverlay(){
  const layer = $("#layer-connections");
  if(!layer) return;
  // Determine all switches
  const switches = (App.config.devices||[]).filter(d => d.type === "l2switch" || d.type === "l3switch");
  if(!switches.length) return;
  // Identify root bridges from any VLAN: a switch is "root for some VLAN" if STP says so
  const rootBridges = {};
  const blockedPorts = {};  // { switchId: { ifaceId: {vlan:..., reason:...} } }
  for(const sw of switches){
    try {
      const stpData = (typeof computeStpForSwitch === "function") ? computeStpForSwitch(sw) : null;
      if(!stpData) continue;
      for(const v of stpData.vlans){
        if(v.isRoot) rootBridges[sw.id] = rootBridges[sw.id] || [];
        if(v.isRoot && !rootBridges[sw.id].includes(v.vlan)) rootBridges[sw.id].push(v.vlan);
        // Find blocked / alternate / discarding ports
        for(const p of (v.ports||[])){
          const role = (p.role||"").toLowerCase();
          if(role.startsWith("altn") || role.startsWith("bloc") || role.startsWith("disc") ||
             (p.state||"").toUpperCase() === "BLK" || (p.state||"").toUpperCase() === "BLOCK"){
            blockedPorts[sw.id] = blockedPorts[sw.id] || {};
            blockedPorts[sw.id][p.iface] = blockedPorts[sw.id][p.iface] || { vlans:[] };
            if(!blockedPorts[sw.id][p.iface].vlans.includes(v.vlan)){
              blockedPorts[sw.id][p.iface].vlans.push(v.vlan);
            }
          }
        }
      }
    } catch(e){ /* keep going */ }
  }
  // 1. Root bridge crowns
  for(const swId in rootBridges){
    const sw = Cfg.byId("devices", swId);
    if(!sw) continue;
    const w = sw.width || 130, h = sw.height || 70;
    const cx = (sw.x||0) + w/2;
    const cy = (sw.y||0) - 12;
    const g = ce("g", { class:"stp-crown", "pointer-events":"none" }, layer);
    // Gold rounded background
    const lblTxt = "👑 ROOT " + (rootBridges[swId].length > 1 ? `(${rootBridges[swId].length} VLAN)` : `V${rootBridges[swId][0]}`);
    const lblW = lblTxt.length * 6.5 + 12;
    ce("rect", {
      x: cx - lblW/2, y: cy - 8,
      width: lblW, height: 16, rx: 8, ry: 8,
      fill: "#f59e0b", stroke: "#fff", "stroke-width": 1.5,
      style:"filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4))"
    }, g);
    ce("text", {
      x: cx, y: cy,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size": 10, "font-family":"var(--mono)", "font-weight":"700",
      fill: "#fff", text: lblTxt
    }, g);
  }
  // 2. Blocked port indicators — small yellow ⊘ near each blocked iface port
  for(const swId in blockedPorts){
    const sw = Cfg.byId("devices", swId);
    if(!sw) continue;
    const w = sw.width || 130, h = sw.height || 70;
    for(const ifaceId in blockedPorts[swId]){
      const iface = (sw.interfaces||[]).find(i=>i.id===ifaceId);
      if(!iface) continue;
      // Find port position similar to renderPorts logic — fallback: estimate
      let px = (sw.x||0) + w - 6, py = (sw.y||0) + h/2;
      try {
        const positions = (typeof computePortPositions === "function") ? computePortPositions(sw, "device") : null;
        if(positions && positions[ifaceId]){
          px = (sw.x||0) + positions[ifaceId].x;
          py = (sw.y||0) + positions[ifaceId].y;
        }
      } catch(e){}
      const g = ce("g", { class:"stp-blocked",
        transform:`translate(${px},${py})`, "pointer-events":"none" }, layer);
      // ⊘ icon: yellow circle with a slash
      ce("circle", { cx:0, cy:-12, r:6, fill:"#f59e0b", stroke:"#fff", "stroke-width":1.5 }, g);
      ce("line", { x1:-4, y1:-16, x2:4, y2:-8,
        stroke:"#fff", "stroke-width":2, "stroke-linecap":"round" }, g);
      // Tooltip-attachable small text
      const lbl = "BLK";
      ce("text", { x: 11, y: -10, text: lbl, "font-size":8, "font-family":"var(--mono)",
        "font-weight":"700", fill:"#f59e0b" }, g);
    }
  }
}

function renderAnnotation(a){
  const layer = $("#layer-annotations") || $("#layer-elements");
  const g = ce("g", {
    "class":"element annotation"+(App.selected&&App.selected.kind==="annotation"&&App.selected.id===a.id?" selected":""),
    "data-kind":"annotation", "data-id":a.id,
    "transform":`translate(${a.x||0},${a.y||0})`
  }, layer);
  const w = a.width || 180, h = a.height || 40;
  const color = a.color || "rgba(255,235,100,0.85)";
  // Sticky-note rectangle
  ce("rect", {
    "class":"annotation-bg",
    x:0, y:0, width:w, height:h, rx:4, ry:4,
    fill: color, stroke:"rgba(0,0,0,0.25)", "stroke-width":1
  }, g);
  // "Sticky" pin in top-right corner
  ce("circle", { cx: w-8, cy: 8, r: 3, fill:"rgba(0,0,0,0.4)", "pointer-events":"none" }, g);
  // Multi-line text rendering
  const fs = a.fontSize || 12;
  const lines = String(a.text || "").split(/\r?\n/);
  let yy = fs + 4;
  for(const line of lines){
    ce("text", {
      x: 8, y: yy, text: line,
      "font-size": fs, "font-family":"var(--mono)",
      fill:"#333", "pointer-events":"none"
    }, g);
    yy += fs + 2;
  }
  // Resize handle (bottom-right)
  if(App.selected && App.selected.kind === "annotation" && App.selected.id === a.id){
    ce("rect", {
      "class":"resize-handle ann-resize handle",
      x: w-8, y: h-8, width:8, height:8,
      fill:"var(--accent)", stroke:"#fff","stroke-width":1,"cursor":"nwse-resize"
    }, g);
  }
  // Use the generic element handler for drag + resize + context menu
  attachElementHandlers(g, "annotation", a.id);
  // Also: double-click → focus textarea
  g.addEventListener("dblclick", (e)=>{
    e.stopPropagation();
    selectElement("annotation", a.id);
    openPropertyPanel();
    setTimeout(()=>{
      const ta = document.querySelector("#panel-property textarea");
      if(ta){ ta.focus(); ta.select(); }
    }, 50);
  });
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
    const cls = "iface-port port-"+typeKey + (linked?" linked":"") + (status==="down"?" down":"") +
      (ifaceHasMacCollision(obj, iface.id) ? " mac-collision" : "");
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

// vPC peer-link: render as a Cisco-style "vPC Domain" — two switches unified inside
// a translucent purple region with bold banner, with peer-link + peer-keepalive,
// plus member port-channel brackets for connections that share vpc_id
function renderVpcOverlay(){
  const layer = $("#layer-connections");
  const drawn = new Set();

  // === Pass 1: vPC domain region + peer-link + keepalive ===
  for(const d of (App.config.devices||[])){
    if(!d.vpc || !d.vpc.enabled || !d.vpc.peer) continue;
    const peerId = d.vpc.peer;
    const pairKey = [d.id, peerId].sort().join("|");
    if(drawn.has(pairKey)) continue;
    drawn.add(pairKey);
    const peer = Cfg.byId("devices", peerId);
    if(!peer) continue;
    const dw = d.width||120, dh = d.height||70;
    const pw = peer.width||120, ph = peer.height||70;
    const cx1 = (d.x||0) + dw/2, cy1 = (d.y||0) + dh/2;
    const cx2 = (peer.x||0) + pw/2, cy2 = (peer.y||0) + ph/2;
    const g = ce("g", { class:"vpc-overlay","data-vpc-pair": pairKey }, layer);

    // (a) Translucent domain background — encloses both devices
    const minX = Math.min(d.x||0, peer.x||0) - 16;
    const maxX = Math.max((d.x||0)+dw, (peer.x||0)+pw) + 16;
    const minY = Math.min(d.y||0, peer.y||0) - 26;
    const maxY = Math.max((d.y||0)+dh, (peer.y||0)+ph) + 14;
    ce("rect", {
      "class":"vpc-domain-region",
      x:minX, y:minY, width:maxX-minX, height:maxY-minY,
      rx:14, ry:14,
      fill:"rgba(163,113,247,0.06)",
      stroke:"var(--purple)", "stroke-width":1.5,
      "stroke-dasharray":"6 4", "pointer-events":"none"
    }, g);

    // (b) Big banner at top — "vPC Domain N"
    const banner = ch("g", {}, g); // visual group; we'll use ce for SVG
    const bannerY = minY + 4;
    const bannerText = `vPC Domain ${d.vpc.domain||1}`;
    const bWidth = bannerText.length * 6.5 + 24;
    const bX = (minX + maxX) / 2 - bWidth / 2;
    ce("rect", { x:bX, y:bannerY, width:bWidth, height:18, rx:9, ry:9,
      fill:"var(--purple)", stroke:"#fff", "stroke-width":1.5, "pointer-events":"none" }, g);
    ce("text", { x:bX+bWidth/2, y:bannerY+9, text: bannerText,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":11, "font-family":"var(--mono)", "font-weight":"700",
      fill:"#fff", "pointer-events":"none" }, g);

    // (c) Peer-link — bold triple parallel lines between the two switches
    const dx = cx2 - cx1, dy = cy2 - cy1, len = Math.hypot(dx,dy)||1;
    const nx = -dy/len, ny = dx/len; // unit normal
    function plLine(off){
      ce("line", {
        "class":"vpc-peer-link",
        x1: cx1 + nx*off, y1: cy1 + ny*off,
        x2: cx2 + nx*off, y2: cy2 + ny*off
      }, g);
    }
    plLine(-5); plLine(0); plLine(5);
    // Peer-link label
    const mx = (cx1+cx2)/2, my = (cy1+cy2)/2;
    const plLbl = "PEER-LINK";
    const plW = plLbl.length * 5.5 + 12;
    ce("rect", { x: mx-plW/2, y: my-9, width: plW, height:14, rx:7, ry:7,
      fill:"var(--panel)", stroke:"var(--purple)", "stroke-width":1.5 }, g);
    ce("text", { x: mx, y: my-2, text: plLbl,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":9, "font-family":"var(--mono)", "font-weight":"700",
      fill:"var(--purple)", "pointer-events":"none" }, g);

    // (d) Peer-keepalive — separate thin dotted line below
    const kaOff = 14;
    ce("line", {
      "class":"vpc-keepalive",
      x1: cx1 + nx*kaOff, y1: cy1 + ny*kaOff,
      x2: cx2 + nx*kaOff, y2: cy2 + ny*kaOff
    }, g);
    // Keepalive label
    const kaX = mx + nx*kaOff, kaY = my + ny*kaOff;
    const kaLbl = "Keepalive";
    const kaW = kaLbl.length * 5 + 10;
    ce("rect", { x: kaX-kaW/2, y: kaY-6, width: kaW, height:10, rx:5, ry:5,
      fill:"var(--panel)", stroke:"var(--purple)", "stroke-width":0.8 }, g);
    ce("text", { x: kaX, y: kaY-1, text: kaLbl,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":7, "font-family":"var(--mono)",
      fill:"var(--purple)", "pointer-events":"none" }, g);

    // (e) Small vPC tag inside each device at top-right corner (subtle, in-domain marker)
    function placeTag(dev, w, h){
      const bx = (dev.x||0) + w - 22;
      const by = (dev.y||0) - 10;
      ce("rect", { x:bx, y:by, width:22, height:10, rx:5, ry:5,
        fill:"var(--purple)", stroke:"#fff", "stroke-width":1, "pointer-events":"none" }, g);
      ce("text", { x:bx+11, y:by+5,
        "text-anchor":"middle", "dominant-baseline":"middle",
        "font-size":7, "font-family":"var(--mono)", "font-weight":"700",
        fill:"#fff", text: "vPC", "pointer-events":"none" }, g);
    }
    placeTag(d, dw, dh);
    placeTag(peer, pw, ph);

    // Tooltip for the whole domain
    g.addEventListener("mouseenter", (e)=>showTooltip(e,
      `vPC Domain ${d.vpc.domain||1}\nPeers: ${d.id} ↔ ${peer.id}\nKeepalive: ${d.vpc.keepalive||"-"} / ${peer.vpc?peer.vpc.keepalive:"-"}\nThis is a logically-unified switch pair.`));
    g.addEventListener("mouseleave", hideTooltip);
    g.addEventListener("mousemove", moveTooltip);
  }

  // === Pass 2: vPC member port-channel brackets ===
  // Group connections by vpc_id where the SAME host connects to BOTH vPC peers
  const byVpcId = {};
  for(const c of (App.config.connections||[])){
    if(!c.vpc_id) continue;
    byVpcId[c.vpc_id] = byVpcId[c.vpc_id] || [];
    byVpcId[c.vpc_id].push(c);
  }
  for(const vpcId in byVpcId){
    const grp = byVpcId[vpcId];
    if(grp.length < 2) continue;  // Need at least 2 cables to form a vPC member
    // Find the "host" side — the common endpoint
    function hostId(c, side){
      const ep = c[side];
      return ep ? (ep.server || ep.device) : null;
    }
    // Determine which side has the common element
    const fromIds = new Set(grp.map(c=>hostId(c,"from")));
    const toIds = new Set(grp.map(c=>hostId(c,"to")));
    let hostSide = null, switchSide = null;
    if(fromIds.size === 1) { hostSide = "from"; switchSide = "to"; }
    else if(toIds.size === 1) { hostSide = "to"; switchSide = "from"; }
    else continue;
    const hostKey = hostSide === "from" ? [...fromIds][0] : [...toIds][0];
    // Compute average of switch-side endpoints (vPC peer side)
    let switchX = 0, switchY = 0, n = 0;
    let hostX = 0, hostY = 0;
    for(const c of grp){
      const a = resolveEndpoint(c.from);
      const b = resolveEndpoint(c.to);
      if(!a || !b) continue;
      const switchEp = switchSide === "from" ? a : b;
      const hostEp = hostSide === "from" ? a : b;
      switchX += switchEp.x; switchY += switchEp.y; n++;
      hostX = hostEp.x; hostY = hostEp.y;
    }
    if(!n) continue;
    switchX /= n; switchY /= n;

    // Draw a thicker "bundled" overlay path from host to convergence point near switches
    // The convergence point is between host and switch midpoint
    const cgX = (hostX + switchX) / 2;
    const cgY = (hostY + switchY) / 2;
    const g = ce("g", { class:"vpc-member-bracket","data-vpc-id":vpcId }, layer);
    // Bracket arc — thick translucent purple line from host to convergence, then split to switches
    ce("path", {
      d: `M ${hostX} ${hostY} L ${cgX} ${cgY}`,
      stroke: "var(--purple)", "stroke-width": 6, opacity: 0.25,
      fill:"none", "stroke-linecap":"round", "pointer-events":"none"
    }, g);
    // Label at convergence
    const memLbl = `vPC ${vpcId}`;
    const memW = memLbl.length * 6 + 10;
    ce("rect", { x: cgX - memW/2, y: cgY - 8, width: memW, height: 14, rx:7, ry:7,
      fill:"var(--purple)", stroke:"#fff", "stroke-width":1, "pointer-events":"none" }, g);
    ce("text", { x: cgX, y: cgY, text: memLbl,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":9, "font-family":"var(--mono)", "font-weight":"700",
      fill:"#fff", "pointer-events":"none" }, g);
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

// Determine the *effective* status of a connection considering both ends.
// Returns: "up" | "down" | "flapping" | "err-disabled" | "device-down" | "device-error"
function effectiveConnStatus(c){
  if(!c) return "up";
  if(c.status === "down") return "down";
  if(c.status === "flapping") return "flapping";
  function getObj(ep){
    if(!ep) return null;
    if(ep.device) return Cfg.byId("devices", ep.device);
    if(ep.server) return Cfg.byId("servers", ep.server);
    return null;
  }
  function getIface(obj, ep){
    if(!obj || !ep) return null;
    return (obj.interfaces||[]).find(i=>i.id===ep.interface) || null;
  }
  const fO = getObj(c.from), tO = getObj(c.to);
  // Device-level status takes priority
  if(fO && fO.status === "stopped") return "device-down";
  if(tO && tO.status === "stopped") return "device-down";
  if(fO && fO.status === "error") return "device-error";
  if(tO && tO.status === "error") return "device-error";
  // Interface-level status
  const fI = getIface(fO, c.from), tI = getIface(tO, c.to);
  if(fI && fI.status === "down") return "down";
  if(tI && tI.status === "down") return "down";
  if(fI && fI.status === "err-disabled") return "err-disabled";
  if(tI && tI.status === "err-disabled") return "err-disabled";
  return c.status || "up";
}

function renderConnection(c){
  if(!c.from || !c.to) return;
  const a = resolveEndpoint(c.from);
  const b = resolveEndpoint(c.to);
  if(!a||!b) return;
  const status = effectiveConnStatus(c);
  const isDown = status === "down" || status === "err-disabled" || status === "device-down" || status === "device-error";
  const traffic = c.traffic || "idle";
  const direction = c.direction || "forward";
  const type = c.type || "ethernet";
  const built = buildConnectionPath(a, b, c);
  const downCls = isDown ? " down" : "";
  const flapCls = status === "flapping" ? " flapping" : "";
  const cls = "conn "+type+downCls+flapCls+" lvl-"+(isDown?"idle":traffic);

  const g = ce("g", { "class":"conn-group","data-kind":"connection","data-id":c.id }, $("#layer-connections"));

  // Hit area (transparent fat line for easier clicking)
  ce("path", { "class":"conn-hit", d: built.pathD, stroke:"transparent", "stroke-width":"14", fill:"none" }, g);

  // Base line - with an id so animateMotion can reference it
  const pathId = "conn-path-" + c.id.replace(/[^a-zA-Z0-9_-]/g,"_");
  const line = ce("path", { id: pathId, "class": cls, d: built.pathD, fill:"none" }, g);
  // Arrowhead markers based on direction (only when up)
  if(!isDown){
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

  // Traffic flow overlay (animated dash + moving blips) — ONLY when actually up AND animations enabled
  if(!isDown && traffic !== "idle" && App.animationsEnabled){
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
  if(!isDown && traffic !== "idle"){
    const trafLbl = {low:"低", medium:"中", high:"高"}[traffic]||"";
    if(trafLbl) lbl += (lbl?" · ":"") + trafLbl;
  }
  if(isDown){
    const reasonLbl = {
      "down":"DOWN", "err-disabled":"ERR-DISABLED",
      "device-down":"DEV-STOPPED", "device-error":"DEV-ERROR"
    }[status] || "DOWN";
    lbl = (lbl ? lbl+" · " : "") + reasonLbl;
  }
  if(lbl){
    const lblW = Math.max(28, lbl.length * 6 + 8);
    const lblFill = isDown ? "rgba(248,81,73,0.15)" : "var(--bg)";
    const lblStroke = isDown ? "var(--red)" : "var(--border)";
    ce("rect", { x:midX-lblW/2, y:midY-7, width:lblW, height:12, rx:3, ry:3,
      fill:lblFill, stroke:lblStroke,"stroke-width":0.5,"pointer-events":"none" }, g);
    const txt = ce("text", { "class":"conn-label", x:midX, y:midY+0.5, "dominant-baseline":"middle", text:lbl }, g);
    if(isDown) txt.setAttribute("style","fill:var(--red);font-weight:700");
  }

  // Visible X mark on the down side(s) of the connection
  if(isDown){
    // Draw X at midpoint, plus a small X at each down endpoint
    function drawXMark(cx, cy, size){
      const xg = ce("g", { class:"conn-down-mark", "pointer-events":"none" }, g);
      ce("line", { x1:cx-size, y1:cy-size, x2:cx+size, y2:cy+size,
        stroke:"var(--red)", "stroke-width":3, "stroke-linecap":"round" }, xg);
      ce("line", { x1:cx+size, y1:cy-size, x2:cx-size, y2:cy+size,
        stroke:"var(--red)", "stroke-width":3, "stroke-linecap":"round" }, xg);
    }
    // Check which side(s) are down and mark them
    const fromIf = (c.from && c.from.interface) ? (Cfg.byId(kindToCol(c.from.device?"device":"server"), c.from.device||c.from.server)||{interfaces:[]}).interfaces.find(i=>i.id===c.from.interface) : null;
    const toIf = (c.to && c.to.interface) ? (Cfg.byId(kindToCol(c.to.device?"device":"server"), c.to.device||c.to.server)||{interfaces:[]}).interfaces.find(i=>i.id===c.to.interface) : null;
    if(fromIf && (fromIf.status === "down" || fromIf.status === "err-disabled")) drawXMark(a.x, a.y, 6);
    if(toIf && (toIf.status === "down" || toIf.status === "err-disabled")) drawXMark(b.x, b.y, 6);
    // Always show one at midpoint
    drawXMark(midX, midY - 14, 5);
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
var dragState = null;

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

