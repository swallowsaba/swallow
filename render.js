// NetSim — rendering, ports, interaction, context menu, status bar
/* ====== RENDERING ====== */
function render(){
  $("#layer-networks").innerHTML = "";
  $("#layer-connections").innerHTML = "";
  $("#layer-elements").innerHTML = "";
  const annLayer = $("#layer-annotations");
  if(annLayer) annLayer.innerHTML = "";
  const ovl = $("#layer-overlays"); if(ovl) ovl.innerHTML = "";  // top layer for pod chips / badges
  ensureArrowMarkers();
  Cfg.ensure();
  gConnSegments = [];
  for(const n of App.config.networks) renderNetwork(n);
  // Precompute the set of elements that currently have a conflicting (duplicate) IP
  App._ipConflictSet = new Set();
  App._macConflictSet = new Set();
  try{
    if(typeof detectIpConflicts==="function"){
      const cf = detectIpConflicts();
      for(const ip in cf){ for(const o of cf[ip]) App._ipConflictSet.add(o.kind+":"+o.id); }
    }
    if(typeof detectMacConflicts==="function"){
      const mf = detectMacConflicts();
      for(const m in mf){ for(const o of mf[m]) App._macConflictSet.add(o.kind+":"+o.id); }
    }
  }catch(e){}
  renderAwsOverlay();
  renderK8sOverlay();
  renderVcenterOverlay();
  for(const c of App.config.connections) renderConnection(c);
  renderCrossoverHops();
  renderVpcOverlay();
  for(const d of App.config.devices) renderDevice(d);
  for(const s of App.config.servers) renderServer(s);
  renderVmHostLinks();
  for(const a of (App.config.annotations||[])) renderAnnotation(a);
  if(App.stpVisible) renderStpOverlay();
  applyViewBox();
}

// Collected straight connection segments for the current render pass (for crossover hops)
var gConnSegments = [];

// Draw a faint dotted "hosted-on" link from each VM to its hypervisor host
function renderVmHostLinks(){
  const layer = $("#layer-connections");
  if(!layer) return;
  const cen = (o)=>({ x:(o.x||0)+(o.width||130)/2, y:(o.y||0)+(o.height||65)/2 });
  for(const s of (App.config.servers||[])){
    if(!s.host) continue;
    const host = Cfg.byId("servers", s.host);
    if(!host) continue;
    const a = cen(s), b = cen(host);
    const g = ce("g", { class:"vm-host-link", "pointer-events":"none" }, layer);
    ce("line", { x1:a.x, y1:a.y, x2:b.x, y2:b.y, stroke:"var(--purple)",
      "stroke-width":1.2, "stroke-dasharray":"3 4", opacity:"0.5" }, g);
  }
}

// Draw a small "jump" (bridge arc) wherever two connection lines cross, so it is
// visually clear the lines pass OVER each other and are not electrically joined.
function renderCrossoverHops(){
  const layer = $("#layer-connections");
  const segs = gConnSegments;
  const R = 6; // hop radius
  const hops = [];
  function segInt(s1, s2){
    // Intersection of two segments; returns point or null. Ignores shared endpoints.
    const x1=s1.x1,y1=s1.y1,x2=s1.x2,y2=s1.y2, x3=s2.x1,y3=s2.y1,x4=s2.x2,y4=s2.y2;
    const d=(x2-x1)*(y4-y3)-(y2-y1)*(x4-x3);
    if(Math.abs(d) < 1e-6) return null; // parallel
    const t=((x3-x1)*(y4-y3)-(y3-y1)*(x4-x3))/d;
    const u=((x3-x1)*(y2-y1)-(y3-y1)*(x2-x1))/d;
    const eps=0.04;
    if(t<=eps||t>=1-eps||u<=eps||u>=1-eps) return null; // crossing must be interior to BOTH
    return { x:x1+t*(x2-x1), y:y1+t*(y2-y1), seg:s1 };
  }
  for(let i=0;i<segs.length;i++){
    for(let j=i+1;j<segs.length;j++){
      if(segs[i].id === segs[j].id) continue; // same connection
      const p = segInt(segs[i], segs[j]);
      if(p){
        // dedup near-identical crossing points
        if(!hops.some(h=>Math.abs(h.x-p.x)<2 && Math.abs(h.y-p.y)<2)){
          // hop is drawn on the LATER-drawn (topmost) segment: segs[i] (drawn first) is under,
          // so we bridge segs[j]; but visually we bridge the one we draw last. Use segs[i] dir.
          hops.push({ x:p.x, y:p.y, dx:segs[i].x2-segs[i].x1, dy:segs[i].y2-segs[i].y1 });
        }
      }
    }
  }
  if(!hops.length) return;
  const g = ce("g", { class:"crossover-hops", "pointer-events":"none" }, layer);
  for(const h of hops){
    const len = Math.hypot(h.dx,h.dy)||1;
    const ux = h.dx/len, uy = h.dy/len;       // direction of the under-passing segment
    // arc endpoints along that segment, bulging perpendicular
    const ax = h.x - ux*R, ay = h.y - uy*R;
    const bx = h.x + ux*R, by = h.y + uy*R;
    const nx = -uy, ny = ux;                   // perpendicular (bulge direction)
    const cx = h.x + nx*R*1.6, cy = h.y + ny*R*1.6;
    // mask out the line under the bridge, then draw the hop arc
    ce("path", { d:`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`,
      stroke:"var(--bg)", "stroke-width":4.5, fill:"none", "stroke-linecap":"round" }, g);
    ce("path", { d:`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`,
      stroke:"var(--text-dim)", "stroke-width":1.6, fill:"none", "stroke-linecap":"round", opacity:0.9 }, g);
  }
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
    if(!iface) continue;
    // Skip virtual interfaces (e.g. bond0) — they have no physical port
    if(iface.virtual || iface.type === "bond") continue;
    // NOTE: bond member physical ports ARE drawn as normal squares (shape unchanged).
    // Connection lines for bonded members are visually re-routed to the bond0 box (see resolveEndpoint),
    // but the port square itself remains visible/unchanged.
    const typeKey = portTypeKey(iface);
    const status = iface.status || "up";
    const linked = (App.config.connections||[]).some(c=>
      ((c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===iface.id) ||
       (c.to && (c.to.device===obj.id||c.to.server===obj.id) && c.to.interface===iface.id))
    );
    const cls = "iface-port port-"+typeKey + (linked?" linked":"") +
      (status==="down"?" down":(status==="up"?" up":"")) +
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
    hit.addEventListener("mouseenter",(e)=>{ App._hoverPort = { kind, id:obj.id, iface:iface.id }; showTooltip(e, formatPortTooltip(iface)); });
    hit.addEventListener("mouseleave",()=>{ if(App._hoverPort && App._hoverPort.id===obj.id && App._hoverPort.iface===iface.id) App._hoverPort = null; hideTooltip(); });
    hit.addEventListener("mousemove",moveTooltip);
    hit.addEventListener("mousedown",(e)=>{
      if(App.connectMode){
        // Connect mode: start a wire gesture from this port. Works for BOTH
        //   (a) press-drag-release onto the target port, and
        //   (b) click this port, then click the target port.
        if(e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const pos = (computePortPositions(obj, kind)[i]) || {cx:0,cy:0,outX:0,outY:0};
        wireDrag = {
          fromKind:kind, fromId:obj.id, fromIface:iface.id,
          sx:(obj.x||0)+(pos.outX!=null?pos.outX:pos.cx), sy:(obj.y||0)+(pos.outY!=null?pos.outY:pos.cy),
          moved:false, connectMode:true
        };
        return;
      }
      // Not in connect mode: LEFT-drag repositions the interface port. No wiring here.
      if(e.button !== 0) return;
      e.stopPropagation();
      dragState = {
        mode: "port", obj, kind, ifaceIdx: i, moved: false,
        origPos: iface.port_position ? JSON.parse(JSON.stringify(iface.port_position)) : null
      };
    });
    hit.addEventListener("click",(e)=>{
      e.stopPropagation();
      // In connect mode, wiring is handled in mousedown/mouseup (drag or click-click).
      if(App.connectMode) return;
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
  s += `Status: ${iface.status||"up"}\n`;
  s += `── 左ドラッグ=移動 / 右ドラッグ=配線`;
  return s;
}

// Compute the bond0 box rectangle. The box sits ADJACENT to the server (its outer border
// flush against the server's outer border), and the member ports straddle the shared boundary.
function bondBoxRect(obj, kind){
  if(!obj || !obj.bonding || !obj.bonding.enabled) return null;
  const members = obj.bonding.members || [];
  if(members.length < 1) return null;
  const w = obj.width || (kind==="server"?130:120);
  const h = obj.height || (kind==="server"?70:70);
  const positions = computePortPositions(obj, kind);
  const memberPorts = [];
  for(const mid of members){
    const idx = (obj.interfaces||[]).findIndex(i=>i.id===mid);
    if(idx>=0 && positions[idx]) memberPorts.push(positions[idx]);
  }
  if(!memberPorts.length) return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of memberPorts){
    minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x+(p.w||12));
    minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y+(p.h||12));
  }
  const side = memberPorts[0].side || (kind==="server"?"top":"bottom");
  const minBoxW=104, boxH=38, minBoxH=48, boxW=104, pad=10;
  let bx,by,bw,bh;
  if(side==="top"){            // box ABOVE server; bottom edge flush with server top (y=0)
    bw = Math.max(maxX-minX+pad*2, minBoxW);
    bx = (minX+maxX)/2 - bw/2;
    bh = boxH; by = -boxH;
  } else if(side==="bottom"){  // box BELOW server; top edge flush with server bottom (y=h)
    bw = Math.max(maxX-minX+pad*2, minBoxW);
    bx = (minX+maxX)/2 - bw/2;
    bh = boxH; by = h;
  } else if(side==="left"){    // box LEFT of server; right edge flush with server left (x=0)
    bh = Math.max(maxY-minY+pad*2, minBoxH);
    by = (minY+maxY)/2 - bh/2;
    bw = boxW; bx = -boxW;
  } else {                     // right
    bh = Math.max(maxY-minY+pad*2, minBoxH);
    by = (minY+maxY)/2 - bh/2;
    bw = boxW; bx = w;
  }
  const ox=(obj.x||0), oy=(obj.y||0);
  return { bx, by, bw, bh, side,
    absX:ox+bx, absY:oy+by, absCx:ox+bx+bw/2, absCy:oy+by+bh/2, w:bw, h:bh };
}

function renderBondOverlay(g, obj, kind){
  if(!obj.bonding || !obj.bonding.enabled) return;
  const members = obj.bonding.members || [];
  if(members.length < 1) return;
  const w = obj.width || (kind==="server"?130:120);
  const h = obj.height || (kind==="server"?70:70);

  // Member physical port positions (relative to the element group g)
  const positions = computePortPositions(obj, kind);
  const memberPorts = [];
  for(const mid of members){
    const idx = (obj.interfaces||[]).findIndex(i=>i.id===mid);
    if(idx>=0 && positions[idx]){
      const m = obj.interfaces[idx];
      memberPorts.push({ id:mid, pos:positions[idx], up:(m.status||"up")==="up" });
    }
  }
  if(!memberPorts.length) return;

  // Bond status + colors
  const effStatus = (typeof bondEffectiveStatus==="function") ? bondEffectiveStatus(obj) : "up";
  const active = (typeof bondActiveMember==="function") ? bondActiveMember(obj) : null;
  let color = "var(--cyan,#06b6d4)";
  if(effStatus==="down") color = "var(--red)";
  else if(effStatus==="degraded") color = "var(--orange)";

  // Enclosing box (shared computation)
  const rect = bondBoxRect(obj, kind);
  if(!rect) return;
  const bx=rect.bx, by=rect.by, bw=rect.bw, bh=rect.bh, side=rect.side;

  // 1) The enclosing bond0 container (rounded rect) — drawn behind the ports
  const boxG = ce("g", { "class":"bond-container", "pointer-events":"none" }, g);
  ce("rect", { x:bx, y:by, width:bw, height:bh, rx:7, ry:7,
    fill:"rgba(6,182,212,0.07)", stroke:color, "stroke-width":1.8,
    "stroke-dasharray": effStatus==="down" ? "5 3" : "" }, boxG);

  // 2) Label: "● bond0 [mode]" and IP — placed away from the straddle edge so ports stay readable
  const statusIcon = effStatus==="up" ? "●" : (effStatus==="degraded" ? "◐" : "✕");
  const modeShort = (obj.bonding.mode||"active-backup").replace("active-backup","A/B").replace("802.3ad","LACP").replace("balance-","bal-");
  let labelY, labelX = bx+6;
  if(side==="top") labelY = by + 12;              // top box: label near its top (above ports)
  else if(side==="bottom") labelY = by + bh - 16; // bottom box: label near its bottom (below ports)
  else labelY = by + 13;
  ce("text", { x:labelX, y:labelY, "font-size":9, "font-family":"var(--mono)",
    "font-weight":"800", fill:color, text:`${statusIcon} ${obj.bonding.bond_name||"bond0"} [${modeShort}]` }, boxG);
  const ipTxt = obj.bonding.bond_ip || "(IP未設定!)";
  ce("text", { x:labelX, y:labelY+11, "font-size":8, "font-family":"var(--mono)",
    fill: obj.bonding.bond_ip ? "var(--text-dim)" : "var(--red)", text: ipTxt }, boxG);

  // 3) Per-member status dot + ACTIVE marker inside the box (so each NIC's state is visible)
  for(const mp of memberPorts){
    const p = mp.pos;
    if(mp.id===active && mp.up){
      const my = (side==="top") ? (by + bh - 4) : (side==="bottom") ? (by + 4) : (p.cy);
      ce("text", { x:p.cx, y:my, "text-anchor":"middle",
        "font-size":6.5, "font-weight":"800", fill:"var(--green)",
        "pointer-events":"none", text:"▲ACTIVE" }, boxG);
    }
  }
}

