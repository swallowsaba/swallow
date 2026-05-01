/* ============================================================
   PROCESS VISUALIZER
   Visualize the actual ticket graph (parent + subtasks + dependencies)
   - Works for tickets generated from templates (uses templateSnapshot)
   - Also works for ANY parent ticket (auto-builds graph from
     subtasks + blocks/blocked_by links)
   - Status color coding (todo/inprogress/review/done)
   - Click a node -> jump to ticket
   - Right-click node -> mini context menu (status, assignee)
   - In-place status & assignee selectors on each node
   ============================================================ */

var PVZ = {
  open: false,
  parentKey: null,
  positions: {},   // parentKey -> {ticketKey: {x,y}}
  zoom: 1, panX: 0, panY: 0,
  draggingNode: null, panning: false
};

function pvLoadPositions(){
  try {
    var s = localStorage.getItem("pvzPositions");
    if (s) PVZ.positions = JSON.parse(s);
  } catch(e){}
}
function pvSavePositions(){
  try { localStorage.setItem("pvzPositions", JSON.stringify(PVZ.positions)); } catch(e){}
}
pvLoadPositions();

/* ===== Determine if a ticket has a process to visualize ===== */
function hasProcess(ticket){
  if (!ticket) return false;
  // Generated from template?
  if (ticket.templateId && ticket.templateRole === "parent") return true;
  // Any ticket with subtasks?
  if (TS.tickets.some(function(t){return t.parentKey === ticket.key})) return true;
  return false;
}

/* ===== Build graph from ticket relationships ===== */
function buildProcessGraph(parentTicket){
  var nodes = [];
  var edges = [];
  // Always include parent itself as the root
  nodes.push({
    id: parentTicket.key,
    ticketKey: parentTicket.key,
    title: parentTicket.title,
    role: "parent",
    isParent: true
  });

  // Get all subtasks
  var subs = TS.tickets.filter(function(t){return t.parentKey === parentTicket.key});

  // If parent has templateSnapshot, use that for layout
  if (parentTicket.templateSnapshot && parentTicket.templateSnapshot.nodes && parentTicket.templateSnapshot.nodes.length){
    var snap = parentTicket.templateSnapshot;
    snap.nodes.forEach(function(n){
      // Find ticket whose templateNodeId matches
      var t = subs.find(function(x){return x.templateNodeId === n.id});
      if (t){
        nodes.push({
          id: t.key,
          templateNodeId: n.id,
          ticketKey: t.key,
          title: t.title,
          role: n.role || t.type,
          x: n.x, y: n.y
        });
      }
    });
    // Edges from snapshot (template node id -> ticket key)
    var nodeIdToKey = {};
    snap.nodes.forEach(function(n){
      var t = subs.find(function(x){return x.templateNodeId === n.id});
      if (t) nodeIdToKey[n.id] = t.key;
    });
    (snap.edges||[]).forEach(function(e){
      var fromK = nodeIdToKey[e.from];
      var toK = nodeIdToKey[e.to];
      if (fromK && toK) edges.push({from:fromK, to:toK, type:"template"});
    });
  } else {
    // No template snapshot - use subtasks directly
    subs.forEach(function(t){
      nodes.push({
        id: t.key, ticketKey: t.key, title: t.title, role: t.type
      });
    });
  }

  // Always add explicit blocks/blocked_by links between any of these tickets
  var nodeKeys = {};
  nodes.forEach(function(n){nodeKeys[n.ticketKey]=true});
  TS.tickets.forEach(function(t){
    if (!nodeKeys[t.key]) return;
    (t.links||[]).forEach(function(l){
      if (l.type === "blocks" && nodeKeys[l.target]){
        var dup = edges.find(function(e){return e.from===t.key && e.to===l.target});
        if (!dup) edges.push({from:t.key, to:l.target, type:"link"});
      }
    });
  });

  // Edge from parent to each top-level subtask (no incoming edge from another sub)
  var hasIncoming = {};
  edges.forEach(function(e){hasIncoming[e.to] = true});
  subs.forEach(function(s){
    if (nodeKeys[s.key] && !hasIncoming[s.key]){
      edges.push({from: parentTicket.key, to: s.key, type:"parent"});
    }
  });

  return {nodes: nodes, edges: edges};
}

