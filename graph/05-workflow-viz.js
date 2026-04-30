/* ============================================================
   WORKFLOW VISUALIZER
   - SVG node graph: Status nodes + Transition edges
   - Auto-layout (level-based)
   - Drag nodes to reposition
   - Hover edge for details
   - Pan & zoom
   ============================================================ */

var WFV = {
  positions: {},      // workflowId -> {statusId: {x,y}}
  zoom: 1,
  panX: 0, panY: 0,
  draggingNode: null,
  panning: false,
  drawingEdge: null,
  isDraft: false
};

function loadVizState(){
  try {
    var s = localStorage.getItem("wfvState");
    if (s){ var j = JSON.parse(s); WFV.positions = j.positions||{} }
  } catch(e){}
}
function saveVizState(){
  try { localStorage.setItem("wfvState", JSON.stringify({positions:WFV.positions})); } catch(e){}
}
loadVizState();

/* ===== Auto-layout: rank nodes by reachability from initialStatus ===== */
function autoLayoutWorkflow(wf){
  var levels = {};
  var visited = {};
  function bfs(){
    var queue = [{id:wf.initialStatus, level:0}];
    visited[wf.initialStatus] = true;
    levels[wf.initialStatus] = 0;
    while (queue.length){
      var cur = queue.shift();
      (wf.transitions||[]).forEach(function(tr){
        if ((tr.from||[]).indexOf(cur.id) >= 0 && !visited[tr.to]){
          visited[tr.to] = true;
          levels[tr.to] = cur.level + 1;
          queue.push({id:tr.to, level:cur.level+1});
        }
      });
    }
    // Unvisited -> place at end
    wf.statuses.forEach(function(s){
      if (!visited[s]) levels[s] = Math.max.apply(null, Object.values(levels).concat([0])) + 1;
    });
  }
  bfs();
  // Group by level, distribute vertically
  var byLevel = {};
  wf.statuses.forEach(function(s){
    var l = levels[s] || 0;
    if (!byLevel[l]) byLevel[l] = [];
    byLevel[l].push(s);
  });
  var positions = {};
  var levelKeys = Object.keys(byLevel).map(Number).sort(function(a,b){return a-b});
  var COL_W = 200, ROW_H = 100, MARGIN = 60;
  levelKeys.forEach(function(lv, ci){
    byLevel[lv].forEach(function(s, ri){
      positions[s] = {x: MARGIN + ci * COL_W, y: MARGIN + ri * ROW_H};
    });
  });
  return positions;
}

function getNodePos(wfId, statusId, wf){
  if (!WFV.positions[wfId]) WFV.positions[wfId] = autoLayoutWorkflow(wf);
  if (!WFV.positions[wfId][statusId]){
    var auto = autoLayoutWorkflow(wf);
    WFV.positions[wfId][statusId] = auto[statusId] || {x:60, y:60};
  }
  return WFV.positions[wfId][statusId];
}