// Draw AWS VPC boundary regions (enclosing their EC2 servers) + subnet sub-boxes.
// Empty VPCs are shown as a labeled placeholder so they are always visible.
function renderAwsOverlay(){
  const layer = $("#layer-networks");
  if(!layer || !App.config.aws) return;
  if(typeof ensureAwsHierarchy === "function") ensureAwsHierarchy();
  const aws = App.config.aws;
  const regions = aws.regions || [];
  const globalSvcs = (App.config.devices||[]).filter(d=>d.aws_kind && !d.aws_vpc);
  if(!regions.length && !globalSvcs.length) return;

  // ---- Layout constants ----
  const SUBNET_W = 200, SUBNET_H = 96, SUBNET_VGAP = 16, AZ_HGAP = 24;
  const AZ_PAD_TOP = 34, REGION_PAD = 30, VPC_PAD = 16, ROW_LABEL_H = 0;

  aws._pos = aws._pos || { x: 40, y: 40 };
  const originX = aws._pos.x, originY = aws._pos.y;

  // ===== AWS master frame (outermost, holds everything) =====
  const awsG = ce("g", { class:"aws-master-overlay" }, layer);

  // We lay out region by region, stacking regions vertically.
  let cursorY = originY + 40;     // leave room for AWS label
  let awsRight = originX + 200;   // will grow

  regions.forEach((region)=>{
    const azs = region.azs && region.azs.length ? region.azs : awsDefaultAzs(region.id);
    const vpcs = region.vpcs || [];

    // Determine, per VPC, the subnet rows. A "row" is a distinct subnet *position*
    // within the VPC. Subnets that share a row index but differ by AZ sit side by side.
    // We group each VPC's subnets by a row key = subnet base-name without the AZ suffix
    // so e.g. public-1a / public-1c line up on the same row.
    function rowKey(sn){
      let n = sn.name || sn.cidr || "";
      // strip trailing az-ish suffix (e.g. "-1a", "-1c", "-a")
      n = n.replace(/[-_]?(1?[a-f])$/i, "");
      return n || (sn.cidr||"row");
    }

    // region geometry
    const regionLabelH = 26;
    const regionX = originX;
    let regionY = cursorY;
    // AZ columns x positions
    const azColW = SUBNET_W + VPC_PAD*2;
    const azX = {};
    azs.forEach((az, i)=>{ azX[az] = regionX + REGION_PAD + i*(azColW + AZ_HGAP); });
    const azBandTop = regionY + regionLabelH + 8;

    // For each VPC compute its rows and total height
    // VPC stacked vertically inside the region, each VPC spans all AZ columns.
    let vpcCursorY = azBandTop + AZ_PAD_TOP + 6;
    const vpcLayouts = [];
    for(const vpc of vpcs){
      const subnets = vpc.subnets || [];
      // unique rows preserving order
      const rowOrder = [];
      const rowMap = {};
      for(const sn of subnets){
        const k = rowKey(sn);
        if(!(k in rowMap)){ rowMap[k] = []; rowOrder.push(k); }
        rowMap[k].push(sn);
      }
      const vpcLabelH = 22;
      const rowsH = rowOrder.length ? rowOrder.length*(SUBNET_H+SUBNET_VGAP) : 60;
      const vpcH = vpcLabelH + 10 + rowsH + VPC_PAD;
      vpcLayouts.push({ vpc, rowOrder, rowMap, y: vpcCursorY, h: vpcH, labelH: vpcLabelH });
      vpcCursorY += vpcH + 24;
    }

    const azBandBottom = vpcCursorY + 6;
    const lastAz = azs[azs.length-1];
    const regionRight = (azX[lastAz] || (regionX+REGION_PAD)) + azColW + REGION_PAD;
    const regionBottom = azBandBottom + REGION_PAD;
    awsRight = Math.max(awsRight, regionRight + REGION_PAD);

    // --- Region frame (solid blue, outermost meaningful box) ---
    const regG = ce("g", { class:"aws-region-overlay" }, layer);
    const regRect = ce("rect", { x:regionX, y:regionY, width:regionRight-regionX, height:regionBottom-regionY, rx:6, ry:6,
      fill:"rgba(40,110,200,0.015)", stroke:"#2860c8", "stroke-width":1.6,
      "pointer-events":"all", style:"cursor:pointer" }, regG);
    regRect.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"aws-region",id:region.id}; if(typeof openPropertyPanel==="function") openPropertyPanel(); });
    regRect.addEventListener("dblclick",(e)=>{ e.stopPropagation(); if(typeof showAwsRegionManager==="function") showAwsRegionManager(region.id); });
    regRect.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation();
      if(typeof _showSimpleContextMenu==="function") _showSimpleContextMenu(e, [
        { icon:"🌐", label:"リージョン設定 (AZ追加/変更)", action:()=>{ if(typeof showAwsRegionManager==="function") showAwsRegionManager(region.id); }},
        { icon:"➕", label:"このリージョンにVPCを追加", action:()=>{ if(typeof awsAddVpcToRegion==="function") awsAddVpcToRegion(region.id); }},
        { sep:true },
        { icon:"🗑", label:"リージョンを削除", action:()=>{ if(typeof awsDeleteRegion==="function") awsDeleteRegion(region.id); }}
      ]);
    });
    // region label (flag icon like the image)
    ce("text", { x:regionX+10, y:regionY+17, "font-size":13, "font-weight":"700", fill:"#2860c8",
      text:"⚑ リージョン / "+region.id, "pointer-events":"none" }, regG);

    // --- AZ vertical bands ---
    for(const az of azs){
      const ax = azX[az];
      const azBand = ce("rect", { x:ax-6, y:azBandTop, width:azColW+12, height:azBandBottom-azBandTop, rx:5, ry:5,
        fill:"rgba(40,110,200,0.02)", stroke:"#3b82d6", "stroke-width":1.1, "stroke-dasharray":"5 4",
        "pointer-events":"all", style:"cursor:pointer" }, regG);
      azBand.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"aws-az",id:region.id+"/"+az}; if(typeof openPropertyPanel==="function") openPropertyPanel(); });
      azBand.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation();
        if(typeof _showSimpleContextMenu==="function") _showSimpleContextMenu(e, [
          { icon:"🌐", label:"アベイラビリティゾーン: "+az, action:()=>{ if(typeof showAwsRegionManager==="function") showAwsRegionManager(region.id); }},
          { sep:true },
          { icon:"🗑", label:"このAZを削除", action:()=>{ if(typeof awsDeleteAz==="function") awsDeleteAz(region.id, az); }}
        ]);
      });
      ce("text", { x:ax+azColW/2, y:azBandTop+16, "text-anchor":"middle", "font-size":10, fill:"#3b82d6",
        text:"アベイラビリティゾーン / "+az, "pointer-events":"none" }, regG);
    }

    // --- VPC frames (green, span across AZ columns) + subnets at intersections ---
    for(const L of vpcLayouts){
      const vpc = L.vpc;
      const vx = regionX + REGION_PAD - 8;
      const vw = regionRight - regionX - 2*(REGION_PAD) + 16;
      const vg = ce("g", { class:"aws-vpc-overlay" }, layer);
      const vpcRect = ce("rect", { x:vx, y:L.y, width:vw, height:L.h, rx:6, ry:6,
        fill:"rgba(80,160,80,0.03)", stroke:"#2e8b2e", "stroke-width":1.6,
        "pointer-events":"all", style:"cursor:pointer" }, vg);
      vpcRect.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"aws-vpc",id:vpc.name}; if(typeof openPropertyPanel==="function") openPropertyPanel(); });
      vpcRect.addEventListener("dblclick",(e)=>{ e.stopPropagation(); showAwsManager(vpc.name); });
      vpcRect.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation(); showContextMenu(e,"aws-vpc",vpc.name); });
      ce("text", { x:vx+12, y:L.y+16, "font-size":12, "font-weight":"700", fill:"#2e8b2e",
        text:"☁ VPC ("+(vpc.cidr||"")+")", "pointer-events":"none" }, vg);
      if(vpc.igw){
        ce("text", { x:vx+vw-10, y:L.y+15, "text-anchor":"end", "font-size":9, fill:"#2e8b2e", "font-weight":"700",
          text:"⇄ IGW", "pointer-events":"none" }, vg);
      }
      // subnets at (az column × row) intersections
      L.rowOrder.forEach((rk, ri)=>{
        const rowSubnets = L.rowMap[rk];
        const rowY = L.y + L.labelH + 10 + ri*(SUBNET_H+SUBNET_VGAP);
        for(const sn of rowSubnets){
          const ax = azX[sn.az];
          if(ax === undefined) continue; // subnet's AZ not in this region's list
          const sx = ax + VPC_PAD, sy = rowY;
          const isPub = sn.public || /public/i.test(sn.type||"");
          const isIsolate = /isolat/i.test(sn.name||"") || /isolat/i.test(sn.type||"");
          const col = isPub ? "#22c55e" : (isIsolate ? "#64a0c8" : "#3b82d6");
          const fillCol = isPub ? "rgba(34,197,94,0.07)" : (isIsolate ? "rgba(100,160,200,0.07)" : "rgba(59,130,214,0.07)");
          const sg = ce("g", { class:"aws-subnet-overlay" }, layer);
          const snRect = ce("rect", { x:sx, y:sy, width:SUBNET_W, height:SUBNET_H, rx:5, ry:5,
            fill:fillCol, stroke:col, "stroke-width":1.2,
            "pointer-events":"all", style:"cursor:pointer" }, sg);
          snRect.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"aws-subnet",id:vpc.name+"/"+sn.name}; if(typeof openPropertyPanel==="function") openPropertyPanel(); });
          snRect.addEventListener("dblclick",(e)=>{ e.stopPropagation(); showAwsManager(vpc.name); });
          snRect.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation();
            if(typeof _showSimpleContextMenu==="function") _showSimpleContextMenu(e, [
              { icon:(isPub?"🔓":"🔒"), label:(sn.name||"subnet")+" ("+(sn.cidr||"")+")", action:()=>showAwsManager(vpc.name) },
              { sep:true },
              { icon:"🗑", label:"このサブネットを削除", action:()=>{
                vpc.subnets = (vpc.subnets||[]).filter(x=>x!==sn);
                // detach EC2s placed here
                for(const s of (App.config.servers||[])) if(s.aws && s.aws.vpc===vpc.name && s.aws.subnet===sn.name) delete s.aws.subnet;
                renderAndSync(); toast("サブネット "+(sn.name)+" を削除","ok");
              }}
            ]);
          });
          ce("text", { x:sx+8, y:sy+15, "font-size":9, "font-weight":"700", fill:col, "pointer-events":"none",
            text:(isPub?"🔓 ":"🔒 ")+(sn.name||"") }, sg);
          ce("text", { x:sx+8, y:sy+28, "font-size":8.5, fill:col, "pointer-events":"none",
            text:(sn.cidr||"") }, sg);
          // place EC2 instances that belong to this subnet into the cell
          const cellServers = (App.config.servers||[]).filter(s=>s.aws && s.aws.vpc===vpc.name && s.aws.subnet===sn.name && !s.host);
          cellServers.forEach((srv, si)=>{
            const cols = 2;
            const cw = (SUBNET_W-16-8)/cols;
            srv.x = sx + 8 + (si%cols)*(cw+4);
            srv.y = sy + 36 + Math.floor(si/cols)*30;
            srv.width = Math.min(cw, 90); srv.height = 26;
          });
          const cellDevices = (App.config.devices||[]).filter(d=>d.aws_kind && d.aws_vpc===vpc.name && d.aws_subnet===sn.name);
          cellDevices.forEach((dev, di)=>{
            dev.x = sx + 8 + (di%2)*90; dev.y = sy + 60 + Math.floor(di/2)*28;
          });
        }
      });
    }

    cursorY = regionBottom + 40;  // next region below
  });

  // ===== AWS master frame around everything (drawn last so it encloses) =====
  // compute bounds from rendered region geometry
  const awsX = originX - 16, awsY = originY - 4;
  const awsW = (awsRight - originX) + 32;
  const awsH = (cursorY - originY) + 10;
  // place the master rect *behind* by inserting at the front of the layer
  const mRect = ce("rect", { x:awsX, y:awsY, width:awsW, height:awsH, rx:10, ry:10,
    fill:"rgba(255,153,0,0.02)", stroke:"#ff9900", "stroke-width":2, "stroke-dasharray":"12 6",
    "pointer-events":"all", style:"cursor:move" }, awsG);
  mRect.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation();
    if(typeof _showSimpleContextMenu==="function") _showSimpleContextMenu(e, [
      { icon:"☁", label:"AWS 全体管理 (リージョン/VPC)", action:()=>{ if(typeof showAwsManager==="function") showAwsManager(); }},
      { icon:"➕", label:"リージョンを追加", action:()=>{ if(typeof awsAddRegionInteractive==="function") awsAddRegionInteractive(); }},
      { sep:true },
      { icon:"🗑", label:"AWS全体を削除", action:()=>{
        if((typeof confirm==="function")?confirm("AWS全体(全リージョン・VPC・サービス)を削除しますか?"):true){
          App.config.aws = { regions:[], vpcs:[] };
          App.config.devices = (App.config.devices||[]).filter(d=>!d.aws_kind);
          App.config.servers = (App.config.servers||[]).filter(s=>!(s.aws&&s.aws.vpc));
          renderAndSync(); toast("AWS全体を削除","ok");
        }
      }}
    ]);
  });
  // AWS master label (draggable to move the whole AWS block)
  const albl = "☁ AWS Cloud";
  const albw = albl.length*8+16;
  const albRect = ce("rect", { x:awsX+10, y:awsY-11, width:albw, height:22, rx:11, ry:11,
    fill:"#ff9900", stroke:"#fff", "stroke-width":1.4, "pointer-events":"all", style:"cursor:move" }, awsG);
  ce("text", { x:awsX+10+albw/2, y:awsY, "text-anchor":"middle", "dominant-baseline":"middle",
    "font-size":11, "font-weight":"700", fill:"#fff", text:albl, "pointer-events":"none" }, awsG);
  const moveAws = (e)=>{
    if(e.button!==0) return; e.preventDefault(); e.stopPropagation();
    const pt = svgPoint(e);
    awsDragState = { startX:pt.x, startY:pt.y, ox:aws._pos.x, oy:aws._pos.y };
  };
  albRect.addEventListener("mousedown", moveAws);
  mRect.addEventListener("mousedown", moveAws);
  // global services row (outside any VPC) along the top
  if(globalSvcs.length){
    ce("text", { x:awsX+awsW-12, y:awsY+16, "text-anchor":"end", "font-size":9,
      fill:"#ff9900", "font-weight":"700", text:"◆ Global / Regional Services", "pointer-events":"none" }, awsG);
    globalSvcs.forEach((dev,i)=>{
      dev.x = awsX + 20 + (i%5)*120;
      dev.y = awsY + 24;
    });
  }
}
// drag state for moving the whole AWS block by its master label
var awsDragState = null;