/* ===== Auto-layout when no template positions exist ===== */
function pvAutoLayout(graph, parentKey){
  var levels = {};
  var visited = {};
  // Start from parent (the root)
  var queue = [{id: parentKey, level: 0}];
  levels[parentKey] = 0;
  visited[parentKey] = true;
  while (queue.length){
    var cur = queue.shift();
    graph.edges.forEach(function(e){
      if (e.from === cur.id){
        var nl = (cur.level || 0) + 1;
        if (levels[e.to] == null || levels[e.to] < nl){
          levels[e.to] = nl;
          if (!visited[e.to]){visited[e.to] = true; queue.push({id:e.to, level:nl})}
        }
      }
    });
  }
  graph.nodes.forEach(function(n){if(levels[n.id]==null)levels[n.id]=0});

  // Group by level
  var byLevel = {};
  graph.nodes.forEach(function(n){
    var l = levels[n.id];
    if (!byLevel[l]) byLevel[l] = [];
    byLevel[l].push(n.id);
  });
  var COL_W = 240, ROW_H = 100, MARGIN_X = 60, MARGIN_Y = 60;
  var positions = {};
  Object.keys(byLevel).map(Number).sort(function(a,b){return a-b}).forEach(function(lv){
    byLevel[lv].forEach(function(id, ri){
      positions[id] = {x: MARGIN_X + lv*COL_W, y: MARGIN_Y + ri*ROW_H};
    });
  });
  return positions;
}

function pvGetPos(graph, parentKey, nodeId, templateX, templateY){
  if (!PVZ.positions[parentKey]){
    PVZ.positions[parentKey] = pvAutoLayout(graph, parentKey);
  }
  if (!PVZ.positions[parentKey][nodeId]){
    if (templateX != null && templateY != null){
      PVZ.positions[parentKey][nodeId] = {x: templateX, y: templateY};
    } else {
      var auto = pvAutoLayout(graph, parentKey);
      PVZ.positions[parentKey][nodeId] = auto[nodeId] || {x: 60, y: 60};
    }
  }
  return PVZ.positions[parentKey][nodeId];
}