/* ===== Render workflow as SVG graph ===== */
function renderWorkflowVisualizer(container, wf, opts){
  opts = opts || {};
  var wfId = opts.wfId || wf.id;
  var isDraft = !!opts.isDraft;
  var draft = opts.draft;
  WFV.isDraft = isDraft;
  WFV.currentWfId = wfId;
  if (!wf || !wf.statuses){
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔀</div><div class="empty-state-title">ステータスなし</div></div>';
    return;
  }

  // Toolbar - show different buttons based on draft state
  var toolbar = document.createElement("div");
  toolbar.className = "wfv-toolbar";
  var tbHtml = '<button class="btn secondary" id="wfvAuto">⚡ Auto Layout</button>'+
    '<button class="btn secondary" id="wfvZoomIn">＋</button>'+
    '<button class="btn secondary" id="wfvZoomOut">－</button>'+
    '<button class="btn secondary" id="wfvReset">⊕ Reset</button>';
  if (isDraft){
    tbHtml += '<button class="btn bp" id="wfvAddStatus" style="margin-left:8px">+ Status追加</button>';
    tbHtml += '<div style="font-size:11px;color:var(--ac);margin-left:auto;font-weight:600;line-height:1.4;text-align:right">';
    tbHtml += '✎ <b>DRAFT 編集中</b><br>';
    tbHtml += '<span style="font-weight:400">青ポート(→)からドラッグ=遷移作成 / 線クリック=メニュー / ノード右クリック=削除メニュー</span>';
    tbHtml += '</div>';
  } else {
    tbHtml += '<span style="font-size:12px;color:var(--t2);margin-left:auto">📖 閲覧モード — <b>Edit</b>ボタンを押すと編集できます</span>';
  }
  toolbar.innerHTML = tbHtml;
  container.innerHTML = "";
  container.appendChild(toolbar);

  var stage = document.createElement("div");
  stage.className = "wfv-stage";
  stage.style.cssText = "flex:1;overflow:auto;position:relative;background:var(--b2);background-image:radial-gradient(circle, var(--bd) 1px, transparent 1px);background-size:20px 20px;background-position:0 0;cursor:"+(isDraft?"crosshair":"grab");
  container.appendChild(stage);

  // Compute SVG size needed
  if (!wf.statuses.length){
    stage.innerHTML = '<div class="empty-state" style="padding:60px"><div class="empty-state-icon">🔀</div><div class="empty-state-title">ステータスがありません</div><div class="empty-state-text">ツールバーの「+ Status」ボタンから追加してください</div></div>';
    bindWfvToolbar(toolbar, container, wf, opts);
    return;
  }

  var positions = {};
  wf.statuses.forEach(function(s){positions[s] = getNodePos(wf.id, s, wf)});
  var maxX = 0, maxY = 0;
  Object.keys(positions).forEach(function(k){
    if (positions[k].x > maxX) maxX = positions[k].x;
    if (positions[k].y > maxY) maxY = positions[k].y;
  });
  var svgW = Math.max(1200, maxX + 300);
  var svgH = Math.max(600, maxY + 200);

  var svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("width", svgW);
  svg.setAttribute("height", svgH);
  svg.style.cssText = "position:absolute;top:0;left:0;transform-origin:0 0;transform:translate("+WFV.panX+"px,"+WFV.panY+"px) scale("+WFV.zoom+")";
  svg.id = "wfvSvg";

  // Defs: arrow markers, drop shadows
  svg.innerHTML = '<defs>'+
    '<marker id="wfvArrow" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto">'+
      '<path d="M0,0 L12,5 L0,10 L3,5 Z" fill="#5e6c84"/></marker>'+
    '<marker id="wfvArrowHover" markerWidth="14" markerHeight="12" refX="13" refY="6" orient="auto">'+
      '<path d="M0,0 L14,6 L0,12 L4,6 Z" fill="#0c66e4"/></marker>'+
    '<filter id="wfvShadow" x="-20%" y="-20%" width="140%" height="140%">'+
      '<feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/></filter>'+
    '</defs>';

  // Group transitions by (from,to) to compute curve offsets for parallel edges
  var edgeMap = {};
  (wf.transitions||[]).forEach(function(tr){
    (tr.from||["*"]).forEach(function(from){
      var k = from + "→" + tr.to;
      if (!edgeMap[k]) edgeMap[k] = [];
      edgeMap[k].push(tr);
    });
  });

  // Render edges first (so nodes overlay)
  var edgesGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
  edgesGroup.setAttribute("class","wfv-edges");
  Object.keys(edgeMap).forEach(function(k){
    var parts = k.split("→");
    var from = parts[0], to = parts[1];
    var transList = edgeMap[k];
    transList.forEach(function(tr, i){
      drawEdge(edgesGroup, wf, from, to, tr, i, transList.length, positions);
    });
  });
  // Self-loops & global transitions
  (wf.transitions||[]).forEach(function(tr){
    if (!tr.from || !tr.from.length || tr.from.indexOf("*")>=0){
      // Global - draw a small "any" badge near the to-node
      drawGlobalEdge(edgesGroup, wf, tr, positions);
    }
  });
  svg.appendChild(edgesGroup);

  // Drawing edge preview layer
  var drawingG = document.createElementNS("http://www.w3.org/2000/svg","g");
  drawingG.setAttribute("id","wfvDrawing");
  svg.appendChild(drawingG);

  // Render nodes
  var nodesGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
  nodesGroup.setAttribute("class","wfv-nodes");
  wf.statuses.forEach(function(sid){
    drawNode(nodesGroup, wf, sid, positions[sid]);
  });
  svg.appendChild(nodesGroup);

  stage.appendChild(svg);

  // Tooltip layer
  var tooltip = document.createElement("div");
  tooltip.className = "wfv-tooltip";
  tooltip.style.cssText = "position:absolute;background:#1d2125;color:#fff;padding:8px 12px;border-radius:4px;font-size:12px;pointer-events:none;z-index:100;display:none;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:280px";
  stage.appendChild(tooltip);

  // === Bindings ===
  bindWfvToolbar(toolbar, container, wf, opts);

  // Wheel zoom
  stage.addEventListener("wheel", function(e){
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.1 : 0.9;
    WFV.zoom = Math.max(0.3, Math.min(3, WFV.zoom * factor));
    applyTransform(svg);
  }, {passive:false});

  // Pan
  stage.addEventListener("mousedown", function(e){
    if (e.target === stage || e.target === svg){
      WFV.panning = true;
      WFV._panStart = {x:e.clientX, y:e.clientY, panX:WFV.panX, panY:WFV.panY};
      stage.style.cursor = "grabbing";
    }
  });

  // Remove previous document-level listeners before adding new ones
  if (WFV._docMove) document.removeEventListener("mousemove", WFV._docMove);
  if (WFV._docUp) document.removeEventListener("mouseup", WFV._docUp);

  WFV._docMove = function(e){
    if (WFV.panning){
      WFV.panX = WFV._panStart.panX + (e.clientX - WFV._panStart.x);
      WFV.panY = WFV._panStart.panY + (e.clientY - WFV._panStart.y);
      var s = document.getElementById("wfvSvg");
      if (s) s.style.transform = "translate("+WFV.panX+"px,"+WFV.panY+"px) scale("+WFV.zoom+")";
    }
    if (WFV.draggingNode){
      e.preventDefault();
      var st = document.querySelector(".wfv-stage");
      if (!st) return;
      var rect = st.getBoundingClientRect();
      var sx = (e.clientX - rect.left + st.scrollLeft - WFV.panX) / WFV.zoom;
      var sy = (e.clientY - rect.top + st.scrollTop - WFV.panY) / WFV.zoom;
      var pos = WFV.positions[WFV.currentWfId] && WFV.positions[WFV.currentWfId][WFV.draggingNode];
      if (!pos) return;
      pos.x = Math.max(0, sx - WFV._dragOffset.x);
      pos.y = Math.max(0, sy - WFV._dragOffset.y);
      WFV._wasDragged = true;

      // Update node transform IMMEDIATELY so the box follows the cursor
      var nodeEl = document.querySelector('[data-status="'+WFV.draggingNode+'"]');
      if (nodeEl){
        nodeEl.setAttribute("transform","translate("+pos.x+","+pos.y+")");
      }

      // Grow SVG if dragging near edge
      var svg2 = document.getElementById("wfvSvg");
      if (svg2){
        var curW = parseInt(svg2.getAttribute("width"));
        var curH = parseInt(svg2.getAttribute("height"));
        if (pos.x + 250 > curW) svg2.setAttribute("width", pos.x + 400);
        if (pos.y + 150 > curH) svg2.setAttribute("height", pos.y + 250);
      }

      // Update edges (lightweight: only update path d= for connected edges)
      wfvUpdateConnectedEdgesLight(WFV.draggingNode);
    }
    if (WFV.drawingEdge){
      var dgEl = document.getElementById("wfvDrawing");
      if (!dgEl) return;
      var st = document.querySelector(".wfv-stage");
      if (!st) return;
      var rect = st.getBoundingClientRect();
      var fromPos = WFV.positions[WFV.currentWfId][WFV.drawingEdge.from];
      if (!fromPos) return;
      var x1 = fromPos.x + 140, y1 = fromPos.y + 28;
      var x2 = (e.clientX - rect.left + st.scrollLeft - WFV.panX) / WFV.zoom;
      var y2 = (e.clientY - rect.top + st.scrollTop - WFV.panY) / WFV.zoom;
      var midX = (x1+x2)/2;
      var d = "M "+x1+","+y1+" C "+midX+","+y1+" "+midX+","+y2+" "+x2+","+y2;
      dgEl.innerHTML = '<path d="'+d+'" stroke="#0c66e4" stroke-width="2.5" fill="none" stroke-dasharray="4,3" marker-end="url(#wfvArrowHover)"/>';
    }
  };
  WFV._docUp = function(e){
    if (WFV.panning){
      WFV.panning = false;
      var st = document.querySelector(".wfv-stage");
      if (st) st.style.cursor = WFV.isDraft ? "crosshair" : "grab";
    }
    if (WFV.draggingNode){
      WFV.draggingNode = null; saveVizState();
      // Now that node moved, redraw edges
      if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
      setTimeout(function(){WFV._wasDragged = false}, 100);
    }
    if (WFV.drawingEdge && WFV.isDraft){
      // Find target status under cursor
      var st = document.querySelector(".wfv-stage");
      if (!st){WFV.drawingEdge = null; return}
      var rect = st.getBoundingClientRect();
      var mx = (e.clientX - rect.left + st.scrollLeft - WFV.panX) / WFV.zoom;
      var my = (e.clientY - rect.top + st.scrollTop - WFV.panY) / WFV.zoom;
      var draftLocal = TS.workflowDrafts && TS.workflowDrafts[WFV.currentWfId];
      var targetStatus = null;
      if (draftLocal){
        draftLocal.statuses.forEach(function(sid){
          var p = WFV.positions[WFV.currentWfId][sid];
          if (p && mx >= p.x && mx <= p.x+140 && my >= p.y && my <= p.y+56 && sid !== WFV.drawingEdge.from){
            targetStatus = sid;
          }
        });
      }
      if (targetStatus && draftLocal){
        // Check duplicate
        var dup = (draftLocal.transitions||[]).find(function(tr){
          return tr.to === targetStatus && tr.from && tr.from.indexOf(WFV.drawingEdge.from) >= 0;
        });
        if (dup){
          if (typeof toast === "function") toast("既に同じ遷移が存在します", 1);
        } else {
          var fromName = (TS.statuses.find(function(s){return s.id===WFV.drawingEdge.from})||{name:WFV.drawingEdge.from}).name;
          var toName = (TS.statuses.find(function(s){return s.id===targetStatus})||{name:targetStatus}).name;
          var fromId = WFV.drawingEdge.from;
          var toId = targetStatus;
          var wfIdLocal = WFV.currentWfId;
          setTimeout(function(){
            var html = '<h3>+ 遷移作成</h3>';
            html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px"><b>'+escHtml(fromName)+'</b> → <b>'+escHtml(toName)+'</b></div>';
            html += '<label>遷移名 *</label><input id="newTrName" placeholder="例: '+escHtml(toName)+'に進める" value="'+escHtml(toName+"に進める")+'">';
            html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="newTrOk">+ 作成</button></div>';
            showModal(html);
            var inp = document.getElementById("newTrName");
            if (inp){
              setTimeout(function(){inp.focus(); inp.select()}, 50);
              inp.onkeydown = function(ev){if(ev.key==="Enter"){document.getElementById("newTrOk").click()}};
            }
            document.getElementById("newTrOk").onclick = function(){
              var trName = document.getElementById("newTrName").value.trim();
              if (!trName){toast("遷移名必須",1);return}
              if (typeof urCapture === "function") urCapture("遷移作成", true);
              draftLocal.transitions = draftLocal.transitions || [];
              draftLocal.transitions.push({
                id: "tr-"+Date.now(),
                name: trName,
                from: [fromId],
                to: toId,
                conditions: [], validators: [], postFunctions: []
              });
              saveDraft(wfIdLocal, draftLocal);
              closeModal();
              if (typeof toast === "function") toast("✓ 遷移作成: "+trName);
              if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
            };
          }, 50);
        }
      }
      var dgEl = document.getElementById("wfvDrawing");
      if (dgEl) dgEl.innerHTML = "";
      WFV.drawingEdge = null;
    }
  };
  document.addEventListener("mousemove", WFV._docMove);
  document.addEventListener("mouseup", WFV._docUp);

  // Edge hover/click handlers via event delegation
  // (Important: edges layer can be rebuilt during drag; delegation makes handlers persistent)
  function findEdgeTarget(e){
    var t = e.target;
    while (t && t !== edgesGroup){
      if (t.dataset && t.dataset.trId) return t;
      t = t.parentNode;
    }
    return null;
  }
  edgesGroup.addEventListener("mouseover", function(e){
    var el = findEdgeTarget(e);
    if (!el) return;
    if (!el.dataset.tip) return;
    tooltip.innerHTML = el.dataset.tip + (isDraft ? '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #444;color:#79e2f2;font-size:10px">クリックでメニュー表示</div>' : '');
    tooltip.style.display = "block";
  });
  edgesGroup.addEventListener("mousemove", function(e){
    var el = findEdgeTarget(e);
    if (!el) return;
    var rect = stage.getBoundingClientRect();
    tooltip.style.left = (e.clientX - rect.left + 12) + "px";
    tooltip.style.top = (e.clientY - rect.top + 12) + "px";
  });
  edgesGroup.addEventListener("mouseout", function(e){
    // Hide tooltip when leaving edges area
    var to = e.relatedTarget;
    if (!to || !edgesGroup.contains(to)) tooltip.style.display = "none";
  });
  if (isDraft){
    edgesGroup.addEventListener("click", function(e){
      var el = findEdgeTarget(e);
      if (!el) return;
      e.stopPropagation();
      var trId = el.dataset.trId;
      if (!trId) return;
      // Re-fetch latest draft each time (in case it was rebuilt)
      var currentDraft = TS.workflowDrafts[wfId];
      wfvShowEdgeMenu(trId, wfId, currentDraft, e.clientX, e.clientY);
    });
    edgesGroup.addEventListener("dblclick", function(e){
      var el = findEdgeTarget(e);
      if (!el) return;
      e.stopPropagation();
      var trId = el.dataset.trId;
      if (trId && typeof wfTransitionDlg === "function") wfTransitionDlg(wfId, trId);
    });
    edgesGroup.addEventListener("contextmenu", function(e){
      var el = findEdgeTarget(e);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      var trId = el.dataset.trId;
      if (!trId) return;
      var currentDraft = TS.workflowDrafts[wfId];
      if (!currentDraft) return;
      var tr = (currentDraft.transitions||[]).find(function(t){return t.id===trId});
      if (!tr) return;
      if (confirm("遷移を削除しますか?\n"+tr.name)){
        if (typeof urCapture === "function") urCapture("遷移削除", true);
        currentDraft.transitions = currentDraft.transitions.filter(function(t){return t.id!==trId});
        saveDraft(wfId, currentDraft);
        if (typeof toast === "function") toast("遷移削除");
        if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
      }
    });
  }

  // Node interactions
  nodesGroup.querySelectorAll("[data-status]").forEach(function(el){
    var sid = el.dataset.status;
    el.style.cursor = isDraft ? "move" : "grab";

    // Mousedown on body = drag, on port = edge create
    el.addEventListener("mousedown", function(e){
      e.stopPropagation();
      WFV._wasDragged = false;
      // Click on × delete button
      var delEl = e.target.closest && e.target.closest(".wfv-node-del");
      if (delEl && isDraft){
        e.preventDefault();
        wfvHandleNodeAction("delete", sid, wfId, draft);
        return;
      }
      // Port = edge create (only in draft mode)
      if (e.target.classList && e.target.classList.contains("wfv-port-out") && isDraft){
        WFV.drawingEdge = {from: sid};
        return;
      }
      // Node body = drag
      var rect = stage.getBoundingClientRect();
      var sx = (e.clientX - rect.left + stage.scrollLeft - WFV.panX) / WFV.zoom;
      var sy = (e.clientY - rect.top + stage.scrollTop - WFV.panY) / WFV.zoom;
      var pos = WFV.positions[wf.id][sid];
      WFV.draggingNode = sid;
      WFV._dragOffset = {x: sx - pos.x, y: sy - pos.y};
    });

    if (isDraft){
      // Double click = rename / edit
      el.addEventListener("dblclick", function(e){
        e.stopPropagation();
        wfvEditStatus(sid, wfId, draft);
      });
      // Right click = context menu
      el.addEventListener("contextmenu", function(e){
        e.preventDefault();
        e.stopPropagation();
        wfvShowNodeMenu(sid, wfId, draft, e.clientX, e.clientY);
      });
    }
  });

  function applyTransform(s){
    s.style.transform = "translate("+WFV.panX+"px,"+WFV.panY+"px) scale("+WFV.zoom+")";
  }
}