// Draw Kubernetes cluster boundary regions enclosing their nodes.
function renderK8sOverlay(){
  const layer = $("#layer-networks");
  if(!layer || !App.config.k8s || !(App.config.k8s.clusters||[]).length) return;
  let placeholderX = 40;
  (App.config.k8s.clusters||[]).forEach((cl)=>{
    const nodes = (cl.nodes||[]).map(id=>Cfg.byId("servers",id)).filter(Boolean);
    const g = ce("g", { class:"k8s-overlay", "pointer-events":"none" }, layer);
    let minX,minY,maxX,maxY;
    if(nodes.length){
      minX=Infinity;minY=Infinity;maxX=-Infinity;maxY=-Infinity;
      for(const s of nodes){ const w=s.width||130,h=s.height||65; minX=Math.min(minX,s.x||0);minY=Math.min(minY,s.y||0);maxX=Math.max(maxX,(s.x||0)+w);maxY=Math.max(maxY,(s.y||0)+h); }
      minX-=26; minY-=34; maxX+=26; maxY+=22;
    } else {
      if(!cl._pos) cl._pos = { x:placeholderX, y:220 };
      minX=cl._pos.x; minY=cl._pos.y; maxX=cl._pos.x+260; maxY=cl._pos.y+140;
      if(!cl._pos.x || cl._pos.x===placeholderX) placeholderX+=300;
    }
    if(cl._pad){ maxX += (cl._pad.w||0); maxY += (cl._pad.h||0); }
    const k8sFrame = ce("rect", { x:minX, y:minY, width:maxX-minX, height:maxY-minY, rx:14, ry:14,
      fill:"rgba(50,108,229,0.05)", stroke:"#326ce5", "stroke-width":1.8, "stroke-dasharray":"10 5",
      "pointer-events":"all", style:"cursor:move" }, g);
    if(nodes.length){
      const memF = nodes.map(s=>({kind:"server",id:s.id}));
      k8sFrame.addEventListener("mousedown",(e)=>startGroupDrag(e, memF));
    } else {
      k8sFrame.addEventListener("mousedown",(e)=>startFrameMove(e, cl, {x:minX,y:minY}));
    }
    k8sFrame.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation(); showContextMenu(e,"k8s-cluster",cl.name); });
    k8sFrame.addEventListener("dblclick",(e)=>{ e.stopPropagation(); showK8sManager(cl.name); });
    k8sFrame.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"k8s-cluster",id:cl.name}; openPropertyPanel(); });
    const podN=(cl.pods||[]).length, svcN=(cl.services||[]).length;
    const label = `☸ K8s ${cl.name} — ${nodes.length}node / ${podN}pod / ${svcN}svc`;
    const bw = label.length*6.0+16;
    const labelRect = ce("rect", { x:minX+8, y:minY-9, width:bw, height:18, rx:9, ry:9, fill:"#326ce5", stroke:"#fff", "stroke-width":1.2,
      style:"cursor:move", "pointer-events":"all" }, g);
    ce("text", { x:minX+8+bw/2, y:minY+1, "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":10, "font-weight":"700", fill:"#fff", "font-family":"var(--mono)", text:label, "pointer-events":"none" }, g);
    if(nodes.length){
      const mem = nodes.map(s=>({kind:"server",id:s.id}));
      labelRect.addEventListener("mousedown",(e)=>startGroupDrag(e, mem));
    }
    labelRect.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"k8s-cluster",id:cl.name}; openPropertyPanel(); });
    labelRect.addEventListener("dblclick",(e)=>{ e.stopPropagation(); showK8sManager(cl.name); });
    if(cl.control_plane && cl.control_plane.ha){
      ce("text", { x:maxX-8, y:minY+1, "text-anchor":"end", "dominant-baseline":"middle",
        "font-size":9, fill:"#326ce5", "font-weight":"700", text:"HA control-plane" }, g);
    }
    if(!nodes.length){
      ce("text", { x:(minX+maxX)/2, y:(minY+maxY)/2, "text-anchor":"middle", "dominant-baseline":"middle",
        "font-size":11, fill:"var(--text-mute)", text:"(ノード未割当 — K8s管理でノード追加)" }, g);
    }
    // ---- Service chips at top of cluster frame (clickable for editing) ----
    const services = cl.services || [];
    if(services.length){
      const topLayer = $("#layer-overlays") || layer;
      const sg = ce("g", { class:"k8s-services-top", "pointer-events":"none" }, topLayer);
      const svcW=70, svcH=14, gap=4;
      services.forEach((svc,si)=>{
        const cx = minX + 14 + bw + 12 + si*(svcW+gap);
        const cy = minY - 9;
        const typeColor = svc.type==="LoadBalancer" ? "#16a34a" : (svc.type==="NodePort" ? "#f59e0b" : "#0891b2");
        const sgEl = ce("g", { class:"k8s-service-chip", "pointer-events":"all", style:"cursor:pointer" }, sg);
        ce("rect", { x:cx, y:cy, width:svcW, height:svcH, rx:7, ry:7,
          fill:typeColor, stroke:"#fff", "stroke-width":1, "pointer-events":"all" }, sgEl);
        ce("text", { x:cx+svcW/2, y:cy+10, "text-anchor":"middle", "font-size":8, "font-weight":"700",
          fill:"#fff", text:"⚓ "+(svc.name.length>7?svc.name.slice(0,7):svc.name), "pointer-events":"none" }, sgEl);
        sgEl.addEventListener("click",(e)=>{ e.stopPropagation();
          if(typeof showServiceEditor==="function") showServiceEditor(cl.name, svc.name);
        });
        sgEl.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation();
          if(typeof showServiceContextMenu==="function") showServiceContextMenu(e, cl.name, svc.name);
        });
      });
    }
    const krh = ce("rect", { x:maxX-7, y:maxY-7, width:12, height:12, rx:2, ry:2,
      fill:"#326ce5", stroke:"#fff", "stroke-width":1, "pointer-events":"all", style:"cursor:nwse-resize" }, g);
    krh.addEventListener("mousedown",(e)=>startFrameResize(e, cl, {x:minX,y:minY,w:maxX-minX,h:maxY-minY}));
    // ---- Pod visualization: show which pods run on each node (TOP layer so visible over nodes) ----
    const topLayer = $("#layer-overlays") || layer;
    const og = ce("g", { class:"k8s-pods-top", "pointer-events":"none" }, topLayer);
    const masters = new Set((cl.control_plane&&cl.control_plane.masters)||[]);
    const podsByNode = {};
    const unscheduled = [];
    const nodeIdSet = new Set((cl.nodes||[]));
    for(const pod of (cl.pods||[])){
      if(pod.node && nodeIdSet.has(pod.node)) (podsByNode[pod.node]=podsByNode[pod.node]||[]).push(pod);
      else unscheduled.push(pod);
    }
    // pods with no/invalid node → put them on the first node so they are still visible
    if(unscheduled.length && nodes.length){
      const fid = nodes[0].id;
      podsByNode[fid] = (podsByNode[fid]||[]).concat(unscheduled);
    }
    for(const s of nodes){
      const role = masters.has(s.id) ? "master" : "worker";
      const rcol = role==="master" ? "#f59e0b" : "#326ce5";
      const nx=(s.x||0), ny=(s.y||0), nw=s.width||130, nh=s.height||65;
      // role badge — top-right corner of the node (always on the node body)
      const rb = ce("g", { class:"k8s-role" }, og);
      const bw = role==="master"?58:52;
      ce("rect", { x:nx+nw-bw-4, y:ny+4, width:bw, height:13, rx:3, ry:3, fill:rcol, opacity:"0.95" }, rb);
      ce("text", { x:nx+nw-bw-4+bw/2, y:ny+13.5, "text-anchor":"middle", "font-size":7.5, "font-weight":"700", fill:"#fff",
        text:(role==="master"?"👑master":"⚙worker") }, rb);
      // pod chips — INSIDE the lower area of the node body (always visible on the server)
      const pods = podsByNode[s.id] || [];
      if(pods.length){
        const chipW=44, chipH=13, gap=4, pad=6;
        const cols = Math.max(1, Math.floor((nw-pad*2+gap)/(chipW+gap)));
        // header
        ce("text", { x:nx+pad, y:ny+nh-6-Math.ceil(pods.length/cols)*(chipH+gap), "font-size":7, fill:"var(--text-mute)",
          "font-weight":"700", text:`Pods (${pods.length})` }, og);
        pods.forEach((pod,pi)=>{
          const col=pi%cols, rrow=Math.floor(pi/cols);
          const cx = nx+pad + col*(chipW+gap);
          const cy = ny+nh - (Math.ceil(pods.length/cols)-rrow)*(chipH+gap) - 2;
          const running=(pod.status||"Running")==="Running";
          const pg=ce("g",{class:"k8s-pod","pointer-events":"all",style:"cursor:pointer"},og);
          ce("rect",{x:cx,y:cy,width:chipW,height:chipH,rx:6,ry:6,
            fill:running?"#326ce5":"#888",stroke:"#fff","stroke-width":0.7,
            "pointer-events":"all"},pg);
          ce("text",{x:cx+chipW/2,y:cy+9.5,"text-anchor":"middle","font-size":7,fill:"#fff","font-weight":"700",
            text:"⬡"+(pod.name.length>7?pod.name.slice(0,7):pod.name),"pointer-events":"none"},pg);
          // クリックで Pod 設定ダイアログを開く
          pg.addEventListener("click",(e)=>{ e.stopPropagation();
            if(typeof showPodEditor==="function") showPodEditor(cl.name, pod.name);
          });
          // ダブルクリックで Pod 移動メニュー
          pg.addEventListener("dblclick",(e)=>{ e.stopPropagation();
            if(typeof showPodMigrationMenu==="function") showPodMigrationMenu(cl.name, pod.name);
          });
          // 右クリックで Pod 操作メニュー (移動/停止/削除)
          pg.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation();
            if(typeof showPodContextMenu==="function") showPodContextMenu(e, cl.name, pod.name);
          });
        });
      }
    }
  });
}