/* ===== Render the Process Visualizer modal ===== */
function showProcessVisualizer(parentKey){
  var parent = TS.tickets.find(function(x){return x.key===parentKey});
  if (!parent){toast("チケットが見つかりません",1);return}

  PVZ.open = true;
  PVZ.parentKey = parentKey;

  var graph = buildProcessGraph(parent);

  // Build modal
  var modal = document.getElementById("pvzModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "pvzModal";
    modal.className = "pvz-modal";
    document.body.appendChild(modal);
  }
  modal.style.display = "flex";

  var headerColor = (parent.templateSnapshot && parent.templateSnapshot.color) || "#0c66e4";
  var icon = (parent.templateSnapshot && parent.templateSnapshot.icon) || "📊";
  var tplName = (parent.templateSnapshot && parent.templateSnapshot.name) || "Process";

  var subs = TS.tickets.filter(function(t){return t.parentKey === parent.key});
  var doneCnt = subs.filter(function(s){return s.status==="done"}).length;
  var totalCnt = subs.length;
  var pctDone = totalCnt ? Math.round(doneCnt/totalCnt*100) : 0;

  modal.innerHTML = '<div class="pvz-content"><div class="pvz-header"><div class="pvz-h-icon" style="background:'+escHtml(headerColor)+'">'+icon+'</div><div style="flex:1;min-width:0"><div class="pvz-h-title">'+escHtml(parent.key)+': '+escHtml(parent.title)+'</div><div class="pvz-h-meta">'+escHtml(tplName)+' · '+graph.nodes.length+' tasks · '+graph.edges.length+' links · 進捗 '+pctDone+'% ('+doneCnt+'/'+totalCnt+')</div></div><button class="pvz-close" id="pvzClose" title="Close">×</button></div><div class="pvz-toolbar"><button class="btn secondary btn-sm" id="pvzAuto">⚡ Auto Layout</button><button class="btn secondary btn-sm" id="pvzZIn">＋</button><button class="btn secondary btn-sm" id="pvzZOut">－</button><button class="btn secondary btn-sm" id="pvzReset">⊕ Reset</button><span style="font-size:11px;color:var(--t2);margin-left:auto">ノードクリック=詳細, ドラッグ=移動, ホイール=ズーム</span></div><div class="pvz-stage" id="pvzStage"></div></div>';

  var stage = document.getElementById("pvzStage");

  // Compute SVG size
  var maxX = 800, maxY = 400;
  graph.nodes.forEach(function(n){
    var pos = pvGetPos(graph, parent.key, n.id, n.x, n.y);
    if (pos.x + 200 > maxX) maxX = pos.x + 200;
    if (pos.y + 80 > maxY) maxY = pos.y + 80;
  });
  var svgW = Math.max(1200, maxX + 200);
  var svgH = Math.max(600, maxY + 200);

  var svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("width", svgW);
  svg.setAttribute("height", svgH);
  svg.style.cssText = "transform-origin:0 0;transform:translate("+PVZ.panX+"px,"+PVZ.panY+"px) scale("+PVZ.zoom+")";
  svg.id = "pvzSvg";
  svg.innerHTML = '<defs>'+
    '<marker id="pvzArr" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto"><path d="M0,0 L12,5 L0,10 L3,5 Z" fill="#5e6c84"/></marker>'+
    '<marker id="pvzArrParent" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto"><path d="M0,0 L12,5 L0,10 L3,5 Z" fill="#a5b3c2" opacity="0.6"/></marker>'+
    '<filter id="pvzShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/></filter>'+
    '</defs>';

  // Edges first
  var edgesG = document.createElementNS("http://www.w3.org/2000/svg","g");
  edgesG.setAttribute("class","pvz-edges");
  graph.edges.forEach(function(e){pvDrawEdge(edgesG, graph, parent.key, e)});
  svg.appendChild(edgesG);

  // Nodes
  var nodesG = document.createElementNS("http://www.w3.org/2000/svg","g");
  graph.nodes.forEach(function(n){pvDrawNode(nodesG, graph, parent.key, n)});
  svg.appendChild(nodesG);

  stage.appendChild(svg);

  // Detail popup container
  var popup = document.createElement("div");
  popup.id = "pvzNodePop";
  popup.className = "pvz-node-pop";
  popup.style.display = "none";
  stage.appendChild(popup);

  // === Bindings ===
  document.getElementById("pvzClose").onclick = closeProcessVisualizer;
  document.getElementById("pvzAuto").onclick = function(){
    PVZ.positions[parent.key] = pvAutoLayout(graph, parent.key);
    pvSavePositions();
    showProcessVisualizer(parent.key);
  };
  document.getElementById("pvzZIn").onclick = function(){PVZ.zoom = Math.min(2, PVZ.zoom*1.2); pvApplyTransform()};
  document.getElementById("pvzZOut").onclick = function(){PVZ.zoom = Math.max(0.4, PVZ.zoom/1.2); pvApplyTransform()};
  document.getElementById("pvzReset").onclick = function(){PVZ.zoom=1;PVZ.panX=0;PVZ.panY=0;pvApplyTransform()};

  // Close on Escape
  document.addEventListener("keydown", pvKeyHandler);

  // Wheel zoom
  stage.addEventListener("wheel", function(e){
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.1 : 0.9;
    PVZ.zoom = Math.max(0.3, Math.min(3, PVZ.zoom*factor));
    pvApplyTransform();
  }, {passive:false});

  // Pan
  stage.addEventListener("mousedown", function(e){
    if (e.target === stage || e.target === svg){
      PVZ.panning = true;
      PVZ._panStart = {x:e.clientX, y:e.clientY, panX:PVZ.panX, panY:PVZ.panY};
      hidePopup();
    }
  });
  document.addEventListener("mousemove", pvMouseMoveHandler);
  document.addEventListener("mouseup", pvMouseUpHandler);

  function pvApplyTransform(){
    var s = document.getElementById("pvzSvg");
    if (s) s.style.transform = "translate("+PVZ.panX+"px,"+PVZ.panY+"px) scale("+PVZ.zoom+")";
  }
}