/* Bind toolbar buttons (extracted so we can call from empty-state too) */
function bindWfvToolbar(toolbar, container, wf, opts){
  opts = opts || {};
  var wfId = opts.wfId || wf.id;
  var isDraft = !!opts.isDraft;
  var draft = opts.draft;

  var ab = toolbar.querySelector("#wfvAuto");
  if (ab) ab.onclick = function(){
    WFV.positions[wf.id] = autoLayoutWorkflow(wf);
    saveVizState();
    if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
  };
  var zi = toolbar.querySelector("#wfvZoomIn");
  if (zi) zi.onclick = function(){
    WFV.zoom = Math.min(2, WFV.zoom*1.2);
    var s = document.getElementById("wfvSvg");
    if (s) s.style.transform = "translate("+WFV.panX+"px,"+WFV.panY+"px) scale("+WFV.zoom+")";
  };
  var zo = toolbar.querySelector("#wfvZoomOut");
  if (zo) zo.onclick = function(){
    WFV.zoom = Math.max(0.4, WFV.zoom/1.2);
    var s = document.getElementById("wfvSvg");
    if (s) s.style.transform = "translate("+WFV.panX+"px,"+WFV.panY+"px) scale("+WFV.zoom+")";
  };
  var rs = toolbar.querySelector("#wfvReset");
  if (rs) rs.onclick = function(){
    WFV.zoom = 1; WFV.panX = 0; WFV.panY = 0;
    var s = document.getElementById("wfvSvg");
    if (s) s.style.transform = "translate(0px,0px) scale(1)";
  };
  var addS = toolbar.querySelector("#wfvAddStatus");
  if (addS && isDraft) addS.onclick = function(){
    if (typeof wfAddStatusDlg === "function") wfAddStatusDlg(wfId);
  };
}