// Draw a frame around each hypervisor (ESXi/vCenter) host enclosing its VMs, so the VMs are
// clearly shown INSIDE the host box.
function renderVcenterOverlay(){
  const layer = $("#layer-networks");
  if(!layer) return;
  const hosts = (App.config.servers||[]).filter(s=>s.hypervisor || s.type==="hypervisor");
  // ===== vCenter Cluster frames (複数ESXiホストを内包する大枠) =====
  const clusters = App.config.vcenter_clusters || [];
  for(const cl of clusters){
    const memberHosts = hosts.filter(h => (cl.hosts||[]).includes(h.id) || h.vcenter_cluster===cl.name);
    if(!memberHosts.length) continue;
    // bounding box: hosts + their VMs
    let cmnx=Infinity, cmny=Infinity, cmxx=-Infinity, cmxy=-Infinity;
    for(const host of memberHosts){
      const w=host.width||160, h=host.height||80;
      cmnx=Math.min(cmnx, host.x||0); cmny=Math.min(cmny, host.y||0);
      cmxx=Math.max(cmxx, (host.x||0)+w); cmxy=Math.max(cmxy, (host.y||0)+h);
      const vms = (App.config.servers||[]).filter(s=>s.vm && s.host===host.id);
      for(const vm of vms){ const vw=vm.width||74, vh=vm.height||42;
        cmnx=Math.min(cmnx, vm.x||0); cmny=Math.min(cmny, vm.y||0);
        cmxx=Math.max(cmxx, (vm.x||0)+vw); cmxy=Math.max(cmxy, (vm.y||0)+vh); }
    }
    cmnx-=32; cmny-=44; cmxx+=32; cmxy+=24;
    cl._pad = cl._pad || {w:0,h:0};
    cmxx += (cl._pad.w||0); cmxy += (cl._pad.h||0);
    const cg = ce("g", { class:"vcenter-cluster-overlay" }, layer);
    // outer cluster frame (太線・濃緑)
    const clFrame = ce("rect", { x:cmnx, y:cmny, width:cmxx-cmnx, height:cmxy-cmny, rx:14, ry:14,
      fill:"rgba(34,139,34,0.04)", stroke:"#228b22", "stroke-width":2.5, "stroke-dasharray":"12 5",
      "pointer-events":"all", style:"cursor:pointer" }, cg);
    clFrame.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"vcenter-cluster",id:cl.name}; });
    clFrame.addEventListener("dblclick",(e)=>{ e.stopPropagation(); if(memberHosts[0]) showHypervisorManager(memberHosts[0].id); });
    clFrame.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation();
      if(typeof _showSimpleContextMenu==="function") _showSimpleContextMenu(e, [
        { icon:"🏢", label:"クラスタ設定を開く", action:()=>{ if(memberHosts[0]) showHypervisorManager(memberHosts[0].id); }},
        { icon:"➕", label:"ESXiホストを追加 (新規作成)", action:()=>{
          pushUndo();
          const newId = uid("esxi");
          const baseN = (App.config.servers||[]).filter(s=>s.hypervisor||s.type==="hypervisor").length;
          App.config.servers.push({
            id:newId, label:"esxi-"+(baseN+1), type:"hypervisor", os:"VMware ESXi", status:"running",
            cpu:32, memory:131072,
            x: cmxx + 20, y: cmny + 60,
            width:200, height:120,
            vcenter_cluster: cl.name,
            interfaces:[{ id:"vmnic0", ip:"10.0.100."+(10+baseN)+"/24", mac:genUniqueMac(), status:"up" }],
            hypervisor:{ type:"esxi", vms:[], vswitches:[{name:"vSwitch0",portgroups:["VM Network","Management"]}], datastores:[{name:"shared-ds",capacity_gb:2000,backing:""}] }
          });
          cl.hosts = cl.hosts || [];
          cl.hosts.push(newId);
          renderAndSync(); toast("ESXi "+newId+" をクラスタ "+cl.name+" に追加","ok");
        }},
        { sep:true },
        { icon:"🗑", label:"クラスタを削除 (ホストは残る)", action:()=>{
          if((typeof confirm==="function")?confirm("クラスタ "+cl.name+" を削除します。ホストは残ります。"):true){
            for(const h of memberHosts){ h.vcenter_cluster=""; }
            App.config.vcenter_clusters = (App.config.vcenter_clusters||[]).filter(c=>c.name!==cl.name);
            renderAndSync(); toast("クラスタ "+cl.name+" を削除","ok");
          }
        }}
      ]);
    });
    // ラベル(設定の概要表示)
    const drsTxt = cl.drs ? "DRS✓" : "DRS✕";
    const haTxt = cl.ha ? "HA✓" : "HA✕";
    const evcTxt = (cl.evc && cl.evc !== "disabled") ? ("EVC:"+cl.evc) : "";
    const totalVMs = memberHosts.reduce((a,h)=>a+(App.config.servers||[]).filter(s=>s.vm&&s.host===h.id).length, 0);
    const clbl = `🏢 vCenter Cluster: ${cl.name} — ${memberHosts.length}台 / ${totalVMs}VM — ${drsTxt} ${haTxt}${evcTxt?" "+evcTxt:""}`;
    const cbw = clbl.length*6.5+18;
    const clblRect = ce("rect", { x:cmnx+10, y:cmny-11, width:cbw, height:22, rx:11, ry:11,
      fill:"#228b22", stroke:"#fff", "stroke-width":1.4, "pointer-events":"all", style:"cursor:move" }, cg);
    ce("text", { x:cmnx+10+cbw/2, y:cmny, "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":10, "font-weight":"700", fill:"#fff", text:clbl, "pointer-events":"none" }, cg);
    // ラベルをドラッグでクラスタ全体(ホスト+VM)を移動
    const allMem = [];
    for(const host of memberHosts){
      allMem.push({kind:"server", id:host.id});
      const vms = (App.config.servers||[]).filter(s=>s.vm && s.host===host.id);
      for(const vm of vms) allMem.push({kind:"server", id:vm.id});
    }
    clblRect.addEventListener("mousedown",(e)=>startGroupDrag(e, allMem));
    clblRect.addEventListener("dblclick",(e)=>{ e.stopPropagation(); if(memberHosts[0]) showHypervisorManager(memberHosts[0].id); });
    // リサイズハンドル
    const crh = ce("rect", { x:cmxx-7, y:cmxy-7, width:12, height:12, rx:2, ry:2,
      fill:"#228b22", stroke:"#fff", "stroke-width":1, "pointer-events":"all", style:"cursor:nwse-resize" }, cg);
    crh.addEventListener("mousedown",(e)=>startFrameResize(e, cl, {x:cmnx,y:cmny,w:cmxx-cmnx,h:cmxy-cmny}));
  }
  // ===== 個別ESXiホストの枠 (旧来通り、クラスタ枠の中に表示) =====
  for(const host of hosts){
    const vms = (App.config.servers||[]).filter(s=>s.vm && s.host===host.id);
    const g = ce("g", { class:"vcenter-overlay" }, layer);
    let minX=host.x||0, minY=host.y||0, maxX=(host.x||0)+(host.width||160), maxY=(host.y||0)+(host.height||80);
    for(const vm of vms){ const w=vm.width||74,h=vm.height||42; minX=Math.min(minX,vm.x||0); minY=Math.min(minY,vm.y||0); maxX=Math.max(maxX,(vm.x||0)+w); maxY=Math.max(maxY,(vm.y||0)+h); }
    minX-=14; minY-=26; maxX+=14; maxY+=14;
    if(host._pad){ maxX += (host._pad.w||0); maxY += (host._pad.h||0); }
    const frame = ce("rect", { x:minX, y:minY, width:maxX-minX, height:maxY-minY, rx:12, ry:12,
      fill:"rgba(120,180,90,0.05)", stroke:"#78b45a", "stroke-width":1.6, "stroke-dasharray":"8 4",
      "pointer-events":"all", style:"cursor:pointer" }, g);
    frame.addEventListener("click",(e)=>{ e.stopPropagation(); App.multiSelect=[]; App.selected={kind:"server",id:host.id}; openPropertyPanel(); });
    frame.addEventListener("dblclick",(e)=>{ e.stopPropagation(); showHypervisorManager(host.id); });
    frame.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation(); showContextMenu(e,"server",host.id); });
    const lbl = `🖥 ${host.label||host.id} — VM ${vms.length}${host.vcenter_cluster?(" ⟨"+host.vcenter_cluster+"⟩"):""}`;
    const bw = lbl.length*7+18;
    const labelRect = ce("rect", { x:minX+8, y:minY-9, width:bw, height:18, rx:9, ry:9,
      fill:"#78b45a", stroke:"#fff", "stroke-width":1, "pointer-events":"all", style:"cursor:pointer" }, g);
    labelRect.addEventListener("click",(e)=>{ e.stopPropagation(); App.selected={kind:"server",id:host.id}; openPropertyPanel(); });
    labelRect.addEventListener("dblclick",(e)=>{ e.stopPropagation(); showHypervisorManager(host.id); });
    ce("text", { x:minX+8+bw/2, y:minY+0.5, "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":10, "font-weight":"700", fill:"#fff", text:lbl, "pointer-events":"none" }, g);
    const rh = ce("rect", { x:maxX-7, y:maxY-7, width:12, height:12, rx:2, ry:2,
      fill:"#78b45a", stroke:"#fff", "stroke-width":1, "pointer-events":"all", style:"cursor:nwse-resize" }, g);
    rh.addEventListener("mousedown",(e)=>startFrameResize(e, host, {x:minX,y:minY,w:maxX-minX,h:maxY-minY}));
    if(!vms.length){
      ce("text", { x:(minX+maxX)/2, y:maxY-12, "text-anchor":"middle", "font-size":9, fill:"var(--text-mute)",
        text:"(VM未作成 — ダブルクリックで仮想基盤を開く)", "pointer-events":"none" }, g);
    } else {
      ce("text", { x:minX+10, y:maxY-6, "font-size":8, fill:"var(--text-mute)",
        text:"💡 VMを右クリック → 🚚vMotion で別ホストへ移動", "pointer-events":"none" }, g);
    }
  }
}