function pvKeyHandler(e){
  if (e.key === "Escape" && PVZ.open){
    closeProcessVisualizer();
  }
}

function pvMouseMoveHandler(e){
  if (PVZ.panning){
    PVZ.panX = PVZ._panStart.panX + (e.clientX - PVZ._panStart.x);
    PVZ.panY = PVZ._panStart.panY + (e.clientY - PVZ._panStart.y);
    var s = document.getElementById("pvzSvg");
    if (s) s.style.transform = "translate("+PVZ.panX+"px,"+PVZ.panY+"px) scale("+PVZ.zoom+")";
  }
  if (PVZ.draggingNode){
    var stage = document.getElementById("pvzStage");
    if (!stage) return;
    var rect = stage.getBoundingClientRect();
    var sx = (e.clientX - rect.left - PVZ.panX) / PVZ.zoom;
    var sy = (e.clientY - rect.top - PVZ.panY) / PVZ.zoom;
    var pos = PVZ.positions[PVZ.parentKey][PVZ.draggingNode];
    pos.x = sx - PVZ._dragOff.x;
    pos.y = sy - PVZ._dragOff.y;
    var nodeEl = document.querySelector('[data-pvz-node="'+PVZ.draggingNode+'"]');
    if (nodeEl) nodeEl.setAttribute("transform", "translate("+pos.x+","+pos.y+")");
    pvRedrawEdges();
  }
}
function pvMouseUpHandler(){
  if (PVZ.panning) PVZ.panning = false;
  if (PVZ.draggingNode){PVZ.draggingNode = null; pvSavePositions()}
}

function pvRedrawEdges(){
  var svg = document.getElementById("pvzSvg");
  if (!svg) return;
  var oldEdges = svg.querySelector(".pvz-edges");
  if (!oldEdges) return;
  var parent = TS.tickets.find(function(x){return x.key===PVZ.parentKey});
  if (!parent) return;
  var graph = buildProcessGraph(parent);
  var newEdges = document.createElementNS("http://www.w3.org/2000/svg","g");
  newEdges.setAttribute("class","pvz-edges");
  graph.edges.forEach(function(e){pvDrawEdge(newEdges, graph, parent.key, e)});
  oldEdges.parentNode.replaceChild(newEdges, oldEdges);
}

function closeProcessVisualizer(){
  var modal = document.getElementById("pvzModal");
  if (modal) modal.style.display = "none";
  PVZ.open = false;
  document.removeEventListener("keydown", pvKeyHandler);
  document.removeEventListener("mousemove", pvMouseMoveHandler);
  document.removeEventListener("mouseup", pvMouseUpHandler);
  hidePopup();
}

function hidePopup(){
  var p = document.getElementById("pvzNodePop");
  if (p) p.style.display = "none";
}