/* Edit status dialog (rename) */
function wfvEditStatus(statusId, wfId, draft){
  var st = TS.statuses.find(function(s){return s.id===statusId});
  if (!st) return;
  var newName = prompt("ステータス名を変更", st.name);
  if (newName && newName.trim() && newName !== st.name){
    if (typeof urCapture === "function") urCapture("ステータス名変更", true);
    st.name = newName.trim();
    saveTS();
    if (typeof toast === "function") toast("✓ "+st.name);
    if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
  }
}

/* Right-click node menu */
function wfvShowNodeMenu(statusId, wfId, draft, clientX, clientY){
  // Remove existing menu
  var old = document.getElementById("wfvNodeMenu");
  if (old) old.remove();

  var menu = document.createElement("div");
  menu.id = "wfvNodeMenu";
  menu.style.cssText = "position:fixed;left:"+clientX+"px;top:"+clientY+"px;background:var(--b1);border:1px solid var(--bd);border-radius:6px;padding:4px;box-shadow:0 8px 24px rgba(9,30,66,.25);z-index:5000;font-size:13px;min-width:180px";

  var items = [
    {label:"✎ 名前を変更",  act:"rename"},
    {label:"⚑ 初期Statusに設定", act:"setInitial"},
    {label:"🎨 色を変更", act:"color"},
    {label:"───", act:null},
    {label:"🗑 削除", act:"delete", danger:true}
  ];
  items.forEach(function(it){
    if (it.act === null){
      var sep = document.createElement("div");
      sep.style.cssText = "border-top:1px solid var(--bd);margin:4px 0";
      menu.appendChild(sep);
      return;
    }
    var btn = document.createElement("button");
    btn.style.cssText = "display:block;width:100%;padding:6px 12px;background:none;border:none;text-align:left;font-size:13px;color:"+(it.danger?"var(--dn)":"var(--t1)")+";cursor:pointer;border-radius:3px;font-family:inherit";
    btn.textContent = it.label;
    btn.onmouseover = function(){btn.style.background = "var(--b3)"};
    btn.onmouseout = function(){btn.style.background = "none"};
    btn.onclick = function(){
      menu.remove();
      wfvHandleNodeAction(it.act, statusId, wfId, draft);
    };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);

  // Close on click outside
  setTimeout(function(){
    var closer = function(ev){
      if (!menu.contains(ev.target)){menu.remove(); document.removeEventListener("mousedown", closer)}
    };
    document.addEventListener("mousedown", closer);
  }, 50);
}

function wfvHandleNodeAction(act, statusId, wfId, draft){
  var st = TS.statuses.find(function(s){return s.id===statusId});
  if (!st) return;
  if (act === "rename"){
    wfvEditStatus(statusId, wfId, draft);
  } else if (act === "setInitial"){
    if (!draft){toast("Draftモードでのみ可能",1);return}
    if (typeof urCapture === "function") urCapture("初期Status変更", true);
    draft.initialStatus = statusId;
    saveDraft(wfId, draft);
    if (typeof toast === "function") toast("✓ 初期Status: "+st.name);
    if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
  } else if (act === "color"){
    var newColor = prompt("色 (HEX例: #1868db)", st.color || "#5e6c84");
    if (newColor && /^#[0-9a-fA-F]{6}$/.test(newColor)){
      if (typeof urCapture === "function") urCapture("Status色変更", true);
      st.color = newColor;
      saveTS();
      if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
    }
  } else if (act === "delete"){
    if (!draft){toast("Draftモードでのみ可能",1);return}
    if (draft.statuses.length <= 1){toast("最低1つのStatus必要",1);return}
    if (draft.initialStatus === statusId){toast("初期Statusは削除不可。先に別のステータスを初期に設定してください",1);return}
    if (confirm("Statusをこのワークフローから削除しますか?\n"+st.name+"\n\n（マスタの定義は残ります）")){
      if (typeof urCapture === "function") urCapture("Status削除", true);
      draft.statuses = draft.statuses.filter(function(s){return s!==statusId});
      // Remove transitions touching this status
      draft.transitions = (draft.transitions||[]).filter(function(tr){
        return tr.to !== statusId && (!tr.from || tr.from.indexOf(statusId) < 0);
      });
      saveDraft(wfId, draft);
      if (typeof toast === "function") toast("削除");
      if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
    }
  }
}

/* Edge action menu */
function wfvShowEdgeMenu(trId, wfId, draft, clientX, clientY){
  var old = document.getElementById("wfvEdgeMenu");
  if (old) old.remove();
  var tr = (draft.transitions||[]).find(function(t){return t.id===trId});
  if (!tr) return;

  var menu = document.createElement("div");
  menu.id = "wfvEdgeMenu";
  menu.style.cssText = "position:fixed;left:"+clientX+"px;top:"+clientY+"px;background:var(--b1);border:1px solid var(--bd);border-radius:6px;padding:4px;box-shadow:0 8px 24px rgba(9,30,66,.25);z-index:5000;font-size:13px;min-width:200px";

  // Header showing transition name
  var hdr = document.createElement("div");
  hdr.style.cssText = "padding:8px 12px;border-bottom:1px solid var(--bd);font-weight:600;color:var(--t1);font-size:13px";
  hdr.textContent = "→ " + tr.name;
  menu.appendChild(hdr);

  var items = [
    {label:"✎ 名前を変更", act:"rename"},
    {label:"⚙ 詳細編集 (条件・検証など)", act:"edit"},
    {label:"───", act:null},
    {label:"🗑 削除", act:"delete", danger:true}
  ];
  items.forEach(function(it){
    if (it.act === null){
      var sep = document.createElement("div");
      sep.style.cssText = "border-top:1px solid var(--bd);margin:4px 0";
      menu.appendChild(sep);
      return;
    }
    var btn = document.createElement("button");
    btn.style.cssText = "display:block;width:100%;padding:6px 12px;background:none;border:none;text-align:left;font-size:13px;color:"+(it.danger?"var(--dn)":"var(--t1)")+";cursor:pointer;border-radius:3px;font-family:inherit";
    btn.textContent = it.label;
    btn.onmouseover = function(){btn.style.background = "var(--b3)"};
    btn.onmouseout = function(){btn.style.background = "none"};
    btn.onclick = function(){
      menu.remove();
      if (it.act === "rename"){
        var newName = prompt("遷移名を変更", tr.name);
        if (newName && newName.trim() && newName !== tr.name){
          if (typeof urCapture === "function") urCapture("遷移名変更", true);
          tr.name = newName.trim();
          saveDraft(wfId, draft);
          toast("✓ "+tr.name);
          if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
        }
      } else if (it.act === "edit"){
        if (typeof wfTransitionDlg === "function") wfTransitionDlg(wfId, trId);
      } else if (it.act === "delete"){
        if (confirm("遷移を削除しますか?\n"+tr.name)){
          if (typeof urCapture === "function") urCapture("遷移削除", true);
          draft.transitions = draft.transitions.filter(function(t){return t.id!==trId});
          saveDraft(wfId, draft);
          toast("削除");
          if (typeof renderWorkflowCanvas === "function") renderWorkflowCanvas();
        }
      }
    };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  setTimeout(function(){
    var closer = function(ev){
      if (!menu.contains(ev.target)){menu.remove(); document.removeEventListener("mousedown", closer)}
    };
    document.addEventListener("mousedown", closer);
  }, 50);
}

/* Update only edges touching a node during drag (efficient) */
/* Lightweight: just update path d= attributes for edges connected to dragging node.
   Avoids DOM replacement which can cause flicker/race conditions during drag. */
function wfvUpdateConnectedEdgesLight(statusId){
  var wfId = WFV.currentWfId;
  if (!wfId) return;
  var positions = WFV.positions[wfId];
  if (!positions) return;
  var svg = document.getElementById("wfvSvg");
  if (!svg) return;
  var edgesGroup = svg.querySelector(".wfv-edges");
  if (!edgesGroup) return;
  // For each path with data-tr-id, recompute d if its endpoints are affected
  edgesGroup.querySelectorAll("[data-tr-id]").forEach(function(hitPath){
    var trId = hitPath.dataset.trId;
    var fromId = hitPath.dataset.from;
    var toId = hitPath.dataset.to;
    if (!fromId || !toId) return;
    if (fromId !== statusId && toId !== statusId) return;
    var fp = positions[fromId];
    var tp = positions[toId];
    if (!fp || !tp) return;
    var x1 = fp.x + 140, y1 = fp.y + 28;
    var x2 = tp.x, y2 = tp.y + 28;
    // Match drawEdge bezier
    var midX = (x1+x2)/2;
    var d = "M "+x1+","+y1+" C "+midX+","+y1+" "+midX+","+y2+" "+x2+","+y2;
    hitPath.setAttribute("d", d);
    // Find sibling visible path (same trId or directly after hit path) and update too
    var visible = hitPath.nextElementSibling;
    while (visible && visible.tagName !== "path"){visible = visible.nextElementSibling}
    if (visible && visible.tagName === "path") visible.setAttribute("d", d);
  });
}

function wfvUpdateConnectedEdges(statusId){
  var wfId = WFV.currentWfId;
  if (!wfId) return;
  var wf = TS.workflowDrafts[wfId] || (TS.workflows||[]).find(function(w){return w.id===wfId});
  if (!wf) return;
  var positions = WFV.positions[wfId];
  if (!positions) return;
  // Rebuild edges layer (simpler than tracking individual edges)
  var svg = document.getElementById("wfvSvg");
  if (!svg) return;
  var oldEdges = svg.querySelector(".wfv-edges");
  if (!oldEdges) return;
  var newEdges = document.createElementNS("http://www.w3.org/2000/svg","g");
  newEdges.setAttribute("class","wfv-edges");
  var edgeMap = {};
  (wf.transitions||[]).forEach(function(tr){
    (tr.from||["*"]).forEach(function(from){
      var k = from + "→" + tr.to;
      if (!edgeMap[k]) edgeMap[k] = [];
      edgeMap[k].push(tr);
    });
  });
  Object.keys(edgeMap).forEach(function(k){
    var parts = k.split("→");
    var transList = edgeMap[k];
    transList.forEach(function(tr, i){
      drawEdge(newEdges, wf, parts[0], parts[1], tr, i, transList.length, positions);
    });
  });
  (wf.transitions||[]).forEach(function(tr){
    if (!tr.from||!tr.from.length||tr.from.indexOf("*")>=0) drawGlobalEdge(newEdges, wf, tr, positions);
  });
  oldEdges.parentNode.replaceChild(newEdges, oldEdges);
}

function updateNodeAndEdges(wf, statusId){
  // Re-position the dragged node
  var nodeEl = document.querySelector('[data-status="'+statusId+'"]');
  if (!nodeEl) return;
  var pos = WFV.positions[wf.id][statusId];
  nodeEl.setAttribute("transform", "translate("+pos.x+","+pos.y+")");
  // Re-draw edges that touch this node
  var svg = document.getElementById("wfvSvg");
  if (!svg) return;
  // Just rebuild edges layer
  var oldEdges = svg.querySelector(".wfv-edges");
  if (oldEdges){
    var positions = {};
    wf.statuses.forEach(function(s){positions[s] = WFV.positions[wf.id][s]});
    var newEdges = document.createElementNS("http://www.w3.org/2000/svg","g");
    newEdges.setAttribute("class","wfv-edges");
    var edgeMap = {};
    (wf.transitions||[]).forEach(function(tr){
      (tr.from||["*"]).forEach(function(from){
        var k = from + "→" + tr.to;
        if (!edgeMap[k]) edgeMap[k] = [];
        edgeMap[k].push(tr);
      });
    });
    Object.keys(edgeMap).forEach(function(k){
      var parts = k.split("→");
      var transList = edgeMap[k];
      transList.forEach(function(tr, i){drawEdge(newEdges, wf, parts[0], parts[1], tr, i, transList.length, positions)});
    });
    (wf.transitions||[]).forEach(function(tr){
      if (!tr.from||!tr.from.length||tr.from.indexOf("*")>=0) drawGlobalEdge(newEdges, wf, tr, positions);
    });
    oldEdges.parentNode.replaceChild(newEdges, oldEdges);
  }
}

/* ===== Draw a single status node ===== */
function drawNode(group, wf, statusId, pos){
  var st = TS.statuses.find(function(x){return x.id===statusId});
  var name = st ? st.name : statusId;
  var color = st ? st.color : "#5e6c84";
  var category = (statusId==="done"?"done":(statusId==="inprogress"||statusId==="review")?"inprogress":"todo");
  var isInit = wf.initialStatus === statusId;

  var W = 140, H = 56;
  var g = document.createElementNS("http://www.w3.org/2000/svg","g");
  g.setAttribute("data-status", statusId);
  g.setAttribute("transform", "translate("+pos.x+","+pos.y+")");

  // Background pill
  var rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
  rect.setAttribute("width", W);
  rect.setAttribute("height", H);
  rect.setAttribute("rx", 8);
  rect.setAttribute("ry", 8);
  rect.setAttribute("fill", "#fff");
  rect.setAttribute("stroke", color);
  rect.setAttribute("stroke-width", 2);
  rect.setAttribute("filter", "url(#wfvShadow)");
  g.appendChild(rect);

  // Color stripe top
  var stripe = document.createElementNS("http://www.w3.org/2000/svg","rect");
  stripe.setAttribute("x", 0);
  stripe.setAttribute("y", 0);
  stripe.setAttribute("width", W);
  stripe.setAttribute("height", 6);
  stripe.setAttribute("rx", 8);
  stripe.setAttribute("ry", 8);
  stripe.setAttribute("fill", color);
  g.appendChild(stripe);

  // INITIAL badge
  if (isInit){
    var badge = document.createElementNS("http://www.w3.org/2000/svg","g");
    badge.setAttribute("transform","translate(-4,-12)");
    var br = document.createElementNS("http://www.w3.org/2000/svg","rect");
    br.setAttribute("width",60);br.setAttribute("height",16);br.setAttribute("rx",8);br.setAttribute("ry",8);
    br.setAttribute("fill","#22a06b");
    badge.appendChild(br);
    var bt = document.createElementNS("http://www.w3.org/2000/svg","text");
    bt.setAttribute("x",30);bt.setAttribute("y",11);bt.setAttribute("text-anchor","middle");bt.setAttribute("fill","#fff");bt.setAttribute("font-size","9");bt.setAttribute("font-weight","700");bt.setAttribute("font-family","sans-serif");
    bt.textContent="INITIAL";
    badge.appendChild(bt);
    g.appendChild(badge);
  }

  // Status name
  var text = document.createElementNS("http://www.w3.org/2000/svg","text");
  text.setAttribute("x", W/2);
  text.setAttribute("y", H/2 + 4);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("fill", "#172b4d");
  text.setAttribute("font-size", "13");
  text.setAttribute("font-weight", "600");
  text.setAttribute("font-family", "-apple-system,sans-serif");
  text.textContent = name.length > 14 ? name.substring(0,12)+"…" : name;
  g.appendChild(text);

  // Category label
  var cat = document.createElementNS("http://www.w3.org/2000/svg","text");
  cat.setAttribute("x", W/2);
  cat.setAttribute("y", H - 6);
  cat.setAttribute("text-anchor", "middle");
  cat.setAttribute("fill", "#8590a2");
  cat.setAttribute("font-size", "9");
  cat.setAttribute("font-family", "sans-serif");
  cat.setAttribute("text-transform","uppercase");
  cat.textContent = category.toUpperCase();
  g.appendChild(cat);

  // Ticket count using this status
  if (typeof TS !== "undefined" && TS.tickets){
    var cnt = TS.tickets.filter(function(t){
      var tWf = (typeof getTicketWorkflow==="function") ? getTicketWorkflow(t) : null;
      return t.status === statusId && tWf && tWf.id === wf.id;
    }).length;
    if (cnt > 0){
      var cb = document.createElementNS("http://www.w3.org/2000/svg","g");
      cb.setAttribute("transform","translate("+(W-22)+",-10)");
      var cc = document.createElementNS("http://www.w3.org/2000/svg","circle");
      cc.setAttribute("r",10);cc.setAttribute("fill","#0c66e4");
      cb.appendChild(cc);
      var ct = document.createElementNS("http://www.w3.org/2000/svg","text");
      ct.setAttribute("text-anchor","middle");ct.setAttribute("y",4);ct.setAttribute("fill","#fff");ct.setAttribute("font-size","10");ct.setAttribute("font-weight","700");
      ct.textContent = cnt > 99 ? "99+" : cnt;
      cb.appendChild(ct);
      g.appendChild(cb);
    }
  }

  // Output port for drag-to-create edge (only in draft mode)
  if (WFV.isDraft){
    var port = document.createElementNS("http://www.w3.org/2000/svg","circle");
    port.setAttribute("cx", W);
    port.setAttribute("cy", H/2);
    port.setAttribute("r", 8);
    port.setAttribute("fill","#0c66e4");
    port.setAttribute("stroke","#fff");
    port.setAttribute("stroke-width","2");
    port.setAttribute("class","wfv-port-out");
    port.style.cursor = "crosshair";
    port.style.pointerEvents = "all";
    g.appendChild(port);
    var pIcon = document.createElementNS("http://www.w3.org/2000/svg","text");
    pIcon.setAttribute("x", W);
    pIcon.setAttribute("y", H/2 + 3);
    pIcon.setAttribute("text-anchor","middle");
    pIcon.setAttribute("fill","#fff");
    pIcon.setAttribute("font-size","11");
    pIcon.setAttribute("font-weight","700");
    pIcon.setAttribute("font-family","sans-serif");
    pIcon.style.pointerEvents = "none";
    pIcon.textContent = "→";
    g.appendChild(pIcon);

    // Delete button (× top-right, shown on hover)
    var del = document.createElementNS("http://www.w3.org/2000/svg","g");
    del.setAttribute("transform","translate("+(W-8)+",-8)");
    del.setAttribute("class","wfv-node-del");
    del.style.cursor = "pointer";
    del.style.opacity = "0";
    del.style.pointerEvents = "all";
    del.style.transition = "opacity .12s";
    var delBg = document.createElementNS("http://www.w3.org/2000/svg","circle");
    delBg.setAttribute("r",10);
    delBg.setAttribute("fill","#c9372c");
    delBg.setAttribute("stroke","#fff");
    delBg.setAttribute("stroke-width","2");
    del.appendChild(delBg);
    var delX = document.createElementNS("http://www.w3.org/2000/svg","text");
    delX.setAttribute("text-anchor","middle");
    delX.setAttribute("y",4);
    delX.setAttribute("fill","#fff");
    delX.setAttribute("font-size","13");
    delX.setAttribute("font-weight","700");
    delX.setAttribute("font-family","sans-serif");
    delX.style.pointerEvents = "none";
    delX.textContent = "×";
    del.appendChild(delX);
    del.setAttribute("data-del-status", statusId);
    g.appendChild(del);
    // Hover handlers
    g.addEventListener("mouseenter", function(){del.style.opacity = "1"});
    g.addEventListener("mouseleave", function(){del.style.opacity = "0"});
  }

  group.appendChild(g);
}

/* ===== Draw a transition edge ===== */
function drawEdge(group, wf, fromId, toId, tr, idx, total, positions){
  var fromPos = positions[fromId];
  var toPos = positions[toId];
  if (!fromPos || !toPos) return;
  var W = 140, H = 56;

  // Self-loop?
  if (fromId === toId){
    drawSelfLoop(group, fromPos, tr, W, H);
    return;
  }

  // Compute connection points (border centers)
  var fromCx = fromPos.x + W/2, fromCy = fromPos.y + H/2;
  var toCx = toPos.x + W/2, toCy = toPos.y + H/2;
  var dx = toCx - fromCx, dy = toCy - fromCy;
  var dist = Math.sqrt(dx*dx + dy*dy);
  if (dist < 1) return;

  // Border intersection points (assume rectangular)
  function borderPoint(cx, cy, dirX, dirY){
    var halfW = W/2, halfH = H/2;
    var tX = halfW / Math.abs(dirX || 0.0001);
    var tY = halfH / Math.abs(dirY || 0.0001);
    var t = Math.min(tX, tY);
    return {x: cx + dirX * t, y: cy + dirY * t};
  }
  var dirX = dx/dist, dirY = dy/dist;
  var p1 = borderPoint(fromCx, fromCy, dirX, dirY);
  var p2 = borderPoint(toCx, toCy, -dirX, -dirY);

  // Curve offset for parallel transitions
  var offset = 0;
  if (total > 1){
    offset = (idx - (total-1)/2) * 30;
  }
  var midX = (p1.x + p2.x)/2 + (-dirY) * offset;
  var midY = (p1.y + p2.y)/2 + (dirX) * offset;

  // Curved path
  var pathD = "M "+p1.x+","+p1.y+" Q "+midX+","+midY+" "+p2.x+","+p2.y;

  // Hit area (wider invisible path for tooltip/hover/click)
  var hit = document.createElementNS("http://www.w3.org/2000/svg","path");
  hit.setAttribute("d", pathD);
  hit.setAttribute("stroke", "transparent");
  hit.setAttribute("stroke-width", 18);
  hit.setAttribute("fill", "none");
  hit.style.cursor = WFV.isDraft ? "pointer" : "default";
  var tipHtml = '<b>'+escHtml(tr.name)+'</b><br>';
  if ((tr.conditions||[]).length) tipHtml += '<div style="color:#9fadbc;font-size:10px;margin-top:4px">📋 条件: '+tr.conditions.length+'</div>';
  if ((tr.validators||[]).length) tipHtml += '<div style="color:#9fadbc;font-size:10px">✓ 検証: '+tr.validators.length+'</div>';
  if ((tr.postFunctions||[]).length) tipHtml += '<div style="color:#9fadbc;font-size:10px">⚡ ポスト関数: '+tr.postFunctions.length+'</div>';
  hit.setAttribute("data-tip", tipHtml);
  if (tr && tr.id) hit.setAttribute("data-tr-id", tr.id);
  if (fromId) hit.setAttribute("data-from", fromId);
  if (toId) hit.setAttribute("data-to", toId);
  group.appendChild(hit);

  // Visible path
  var path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d", pathD);
  path.setAttribute("stroke", "#5e6c84");
  path.setAttribute("stroke-width", 1.6);
  path.setAttribute("fill", "none");
  path.setAttribute("marker-end", "url(#wfvArrow)");
  path.style.pointerEvents = "none";
  group.appendChild(path);

  // Transition name label
  var labelG = document.createElementNS("http://www.w3.org/2000/svg","g");
  labelG.style.pointerEvents = "none";
  // Background rect for legibility
  var labelBg = document.createElementNS("http://www.w3.org/2000/svg","rect");
  var lblText = tr.name.length > 18 ? tr.name.substring(0,16)+"…" : tr.name;
  var charW = 6.5;
  var bgW = lblText.length * charW + 16;
  labelBg.setAttribute("x", midX - bgW/2);
  labelBg.setAttribute("y", midY - 9);
  labelBg.setAttribute("width", bgW);
  labelBg.setAttribute("height", 18);
  labelBg.setAttribute("rx", 9);
  labelBg.setAttribute("fill", "#fff");
  labelBg.setAttribute("stroke", "#dfe1e6");
  labelBg.setAttribute("stroke-width", 1);
  labelG.appendChild(labelBg);
  // Icons for conditions/validators (small dots)
  var iconsX = midX - bgW/2 + 6;
  var labelOffset = 0;
  if ((tr.conditions||[]).length){
    var c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", iconsX); c.setAttribute("cy", midY); c.setAttribute("r", 3);
    c.setAttribute("fill", "#5e4db2"); labelG.appendChild(c);
    iconsX += 8; labelOffset += 8;
  }
  if ((tr.validators||[]).length){
    var c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", iconsX); c.setAttribute("cy", midY); c.setAttribute("r", 3);
    c.setAttribute("fill", "#a54800"); labelG.appendChild(c);
    iconsX += 8; labelOffset += 8;
  }
  if ((tr.postFunctions||[]).length){
    var c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", iconsX); c.setAttribute("cy", midY); c.setAttribute("r", 3);
    c.setAttribute("fill", "#216e4e"); labelG.appendChild(c);
    labelOffset += 8;
  }
  var label = document.createElementNS("http://www.w3.org/2000/svg","text");
  label.setAttribute("x", midX + labelOffset/2);
  label.setAttribute("y", midY + 4);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("fill", "#172b4d");
  label.setAttribute("font-size", "11");
  label.setAttribute("font-weight", "500");
  label.setAttribute("font-family", "-apple-system,sans-serif");
  label.textContent = lblText;
  labelG.appendChild(label);
  group.appendChild(labelG);
}

function drawSelfLoop(group, pos, tr, W, H){
  var cx = pos.x + W/2, cy = pos.y;
  var pathD = "M "+(pos.x+W*0.7)+","+pos.y+" C "+(pos.x+W+30)+","+(pos.y-40)+" "+(pos.x+W+30)+","+(pos.y+H+10)+" "+(pos.x+W*0.7)+","+(pos.y+H);
  var path = document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d", pathD);
  path.setAttribute("stroke", "#5e6c84");
  path.setAttribute("stroke-width", 1.6);
  path.setAttribute("fill", "none");
  path.setAttribute("marker-end", "url(#wfvArrow)");
  group.appendChild(path);
  var label = document.createElementNS("http://www.w3.org/2000/svg","text");
  label.setAttribute("x", pos.x + W + 36);
  label.setAttribute("y", pos.y + H/2 + 4);
  label.setAttribute("fill", "#172b4d");
  label.setAttribute("font-size", "11");
  label.setAttribute("font-family", "sans-serif");
  label.textContent = tr.name;
  group.appendChild(label);
}

function drawGlobalEdge(group, wf, tr, positions){
  // Show as a floating "Any" badge with arrow into the to-node
  var toPos = positions[tr.to];
  if (!toPos) return;
  var W = 140, H = 56;
  // Place label above target
  var labelX = toPos.x + W/2;
  var labelY = toPos.y - 30;
  var bg = document.createElementNS("http://www.w3.org/2000/svg","rect");
  bg.setAttribute("x", labelX - 50);
  bg.setAttribute("y", labelY - 10);
  bg.setAttribute("width", 100);
  bg.setAttribute("height", 18);
  bg.setAttribute("rx", 9);
  bg.setAttribute("fill", "#f3f0ff");
  bg.setAttribute("stroke", "#5e4db2");
  bg.setAttribute("stroke-dasharray", "3,2");
  bg.setAttribute("stroke-width", 1);
  group.appendChild(bg);
  var t = document.createElementNS("http://www.w3.org/2000/svg","text");
  t.setAttribute("x", labelX); t.setAttribute("y", labelY + 4);
  t.setAttribute("text-anchor","middle"); t.setAttribute("fill","#5e4db2");
  t.setAttribute("font-size","10"); t.setAttribute("font-weight","600");
  t.setAttribute("font-family","sans-serif");
  var lbl = "★ " + (tr.name.length>10 ? tr.name.substring(0,8)+"…" : tr.name);
  t.textContent = lbl;
  group.appendChild(t);
  // Dashed line to target
  var line = document.createElementNS("http://www.w3.org/2000/svg","path");
  line.setAttribute("d", "M "+labelX+","+(labelY+9)+" L "+labelX+","+toPos.y);
  line.setAttribute("stroke", "#5e4db2");
  line.setAttribute("stroke-width", 1.2);
  line.setAttribute("stroke-dasharray", "3,2");
  line.setAttribute("fill", "none");
  line.setAttribute("marker-end", "url(#wfvArrow)");
  group.appendChild(line);
}