function renderVpcOverlay(){
  const layer = $("#layer-connections");
  const drawn = new Set();

  // Helper: point on a rectangle's edge facing a target point
  function edgePoint(obj, w, h, tx, ty){
    const cx=(obj.x||0)+w/2, cy=(obj.y||0)+h/2;
    const dx=tx-cx, dy=ty-cy;
    if(dx===0&&dy===0) return {x:cx,y:cy};
    const sx = dx!==0 ? (w/2)/Math.abs(dx) : Infinity;
    const sy = dy!==0 ? (h/2)/Math.abs(dy) : Infinity;
    const s = Math.min(sx,sy);
    return { x:cx+dx*s, y:cy+dy*s };
  }

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

    // (a) Translucent domain background enclosing both peers
    const minX = Math.min(d.x||0, peer.x||0) - 18;
    const maxXbase = Math.max((d.x||0)+dw, (peer.x||0)+pw) + 18;
    const minY = Math.min(d.y||0, peer.y||0) - 30;
    const maxYbase = Math.max((d.y||0)+dh, (peer.y||0)+ph) + 16;
    d.vpc._pad = d.vpc._pad || null;
    const maxX = maxXbase + ((d.vpc._pad&&d.vpc._pad.w)||0);
    const maxY = maxYbase + ((d.vpc._pad&&d.vpc._pad.h)||0);
    const vpcRegion = ce("rect", {
      "class":"vpc-domain-region",
      x:minX, y:minY, width:maxX-minX, height:maxY-minY, rx:16, ry:16,
      fill:"rgba(163,113,247,0.07)", stroke:"var(--purple)", "stroke-width":1.6,
      "stroke-dasharray":"7 5", "pointer-events":"all", style:"cursor:move"
    }, g);
    vpcRegion.addEventListener("mousedown",(e)=>startGroupDrag(e, [{kind:"device",id:d.id},{kind:"device",id:peerId}]));
    const vrh = ce("rect", { x:maxX-7, y:maxY-7, width:12, height:12, rx:2, ry:2,
      fill:"var(--purple)", stroke:"#fff", "stroke-width":1, "pointer-events":"all", style:"cursor:nwse-resize" }, g);
    vrh.addEventListener("mousedown",(e)=>startFrameResize(e, d.vpc, {x:minX,y:minY,w:maxX-minX,h:maxY-minY}));

    // (b) Domain badge at top-LEFT corner (does not overlap the peer-link in the middle)
    const badgeText = `⛓ vPC Domain ${d.vpc.domain||1} — 論理1台`;
    const bWidth = badgeText.length * 6.0 + 18;
    const vpcLabelRect = ce("rect", { x:minX+8, y:minY-9, width:bWidth, height:18, rx:9, ry:9,
      fill:"var(--purple)", stroke:"#fff", "stroke-width":1.5, "pointer-events":"all", style:"cursor:move" }, g);
    vpcLabelRect.addEventListener("mousedown",(e)=>startGroupDrag(e, [{kind:"device",id:d.id},{kind:"device",id:peerId}]));
    ce("text", { x:minX+8+bWidth/2, y:minY+1, text: badgeText,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":10, "font-family":"var(--mono)", "font-weight":"700",
      fill:"#fff", "pointer-events":"none" }, g);

    // (c) PEER-LINK — bold double line between the facing EDGES of the two switches
    const e1 = edgePoint(d, dw, dh, cx2, cy2);
    const e2 = edgePoint(peer, pw, ph, cx1, cy1);
    const dx = e2.x - e1.x, dy = e2.y - e1.y, len = Math.hypot(dx,dy)||1;
    const nx = -dy/len, ny = dx/len;
    function plLine(off, cls){
      ce("line", { "class":cls,
        x1:e1.x+nx*off, y1:e1.y+ny*off, x2:e2.x+nx*off, y2:e2.y+ny*off }, g);
    }
    plLine(-3.5, "vpc-peer-link"); plLine(3.5, "vpc-peer-link");
    const mx=(e1.x+e2.x)/2, my=(e1.y+e2.y)/2;
    const plLbl = "Peer-Link";
    const plW = plLbl.length*6+14;
    ce("rect", { x:mx-plW/2, y:my-9, width:plW, height:15, rx:7, ry:7,
      fill:"var(--panel)", stroke:"var(--purple)", "stroke-width":1.5, "pointer-events":"none" }, g);
    ce("text", { x:mx, y:my-1, text:plLbl, "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":9.5, "font-family":"var(--mono)", "font-weight":"700",
      fill:"var(--purple)", "pointer-events":"none" }, g);

    // (d) KEEPALIVE — thin dotted line, clearly offset and labeled (separate mgmt heartbeat)
    const kaOff = 15;
    ce("line", { "class":"vpc-keepalive",
      x1:e1.x+nx*kaOff, y1:e1.y+ny*kaOff, x2:e2.x+nx*kaOff, y2:e2.y+ny*kaOff }, g);
    const kaX=mx+nx*kaOff, kaY=my+ny*kaOff;
    const kaLbl="❤ Keepalive";
    const kaW=kaLbl.length*5.2+10;
    ce("rect", { x:kaX-kaW/2, y:kaY-6, width:kaW, height:11, rx:5, ry:5,
      fill:"var(--panel)", stroke:"var(--purple)", "stroke-width":0.8, "pointer-events":"none" }, g);
    ce("text", { x:kaX, y:kaY-0.5, text:kaLbl, "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":7.5, "font-family":"var(--mono)", fill:"var(--purple)", "pointer-events":"none" }, g);

    // (e) "vPC peer" tag on each switch top-right
    function placeTag(dev, w){
      const bx=(dev.x||0)+w-30, by=(dev.y||0)-9;
      ce("rect", { x:bx, y:by, width:30, height:11, rx:5, ry:5,
        fill:"var(--purple)", stroke:"#fff", "stroke-width":1, "pointer-events":"none" }, g);
      ce("text", { x:bx+15, y:by+5.5, "text-anchor":"middle", "dominant-baseline":"middle",
        "font-size":7, "font-family":"var(--mono)", "font-weight":"700",
        fill:"#fff", text:"vPC peer", "pointer-events":"none" }, g);
    }
    placeTag(d, dw); placeTag(peer, pw);

    g.addEventListener("mouseenter", (e)=>showTooltip(e,
      `vPC Domain ${d.vpc.domain||1}\n${d.id} と ${peer.id} は論理的に1台のスイッチとして動作\nPeer-Link: 制御・データ同期\nKeepalive: ${d.vpc.keepalive||"-"} ↔ ${peer.vpc?peer.vpc.keepalive:"-"} (障害検知用ハートビート)`));
    g.addEventListener("mouseleave", hideTooltip);
    g.addEventListener("mousemove", moveTooltip);
  }

  // === Pass 2: vPC member port-channels (switch-side bracket, NOT a floating line) ===
  // vPC is configured on the SWITCH side: the two peer switch ports present ONE
  // logical port-channel to a dual-homed host. We draw a brace tying those two
  // switch ports together with a "vPC <id>" badge — the clearest representation.
  const byVpcId = {};
  for(const c of (App.config.connections||[])){
    if(!c.vpc_id) continue;
    (byVpcId[c.vpc_id] = byVpcId[c.vpc_id] || []).push(c);
  }
  for(const vpcId in byVpcId){
    const grp = byVpcId[vpcId];
    if(grp.length < 2) continue;
    function hostId(c, side){ const ep=c[side]; return ep ? (ep.server||ep.device) : null; }
    const fromIds = new Set(grp.map(c=>hostId(c,"from")));
    const toIds = new Set(grp.map(c=>hostId(c,"to")));
    let hostSide, switchSide;
    if(fromIds.size===1){ hostSide="from"; switchSide="to"; }
    else if(toIds.size===1){ hostSide="to"; switchSide="from"; }
    else continue;
    const hostKey = hostSide==="from" ? [...fromIds][0] : [...toIds][0];

    // Collect the two switch-side endpoints (the vPC member ports)
    const swPts = [];
    let hostPt = null;
    for(const c of grp){
      const a = resolveEndpoint(c.from), b = resolveEndpoint(c.to);
      if(!a||!b) continue;
      swPts.push(switchSide==="from" ? a : b);
      hostPt = hostSide==="from" ? a : b;
    }
    if(swPts.length < 2 || !hostPt) continue;

    const g = ce("g", { class:"vpc-member-bracket","data-vpc-id":vpcId }, layer);
    // Brace connecting the two switch ports, bowed toward the host
    const s1=swPts[0], s2=swPts[1];
    const midX=(s1.x+s2.x)/2, midY=(s1.y+s2.y)/2;
    // control point bowed toward the host
    const towardHostX = midX + (hostPt.x-midX)*0.18;
    const towardHostY = midY + (hostPt.y-midY)*0.18;
    ce("path", {
      d:`M ${s1.x} ${s1.y} Q ${towardHostX} ${towardHostY} ${s2.x} ${s2.y}`,
      stroke:"var(--purple)", "stroke-width":2.5, opacity:0.65, fill:"none",
      "stroke-linecap":"round", "stroke-dasharray":"1 0", "pointer-events":"none"
    }, g);
    // Badge "vPC <id> → host" at the bow apex
    const apX = midX + (hostPt.x-midX)*0.30;
    const apY = midY + (hostPt.y-midY)*0.30;
    const memLbl = `vPC ${vpcId} → ${hostKey}`;
    const memW = memLbl.length*5.6+12;
    ce("rect", { x:apX-memW/2, y:apY-8, width:memW, height:15, rx:7, ry:7,
      fill:"var(--purple)", stroke:"#fff", "stroke-width":1, "pointer-events":"none" }, g);
    ce("text", { x:apX, y:apY-0.5, text:memLbl,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":8.5, "font-family":"var(--mono)", "font-weight":"700",
      fill:"#fff", "pointer-events":"none" }, g);
    // small dots on the two member ports
    for(const sp of [s1,s2]) ce("circle", { cx:sp.x, cy:sp.y, r:3.5,
      fill:"var(--purple)", stroke:"#fff", "stroke-width":1, "pointer-events":"none" }, g);

    g.addEventListener("mouseenter", (e)=>showTooltip(e,
      `vPC ${vpcId}: ${hostKey} は2台のピアスイッチへ二重接続\n物理2本が1つの論理ポートチャネルとして動作\n(片方のスイッチ障害でも通信継続)`));
    g.addEventListener("mouseleave", hideTooltip);
    g.addEventListener("mousemove", moveTooltip);
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
    case "cloud":
    case "saas":
    case "internet": {
      const col = type==="saas" ? "var(--purple)" : (type==="internet" ? "var(--cyan)" : "var(--orange)");
      // cloud shape
      ce("path", { d:`M ${cx-13} ${cy+5} Q ${cx-17} ${cy-2} ${cx-9} ${cy-3} Q ${cx-8} ${cy-10} ${cx} ${cy-8} Q ${cx+7} ${cy-12} ${cx+10} ${cy-4} Q ${cx+17} ${cy-3} ${cx+13} ${cy+5} Z`,
        fill:"rgba(255,255,255,0.06)", stroke:col, "stroke-width":1.5 }, g);
      const glyph = type==="saas" ? "SaaS" : (type==="internet" ? "🌐" : "☁");
      ce("text", { x:cx, y:cy+2, text:glyph, "text-anchor":"middle","dominant-baseline":"middle",
        "font-size": type==="saas"?"7":"10","fill":col,"font-weight":"700","font-family":"monospace" }, g);
      break;
    }
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
  // IP address conflict badge
  if(App._ipConflictSet && App._ipConflictSet.has("device:"+d.id)){
    const cb = ce("g", { class:"ipconflict-badge" }, g);
    ce("rect", { x:w/2-30, y:h+2, width:60, height:13, rx:3, ry:3, fill:"var(--red)" }, cb);
    ce("text", { x:w/2, y:h+11, "text-anchor":"middle", "font-size":"7.5", fill:"#fff", "font-weight":"700", text:"⚠ IP重複" }, cb);
  }
  if((d.type==="l2switch" || d.type==="l3switch") && typeof computeStpForSwitch==="function"){
    try{
      const sd = computeStpForSwitch(d);
      const v1 = (sd.vlans||[]).find(v=>v.vlan===1) || (sd.vlans||[])[0];
      if(v1 && v1.isRoot){
        const cg = ce("g", { class:"root-crown", "pointer-events":"none" }, g);
        ce("text", { x:10, y:-4, "font-size":"13", text:"👑" }, cg);
        ce("text", { x:24, y:-4, "font-size":"7.5", fill:"#f59e0b", "font-weight":"700", text:"ROOT BRIDGE" }, cg);
      }
    }catch(e){}
  }
  // MAC flapping warning badge (severity-scaled)
  if(typeof macFlapSeverity === "function"){
    const sev = macFlapSeverity(d.id);
    if(sev > 0){
      const fb = ce("g", { class:"macflap-badge" }, g);
      const col = sev<50 ? "var(--orange)" : "var(--red)";
      ce("rect", { x:w/2-34, y:-16, width:68, height:13, rx:3, ry:3, fill:col, opacity: (0.5+0.5*Math.min(1,sev/100)) }, fb);
      ce("text", { x:w/2, y:-6, "text-anchor":"middle", "font-size":"7.5", fill:"#fff", "font-weight":"700",
        text:"⚠ MAC FLAP "+Math.round(sev)+"%" }, fb);
      // pulsing ring intensifies with severity
      const ring = ce("rect", { x:1.5, y:1.5, width:w-3, height:h-3, rx:6, ry:6, fill:"none",
        stroke:col, "stroke-width": (1+sev/40).toFixed(1), opacity:"0.8" }, g);
      if(App.animationsEnabled !== false){
        const an = ce("animate", { attributeName:"opacity", values:"0.8;0.15;0.8",
          dur:(Math.max(0.4, 1.6 - sev/80))+"s", repeatCount:"indefinite" }, ring);
      }
    }
  }
  renderBondOverlay(g, d, "device");
  renderPorts(g, d, "device");
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
  // Containers render as mini-badges; VMs are full standalone server nodes (see below).
  const ctrs = Array.isArray(s.containers) ? s.containers : [];
  const guests = ctrs.length;
  const baseW = s.width||130, baseH = s.height||65;
  const w = Math.max(baseW, guests>0 ? 150 : baseW);
  const perRow = Math.max(1, Math.floor((w-12)/46));
  const guestRows = guests>0 ? Math.ceil(guests/perRow) : 0;
  const guestZoneH = guestRows>0 ? (guestRows*16 + 14) : 0;
  const svcCount = (App.config.services||[]).filter(sv=>sv.server===s.id).length;
  const h = baseH + guestZoneH;

  const g = ce("g", {
    "class":"element server status-"+(s.status||"running"),
    "data-kind":"server","data-id":s.id,
    "transform":`translate(${s.x||0},${s.y||0})`
  }, $("#layer-elements"));
  ce("rect", { "class":"body server-body", x:0, y:0, width:w, height:h, rx:6, ry:6 }, g);
  drawServerIcon(g, s.type, 9, 9);
  ce("text", { "class":"element-label", x:w/2, y:16, text:s.label||s.id, "font-size":"11" }, g);
  ce("text", { "class":"element-sublabel", x:w/2, y:28,
    text:(s.hypervisor?("⬡ "+(s.hypervisor.type||"esxi")):(s.host?("🖥 VM @"+s.host):(s.os||""))) }, g);

  // Services (kept near the divider above the guest zone)
  const services = (App.config.services||[]).filter(sv=>sv.server===s.id);
  const svcStartY = baseH - 16;
  const colCount = Math.max(1, Math.floor((w-12)/22));
  for(let i=0; i<services.length; i++){
    const sv = services[i];
    const col = i % colCount, row = Math.floor(i / colCount);
    renderServiceMini(g, sv, 6 + col*22, svcStartY - row*14, 20, 12);
  }

  // Guest zone: containers (🐳) only — VMs are standalone server nodes now
  if(guests>0){
    const zoneTop = baseH;
    ce("line", { x1:4, y1:zoneTop-2, x2:w-4, y2:zoneTop-2, stroke:"var(--border)", "stroke-width":0.7, "stroke-dasharray":"2 2" }, g);
    ce("text", { x:6, y:zoneTop+8, text:"CT×"+ctrs.length, "font-size":"7.5", fill:"var(--text-dim)" }, g);
    let idx=0;
    for(const c of ctrs){
      const on=(c.status||"running")==="running";
      const col = idx % perRow, row = Math.floor(idx / perRow);
      const gx = 6 + col*46, gy = zoneTop + 12 + row*16;
      const gg = ce("g", { "class":"guest-mini", transform:`translate(${gx},${gy})` }, g);
      ce("rect", { x:0, y:0, width:43, height:13, rx:2.5, ry:2.5,
        fill: on?"rgba(63,185,80,0.15)":"rgba(120,120,120,0.12)",
        stroke: on?"var(--green)":"var(--grey)", "stroke-width":0.7 }, gg);
      ce("circle", { cx:5, cy:6.5, r:2.2, fill: on?"var(--green)":"var(--grey)" }, gg);
      ce("text", { x:10, y:9, text:"🐳", "font-size":"7" }, gg);
      ce("text", { x:19, y:9, text:(c.name||c.id||"").slice(0,7), "font-size":"7", fill:"var(--text)", "font-family":"var(--mono)" }, gg);
      gg.addEventListener("click",(e)=>{ e.stopPropagation(); showContainerManager(s.id); });
      idx++;
    }
  }

  renderStatusLed(g, w-9, 9, s.status);
  // MAC-flapping / broadcast-storm impact on this server (if its access switch is affected)
  if(typeof l2StormSeverityForHost === "function"){
    let sev = 0;
    try{ sev = l2StormSeverityForHost("server", s.id); }catch(e){}
    if(sev > 0){
      const col = sev<40?"#f59e0b":sev<70?"#ef4444":"#b91c1c";
      const fb = ce("g", { class:"flap-impact" }, g);
      ce("rect", { x:w/2-44, y:-15, width:88, height:13, rx:3, ry:3, fill:col }, fb);
      ce("text", { x:w/2, y:-6, "text-anchor":"middle", "font-size":"7", fill:"#fff", "font-weight":"700",
        text:`⚠ 通信不安定 ${Math.round(sev)}%` }, fb);
      // pulsing ring to draw attention
      const ring = ce("rect", { x:-3, y:-3, width:w+6, height:h+6, rx:8, ry:8, fill:"none", stroke:col, "stroke-width":2, opacity:"0.8" }, g);
      if(App.animationsEnabled !== false) ce("animate", { attributeName:"opacity", values:"0.8;0.2;0.8", dur:"1.1s", repeatCount:"indefinite" }, ring);
    }
  }
  if(App._ipConflictSet && App._ipConflictSet.has("server:"+s.id)){
    const cb = ce("g", { class:"ipconflict-badge" }, g);
    ce("rect", { x:w/2-30, y:-15, width:60, height:13, rx:3, ry:3, fill:"var(--red)" }, cb);
    ce("text", { x:w/2, y:-6, "text-anchor":"middle", "font-size":"7.5", fill:"#fff", "font-weight":"700", text:"⚠ IP重複" }, cb);
  }
  renderBondOverlay(g, s, "server");
  renderPorts(g, s, "server");

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
  // If an endpoint emanates from a bond box, clip its anchor to the box border facing the peer
  function clipToBox(endpoint, other){
    if(!endpoint.bondBox) return endpoint;
    const r = endpoint.bondBox;
    const cx = r.absCx, cy = r.absCy, hw = r.w/2, hh = r.h/2;
    const dx = other.x - cx, dy = other.y - cy;
    if(dx === 0 && dy === 0) return endpoint;
    const sx = dx!==0 ? hw/Math.abs(dx) : Infinity;
    const sy = dy!==0 ? hh/Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return Object.assign({}, endpoint, { x: cx + dx*s, y: cy + dy*s });
  }
  const a2 = clipToBox(a, b), b2 = clipToBox(b, a);
  a = a2; b = b2;
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

// Pick the ONE connection that represents the logical bond link for this element.
// Always resolves to a real, existing cable (so the logical link never disappears):
//   1) the active member's cable, else 2) any up member's cable,
//   3) the primary's cable, 4) any member cable.
function bondRepresentativeCable(obj){
  if(!obj || !obj.bonding || !obj.bonding.enabled) return null;
  const members = obj.bonding.members || [];
  const memberCable = {};
  for(const c of (App.config.connections||[])){
    for(const ep of [c.from, c.to]){
      if(ep && (ep.device===obj.id||ep.server===obj.id) && members.includes(ep.interface)){
        if(!memberCable[ep.interface]) memberCable[ep.interface] = c.id;
      }
    }
  }
  const active = (typeof bondActiveMember==="function") ? bondActiveMember(obj) : null;
  if(active && memberCable[active]) return memberCable[active];
  for(const mid of members){
    const m = (obj.interfaces||[]).find(i=>i.id===mid);
    if(m && (m.status||"up")==="up" && memberCable[mid]) return memberCable[mid];
  }
  const primary = obj.bonding.primary || members[0];
  if(memberCable[primary]) return memberCable[primary];
  for(const mid of members) if(memberCable[mid]) return memberCable[mid];
  return null;
}

// === Unified bond member cable state (single logical link) ===
// Exactly ONE cable per bond (the representative) is drawn as the logical link.
// It is always a real existing cable, so the line never vanishes on member failure.
function bondCableState(c){
  for(const ep of [c.from, c.to]){
    if(!ep) continue;
    const obj = ep.device ? Cfg.byId("devices", ep.device) : (ep.server ? Cfg.byId("servers", ep.server) : null);
    if(!obj || !obj.bonding || !obj.bonding.enabled) continue;
    const members = obj.bonding.members || [];
    if(!members.includes(ep.interface)) continue;
    const eff = (typeof bondEffectiveStatus === "function") ? bondEffectiveStatus(obj) : "up";
    const active = (typeof bondActiveMember === "function") ? bondActiveMember(obj) : null;
    const primary = obj.bonding.primary || members[0];
    const memberIf = (obj.interfaces||[]).find(i=>i.id===ep.interface);
    const memberUp = memberIf && (memberIf.status||"up") === "up";
    // Whole bond down → this physical link is down too
    if(eff === "down") return { role:"down", isDown:true, traffic:"idle", hidden:false };
    // The ACTIVE member carries the live logical link → solid + animated
    if(ep.interface === active){
      let lvl = (typeof bondConfiguredTraffic === "function") ? bondConfiguredTraffic(obj) : "medium";
      if(!lvl || lvl === "idle") lvl = "medium";
      const isFailover = (active !== primary);
      return { role: isFailover ? "failover" : "active", isDown:false, traffic: lvl, hidden:false };
    }
    // Non-active member: DRAW the physical link (so redundancy is visible / topology not broken),
    // but de-emphasized. Distinguish a healthy standby from a failed member's link.
    if(!memberUp) return { role:"standby-down", isDown:false, traffic:"idle", hidden:false };
    return { role:"standby", isDown:false, traffic:"idle", hidden:false };
  }
  return null;
}

function renderConnection(c){
  if(!c.from || !c.to) return;
  const a = resolveEndpoint(c.from);
  const b = resolveEndpoint(c.to);
  if(!a||!b) return;
  const status = effectiveConnStatus(c);
  let isDown = status === "down" || status === "err-disabled" || status === "device-down" || status === "device-error";
  let traffic = c.traffic || "idle";
  const direction = c.direction || "forward";
  const type = c.type || "ethernet";

  // === Bond member cable state ===
  // All physical member links are drawn (so bonding redundancy is visible and the topology
  // stays logically complete). The ACTIVE link is solid+animated; standby links are faint.
  let failoverActive = false;
  let bondStandby = false;
  const bondState = bondCableState(c);
  if(bondState){
    isDown = bondState.isDown;
    traffic = bondState.traffic;
    failoverActive = bondState.role === "failover";
    bondStandby = (bondState.role === "standby" || bondState.role === "standby-down");
  }

  const built = buildConnectionPath(a, b, c);
  // Record straight segments (skip curved/bend connections) for crossover-hop rendering
  if(!isDown && (!c.bend || c.bend===0)){
    const pts = built.points || [];
    for(let i=0;i<pts.length-1;i++){
      gConnSegments.push({ id:c.id, x1:pts[i].x, y1:pts[i].y, x2:pts[i+1].x, y2:pts[i+1].y });
    }
  }
  const downCls = isDown ? " down" : "";
  const flapCls = status === "flapping" ? " flapping" : "";
  const failCls = failoverActive ? " bond-failover" : "";
  const standbyCls = bondStandby ? " bond-standby" : "";
  const cls = "conn "+type+downCls+flapCls+failCls+standbyCls+" lvl-"+(isDown?"idle":traffic);

  const g = ce("g", { "class":"conn-group","data-kind":"connection","data-id":c.id }, $("#layer-connections"));

  // Hit area (transparent fat line for easier clicking)
  ce("path", { "class":"conn-hit", d: built.pathD, stroke:"transparent", "stroke-width":"14", fill:"none" }, g);

  // Base line - with an id so animateMotion can reference it
  const pathId = "conn-path-" + c.id.replace(/[^a-zA-Z0-9_-]/g,"_");
  const line = ce("path", { id: pathId, "class": cls, d: built.pathD, fill:"none" }, g);
  // MAC-flapping degradation: links touching a flapping switch turn an escalating red and flicker
  if(typeof macFlapSeverity === "function" && !isDown){
    const fa = (c.from.device && macFlapSeverity(c.from.device)) || 0;
    const fb = (c.to.device && macFlapSeverity(c.to.device)) || 0;
    const sev = Math.max(fa, fb);
    if(sev > 0){
      const col = sev<40 ? "#f59e0b" : sev<70 ? "#ef4444" : "#b91c1c";
      line.setAttribute("stroke", col);
      line.setAttribute("stroke-width", (2 + sev/30).toFixed(1));
      if(App.animationsEnabled !== false){
        ce("animate", { attributeName:"opacity", values:"1;0.25;1",
          dur:(Math.max(0.35, 1.4 - sev/90))+"s", repeatCount:"indefinite" }, line);
      }
    }
  }
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
  const isFlapping = status === "flapping";
  if(isFlapping){
    lbl = (lbl ? lbl+" · " : "") + "⚡ FLAPPING";
  }
  if(failoverActive){
    lbl = (lbl ? lbl+" · " : "") + "⇄ FAILOVER (通信中)";
  }
  if(lbl){
    const lblW = Math.max(28, lbl.length * 6.5 + 10);
    let lblFill = "var(--bg)";
    let lblStroke = "var(--border)";
    if(isDown){ lblFill = "rgba(248,81,73,0.15)"; lblStroke = "var(--red)"; }
    else if(isFlapping){ lblFill = "rgba(245,158,11,0.18)"; lblStroke = "var(--orange)"; }
    else if(failoverActive){ lblFill = "rgba(63,185,80,0.18)"; lblStroke = "var(--green)"; }
    ce("rect", { x:midX-lblW/2, y:midY-8, width:lblW, height:14, rx:4, ry:4,
      fill:lblFill, stroke:lblStroke,"stroke-width": isFlapping ? 1.5 : 0.5,
      "class": isFlapping ? "flap-label-bg" : "", "pointer-events":"none" }, g);
    const txt = ce("text", { "class":"conn-label"+(isFlapping?" flap-label":""),
      x:midX, y:midY+0.5, "dominant-baseline":"middle", text:lbl }, g);
    if(isDown) txt.setAttribute("style","fill:var(--red);font-weight:700");
    else if(isFlapping) txt.setAttribute("style","fill:var(--orange);font-weight:800");
    else if(failoverActive) txt.setAttribute("style","fill:var(--green);font-weight:800");
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

// The bond's intended (logical) traffic level — the single flow carried by the active member.
// Returns the highest traffic level configured among the bond's member links.
function bondConfiguredTraffic(obj){
  if(!obj || !obj.bonding || !obj.bonding.enabled) return null;
  const members = new Set(obj.bonding.members||[]);
  const rank = { idle:0, low:1, medium:2, high:3 };
  let best = "idle", bestRank = 0;
  for(const c of (App.config.connections||[])){
    let myEp = null;
    if(c.from && (c.from.device===obj.id||c.from.server===obj.id) && members.has(c.from.interface)) myEp = c.from;
    else if(c.to && (c.to.device===obj.id||c.to.server===obj.id) && members.has(c.to.interface)) myEp = c.to;
    if(!myEp) continue;
    const lvl = c.traffic || "idle";
    if((rank[lvl]||0) > bestRank){ best = lvl; bestRank = rank[lvl]||0; }
  }
  return best;
}

function resolveEndpoint(ep){
  if(!ep) return null;
  let obj=null, kind=null;
  if(ep.device){ obj = Cfg.byId("devices", ep.device); kind="device"; }
  else if(ep.server){ obj = Cfg.byId("servers", ep.server); kind="server"; }
  if(!obj) return null;
  const w = obj.width || (kind==="server"?130:120);
  const h = obj.height || (kind==="server"?65:70);
  // If interface specified, return port outer position (cables attach to the real physical port)
  if(ep.interface){
    // BOND: if this iface is a bonded member, the cable emanates from the bond0 BOX, not the port.
    if(obj.bonding && obj.bonding.enabled && (obj.bonding.members||[]).includes(ep.interface)){
      const r = bondBoxRect(obj, kind);
      if(r){
        return { x: r.absCx, y: r.absCy, kind, obj, bondBox:r };
      }
    }
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
// Drag-to-connect state (rubber-band wiring from one interface port to another)
var wireDrag = null;
// Create a connection between two specific interfaces (used by drag-to-connect)
function createConnectionBetween(fromKind, fromId, fromIface, toKind, toId, toIface){
  if((fromKind!=="device"&&fromKind!=="server")||(toKind!=="device"&&toKind!=="server")){
    toast("接続はデバイス/サーバ間で作成できます","warn"); return;
  }
  if(fromKind===toKind && fromId===toId && fromIface===toIface){
    toast("同じインターフェース同士は接続できません","warn"); return;
  }
  // prevent duplicate link on the same iface pair
  const dup = (App.config.connections||[]).some(c=>{
    const a=c.from||{}, b=c.to||{};
    const aMatch=(a.device===fromId||a.server===fromId)&&a.interface===fromIface;
    const bMatch=(b.device===toId||b.server===toId)&&b.interface===toIface;
    const aMatch2=(a.device===toId||a.server===toId)&&a.interface===toIface;
    const bMatch2=(b.device===fromId||b.server===fromId)&&b.interface===fromIface;
    return (aMatch&&bMatch)||(aMatch2&&bMatch2);
  });
  if(dup){ toast("そのインターフェース間には既に接続があります","warn"); return; }
  addConnection({ kind:fromKind, id:fromId, iface:fromIface }, { kind:toKind, id:toId, iface:toIface });
  toast(`接続を作成: ${fromId}/${fromIface} ↔ ${toId}/${toIface}`, "ok");
}

function attachElementHandlers(g, kind, id){
  if(isMultiSelected(kind, id) && g.classList) g.classList.add("selected");
  g.addEventListener("mousedown", (e)=>onElMouseDown(e, kind, id));
  g.addEventListener("click", (e)=>{
    e.stopPropagation();
    if(App.connectMode){ handleConnectClick(kind, id); return; }
    if(e.shiftKey) return; // shift-toggle handled in mousedown
    // if a multi-move/rubberband just happened, don't collapse the selection
    if(App.multiSelect && App.multiSelect.length && isMultiSelected(kind,id)) return;
    App.multiSelect = [];
    selectElement(kind, id);
  });
  g.addEventListener("dblclick", (e)=>{ e.stopPropagation(); App.multiSelect=[]; selectElement(kind, id); openPropertyPanel(); });
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
  // Shift+click toggles this element in the multi-selection (PowerPoint-style)
  if(e.shiftKey){
    toggleMultiSelect(kind, id);
    return;
  }
  // If this element is part of a multi-selection, drag moves ALL selected together
  if(isMultiSelected(kind, id) && App.multiSelect.length > 1){
    const pt = svgPoint(e);
    dragState = {
      mode:"multimove", moved:false, startSX:pt.x, startSY:pt.y,
      items: App.multiSelect.map(m=>{ const o=Cfg.byId(kindToCol(m.kind),m.id); return o?{kind:m.kind,id:m.id,x0:o.x||0,y0:o.y||0}:null; }).filter(Boolean)
    };
    return;
  }
  // If this is a K8s cluster node OR vCenter cluster ESXi host, drag the WHOLE cluster
  // (so the cluster frame and its members move together). Alt+drag moves only this node.
  if(kind === "server" && !e.altKey){
    // K8s node?
    const k8sCl = ((App.config.k8s&&App.config.k8s.clusters)||[]).find(cl=>(cl.nodes||[]).includes(id));
    if(k8sCl && (k8sCl.nodes||[]).length>1){
      const members = (k8sCl.nodes||[]).map(nid=>({kind:"server",id:nid}));
      const pt = svgPoint(e);
      dragState = {
        mode:"group", moved:false, startSX:pt.x, startSY:pt.y,
        members: members.map(m=>{ const o=Cfg.byId("servers",m.id); return o?{kind:m.kind,id:m.id,x0:o.x||0,y0:o.y||0}:null; }).filter(Boolean)
      };
      return;
    }
    // vCenter cluster ESXi host?
    if(obj.hypervisor || obj.type==="hypervisor"){
      const vc = (App.config.vcenter_clusters||[]).find(c=>(c.hosts||[]).includes(id)||obj.vcenter_cluster===c.name);
      if(vc && (vc.hosts||[]).length>1){
        const memList = [];
        for(const hid of (vc.hosts||[])){
          memList.push({kind:"server", id:hid});
          // include all VMs on this host
          for(const s of (App.config.servers||[])) if(s.vm && s.host===hid) memList.push({kind:"server", id:s.id});
        }
        const pt = svgPoint(e);
        dragState = {
          mode:"group", moved:false, startSX:pt.x, startSY:pt.y,
          members: memList.map(m=>{ const o=Cfg.byId("servers",m.id); return o?{kind:m.kind,id:m.id,x0:o.x||0,y0:o.y||0}:null; }).filter(Boolean)
        };
        return;
      }
    }
  }
  const pt = svgPoint(e);
  dragState = {
    mode:"move", kind, id, obj,
    startX: obj.x||0, startY: obj.y||0,
    startSX: pt.x, startSY: pt.y, moved:false
  };
}

// AWS Subnet box drag: move the subnet's pos AND all its EC2 members together
function startSubnetDrag(e, snDef, members){
  if(e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const pt = svgPoint(e);
  const startPx = pt.x, startPy = pt.y;
  const startSnX = snDef._pos.x, startSnY = snDef._pos.y;
  const memInit = members.map(m=>{ const o = Cfg.byId(kindToCol(m.kind), m.id); return {kind:m.kind,id:m.id,x:o?(o.x||0):0,y:o?(o.y||0):0}; });
  dragState = {
    mode:"subnetMove", snDef, memInit, startPx, startPy, startSnX, startSnY,
    moved:false
  };
}

// AWS Subnet box resize: drag the SE handle to enlarge
function startSubnetResize(e, snDef){
  if(e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const pt = svgPoint(e);
  dragState = {
    mode:"subnetResize", snDef,
    startPx:pt.x, startPy:pt.y,
    startW:snDef._size.w, startH:snDef._size.h
  };
}

// Begin dragging a group of elements (used by VPC/K8s/vPC frame labels to move the whole group)
function startGroupDrag(e, members){
  if(e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const pt = svgPoint(e);
  dragState = {
    mode:"group", moved:false, startSX:pt.x, startSY:pt.y,
    members: members.map(m=>{ const o=Cfg.byId(kindToCol(m.kind), m.id); return o?{kind:m.kind,id:m.id,x0:o.x||0,y0:o.y||0}:null; }).filter(Boolean)
  };
}

function startFrameMove(e, target, curOrigin){
  if(e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const pt = svgPoint(e);
  target._pos = target._pos || { x:curOrigin.x, y:curOrigin.y };
  dragState = {
    mode:"framemove", moved:false, target,
    x0: target._pos.x, y0: target._pos.y,
    startSX:pt.x, startSY:pt.y
  };
}
function startFrameResize(e, target, curBox){
  if(e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const pt = svgPoint(e);
  target._pad = target._pad || { w:0, h:0 };
  dragState = {
    mode:"frameresize", moved:false, target,
    pad0:{ w:target._pad.w||0, h:target._pad.h||0 },
    startSX:pt.x, startSY:pt.y
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
  // AWS master block drag (move the whole AWS cloud by its label)
  if(awsDragState){
    const pt = svgPoint(e);
    App.config.aws._pos = { x: awsDragState.ox + (pt.x - awsDragState.startX), y: awsDragState.oy + (pt.y - awsDragState.startY) };
    awsDragState.moved = true;
    render();
    return;
  }
  // Wire-drag (drag-to-connect from an interface port)
  if(wireDrag){
    wireDrag.moved = true;
    const pt = svgPoint(e);
    let rb = $("#wire-rubber");
    const layer = $("#layer-overlays") || $("#layer-connections");
    if(!rb && layer){
      rb = ce("path", { id:"wire-rubber", fill:"none", stroke:"var(--accent)",
        "stroke-width":2.5, "stroke-dasharray":"6 4", "pointer-events":"none", opacity:"0.9" }, layer);
    }
    if(rb) rb.setAttribute("d", `M ${wireDrag.sx} ${wireDrag.sy} L ${pt.x} ${pt.y}`);
    return;
  }
  // Connect mode click-pick: after the first port is picked, show a rubber band
  // from that port to the cursor so the user can aim at the target port.
  if(App.connectMode && App.connectMode.from && App.connectMode.from.anchor){
    const pt = svgPoint(e);
    let rb = $("#wire-rubber");
    const layer = $("#layer-overlays") || $("#layer-connections");
    if(!rb && layer){
      rb = ce("path", { id:"wire-rubber", fill:"none", stroke:"var(--accent)",
        "stroke-width":2.5, "stroke-dasharray":"6 4", "pointer-events":"none", opacity:"0.9" }, layer);
    }
    const a = App.connectMode.from.anchor;
    if(rb) rb.setAttribute("d", `M ${a.x} ${a.y} L ${pt.x} ${pt.y}`);
    return;
  }
  if(!dragState) return;
  if(dragState.mode === "rubberband"){
    const pt = svgPoint(e);
    dragState.x1 = pt.x; dragState.y1 = pt.y;
    let rb = $("#sel-rect");
    const layer = $("#layer-overlays") || $("#layer-connections");
    if(!rb && layer){
      rb = ce("rect", { id:"sel-rect", fill:"rgba(88,166,255,0.12)", stroke:"var(--accent)",
        "stroke-width":1, "stroke-dasharray":"4 3", "pointer-events":"none" }, layer);
    }
    if(rb){
      rb.setAttribute("x", Math.min(dragState.x0,pt.x));
      rb.setAttribute("y", Math.min(dragState.y0,pt.y));
      rb.setAttribute("width", Math.abs(pt.x-dragState.x0));
      rb.setAttribute("height", Math.abs(pt.y-dragState.y0));
    }
    return;
  }
  if(dragState.mode === "multimove"){
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startSX;
    const dy = pt.y - dragState.startSY;
    if(Math.abs(dx)>2||Math.abs(dy)>2) dragState.moved = true;
    for(const m of dragState.items){
      const o = Cfg.byId(kindToCol(m.kind), m.id);
      if(o){ o.x = m.x0+dx; o.y = m.y0+dy; }
    }
    render();
    return;
  }
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
  } else if(dragState.mode === "framemove"){
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startSX;
    const dy = pt.y - dragState.startSY;
    if(Math.abs(dx)>2 || Math.abs(dy)>2) dragState.moved = true;
    dragState.target._pos = { x: dragState.x0+dx, y: dragState.y0+dy };
    render();
  } else if(dragState.mode === "frameresize"){
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startSX;
    const dy = pt.y - dragState.startSY;
    if(Math.abs(dx)>2 || Math.abs(dy)>2) dragState.moved = true;
    dragState.target._pad = {
      w: Math.max(0, dragState.pad0.w + dx),
      h: Math.max(0, dragState.pad0.h + dy)
    };
    render();
  } else if(dragState.mode === "group"){
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startSX;
    const dy = pt.y - dragState.startSY;
    if(Math.abs(dx)>2 || Math.abs(dy)>2) dragState.moved = true;
    for(const m of dragState.members){
      const co = Cfg.byId(kindToCol(m.kind), m.id);
      if(co){ co.x = m.x0 + dx; co.y = m.y0 + dy; }
    }
    render();
  } else if(dragState.mode === "subnetMove"){
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startPx;
    const dy = pt.y - dragState.startPy;
    if(Math.abs(dx)>2 || Math.abs(dy)>2) dragState.moved = true;
    dragState.snDef._pos = { x: dragState.startSnX + dx, y: dragState.startSnY + dy };
    for(const m of dragState.memInit){
      const co = Cfg.byId(kindToCol(m.kind), m.id);
      if(co){ co.x = m.x + dx; co.y = m.y + dy; }
    }
    render();
  } else if(dragState.mode === "subnetResize"){
    const pt = svgPoint(e);
    const dx = pt.x - dragState.startPx;
    const dy = pt.y - dragState.startPy;
    dragState.snDef._size = { w: Math.max(80, dragState.startW + dx), h: Math.max(60, dragState.startH + dy) };
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
  // Finish AWS master block drag
  if(awsDragState){
    if(awsDragState.moved){ pushUndo(); syncYamlFromConfig(); }
    awsDragState = null;
    render();
    return;
  }
  // Complete a wire-drag: if released over a different interface port, create a connection
  if(wireDrag){
    const rb = $("#wire-rubber"); if(rb) rb.remove();
    const wd = wireDrag; wireDrag = null;
    const tp = App._hoverPort;
    if(wd.connectMode){
      // CONNECT MODE — two ways to wire:
      const sameAsTarget = tp && tp.kind===wd.fromKind && tp.id===wd.fromId && tp.iface===wd.fromIface;
      if(wd.moved && tp && !sameAsTarget){
        // (a) drag gesture: pressed on source port, released on target port → wire now
        createConnectionBetween(wd.fromKind, wd.fromId, wd.fromIface, tp.kind, tp.id, tp.iface);
        if(App.connectMode){ App.connectMode.step=1; App.connectMode.from=null; }
        setConnectStatusMsg();
      } else {
        // (b) click (no real movement): treat as a click-pick (click source, then click target)
        handleConnectClick(wd.fromKind, wd.fromId, wd.fromIface);
      }
      return;
    }
    if(wd.moved && tp){
      const sameIface = tp.kind===wd.fromKind && tp.id===wd.fromId && tp.iface===wd.fromIface;
      if(!sameIface){
        createConnectionBetween(wd.fromKind, wd.fromId, wd.fromIface, tp.kind, tp.id, tp.iface);
      }
    }
    return;
  }
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
  if(dragState.mode === "group"){
    if(dragState.moved){ pushUndo(); syncYamlFromConfig(); render(); }
    dragState = null;
    return;
  }
  if(dragState.mode === "rubberband"){
    if(dragState.x1!=null) finishRubberband();
    else { const rb=$("#sel-rect"); if(rb) rb.remove(); }
    dragState = null;
    return;
  }
  if(dragState.mode === "multimove"){
    if(dragState.moved){ pushUndo(); syncYamlFromConfig(); render(); }
    dragState = null;
    return;
  }
  if(dragState.mode === "framemove"){
    if(dragState.moved){ pushUndo(); syncYamlFromConfig(); render(); }
    dragState = null;
    return;
  }
  if(dragState.mode === "frameresize"){
    if(dragState.moved){ pushUndo(); syncYamlFromConfig(); render(); }
    dragState = null;
    return;
  }
  if(dragState.mode === "subnetMove" || dragState.mode === "subnetResize"){
    if(dragState.moved!==false){ pushUndo(); syncYamlFromConfig(); render(); }
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
    // Shift-drag (or 選択モード) on empty canvas → rubber-band multi-select; else pan
    if(e.shiftKey || App.selectMode){
      const pt = svgPoint(e);
      if(!e.shiftKey){ App.multiSelect = []; }
      dragState = { mode:"rubberband", x0:pt.x, y0:pt.y, additive:e.shiftKey };
      return;
    }
    selectElement(null, null);
    if(!e.shiftKey) App.multiSelect = [];
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
// Bounding box of an element in world coords
function elementBBox(kind, o){
  if(kind==="network") return { x:o.x||0, y:o.y||0, w:o.width||300, h:o.height||200 };
  const w = o.width || (o.interfaces?130:120), h = o.height || 65;
  return { x:o.x||0, y:o.y||0, w, h };
}
function rectsIntersect(a,b){
  return !(a.x+a.w < b.x || b.x+b.w < a.x || a.y+a.h < b.y || b.y+b.h < a.y);
}
function finishRubberband(){
  const r = dragState;
  App.multiSelect = App.multiSelect || [];
  const sel = { x:Math.min(r.x0,r.x1), y:Math.min(r.y0,r.y1), w:Math.abs(r.x1-r.x0), h:Math.abs(r.y1-r.y0) };
  if(!r.additive) App.multiSelect = [];
  const addIf = (kind, arr)=>{ for(const o of (arr||[])){ if(rectsIntersect(sel, elementBBox(kind,o))){ if(!App.multiSelect.some(m=>m.kind===kind&&m.id===o.id)) App.multiSelect.push({kind,id:o.id}); } } };
  addIf("device", App.config.devices);
  addIf("server", App.config.servers);
  addIf("network", App.config.networks);
  const rb = $("#sel-rect"); if(rb) rb.remove();
  App.selected = null;
  render();
  if(App.multiSelect.length) toast(`${App.multiSelect.length}個の要素を選択`, "ok");
}
function isMultiSelected(kind, id){ return App.multiSelect && App.multiSelect.some(m=>m.kind===kind&&m.id===id); }
function toggleMultiSelect(kind, id){
  App.multiSelect = App.multiSelect || [];
  const i = App.multiSelect.findIndex(m=>m.kind===kind&&m.id===id);
  if(i>=0) App.multiSelect.splice(i,1); else App.multiSelect.push({kind,id});
  render();
}
function deleteMultiSelected(){
  if(!App.multiSelect || !App.multiSelect.length) return false;
  pushUndo();
  for(const m of App.multiSelect){
    const col = kindToCol(m.kind);
    if(App.config[col]) App.config[col] = App.config[col].filter(o=>o.id!==m.id);
    // also remove connections touching deleted devices/servers
    App.config.connections = (App.config.connections||[]).filter(c=>{
      const f=c.from&&(c.from[m.kind]===m.id), t=c.to&&(c.to[m.kind]===m.id);
      return !(f||t);
    });
  }
  const n = App.multiSelect.length;
  App.multiSelect = [];
  renderAndSync(); updateStatusBar();
  toast(`${n}個の要素を削除しました`, "ok");
  return true;
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

function handleConnectClick(kind, id, ifaceId){
  if(kind !== "device" && kind !== "server"){
    Log.warn("接続はデバイス/サーバ間で作成可能です");
    return;
  }
  if(App.connectMode.step === 1){
    // record the anchor point of the picked port so a rubber band can follow the cursor
    let anchor = null;
    const obj = Cfg.byId(kindToCol(kind), id);
    if(obj && ifaceId){
      const positions = computePortPositions(obj, kind);
      const ifIdx = (obj.interfaces||[]).findIndex(i=>i.id===ifaceId);
      const pos = positions[ifIdx];
      if(pos) anchor = { x:(obj.x||0)+(pos.outX!=null?pos.outX:pos.cx), y:(obj.y||0)+(pos.outY!=null?pos.outY:pos.cy) };
    }
    App.connectMode.from = { kind, id, iface: ifaceId, anchor };
    App.connectMode.step = 2;
    const port = ifaceId ? ` (${ifaceId})` : "";
    $("#status-msg").textContent = `始点: ${id}${port} → 接続先インターフェースをクリック/ドラッグ離し (ESCでキャンセル)`;
    Log.info(`接続元: ${kind} ${id}${port}`);
  } else {
    if(App.connectMode.from.kind === kind && App.connectMode.from.id === id){
      if(App.connectMode.from.iface && ifaceId && App.connectMode.from.iface === ifaceId){
        Log.warn("同じインターフェース同士は接続できません");
        return;
      }
      if(!ifaceId){ Log.warn("同じ要素には接続できません"); return; }
    }
    addConnection(App.connectMode.from, { kind, id, iface: ifaceId });
    App.connectMode.step = 1;
    App.connectMode.from = null;
    const rb = $("#wire-rubber"); if(rb) rb.remove();
    setConnectStatusMsg();
  }
}
function setConnectStatusMsg(){
  const el = $("#status-msg"); if(!el) return;
  el.textContent = "接続モード: 始点インターフェースをクリック → 終点をクリック(またはドラッグ離し) / 連続配線可 / ESC・「接続」ボタンで終了";
}
function cancelConnectMode(){
  App.connectMode = null;
  $("#svg").classList.remove("connecting");
  $("#status-msg").textContent = "";
  const rb = $("#wire-rubber"); if(rb) rb.remove();
  const btn = $("#btn-add-connection"); if(btn) btn.classList.remove("active");
  if(typeof updateModeIndicator==="function") updateModeIndicator();
}
// Show a clear on-canvas indicator of the active interaction mode
function updateModeIndicator(){
  const el = $("#mode-indicator"); if(!el) return;
  if(App.connectMode){
    el.style.display="block"; el.style.background="#22c55e";
    el.textContent = "🔌 接続モード — ポートをクリック/ドラッグで配線 (ESCで終了)";
  } else if(App.selectMode){
    el.style.display="block"; el.style.background="#8b5cf6";
    el.textContent = "⬚ 複数選択モード — ドラッグで範囲選択 / Shift+クリックで追加 (ESCで終了)";
  } else {
    el.style.display="none";
  }
}

function addConnection(from, to){
  const fromObj = Cfg.byId(kindToCol(from.kind), from.id);
  const toObj = Cfg.byId(kindToCol(to.kind), to.id);
  if(!fromObj || !toObj) return;
  // Use clicked iface if provided, else first available iface
  const fromIf = from.iface || ((fromObj.interfaces&&fromObj.interfaces[0]) ? fromObj.interfaces[0].id : "eth0");
  const toIf = to.iface || ((toObj.interfaces&&toObj.interfaces[0]) ? toObj.interfaces[0].id : "eth0");
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
  if(kind === "aws-vpc"){
    return [
      { icon:"☁", label:"VPC設定を開く", action:()=>showAwsManager(id) },
      { icon:"📦", label:"EC2インスタンス追加", action:()=>showAwsManager(id) },
      { sep:true },
      { icon:"🗑", label:"VPC削除", action:()=>deleteAwsVpc(id) }
    ];
  }
  if(kind === "k8s-cluster"){
    return [
      { icon:"☸", label:"クラスタ設定を開く", action:()=>showK8sManager(id) },
      { sep:true },
      { icon:"🗑", label:"クラスタ削除", action:()=>deleteK8sCluster(id) }
    ];
  }
  if(kind === "device" || kind === "server"){
    const obj = Cfg.byId(kindToCol(kind), id);
    if(!obj) return [];
    const items = [
      { icon:"▶", label:"起動", action:()=>setStatus(kind,id,"running"), disabled: obj.status==="running" },
      { icon:"⏹", label:"停止", action:()=>setStatus(kind,id,"stopped"), disabled: obj.status==="stopped" },
      { icon:"⚠", label:"障害発生", action:()=>setStatus(kind,id,"error") },
      { icon:"🔧", label:"メンテナンスモード", action:()=>setStatus(kind,id,"maintenance") },
      { sep:true },
      { icon:"🎯", label:"ここから通信テスト...", action:()=>{ if(typeof openCommTestFrom==="function") openCommTestFrom(kind, id); }},
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
    if(kind === "server"){
      items.push({ sep:true });
      // K8s node: show pods running on this node as a submenu
      const inCluster = ((App.config.k8s&&App.config.k8s.clusters)||[]).find(cl=>(cl.nodes||[]).includes(id));
      if(inCluster){
        const podsHere = (inCluster.pods||[]).filter(p=>p.node===id);
        if(podsHere.length){
          items.push({ icon:"⬡", label:`⬡ Pod 操作 (このノード: ${podsHere.length}個)`, action:()=>{
            openDialog(`⬡ ${obj.label||id} のPod一覧`, (body)=>{
              ch("div",{text:"ノードに配置されているPod。クリックで個別編集できます。",style:{fontSize:"11px",color:"var(--text-dim)",margin:"6px 0"}},body);
              for(const pod of podsHere){
                const row = ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",padding:"6px",border:"1px solid var(--border)",borderRadius:"4px",marginBottom:"4px",background:"var(--bg2)"}},body);
                ch("span",{text:"⬡ "+pod.name,style:{flex:"1",fontWeight:"700",fontSize:"11px"}},row);
                ch("span",{text:pod.status||"Running",style:{fontSize:"10px",color:pod.status==="Running"?"var(--green)":"var(--orange)",padding:"2px 5px",border:"1px solid",borderRadius:"3px"}},row);
                ch("button",{text:"⚙ 編集",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px"},
                  on:{click:()=>{ closeDialog(); showPodEditor(inCluster.name, pod.name); }}},row);
                ch("button",{text:"🔀 移動",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"3px"},
                  on:{click:()=>{ closeDialog(); showPodMigrationMenu(inCluster.name, pod.name); }}},row);
              }
              ch("button",{text:"+ このノードに新規Podを作成",style:{padding:"5px 10px",fontSize:"11px",cursor:"pointer",background:"var(--green)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700",marginTop:"8px"},
                on:{click:()=>{ const n=(inCluster.pods=inCluster.pods||[]).length+1; const newPod={name:"pod-"+n,namespace:"default",node:id,ip:"10.244.0."+(n+1),labels:{app:"web"},status:"Running",containers:[{name:"app",image:"nginx:latest",ports:[80]}]}; inCluster.pods.push(newPod); renderAndSync(); closeDialog(); showPodEditor(inCluster.name, newPod.name); }}},body);
              return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
            });
          }});
        }
        items.push({ icon:"➕", label:"⬡ このノードにPod追加", action:()=>{
          const n=(inCluster.pods=inCluster.pods||[]).length+1;
          const newPod={name:"pod-"+n,namespace:"default",node:id,ip:"10.244.0."+(n+1),labels:{app:"web"},status:"Running",containers:[{name:"app",image:"nginx:latest",ports:[80]}]};
          inCluster.pods.push(newPod); renderAndSync();
          showPodEditor(inCluster.name, newPod.name);
        }});
        items.push({ icon:"☸", label:"☸ クラスタ管理を開く", action:()=>showK8sManager(inCluster.name) });
        items.push({ sep:true });
      }
      // ESXi/Hypervisor: vCenter cluster operations
      if(obj.hypervisor || obj.type==="hypervisor"){
        items.push({ icon:"🖥", label:"仮想基盤(ESXi)を開く", action:()=>showHypervisorManager(id) });
        items.push({ icon:"🏢", label:"vCenterクラスタ管理", action:()=>showVcenterClusterManager(obj.vcenter_cluster||"") });
        // VMリスト
        const myVMs = (App.config.servers||[]).filter(s=>s.vm && s.host===id);
        if(myVMs.length){
          items.push({ icon:"⬡", label:`VM一覧 (${myVMs.length}台)`, action:()=>{
            openDialog(`⬡ ${obj.label||id} のVM一覧`, (body)=>{
              for(const vm of myVMs){
                const row=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",padding:"6px",border:"1px solid var(--border)",borderRadius:"4px",marginBottom:"4px",background:"var(--bg2)"}},body);
                ch("span",{text:"⬡ "+(vm.label||vm.id),style:{flex:"1",fontWeight:"700",fontSize:"11px"}},row);
                ch("span",{text:vm.status,style:{fontSize:"10px",color:vm.status==="running"?"var(--green)":"var(--orange)",padding:"2px 5px",border:"1px solid",borderRadius:"3px"}},row);
                ch("button",{text:"⚙ 編集",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px"},
                  on:{click:()=>{ closeDialog(); App.selected={kind:"server",id:vm.id}; openPropertyPanel(); }}},row);
              }
              return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
            });
          }});
        }
        items.push({ icon:"➕", label:"VMをこのホストに追加", action:()=>{
          const n = myVMs.length + 1;
          const vmId = uid("vm");
          const w = obj.width||200, h = obj.height||120;
          App.config.servers.push({
            id:vmId, label:"vm-"+n, host:id, vm:true, type:"virtual",
            os:"linux", status:"running", power:"on", vcpu:2, ram_gb:4,
            x: (obj.x||0)+15+((n-1)%2)*80, y:(obj.y||0)+30+Math.floor((n-1)/2)*46,
            width:70, height:38, portgroup:"VM Network",
            interfaces:[{id:"eth0", ip:"10.50.0."+(10+n)+"/24", mac:genUniqueMac(), status:"up"}]
          });
          renderAndSync(); toast("VM "+vmId+" を "+id+" に追加","ok");
        }});
        items.push({ sep:true });
      }
      // VM: vMotion submenu — pick a target hypervisor and run live migration
      if(obj.vm && obj.host){
        const others=(App.config.servers||[]).filter(s=>(s.hypervisor||s.type==="hypervisor")&&s.id!==obj.host && s.status==="running");
        if(others.length){
          for(const tgt of others){
            items.push({ icon:"🚚", label:`vMotion → ${tgt.label||tgt.id}`,
              action:()=>{ if(typeof runLiveMigration==="function"){ const mig=runLiveMigration("vm",obj.id,tgt.id,obj._tcp_sessions||0); if(mig.failed) toast("ライブマイグレーション失敗: "+mig.reason,"err"); else toast(`vMotion完了: ${obj.label||obj.id} → ${tgt.id} (ダウンタイム${mig.downtime_ms}ms)`,"ok"); } } });
          }
        } else {
          items.push({ icon:"🚚", label:"vMotion (移動先ホスト無し)", action:()=>toast("別の稼働中ESXi/vCenterホストを配置してください","warn") });
        }
      }
      items.push({ icon:"➕", label:"サービス追加...", action:()=>addServiceToServer(id) });
      const hosted = (App.config.services||[]).filter(s=>s.server===id);
      for(const sv of hosted){
        items.push({ icon:(sv.status==="running"?"●":"○"), label:`サービス設定: ${sv.label||sv.id}`,
          action:()=>{ selectElement("service", sv.id); openPropertyPanel(); } });
      }
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
  // Immediate HA failover check when a server/host goes down
  if(typeof checkAutoMigrations==="function" && (newStatus==="error"||newStatus==="stopped")){
    setTimeout(()=>{ try{ const n=checkAutoMigrations(); if(n>0) toast(`HAフェイルオーバ: ${n}件のPod/VMを健全なノードへ移動`,"ok"); }catch(e){} }, 100);
  }
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
  if(kind === "aws-vpc"){ App.selected=null; deleteAwsVpc(id); return; }
  if(kind === "k8s-cluster"){ App.selected=null; deleteK8sCluster(id); return; }
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
  // IP / MAC conflict warning in the status message (clears reliably when resolved)
  try{
    const msgEl = $("#status-msg");
    if(msgEl && !App.connectMode){
      const cf = (typeof detectIpConflicts==="function") ? detectIpConflicts() : {};
      const ips = Object.keys(cf);
      const mc = (typeof detectMacConflicts==="function") ? detectMacConflicts() : {};
      const macs = Object.keys(mc);
      if(ips.length){
        msgEl.textContent = `⚠ IPアドレス競合: ${ips.slice(0,3).join(", ")}${ips.length>3?" 他":""} — 同一ネットワーク内で重複しています`;
        msgEl.style.color = "var(--red)";
        msgEl.dataset.warn = "1";
      } else if(macs.length){
        msgEl.textContent = `⚠ MACアドレス重複: ${macs.length}件 — 同一MACが複数のNICに存在(フラッピングの原因)`;
        msgEl.style.color = "var(--red)";
        msgEl.dataset.warn = "1";
      } else if(msgEl.dataset.warn === "1"){
        // previously showed a conflict warning → now resolved, clear it
        msgEl.textContent = "";
        msgEl.style.color = "";
        msgEl.dataset.warn = "";
      }
    }
  }catch(e){}
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