/* ===== Draw a process node ===== */
function pvDrawNode(group, graph, parentKey, n){
  var t = TS.tickets.find(function(x){return x.key===n.ticketKey});
  if (!t) return;
  var pos = pvGetPos(graph, parentKey, n.id, n.x, n.y);

  var W = n.isParent ? 220 : 200;
  var H = n.isParent ? 76 : 70;

  // Status -> color
  var stColors = {todo:"#5e6c84", inprogress:"#0c66e4", review:"#a54800", done:"#216e4e"};
  var stBg = {todo:"#f1f2f4", inprogress:"#e9f2ff", review:"#fff7d6", done:"#dcfff1"};
  var st = TS.statuses.find(function(s){return s.id===t.status});
  var stColor = stColors[t.status] || (st ? st.color : "#5e6c84");
  var stBgColor = stBg[t.status] || "#fff";
  var stName = st ? st.name : t.status;

  var g = document.createElementNS("http://www.w3.org/2000/svg","g");
  g.setAttribute("data-pvz-node", n.id);
  g.setAttribute("data-pvz-key", t.key);
  g.setAttribute("transform", "translate("+pos.x+","+pos.y+")");
  g.style.cursor = "grab";

  // Background
  var rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
  rect.setAttribute("width", W); rect.setAttribute("height", H);
  rect.setAttribute("rx", 8);
  rect.setAttribute("fill", "#fff");
  rect.setAttribute("stroke", stColor);
  rect.setAttribute("stroke-width", n.isParent ? 3 : 2);
  rect.setAttribute("filter","url(#pvzShadow)");
  g.appendChild(rect);

  // Status stripe
  var stripe = document.createElementNS("http://www.w3.org/2000/svg","rect");
  stripe.setAttribute("x",0); stripe.setAttribute("y",0); stripe.setAttribute("width",W); stripe.setAttribute("height",24);
  stripe.setAttribute("rx",8);
  stripe.setAttribute("fill", stColor);
  g.appendChild(stripe);

  // Status name in stripe
  var stTxt = document.createElementNS("http://www.w3.org/2000/svg","text");
  stTxt.setAttribute("x", 12); stTxt.setAttribute("y", 16);
  stTxt.setAttribute("fill","#fff"); stTxt.setAttribute("font-size","10"); stTxt.setAttribute("font-weight","700");
  stTxt.setAttribute("font-family","sans-serif"); stTxt.setAttribute("letter-spacing","0.5");
  stTxt.textContent = (stName||"").toUpperCase();
  g.appendChild(stTxt);

  // Key in stripe right
  var keyTxt = document.createElementNS("http://www.w3.org/2000/svg","text");
  keyTxt.setAttribute("x", W-12); keyTxt.setAttribute("y", 16);
  keyTxt.setAttribute("fill","#fff"); keyTxt.setAttribute("font-size","10"); keyTxt.setAttribute("font-weight","600");
  keyTxt.setAttribute("font-family","SF Mono, monospace"); keyTxt.setAttribute("text-anchor","end");
  keyTxt.textContent = t.key;
  g.appendChild(keyTxt);

  // Title
  var title = document.createElementNS("http://www.w3.org/2000/svg","text");
  title.setAttribute("x", 12); title.setAttribute("y", 44);
  title.setAttribute("fill","#172b4d"); title.setAttribute("font-size", n.isParent ? "14" : "13");
  title.setAttribute("font-weight", n.isParent ? "700" : "600");
  title.setAttribute("font-family","-apple-system,sans-serif");
  var maxLen = n.isParent ? 28 : 24;
  title.textContent = t.title.length > maxLen ? t.title.substring(0, maxLen-1)+"…" : t.title;
  g.appendChild(title);

  // Meta line: assignee + due
  var meta = document.createElementNS("http://www.w3.org/2000/svg","text");
  meta.setAttribute("x", 12); meta.setAttribute("y", 62);
  meta.setAttribute("fill","#5e6c84"); meta.setAttribute("font-size","11");
  meta.setAttribute("font-family","-apple-system,sans-serif");
  var asgU = TS.users.find(function(u){return u.id===t.assignee});
  var metaTxt = "👤 " + (asgU?asgU.name:"未割当");
  if (t.dueDate){
    var overdue = (t.dueDate < new Date().toISOString().substr(0,10) && t.status!=="done");
    metaTxt += "  📅 " + t.dueDate + (overdue ? " ⚠" : "");
  }
  meta.textContent = metaTxt;
  g.appendChild(meta);

  // Click to show node popup with actions
  g.addEventListener("click", function(e){
    e.stopPropagation();
    if (g._wasDragged){g._wasDragged = false; return}
    showNodePopup(t, e.clientX, e.clientY);
  });
  // Double-click jumps directly
  g.addEventListener("dblclick", function(e){
    e.stopPropagation();
    closeProcessVisualizer();
    TS.selectedTicket = t.key;
    if (typeof switchView === "function") switchView("ticket");
  });
  // Drag
  g.addEventListener("mousedown", function(e){
    if (e.button !== 0) return;
    e.stopPropagation();
    var stage = document.getElementById("pvzStage");
    if (!stage) return;
    var rect = stage.getBoundingClientRect();
    var sx = (e.clientX - rect.left - PVZ.panX) / PVZ.zoom;
    var sy = (e.clientY - rect.top - PVZ.panY) / PVZ.zoom;
    var p = PVZ.positions[parentKey][n.id];
    PVZ.draggingNode = n.id;
    PVZ._dragOff = {x: sx-p.x, y: sy-p.y};
    g._dragStart = {x:e.clientX, y:e.clientY};
  });
  g.addEventListener("mouseup", function(e){
    if (g._dragStart){
      var moved = Math.abs(e.clientX-g._dragStart.x) + Math.abs(e.clientY-g._dragStart.y);
      g._wasDragged = (moved > 4);
      g._dragStart = null;
    }
  });

  group.appendChild(g);
}

/* ===== Edge drawing ===== */
function pvDrawEdge(group, graph, parentKey, e){
  var fromN = graph.nodes.find(function(n){return n.id===e.from});
  var toN = graph.nodes.find(function(n){return n.id===e.to});
  if (!fromN || !toN) return;
  var fromPos = pvGetPos(graph, parentKey, fromN.id, fromN.x, fromN.y);
  var toPos = pvGetPos(graph, parentKey, toN.id, toN.x, toN.y);
  var fromW = fromN.isParent ? 220 : 200;
  var fromH = fromN.isParent ? 76 : 70;

  // Connection points (right edge of from, left edge of to)
  var x1 = fromPos.x + fromW, y1 = fromPos.y + fromH/2;
  var x2 = toPos.x, y2 = toPos.y + (toN.isParent?38:35);
  var midX = (x1+x2)/2;

  var pathD = "M "+x1+","+y1+" C "+midX+","+y1+" "+midX+","+y2+" "+x2+","+y2;

  var path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill","none");
  if (e.type === "parent"){
    path.setAttribute("stroke", "#a5b3c2");
    path.setAttribute("stroke-width","1.5");
    path.setAttribute("stroke-dasharray","4,3");
    path.setAttribute("marker-end","url(#pvzArrParent)");
  } else {
    path.setAttribute("stroke", "#5e6c84");
    path.setAttribute("stroke-width","2");
    path.setAttribute("marker-end","url(#pvzArr)");
  }
  group.appendChild(path);
}

/* ===== Node action popup ===== */
function showNodePopup(t, clientX, clientY){
  var pop = document.getElementById("pvzNodePop");
  if (!pop) return;
  var stage = document.getElementById("pvzStage");
  var rect = stage.getBoundingClientRect();
  var x = clientX - rect.left + 10;
  var y = clientY - rect.top + 10;
  // Constrain to stage
  if (x + 280 > rect.width) x = rect.width - 290;
  if (y + 320 > rect.height) y = rect.height - 330;

  var stOpts = TS.statuses.map(function(s){return '<option value="'+s.id+'"'+(t.status===s.id?" selected":"")+'>'+escHtml(s.name)+'</option>'}).join("");
  var asgOpts = '<option value="">- 未割当 -</option>'+TS.users.map(function(u){return '<option value="'+u.id+'"'+(t.assignee===u.id?" selected":"")+'>'+escHtml(u.name)+'</option>'}).join("");
  var prOpts = TS.priorities.map(function(p){return '<option value="'+p+'"'+(t.priority===p?" selected":"")+'>'+p+'</option>'}).join("");

  // Available transitions from current ticket workflow
  var trBtns = "";
  if (typeof getAvailableTransitions === "function"){
    var trs = getAvailableTransitions(t);
    if (trs.length){
      trBtns = '<div style="margin-top:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9fadbc;letter-spacing:.5px;margin-bottom:4px">Workflow</div>';
      trs.slice(0,4).forEach(function(tr){
        trBtns += '<button class="pvz-tr-btn" data-tr="'+tr.id+'">'+escHtml(tr.name)+' →</button>';
      });
      trBtns += '</div>';
    }
  }

  pop.innerHTML = '<div class="pvz-pop-h"><span class="pvz-pop-key">'+t.key+'</span><button class="pvz-pop-close">×</button></div>'+
    '<div class="pvz-pop-title">'+escHtml(t.title)+'</div>'+
    '<label>Status</label><select class="pvz-sel" data-act="status">'+stOpts+'</select>'+
    '<label>Assignee</label><select class="pvz-sel" data-act="assignee">'+asgOpts+'</select>'+
    '<label>Priority</label><select class="pvz-sel" data-act="priority">'+prOpts+'</select>'+
    trBtns+
    '<div class="pvz-pop-actions"><button class="btn secondary btn-sm" data-act="open">📋 詳細を開く</button><button class="btn bp btn-sm" data-act="comment">💬 コメント</button></div>';

  pop.style.left = x+"px";
  pop.style.top = y+"px";
  pop.style.display = "block";

  pop.querySelector(".pvz-pop-close").onclick = hidePopup;
  pop.querySelectorAll(".pvz-sel").forEach(function(s){
    s.onchange = function(){
      var act = s.dataset.act;
      var patch = {};
      patch[act] = s.value;
      if (typeof updateTicket === "function"){
        updateTicket(t.key, patch);
        toast("✓ "+t.key+" "+act+"="+s.value);
        // Re-render with new status color
        if (PVZ.parentKey) showProcessVisualizer(PVZ.parentKey);
      }
    };
  });
  // Workflow transitions
  pop.querySelectorAll(".pvz-tr-btn").forEach(function(b){
    b.onclick = function(){
      var trId = b.dataset.tr;
      var wf = (typeof getTicketWorkflow==="function") ? getTicketWorkflow(t) : null;
      if (!wf){toast("ワークフロー未定義",1);return}
      var tr = wf.transitions.find(function(x){return x.id===trId});
      if (!tr) return;
      // Pre-check conditions
      for (var i=0;i<(tr.conditions||[]).length;i++){
        var c = tr.conditions[i];
        var fn = WF_CONDITIONS[c.type||c];
        if (fn){var r=fn.check(t,tr,{});if(!r.ok){toast("条件NG: "+r.msg,1);return}}
      }
      var needsDlg = (tr.validators||[]).length || (tr.postFunctions||[]).some(function(p){return (p.type||p)==="set_resolution"});
      if (needsDlg && typeof showTransitionDlg==="function"){
        hidePopup();
        showTransitionDlg(t, tr);
        // Re-render after closes (heuristic: timeout)
        setTimeout(function(){if(PVZ.parentKey&&PVZ.open)showProcessVisualizer(PVZ.parentKey)}, 400);
      } else {
        var rr = executeTransition(t.key, trId, {});
        if (rr.ok){toast("'"+tr.name+"' 実行"); if(PVZ.parentKey)showProcessVisualizer(PVZ.parentKey)}
        else toast(rr.msg||"失敗",1);
      }
    };
  });
  pop.querySelector('[data-act="open"]').onclick = function(){
    closeProcessVisualizer();
    TS.selectedTicket = t.key;
    if (typeof switchView==="function") switchView("ticket");
  };
  pop.querySelector('[data-act="comment"]').onclick = function(){
    var c = prompt("コメント");
    if (c && c.trim()){
      if (typeof addComment === "function") addComment(t.key, c);
      toast("コメント追加");
    }
  };
}
