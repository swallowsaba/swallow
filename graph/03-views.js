/* ===== Ticket View ===== */
function renderTicketView(){
  var v = document.getElementById("ticketView");
  v.innerHTML = '<div class="page-header"><div class="page-bc"><a>プロジェクト</a> / <a>サンプル</a></div><div class="page-title">🎫 Issues</div></div><div class="page-toolbar"><input class="tb-input" id="ticketSearch" placeholder="検索 / JQL: status = todo AND priority = high" value="'+escHtml(TS.filter)+'" style="flex:1;max-width:480px"><button class="btn bp" id="ticketAdd">+ Create</button><button class="btn secondary" id="ticketTpl">⚡ From Template</button><button class="btn secondary" id="ticketImport">📥 Import</button><button class="btn secondary" id="ticketExport">📤 Export</button></div><div class="tv-body"><div class="tv-list" id="ticketList"></div><div class="tv-detail" id="ticketDetail" style="display:none"></div></div>';
  var listEl = document.getElementById("ticketList");
  var results = searchTickets(TS.filter);
  // Build hierarchy: parents first, then children indented
  var byKey = {};results.forEach(function(t){byKey[t.key]=t});
  var hierarchical = [];
  var added = {};
  results.forEach(function(t){
    if (added[t.key]) return;
    if (t.parentKey && byKey[t.parentKey]) return; // skip; will be added under parent
    hierarchical.push({t:t, level:0});
    added[t.key] = true;
    // Find children (in result set)
    var children = results.filter(function(x){return x.parentKey===t.key&&!added[x.key]});
    children.forEach(function(c){
      hierarchical.push({t:c, level:1});
      added[c.key] = true;
    });
  });
  // Add orphans (children whose parent is not in results)
  results.forEach(function(t){if(!added[t.key]){hierarchical.push({t:t,level:0});added[t.key]=true}});

  var html = '<div class="tk-row hd"><div><button class="tk-bulk-cb" id="tkSelAll" title="全選択">＋</button></div><div>KEY</div><div>TYPE</div><div>SUMMARY</div><div>STATUS</div><div>PRIORITY</div><div>ASSIGNEE</div><div>DUE</div></div>';
  hierarchical.forEach(function(item){
    var t = item.t;
    var st = TS.statuses.find(function(s){return s.id===t.status});
    var due = t.dueDate ? formatDate(t.dueDate) : "";
    var dueCls = (t.dueDate && t.dueDate < new Date().toISOString().substr(0,10) && t.status !== "done") ? " overdue" : "";
    var sel = TS.selectedTicket===t.key ? " sel" : "";
    var subCnt = TS.tickets.filter(function(x){return x.parentKey===t.key}).length;
    var indent = item.level>0 ? '<span class="ind-line">└</span>' : '';
    var subBadge = subCnt > 0 ? ' <span class="sub-cnt">📎'+subCnt+'</span>' : '';
    var ganttBadge = t.ganttTaskId ? ' <span class="gantt-link" title="Gantt連携">📊</span>' : '';
    var typeIcon = '<span class="ti '+(item.level>0?"subtask":t.type)+'" title="'+t.type+'">'+(item.level>0?"S":t.type[0].toUpperCase())+'</span>';
    var subClass = item.level>0 ? " subtask" : "";
    var stCls = t.status==="done"?"done":t.status==="inprogress"?"inprogress":t.status==="review"?"review":"todo";
    var bulkOn = (typeof BULK !== "undefined" && BULK.selected.has(t.key));
    var bulkCls = bulkOn ? " bulk-sel" : "";
    var bulkCb = '<button class="tk-bulk-cb'+(bulkOn?" on":"")+'" data-bulk="'+t.key+'" title="選択">'+(bulkOn?"✓":"")+'</button>';
    html += '<div class="tk-row'+sel+subClass+bulkCls+'" data-key="'+t.key+'">'+'<div>'+bulkCb+'</div>'+'<div class="tk-key">'+indent+t.key+'</div><div>'+typeIcon+'</div><div class="tk-title">'+escHtml(t.title)+subBadge+ganttBadge+'</div><div><span class="lozenge '+stCls+'">'+(st?st.name:t.status)+'</span></div><div><span class="ti-pri '+t.priority+'" title="'+t.priority+'">'+priIcon(t.priority)+'</span> <span style="font-size:12px;color:var(--t2)">'+t.priority+'</span></div><div class="tk-asg">'+escHtml(t.assignee||"-")+'</div><div class="tk-due'+dueCls+'">'+due+'</div></div>';
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll(".tk-row[data-key]").forEach(function(r){
    r.onclick = function(e){
      // Don't open detail if user clicked the bulk checkbox
      if (e.target.classList && e.target.classList.contains("tk-bulk-cb")) return;
      TS.selectedTicket=r.dataset.key;renderTicketView();
    };
  });
  listEl.querySelectorAll(".tk-bulk-cb[data-bulk]").forEach(function(cb){
    cb.onclick = function(e){
      e.stopPropagation();
      if (typeof bulkToggle === "function") bulkToggle(cb.dataset.bulk);
      // Update only this row visually
      var row = cb.closest(".tk-row");
      var on = BULK.selected.has(cb.dataset.bulk);
      cb.classList.toggle("on", on);
      cb.textContent = on ? "✓" : "";
      if (row) row.classList.toggle("bulk-sel", on);
    };
  });
  var sa = document.getElementById("tkSelAll");
  if (sa) sa.onclick = function(){
    if (typeof bulkSelectAll === "function") bulkSelectAll();
    // Re-render to update all checkboxes
    renderTicketView();
  };
  document.getElementById("ticketSearch").oninput = function(){TS.filter=this.value;clearTimeout(window._tkSt);window._tkSt=setTimeout(function(){renderTicketView();var i=document.getElementById("ticketSearch");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},300)};
  document.getElementById("ticketAdd").onclick = function(){newTicketDlg()};
  var tt = document.getElementById("ticketTpl");
  if (tt) tt.onclick = function(){if(typeof switchView==="function")switchView("template")};
  document.getElementById("ticketImport").onclick = importCsv;
  document.getElementById("ticketExport").onclick = exportCsv;
  if (TS.selectedTicket) renderTicketDetail();
}

function priIcon(p){return {highest:"⏫",high:"🔺",medium:"⏺",low:"🔻",lowest:"⏬"}[p]||"⏺"}

function renderTicketDetail(){
  var t = TS.tickets.find(function(x){return x.key===TS.selectedTicket});
  var det = document.getElementById("ticketDetail");
  if (!t || !det){if(det)det.style.display="none";return}
  det.style.display = "block";
  var st = TS.statuses.find(function(s){return s.id===t.status});
  var asgOpts = '<option value="">-</option>'+TS.users.map(function(u){return '<option value="'+u.id+'"'+(t.assignee===u.id?" selected":"")+'>'+escHtml(u.name)+'</option>'}).join("");
  var stOpts = TS.statuses.map(function(s){return '<option value="'+s.id+'"'+(t.status===s.id?" selected":"")+'>'+escHtml(s.name)+'</option>'}).join("");
  var prOpts = TS.priorities.map(function(p){return '<option value="'+p+'"'+(t.priority===p?" selected":"")+'>'+priIcon(p)+' '+p.toUpperCase()+'</option>'}).join("");
  var tpOpts = TS.types.map(function(p){return '<option value="'+p+'"'+(t.type===p?" selected":"")+'>'+p.toUpperCase()+'</option>'}).join("");
  var ganttOpts = '<option value="">-</option>'+(typeof S!=="undefined"?S.flat:[]).map(function(g){return '<option value="'+g.id+'"'+(t.ganttTaskId===g.id?" selected":"")+'>'+escHtml(g.name)+'</option>'}).join("");

  // Parent breadcrumb (JIRA style)
  var parentBc = "";
  if (t.parentKey){
    var p = TS.tickets.find(function(x){return x.key===t.parentKey});
    if (p){
      var pSt = TS.statuses.find(function(s){return s.id===p.status});
      parentBc = '<div class="parent-bc"><span class="ti '+p.type+'">'+p.type[0].toUpperCase()+'</span><a id="bcParent">'+p.key+'</a><span style="color:var(--t3)">/</span><span style="color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">'+escHtml(p.title)+'</span></div>';
    }
  }

  var typeIcon = '<span class="ti '+t.type+'" style="width:20px;height:20px;font-size:12px">'+t.type[0].toUpperCase()+'</span>';
  var html = '<div class="dt-h">'+parentBc+'<div style="display:flex;align-items:center;gap:6px;width:100%">'+typeIcon+'<span class="tk-key">'+t.key+'</span><div style="flex:1"></div><button class="dt-close" onclick="TS.selectedTicket=null;renderTicketView()">×</button></div></div>';
  html += '<div class="dt-title" id="dtTitle">'+escHtml(t.title)+'</div>';

  // Workflow Transition buttons (JIRA style top action area)
  var availTransitions = (typeof getAvailableTransitions==="function") ? getAvailableTransitions(t) : [];
  if (availTransitions.length){
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;padding:8px;background:var(--ac-bg);border-radius:4px;border:1px solid var(--ac-bg-h)">';
    html += '<span style="font-size:11px;color:var(--ac);font-weight:700;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;padding:0 4px">Workflow:</span>';
    availTransitions.forEach(function(tr){
      html += '<button class="btn bp btn-sm" data-transition="'+tr.id+'">'+escHtml(tr.name)+' →</button>';
    });
    html += '</div>';
  }

  // Quick action buttons
  html += '<div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap">';
  html += '<button class="btn" id="dtAddSub2">＋ サブタスク</button>';
  html += '<button class="btn" id="dtAddLink2">🔗 リンク</button>';
  if (typeof S !== "undefined") html += '<button class="btn" id="dtLinkGantt">📊 Gantt連携</button>';
  // Process View button for parents (template-generated or has subtasks)
  if (typeof hasProcess === "function" && hasProcess(t)){
    var pvLabel = t.templateSnapshot ? '📊 Process View' : '📊 Subtask Graph';
    html += '<button class="btn bp" id="dtProcView" style="margin-left:auto">'+pvLabel+'</button>';
  }
  html += '</div>';

  html += '<div class="dt-meta">';
  html += '<label>種別</label><select id="dtType">'+tpOpts+'</select>';
  html += '<label>状態</label><select id="dtStatus">'+stOpts+'</select>';
  html += '<label>優先度</label><select id="dtPri">'+prOpts+'</select>';
  html += '<label>担当</label><select id="dtAsg">'+asgOpts+'</select>';
  html += '<label>期限</label><input id="dtDue" type="date" value="'+(t.dueDate||"")+'">';
  html += '<label>SP</label><input id="dtSp" type="number" value="'+(t.storyPoint||"")+'" style="width:80px">';
  html += '<label>Gantt</label><select id="dtGantt">'+ganttOpts+'</select>';
  html += '<label>ラベル</label><input id="dtLabels" value="'+escHtml((t.labels||[]).join(","))+'" placeholder="カンマ区切り">';
  html += '</div>';
  html += '<div class="dt-sec"><h4>説明</h4><div class="dt-desc" id="dtDesc">'+escHtml(t.description||"クリックして編集")+'</div></div>';

  // Subtasks (children where parentKey===t.key)
  var subs = TS.tickets.filter(function(x){return x.parentKey===t.key});
  if (subs.length || true){
    html += '<div class="dt-sec"><h4>サブタスク ('+subs.length+')</h4><div id="dtSubs"></div></div>';
  }

  // Links - grouped by type (JIRA style)
  var allLinks = (t.links||[]).filter(function(l){return l.type!=="subtask"}); // exclude auto subtask links
  var byType = {};
  allLinks.forEach(function(l){if(!byType[l.type])byType[l.type]=[];byType[l.type].push(l)});
  // Also show inverse links (where this ticket is a target)
  var inverseLinks = [];
  TS.tickets.forEach(function(other){
    (other.links||[]).forEach(function(l){
      if (l.target===t.key && l.type!=="subtask"){
        var invType = invertLinkType(l.type);
        inverseLinks.push({type:invType, target:other.key, _inverse:true});
      }
    });
  });
  inverseLinks.forEach(function(l){if(!byType[l.type])byType[l.type]=[];byType[l.type].push(l)});

  html += '<div class="dt-sec"><h4>リンク</h4><div id="dtLinks"></div></div>';

  if (t.gitRefs && t.gitRefs.length){
    html += '<div class="dt-sec"><h4>Git ('+t.gitRefs.length+')</h4>';
    t.gitRefs.forEach(function(r){html += '<div class="lk-row"><span style="color:#f39c12">⬢</span><span style="font-family:\'SF Mono\',monospace;font-size:10px;color:var(--ac)">'+r.hash.substring(0,7)+'</span><span class="lk-title">'+escHtml(r.msg)+'</span></div>'});
    html += '</div>';
  }
  html += '<div class="dt-sec"><h4>コメント ('+t.comments.length+')</h4><div id="dtComments"></div><textarea id="dtNewCmt" placeholder="コメント追加..." style="width:100%;min-height:50px;padding:6px;background:var(--b3);border:1px solid var(--bd);border-radius:4px;color:var(--t1);outline:none;font-family:inherit;font-size:11px;margin-top:4px"></textarea><button class="btn bp" id="dtSendCmt" style="margin-top:4px">送信</button></div>';
  // Per-ticket Workflow History timeline
  var ticketHist = (TS.ticketHistory && TS.ticketHistory[t.key]) || [];
  if (ticketHist.length){
    html += '<div class="dt-sec"><h4>📜 History ('+ticketHist.length+')</h4><div class="hist-list" style="padding:0;background:transparent;max-height:240px;overflow-y:auto">';
    ticketHist.slice().reverse().forEach(function(h){
      var u = TS.users.find(function(x){return x.id===h.user});
      var fromSt = TS.statuses.find(function(x){return x.id===h.from});
      var toSt = TS.statuses.find(function(x){return x.id===h.to});
      html += '<div class="hist-row"><div class="hist-time">'+new Date(h.ts).toLocaleString("ja-JP")+'</div><div class="hist-user">'+escHtml(u?u.name:h.user)+'</div><div class="hist-body">';
      if (h.type==="transition"){
        html += '<b>'+escHtml(h.transition||"")+'</b>: <span class="hist-from">'+escHtml(fromSt?fromSt.name:h.from)+'</span> → <span class="hist-to">'+escHtml(toSt?toSt.name:h.to)+'</span>';
      } else if (h.type==="migration"){
        html += '<span style="color:var(--wn);font-weight:600">Migration:</span> <span class="hist-from">'+escHtml(fromSt?fromSt.name:h.from)+'</span> → <span class="hist-to">'+escHtml(toSt?toSt.name:h.to)+'</span>';
      } else {
        html += escHtml(h.type+": "+(h.comment||""));
      }
      if (h.comment) html += '<div style="font-size:11px;color:var(--t2);margin-top:4px;font-style:italic">"'+escHtml(h.comment)+'"</div>';
      html += '</div></div>';
    });
    html += '</div></div>';
  }
  html += '<div class="dt-sec"><button class="btn" style="color:var(--dn);border-color:var(--dn);width:100%" id="dtDel">🗑 削除</button></div>';
  det.innerHTML = html;

  // Bindings
  if (parentBc) document.getElementById("bcParent").onclick = function(){TS.selectedTicket=t.parentKey;renderTicketView()};
  document.getElementById("dtType").onchange = function(){updateTicket(t.key,{type:this.value});renderTicketView()};
  document.getElementById("dtStatus").onchange = function(){updateTicket(t.key,{status:this.value});renderTicketView()};
  document.getElementById("dtPri").onchange = function(){updateTicket(t.key,{priority:this.value});renderTicketView()};
  document.getElementById("dtAsg").onchange = function(){updateTicket(t.key,{assignee:this.value});renderTicketView()};
  document.getElementById("dtDue").onchange = function(){updateTicket(t.key,{dueDate:this.value||null});renderTicketView()};
  document.getElementById("dtSp").onchange = function(){updateTicket(t.key,{storyPoint:parseInt(this.value)||null});renderTicketView()};
  document.getElementById("dtGantt").onchange = function(){updateTicket(t.key,{ganttTaskId:this.value||null});renderTicketView()};
  document.getElementById("dtLabels").onchange = function(){updateTicket(t.key,{labels:this.value.split(",").map(function(x){return x.trim()}).filter(Boolean)});renderTicketView()};
  document.getElementById("dtTitle").onclick = function(){
    var nv = prompt("タイトル", t.title);
    if (nv != null && nv.trim()){updateTicket(t.key,{title:nv});renderTicketView()}
  };
  document.getElementById("dtDesc").onclick = function(){
    var nv = prompt("説明 (Markdown)", t.description||"");
    if (nv != null){updateTicket(t.key,{description:nv});renderTicketView()}
  };
  document.getElementById("dtSendCmt").onclick = function(){
    var v = document.getElementById("dtNewCmt").value.trim();
    if (v){addComment(t.key, v);renderTicketView()}
  };
  document.getElementById("dtDel").onclick = function(){
    if (confirm("削除しますか？\n"+t.key+": "+t.title)){deleteTicket(t.key);TS.selectedTicket=null;renderTicketView()}
  };
  document.getElementById("dtAddSub2").onclick = function(){newTicketDlg(null, t.key)};
  document.getElementById("dtAddLink2").onclick = function(){addLinkDlg(t)};
  if (typeof S !== "undefined" && document.getElementById("dtLinkGantt")){
    document.getElementById("dtLinkGantt").onclick = function(){linkToGanttDlg(t)};
  }
  var dtProc = document.getElementById("dtProcView");
  if (dtProc) dtProc.onclick = function(){if(typeof showProcessVisualizer==="function")showProcessVisualizer(t.key)};
  // Workflow transition button bindings
  det.querySelectorAll("[data-transition]").forEach(function(b){
    b.onclick = function(e){
      e.stopPropagation();
      var tr = (typeof getTicketWorkflow==="function") ? (function(){var wf=getTicketWorkflow(t);return wf?wf.transitions.find(function(x){return x.id===b.dataset.transition}):null})() : null;
      if (!tr){toast("遷移が見つかりません",1);return}
      // Pre-check conditions (if a condition fails, show why instead of opening dialog)
      for (var i=0;i<(tr.conditions||[]).length;i++){
        var cond = tr.conditions[i];
        var fn = WF_CONDITIONS[cond.type||cond];
        if (!fn) continue;
        var r = fn.check(t, tr, {});
        if (!r.ok){toast("条件NG: "+r.msg, 1);return}
      }
      showTransitionDlg(t, tr);
    };
  });

  // Render comments
  var cm = document.getElementById("dtComments");
  t.comments.forEach(function(c){
    var d = document.createElement("div");
    d.className = "cmt";
    var u = TS.users.find(function(x){return x.id===c.user});
    d.innerHTML = '<div class="cmt-h"><span><b>'+escHtml(u?u.name:c.user)+'</b> '+new Date(c.ts).toLocaleString("ja-JP")+'</span><button class="cmt-rm">削除</button></div><div class="cmt-body">'+escHtml(c.body)+'</div>';
    d.querySelector(".cmt-rm").onclick = function(){
      t.comments = t.comments.filter(function(x){return x.id!==c.id});
      saveTS();renderTicketView();
    };
    cm.appendChild(d);
  });

  // Render subtasks (JIRA style with status badges)
  var subsEl = document.getElementById("dtSubs");
  if (subsEl){
    if (subs.length){
      subs.forEach(function(s){
        var ss = TS.statuses.find(function(x){return x.id===s.status});
        var d = document.createElement("div");
        d.className = "lk-row";
        d.innerHTML = '<span class="ti '+s.type+'">'+s.type[0].toUpperCase()+'</span><span class="lk-key">'+s.key+'</span><span class="lk-title">'+escHtml(s.title)+'</span><span class="ti-st lk-st" style="background:'+(ss?ss.color:"#666")+';color:#fff">'+(ss?ss.name:s.status)+'</span><button class="lk-rm" title="削除">×</button>';
        d.onclick = function(e){if(e.target.classList.contains("lk-rm"))return;TS.selectedTicket=s.key;renderTicketView()};
        d.querySelector(".lk-rm").onclick = function(e){e.stopPropagation();if(confirm("サブタスクを削除しますか？\n"+s.key)){deleteTicket(s.key);renderTicketView()}};
        subsEl.appendChild(d);
      });
    } else {
      subsEl.innerHTML = '<div style="color:var(--t3);font-size:10px;padding:4px">サブタスクなし</div>';
    }
  }

  // Render links grouped by type
  var ll = document.getElementById("dtLinks");
  var typeNames = {blocks:"⛔ blocks",blocked_by:"⛔ is blocked by",relates_to:"🔗 relates to",duplicates:"📋 duplicates",is_duplicated_by:"📋 is duplicated by",clones:"⎘ clones",is_cloned_by:"⎘ is cloned by"};
  var typeKeys = Object.keys(byType);
  if (typeKeys.length){
    typeKeys.forEach(function(typ){
      var grp = document.createElement("div");
      grp.className = "link-group";
      grp.innerHTML = '<div class="link-group-h">'+escHtml(typeNames[typ]||typ)+'</div>';
      byType[typ].forEach(function(l){
        var tgt = TS.tickets.find(function(x){return x.key===l.target});
        if (!tgt) return;
        var ts2 = TS.statuses.find(function(x){return x.id===tgt.status});
        var d = document.createElement("div");
        d.className = "lk-row";
        var inv = l._inverse ? '<span style="color:var(--t3);font-size:9px;margin-left:4px">←</span>' : '';
        d.innerHTML = '<span class="ti '+tgt.type+'">'+tgt.type[0].toUpperCase()+'</span><span class="lk-key">'+tgt.key+'</span>'+inv+'<span class="lk-title">'+escHtml(tgt.title)+'</span><span class="ti-st lk-st" style="background:'+(ts2?ts2.color:"#666")+';color:#fff">'+(ts2?ts2.name:tgt.status)+'</span>'+(l._inverse?"":'<button class="lk-rm" title="削除">×</button>');
        d.onclick = function(e){if(e.target.classList.contains("lk-rm"))return;TS.selectedTicket=tgt.key;renderTicketView()};
        var rm = d.querySelector(".lk-rm");
        if (rm) rm.onclick = function(e){
          e.stopPropagation();
          t.links = (t.links||[]).filter(function(x){return!(x.type===typ&&x.target===l.target)});
          saveTS();renderTicketView();
        };
        grp.appendChild(d);
      });
      ll.appendChild(grp);
    });
  } else {
    ll.innerHTML = '<div style="color:var(--t3);font-size:10px;padding:4px">リンクなし</div>';
  }
}

function invertLinkType(typ){
  var inv = {blocks:"blocked_by",blocked_by:"blocks",relates_to:"relates_to",duplicates:"is_duplicated_by",is_duplicated_by:"duplicates",clones:"is_cloned_by",is_cloned_by:"clones"};
  return inv[typ] || typ;
}

function addLinkDlg(t){
  var typeOpts = '<option value="blocks">⛔ blocks</option><option value="blocked_by">⛔ is blocked by</option><option value="relates_to" selected>🔗 relates to</option><option value="duplicates">📋 duplicates</option><option value="clones">⎘ clones</option>';
  var tgtOpts = '<option value="">-- 選択 --</option>'+TS.tickets.filter(function(x){return x.key!==t.key}).map(function(x){
    return '<option value="'+x.key+'">'+x.key+': '+escHtml(x.title.substring(0,50))+'</option>';
  }).join("");
  showModal('<h3>🔗 リンク追加</h3><label>関係</label><select id="alType">'+typeOpts+'</select><label>リンク先チケット</label><select id="alTgt">'+tgtOpts+'</select><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="alOk">追加</button></div>');
  document.getElementById("alOk").onclick = function(){
    var typ = document.getElementById("alType").value;
    var tgt = document.getElementById("alTgt").value;
    if (!tgt){toast("リンク先を選択",1);return}
    t.links = t.links || [];
    if (t.links.find(function(x){return x.type===typ&&x.target===tgt})){toast("既に存在",1);return}
    t.links.push({type:typ, target:tgt});
    audit("update","ticket",t.key,"link "+typ+" "+tgt);
    saveTS();closeModal();renderTicketView();
  };
}

function linkToGanttDlg(t){
  if (typeof S === "undefined" || !S.flat || !S.flat.length){toast("Ganttタスクがありません",1);return}
  var opts = '<option value="">-- 解除 --</option>'+S.flat.map(function(g){
    return '<option value="'+g.id+'"'+(t.ganttTaskId===g.id?" selected":"")+'>'+(g.lv>0?"  ".repeat(g.lv):"")+g.name+'</option>';
  }).join("");
  showModal('<h3>📊 Gantt連携</h3><label>連携先Ganttタスク</label><select id="lgTgt">'+opts+'</select><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="lgOk">設定</button></div>');
  document.getElementById("lgOk").onclick = function(){
    var v = document.getElementById("lgTgt").value;
    updateTicket(t.key,{ganttTaskId:v||null});
    closeModal();renderTicketView();toast("Gantt連携: "+(v||"解除"));
  };
}

function newTicketDlg(defaultStatus, parentKey){
  var stOpts = TS.statuses.map(function(s){return '<option value="'+s.id+'"'+((defaultStatus&&defaultStatus===s.id)?" selected":"")+'>'+escHtml(s.name)+'</option>'}).join("");
  var prOpts = TS.priorities.map(function(p){return '<option value="'+p+'"'+(p==="medium"?" selected":"")+'>'+p.toUpperCase()+'</option>'}).join("");
  var tpOpts = TS.types.map(function(p){return '<option value="'+p+'">'+p.toUpperCase()+'</option>'}).join("");
  var asgOpts = '<option value="">-</option>'+TS.users.map(function(u){return '<option value="'+u.id+'">'+escHtml(u.name)+'</option>'}).join("");
  var parentInfo = parentKey ? '<div style="background:rgba(66,185,131,.1);padding:6px 10px;border-radius:4px;font-size:11px;margin-bottom:8px">📎 親チケット: <b>'+parentKey+'</b></div>' : '';
  showModal('<h3>＋ '+(parentKey?"サブタスク追加":"チケット追加")+'</h3>'+parentInfo+'<label>タイトル</label><input id="ntT"><label>種別</label><select id="ntTy">'+tpOpts+'</select><div class="fr"><div><label>状態</label><select id="ntS">'+stOpts+'</select></div><div><label>優先度</label><select id="ntP">'+prOpts+'</select></div></div><label>担当</label><select id="ntA">'+asgOpts+'</select><label>期限</label><input id="ntD" type="date"><label>説明</label><textarea id="ntDsc" style="width:100%;min-height:60px;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;background:var(--b3);color:var(--t1);font-family:inherit;font-size:12px;margin-bottom:8px;outline:none"></textarea><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="ntOk">作成</button></div>');
  setTimeout(function(){var f=document.getElementById("ntT");if(f)f.focus()},50);
  document.getElementById("ntOk").onclick = function(){
    var ti = document.getElementById("ntT").value.trim();
    if (!ti){toast("タイトル必須",1);return}
    var nt = createTicket({
      title: ti,
      type: document.getElementById("ntTy").value,
      status: document.getElementById("ntS").value,
      priority: document.getElementById("ntP").value,
      assignee: document.getElementById("ntA").value,
      dueDate: document.getElementById("ntD").value||null,
      description: document.getElementById("ntDsc").value,
      parentKey: parentKey || null
    });
    if (nt && parentKey){
      // Add subtask link from parent
      var parent = TS.tickets.find(function(x){return x.key===parentKey});
      if (parent){
        parent.links = parent.links || [];
        parent.links.push({type:"subtask", target:nt.key});
        saveTS();
      }
    }
    closeModal();
    if (TS.currentView==="ticket") renderTicketView();
    else if (TS.currentView==="kanban") renderKanbanView();
    else if (TS.currentView==="backlog") renderBacklogView();
    toast("チケット作成: "+nt.key);
  };
}

function formatDate(s){if(!s)return"";var p=String(s).substr(0,10).split("-");return p[1]+"/"+p[2]}

/* ===== CSV Import/Export ===== */
function exportCsv(){
  var hdr = ["key","title","type","status","priority","assignee","reporter","dueDate","storyPoint","labels","description"];
  var rows = TS.tickets.map(function(t){
    return hdr.map(function(h){
      var v = h==="labels" ? (t.labels||[]).join(";") : (t[h]||"");
      return '"'+String(v).replace(/"/g,'""')+'"';
    }).join(",");
  });
  var csv = hdr.join(",")+"\n"+rows.join("\n");
  var b = new Blob([csv],{type:"text/csv"});
  var a = document.createElement("a");a.href=URL.createObjectURL(b);a.download="tickets.csv";a.click();
  toast("CSV出力完了");
}

function importCsv(){
  var inp = document.createElement("input");
  inp.type = "file";inp.accept = ".csv";
  inp.onchange = function(e){
    var f = e.target.files[0];if(!f)return;
    var r = new FileReader();
    r.onload = function(ev){
      var lines = ev.target.result.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      var hdr = parseCsvLine(lines[0]);
      var added = 0;
      for (var i=1;i<lines.length;i++){
        var cells = parseCsvLine(lines[i]);
        var obj = {};
        hdr.forEach(function(h,j){obj[h]=cells[j]||""});
        if (obj.labels) obj.labels = obj.labels.split(";").filter(Boolean);
        if (obj.storyPoint) obj.storyPoint = parseInt(obj.storyPoint)||null;
        createTicket(obj);added++;
      }
      toast(added+"件追加");renderTicketView();
    };
    r.readAsText(f);
  };
  inp.click();
}
function parseCsvLine(line){
  var r=[],cur="",inQ=false;
  for(var i=0;i<line.length;i++){
    var c=line[i];
    if(inQ){if(c==='"'){if(line[i+1]==='"'){cur+='"';i++}else inQ=false}else cur+=c}
    else{if(c==='"')inQ=true;else if(c===","){r.push(cur);cur=""}else cur+=c}
  }
  r.push(cur);return r;
}

/* ===== Kanban View ===== */
function renderKanbanView(){
  var v = document.getElementById("kanbanView");
  // Get visible status order from board config (allow custom column order/visibility)
  ensureBoardConfig();
  var visibleStatusIds = TS.boardConfig.columns;
  var hiddenCount = TS.statuses.length - visibleStatusIds.length;
  v.innerHTML = '<div class="page-header"><div class="page-bc"><a>プロジェクト</a> / <a>サンプル</a></div><div class="page-title">📋 Board</div></div><div class="page-toolbar"><input class="tb-input" id="kbSearch" placeholder="Filter board..." value="'+escHtml(TS.filter)+'" style="flex:1;max-width:380px"><button class="btn bp" id="kbAdd">+ Create</button><button class="btn secondary" id="kbColMgr" title="列の管理">⚙ 列管理</button><span style="font-size:12px;color:var(--t2);margin-left:auto">カードをドラッグでステータス変更</span></div><div class="kb-cols" id="kbCols"></div>';
  var kc = document.getElementById("kbCols");
  var tickets = searchTickets(TS.filter);

  visibleStatusIds.forEach(function(stId){
    var st = TS.statuses.find(function(s){return s.id===stId});
    if (!st) return;
    var col = document.createElement("div");
    col.className = "kb-col";col.dataset.status = st.id;
    col.draggable = true;  // for column reorder
    var items = tickets.filter(function(t){return t.status===st.id});
    var wipLimit = (TS.boardConfig.wipLimits||{})[st.id] || 0;
    var wipExceeded = wipLimit > 0 && items.length > wipLimit;
    var hsl = '<div class="kb-col-h"><span class="kb-col-h-grip" title="ドラッグで並べ替え">⋮⋮</span><span style="color:'+st.color+'">'+escHtml(st.name)+'</span>';
    hsl += '<span style="display:flex;align-items:center;gap:4px;flex:1;justify-content:flex-end">';
    hsl += '<span class="ct-cnt">'+items.length+(wipLimit>0?"/"+wipLimit:"")+'</span>';
    if (wipExceeded) hsl += '<span class="kb-col-wip-warn" title="WIP超過">⚠</span>';
    hsl += '<span class="kb-col-h-actions">';
    hsl += '<button data-newst="'+st.id+'" title="チケット追加">+</button>';
    hsl += '<button data-edcol="'+st.id+'" title="列を編集">✎</button>';
    hsl += '<button data-rmcol="'+st.id+'" class="dn" title="列を非表示">×</button>';
    hsl += '</span></span></div><div class="kb-col-b"></div>';
    col.innerHTML = hsl;
    var body = col.querySelector(".kb-col-b");
    items.forEach(function(t){
      var c = document.createElement("div");
      var subCnt = TS.tickets.filter(function(x){return x.parentKey===t.key}).length;
      var hasSubsCls = subCnt>0?" has-children":"";
      var subCls = t.parentKey?" subtask":"";
      c.className = "kb-card"+hasSubsCls+subCls;
      c.draggable = true;c.dataset.key = t.key;
      c.style.borderLeftColor = st.color;
      var parentInfo = "";
      if (t.parentKey){
        var par = TS.tickets.find(function(x){return x.key===t.parentKey});
        if (par) parentInfo = '<div style="font-size:9px;color:var(--t3);margin-bottom:2px">↳ '+par.key+'</div>';
      }
      var typeIcon = '<span class="ti '+(t.parentKey?"subtask":t.type)+'">'+(t.parentKey?"S":t.type[0].toUpperCase())+'</span>';
      var ganttBadge = t.ganttTaskId ? ' <span class="gantt-link" title="Gantt連携">📊</span>' : '';
      var subBadge = subCnt > 0 ? ' <span class="sub-cnt">📎'+subCnt+'</span>' : '';
      var linkCnt = (t.links||[]).filter(function(l){return l.type!=="subtask"}).length;
      var linkBadge = linkCnt > 0 ? ' <span class="sub-cnt">🔗'+linkCnt+'</span>' : '';
      c.innerHTML = parentInfo+'<div class="ct-key">'+typeIcon+t.key+'</div><div class="ct-title">'+escHtml(t.title)+'</div><div class="ct-meta"><span class="ti-pri '+t.priority+'" title="'+t.priority+'">'+priIcon(t.priority)+'</span><span style="color:var(--t2);font-size:9px">'+escHtml(t.assignee||"-")+'</span>'+(t.storyPoint?'<span style="background:var(--b1);color:var(--ac);font-weight:700;padding:1px 5px;border-radius:8px;font-size:9px">'+t.storyPoint+'</span>':'')+subBadge+linkBadge+ganttBadge+'</div>';
      c.onclick = function(){TS.selectedTicket=t.key;switchView("ticket")};
      c.ondragstart = function(e){
        e.stopPropagation();
        e.dataTransfer.setData("text/plain",t.key);
        e.dataTransfer.setData("application/x-card", t.key);
        c.classList.add("dragging");
      };
      c.ondragend = function(){c.classList.remove("dragging")};
      body.appendChild(c);
    });
    // Card drop on column body (status change)
    col.ondragover = function(e){
      e.preventDefault();
      var isCol = e.dataTransfer.types.indexOf("application/x-col") >= 0;
      if (isCol) col.classList.add("col-drag-over");
      else col.classList.add("dragover");
    };
    col.ondragleave = function(){col.classList.remove("dragover");col.classList.remove("col-drag-over")};
    col.ondrop = function(e){
      e.preventDefault();col.classList.remove("dragover");col.classList.remove("col-drag-over");
      // Column reorder?
      var srcCol = e.dataTransfer.getData("application/x-col");
      if (srcCol && srcCol !== st.id){
        var cols = TS.boardConfig.columns.slice();
        var srcIdx = cols.indexOf(srcCol);
        var dstIdx = cols.indexOf(st.id);
        if (srcIdx >= 0 && dstIdx >= 0){
          if (typeof urCapture === "function") urCapture("列順変更", true);
          cols.splice(srcIdx, 1);
          cols.splice(dstIdx, 0, srcCol);
          TS.boardConfig.columns = cols;
          saveTS();
          renderKanbanView();
        }
        return;
      }
      // Card drop
      var k = e.dataTransfer.getData("text/plain");
      var ticket = TS.tickets.find(function(x){return x.key===k});
      if (!ticket) return;
      if (ticket.status === st.id){renderKanbanView();return}
      // Try workflow engine first
      if (typeof getAvailableTransitions==="function" && TS.workflows && TS.workflows.length){
        var trans = getAvailableTransitions(ticket).filter(function(tr){return tr.to===st.id});
        if (trans.length){
          var tr = trans[0];
          var needsDialog = (tr.validators||[]).length || (tr.conditions||[]).length;
          if (needsDialog){
            for (var i=0;i<(tr.conditions||[]).length;i++){
              var cond=tr.conditions[i];var fn=WF_CONDITIONS[cond.type||cond];
              if (fn){var cr=fn.check(ticket,tr,{});if(!cr.ok){toast("条件NG: "+cr.msg,1);renderKanbanView();return}}
            }
            if ((tr.validators||[]).length){
              showTransitionDlg(ticket, tr);
              return;
            }
          }
          var r = executeTransition(k, tr.id, {});
          if (!r.ok){toast(r.msg||"遷移失敗",1)}
          else {toast("'"+tr.name+"' 実行")}
          renderKanbanView();
          return;
        } else {
          toast("ワークフロー上 "+ticket.status+"→"+st.id+" の遷移は定義されていません",1);
          renderKanbanView();
          return;
        }
      }
      updateTicket(k, {status: st.id});renderKanbanView();
    };
    // Column drag start (for reorder)
    col.ondragstart = function(e){
      // Only start col drag from grip area
      if (e.target.classList && e.target.classList.contains("kb-col-h-grip")){
        e.dataTransfer.setData("application/x-col", st.id);
        e.dataTransfer.effectAllowed = "move";
        col.style.opacity = "0.5";
      } else {
        e.preventDefault();
      }
    };
    col.ondragend = function(){col.style.opacity = "1"};
    kc.appendChild(col);
  });

  // "+ Add Column" button
  var addCol = document.createElement("div");
  addCol.className = "kb-add-col";
  addCol.innerHTML = '<div style="text-align:center"><div style="font-size:24px;line-height:1">+</div><div>列を追加</div>'+(hiddenCount>0?'<div style="font-size:10px;margin-top:4px">非表示: '+hiddenCount+'件</div>':'')+'</div>';
  addCol.onclick = function(){kbAddColDlg()};
  kc.appendChild(addCol);

  document.getElementById("kbSearch").oninput = function(){TS.filter=this.value;clearTimeout(window._kbSt);window._kbSt=setTimeout(renderKanbanView,300)};
  document.getElementById("kbAdd").onclick = function(){newTicketDlg()};
  document.getElementById("kbColMgr").onclick = function(){kbColMgrDlg()};
  v.querySelectorAll("[data-newst]").forEach(function(b){b.onclick = function(e){e.stopPropagation();newTicketDlg(b.dataset.newst)}});
  v.querySelectorAll("[data-edcol]").forEach(function(b){b.onclick = function(e){e.stopPropagation();kbEditColDlg(b.dataset.edcol)}});
  v.querySelectorAll("[data-rmcol]").forEach(function(b){b.onclick = function(e){
    e.stopPropagation();
    var sid = b.dataset.rmcol;
    var st = TS.statuses.find(function(s){return s.id===sid});
    if (!st) return;
    if (!confirm("列「"+st.name+"」を非表示にしますか？\n\n（チケットは削除されません。「列管理」から再表示できます）")) return;
    if (typeof urCapture === "function") urCapture("列非表示", true);
    TS.boardConfig.columns = TS.boardConfig.columns.filter(function(x){return x !== sid});
    saveTS();
    renderKanbanView();
  }});
}

/* ===== Board column management ===== */
function ensureBoardConfig(){
  if (!TS.boardConfig) TS.boardConfig = {};
  if (!TS.boardConfig.columns){
    // Default: show all statuses in TS.statuses order
    TS.boardConfig.columns = TS.statuses.map(function(s){return s.id});
  }
  if (!TS.boardConfig.wipLimits) TS.boardConfig.wipLimits = {};
  // Cleanup: remove ids that don't exist anymore
  TS.boardConfig.columns = TS.boardConfig.columns.filter(function(id){
    return TS.statuses.find(function(s){return s.id===id});
  });
}

function kbAddColDlg(){
  ensureBoardConfig();
  var hidden = TS.statuses.filter(function(s){return TS.boardConfig.columns.indexOf(s.id) < 0});

  var html = '<h3>+ 列を追加</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">既存ステータスから選ぶか、新しいステータスを作成して追加できます</div>';
  // Tabs
  html += '<div style="display:flex;gap:0;border-bottom:1px solid var(--bd);margin-bottom:14px">';
  html += '<button class="kbac-tab on" data-tab="new" style="padding:8px 14px;background:none;border:none;border-bottom:2px solid var(--ac);color:var(--ac);font-weight:600;cursor:pointer;font-family:inherit">✨ 新規作成</button>';
  if (hidden.length){
    html += '<button class="kbac-tab" data-tab="exist" style="padding:8px 14px;background:none;border:none;border-bottom:2px solid transparent;color:var(--t2);cursor:pointer;font-family:inherit">既存から選択 ('+hidden.length+')</button>';
  }
  html += '</div>';
  // New pane
  html += '<div class="kbac-pane" data-pane="new">';
  html += '<label>列名（=ステータス名） *</label><input id="kbacName" placeholder="例: レビュー中">';
  html += '<label>カテゴリ</label><select id="kbacCat"><option value="todo">To Do (グレー)</option><option value="inprogress">In Progress (青)</option><option value="review">Review (黄)</option><option value="done">Done (緑)</option></select>';
  html += '<label>色</label><input type="color" id="kbacColor" value="#5e6c84" style="width:60px;height:34px;border:1px solid var(--bd);border-radius:3px;cursor:pointer">';
  html += '<label>WIP制限 (任意, 0=無制限)</label><input id="kbacWip" type="number" value="0" min="0">';
  html += '</div>';
  // Existing pane
  if (hidden.length){
    var opts = hidden.map(function(s){return '<option value="'+s.id+'">'+escHtml(s.name)+'</option>'}).join("");
    html += '<div class="kbac-pane" data-pane="exist" style="display:none"><label>ステータス</label><select id="kbacS">'+opts+'</select><label>WIP制限 (任意, 0=無制限)</label><input id="kbacWipE" type="number" value="0" min="0"></div>';
  }
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="kbacOk">追加</button></div>';
  showModal(html);

  var activeTab = "new";
  document.querySelectorAll(".kbac-tab").forEach(function(t){
    t.onclick = function(){
      activeTab = t.dataset.tab;
      document.querySelectorAll(".kbac-tab").forEach(function(x){
        var on = x.dataset.tab === activeTab;
        x.style.color = on ? "var(--ac)" : "var(--t2)";
        x.style.borderBottomColor = on ? "var(--ac)" : "transparent";
        x.style.fontWeight = on ? "600" : "400";
      });
      document.querySelectorAll(".kbac-pane").forEach(function(p){
        p.style.display = (p.dataset.pane === activeTab) ? "block" : "none";
      });
    };
  });

  var catColors = {todo:"#5e6c84", inprogress:"#0c66e4", review:"#a54800", done:"#216e4e"};
  document.getElementById("kbacCat").onchange = function(){
    document.getElementById("kbacColor").value = catColors[this.value];
  };

  document.getElementById("kbacOk").onclick = function(){
    if (typeof urCapture === "function") urCapture("列追加", true);
    if (activeTab === "new"){
      var name = document.getElementById("kbacName").value.trim();
      if (!name){toast("列名必須",1);return}
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"") || "col_"+Date.now();
      var orig = id, n = 2;
      while (TS.statuses.find(function(s){return s.id===id})){id = orig+"_"+n; n++}
      TS.statuses.push({id:id, name:name, color:document.getElementById("kbacColor").value, category:document.getElementById("kbacCat").value});
      TS.boardConfig.columns.push(id);
      var wip = parseInt(document.getElementById("kbacWip").value) || 0;
      if (wip > 0) TS.boardConfig.wipLimits[id] = wip;
      saveTS();
      closeModal();
      renderKanbanView();
      toast("✓ 列追加: "+name);
    } else {
      var sid = document.getElementById("kbacS").value;
      if (!sid) return;
      TS.boardConfig.columns.push(sid);
      var wip = parseInt(document.getElementById("kbacWipE").value) || 0;
      if (wip > 0) TS.boardConfig.wipLimits[sid] = wip;
      saveTS();
      closeModal();
      renderKanbanView();
      toast("✓ 列追加");
    }
  };
}

function kbEditColDlg(sid){
  ensureBoardConfig();
  var st = TS.statuses.find(function(s){return s.id===sid});
  if (!st) return;
  var wipLimit = (TS.boardConfig.wipLimits||{})[sid] || 0;
  var html = '<h3>✎ 列の編集</h3>';
  html += '<label>列名（=ステータス名）</label><input id="kbeName" value="'+escHtml(st.name)+'">';
  html += '<label>色</label><input type="color" id="kbeColor" value="'+(st.color||"#5e6c84")+'" style="width:60px;height:34px;border:1px solid var(--bd);border-radius:3px;cursor:pointer">';
  html += '<label>WIP制限 (0=無制限)</label><input id="kbeWip" type="number" value="'+wipLimit+'" min="0">';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="kbeOk">保存</button></div>';
  showModal(html);
  document.getElementById("kbeOk").onclick = function(){
    var name = document.getElementById("kbeName").value.trim();
    if (!name){toast("名前必須",1);return}
    if (typeof urCapture === "function") urCapture("列編集", true);
    st.name = name;
    st.color = document.getElementById("kbeColor").value;
    var wip = parseInt(document.getElementById("kbeWip").value) || 0;
    if (wip > 0) TS.boardConfig.wipLimits[sid] = wip;
    else delete TS.boardConfig.wipLimits[sid];
    saveTS();
    closeModal();
    renderKanbanView();
    toast("✓ 保存");
  };
}

function kbColMgrDlg(){
  ensureBoardConfig();
  var html = '<h3>⚙ Board列の管理</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">表示する列のチェックボックスをON/OFF。WIP制限は0で無効。</div>';
  html += '<div style="max-height:50vh;overflow:auto;border:1px solid var(--bd);border-radius:4px">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--b2)"><th style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">表示</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">ステータス</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">カテゴリ</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">WIP制限</th></tr></thead><tbody>';
  TS.statuses.forEach(function(st){
    var visible = TS.boardConfig.columns.indexOf(st.id) >= 0;
    var wip = (TS.boardConfig.wipLimits||{})[st.id] || 0;
    html += '<tr><td style="padding:8px;border-bottom:1px solid var(--bd)"><input type="checkbox" data-cmgr-id="'+st.id+'"'+(visible?" checked":"")+'></td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd)"><span style="display:inline-block;width:8px;height:8px;background:'+st.color+';border-radius:50%;margin-right:6px"></span>'+escHtml(st.name)+'</td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd);color:var(--t3);font-size:11px">'+escHtml(st.category||"-")+'</td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd)"><input type="number" data-cmgr-wip="'+st.id+'" value="'+wip+'" min="0" style="width:60px"></td></tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="cmgrOk">適用</button></div>';
  showModal(html);
  document.getElementById("cmgrOk").onclick = function(){
    if (typeof urCapture === "function") urCapture("列管理", true);
    var newCols = [];
    document.querySelectorAll("[data-cmgr-id]").forEach(function(cb){
      if (cb.checked) newCols.push(cb.dataset.cmgrId);
    });
    TS.boardConfig.columns = newCols;
    document.querySelectorAll("[data-cmgr-wip]").forEach(function(inp){
      var v = parseInt(inp.value) || 0;
      if (v > 0) TS.boardConfig.wipLimits[inp.dataset.cmgrWip] = v;
      else delete TS.boardConfig.wipLimits[inp.dataset.cmgrWip];
    });
    saveTS();
    closeModal();
    renderKanbanView();
    toast("✓ 適用");
  };
}

/* ===== Backlog View ===== */
function renderBacklogView(){
  var v = document.getElementById("backlogView");
  var notDone = TS.tickets.filter(function(t){return t.status!=="done"&&!t.sprintId});
  var inSprints = {};
  TS.sprints.forEach(function(sp){inSprints[sp.id] = TS.tickets.filter(function(t){return t.sprintId===sp.id})});
  var html = '<div class="page-header"><div class="page-bc"><a>プロジェクト</a> / <a>サンプル</a></div><div class="page-title">📚 Backlog</div></div><div class="page-toolbar"><button class="btn bp" id="blAddSp">+ Sprint</button><button class="btn secondary" id="blAddTk">+ Issue</button></div><div class="page-body" style="overflow:auto">';
  TS.sprints.forEach(function(sp){
    var items = inSprints[sp.id] || [];
    var totalSp = items.reduce(function(a,t){return a+(t.storyPoint||0)},0);
    html += '<div class="bl-section"><div class="bl-h"><span>🏃 '+escHtml(sp.name)+' <span style="color:var(--t3);font-size:10px">'+(sp.startDate||"")+' ~ '+(sp.endDate||"")+'</span> <span style="color:var(--ac);font-size:10px">'+items.length+'件 / SP:'+totalSp+'</span></span><span><button class="btn" data-spaction="start" data-id="'+sp.id+'">'+(sp.active?"終了":"開始")+'</button> <button class="btn" data-spaction="del" data-id="'+sp.id+'" style="color:var(--dn)">削除</button></span></div><div class="bl-list" data-sprint="'+sp.id+'">';
    items.forEach(function(t){html += blRowHtml(t)});
    if (!items.length) html += '<div style="padding:14px;text-align:center;color:var(--t3);font-size:11px">空 — チケットをドラッグで追加</div>';
    html += '</div></div>';
  });
  html += '<div class="bl-section"><div class="bl-h">📚 Backlog ('+notDone.length+'件)</div><div class="bl-list" data-sprint="">';
  notDone.forEach(function(t){html += blRowHtml(t)});
  if (!notDone.length) html += '<div style="padding:14px;text-align:center;color:var(--t3);font-size:11px">バックログは空です</div>';
  html += '</div></div></div>';
  v.innerHTML = html;
  document.getElementById("blAddSp").onclick = function(){
    var n = prompt("スプリント名");if(!n)return;
    var sd = prompt("開始日 (YYYY-MM-DD)", new Date().toISOString().substr(0,10));
    var ed = prompt("終了日 (YYYY-MM-DD)");
    TS.sprints.push({id:"sp"+Date.now(),name:n,startDate:sd,endDate:ed,active:false});
    audit("create","sprint",n,"");saveTS();renderBacklogView();
  };
  document.getElementById("blAddTk").onclick = newTicketDlg;
  v.querySelectorAll("[data-spaction]").forEach(function(b){
    b.onclick = function(){
      var sp = TS.sprints.find(function(x){return x.id===b.dataset.id});
      if (b.dataset.spaction==="start"){sp.active=!sp.active;audit("update","sprint",sp.id,sp.active?"start":"end")}
      else if (b.dataset.spaction==="del"){
        TS.tickets.forEach(function(t){if(t.sprintId===sp.id)t.sprintId=null});
        TS.sprints = TS.sprints.filter(function(x){return x.id!==sp.id});
        audit("delete","sprint",sp.id,"");
      }
      saveTS();renderBacklogView();
    };
  });
  v.querySelectorAll(".bl-row").forEach(function(r){
    r.draggable = true;
    r.ondragstart = function(e){e.dataTransfer.setData("text/plain",r.dataset.key);r.classList.add("dragging")};
    r.ondragend = function(){r.classList.remove("dragging")};
    r.onclick = function(){TS.selectedTicket=r.dataset.key;switchView("ticket")};
  });
  v.querySelectorAll(".bl-list").forEach(function(l){
    l.ondragover = function(e){e.preventDefault()};
    l.ondrop = function(e){
      e.preventDefault();
      var k = e.dataTransfer.getData("text/plain");
      var spId = l.dataset.sprint || null;
      updateTicket(k, {sprintId: spId});renderBacklogView();
    };
  });
}
function blRowHtml(t){
  var st = TS.statuses.find(function(s){return s.id===t.status});
  var subCls = t.parentKey ? " subtask" : "";
  var typeIcon = '<span class="ti '+(t.parentKey?"subtask":t.type)+'">'+(t.parentKey?"S":t.type[0].toUpperCase())+'</span>';
  var subCnt = TS.tickets.filter(function(x){return x.parentKey===t.key}).length;
  var subBadge = subCnt > 0 ? ' <span class="sub-cnt">📎'+subCnt+'</span>' : '';
  var ganttBadge = t.ganttTaskId ? ' <span class="gantt-link">📊</span>' : '';
  var stCls = t.status==="done"?"done":t.status==="inprogress"?"inprogress":t.status==="review"?"review":"todo";
  return '<div class="bl-row'+subCls+'" data-key="'+t.key+'"><div class="grip">⠿</div><div class="tk-key">'+t.key+'</div><div>'+typeIcon+'</div><div class="tk-title">'+escHtml(t.title)+subBadge+ganttBadge+'</div><div><span class="lozenge '+stCls+'">'+(st?st.name:t.status)+'</span></div><div><span class="ti-pri '+t.priority+'">'+priIcon(t.priority)+'</span> <span style="font-size:11px;color:var(--t2)">'+t.priority.substring(0,3)+'</span></div><div style="text-align:center;font-weight:600;color:var(--ac)">'+(t.storyPoint||"-")+'</div><div style="font-size:12px;color:var(--t2)">'+escHtml(t.assignee||"-")+'</div></div>';
}

/* ===== Audit View ===== */
function renderAuditView(){
  var v = document.getElementById("auditView");
  var html = '<div class="page-header"><div class="page-bc"><a>管理</a></div><div class="page-title">📜 Audit log</div></div><div class="page-toolbar"><span style="font-size:12px;color:var(--t2)">'+TS.auditLog.length+' entries</span><div style="flex:1"></div><button class="btn secondary" id="auExp">📤 Export</button><button class="btn danger" id="auClr">🗑 Clear</button></div><div class="au-list">';
  if (!TS.auditLog.length) html += '<div style="padding:30px;text-align:center;color:var(--t3)">ログなし</div>';
  TS.auditLog.slice().reverse().forEach(function(a){
    html += '<div class="au-row"><div class="au-time">'+new Date(a.ts).toLocaleString("ja-JP")+'</div><div class="au-user">'+escHtml(a.user)+'</div><div class="au-act '+a.action+'">'+a.action+'</div><div>'+escHtml(a.entity)+': <b>'+escHtml(a.entityId)+'</b> '+escHtml(a.detail||"")+'</div></div>';
  });
  html += '</div>';
  v.innerHTML = html;
  document.getElementById("auExp").onclick = function(){
    var b = new Blob([JSON.stringify(TS.auditLog,null,2)],{type:"application/json"});
    var a = document.createElement("a");a.href=URL.createObjectURL(b);a.download="audit-log.json";a.click();
  };
  document.getElementById("auClr").onclick = function(){if(confirm("ログを全削除しますか？")){TS.auditLog=[];saveTS();renderAuditView()}};
}

/* ===== Admin View ===== */
function renderAdminView(){
  var v = document.getElementById("adminView");
  var html = '<div class="page-header"><div class="page-bc"><a>管理</a></div><div class="page-title">⚙ Settings</div></div><div class="adm-grid">';
  // Users
  html += '<div class="adm-card"><h3>👤 ユーザー</h3><div class="adm-list" id="admUsers"></div><div class="adm-add"><input id="admUN" placeholder="名前"><select id="admUR">'+TS.roles.map(function(r){return '<option value="'+r.id+'">'+escHtml(r.name)+'</option>'}).join("")+'</select><button class="btn bp" id="admUA">追加</button></div></div>';
  // Roles
  html += '<div class="adm-card"><h3>🔑 ロール</h3><div class="adm-list" id="admRoles"></div><div class="adm-add"><input id="admRN" placeholder="ロール名"><input id="admRP" placeholder="権限(カンマ区切り)"><button class="btn bp" id="admRA">追加</button></div></div>';
  // Statuses
  html += '<div class="adm-card"><h3>📊 ステータス</h3><div class="adm-list" id="admSts"></div><div class="adm-add"><input id="admSN" placeholder="名前"><input id="admSC" type="color" value="#3498db"><button class="btn bp" id="admSA">追加</button></div></div>';
  // Git
  html += '<div class="adm-card"><h3>🔗 Git連携</h3><label style="font-size:11px;color:var(--t2);display:block;margin-bottom:4px">プロバイダ</label><select id="admGP" style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;background:var(--b3);color:var(--t1);margin-bottom:6px"><option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="gitea">Gitea</option><option value="local">Local Git</option></select><label style="font-size:11px;color:var(--t2);display:block;margin-bottom:4px">リポジトリURL</label><input id="admGR" style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;background:var(--b3);color:var(--t1);margin-bottom:6px" placeholder="https://github.com/user/repo"><label style="font-size:11px;color:var(--t2);display:block;margin-bottom:4px">コミット連携テスト</label><textarea id="admGC" placeholder="例: TK-1 fix login bug" style="width:100%;min-height:50px;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;background:var(--b3);color:var(--t1);font-family:inherit;font-size:11px"></textarea><button class="btn" id="admGT" style="margin-top:6px">📥 仮想コミット送信</button><div style="font-size:10px;color:var(--t3);margin-top:8px">コミットメッセージ内のチケット番号(TK-N)を自動検出してリンク</div></div>';
  // Login
  html += '<div class="adm-card"><h3>👤 現在のユーザー</h3><div id="admMe"></div><div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--bd)"><h3 style="font-size:12px">🔔 アラート設定</h3><button class="btn secondary" id="admAlerts" style="margin-top:6px;width:100%">⚙ アラートルールを編集</button></div><div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--bd)"><h3 style="font-size:12px">🔄 Gantt連携設定</h3><label style="display:flex;align-items:center;gap:8px;font-size:11px;margin-top:6px;cursor:pointer"><input type="checkbox" id="admAutoCreate"'+(TS.autoCreateTicket?" checked":"")+' style="width:auto;margin:0">Ganttタスクから自動でチケットを作成</label><div style="font-size:10px;color:var(--t3);margin-top:4px">小項目のGanttタスクを保存時、対応チケットがなければ自動生成</div><button class="btn" id="admManualSync" style="margin-top:8px;width:100%">🔄 今すぐ同期</button></div><button class="btn" style="color:var(--dn);border-color:var(--dn);margin-top:14px;width:100%" id="admReset">⚠ 全データリセット</button></div>';
  html += '</div>';
  v.innerHTML = html;
  // Users
  var ul = document.getElementById("admUsers");
  TS.users.forEach(function(u){
    var d = document.createElement("div");d.className="adm-item";
    var rl = TS.roles.find(function(r){return r.id===u.roleId});
    d.innerHTML = '<span class="ai-name">'+escHtml(u.name)+'</span><span style="color:var(--t2);font-size:10px">['+escHtml(rl?rl.name:"?")+']</span><button class="ai-rm">×</button>';
    d.querySelector(".ai-rm").onclick = function(){
      TS.users = TS.users.filter(function(x){return x.id!==u.id});
      audit("delete","user",u.id,"");saveTS();renderAdminView();
    };
    ul.appendChild(d);
  });
  document.getElementById("admUA").onclick = function(){
    var n = document.getElementById("admUN").value.trim();
    if (!n) return;
    var rId = document.getElementById("admUR").value;
    var u = {id:"u"+Date.now(),name:n,roleId:rId};
    TS.users.push(u);audit("create","user",u.id,n);
    if (!TS.currentUser) TS.currentUser = u;
    saveTS();renderAdminView();updateUserInfo();
  };
  // Roles
  var rl = document.getElementById("admRoles");
  TS.roles.forEach(function(r){
    var d = document.createElement("div");d.className="adm-item";
    d.innerHTML = '<span class="ai-name">'+escHtml(r.name)+'</span><span style="color:var(--t2);font-size:9px">'+escHtml(r.perms.join(","))+'</span>'+(r.id==="admin"?"":'<button class="ai-rm">×</button>');
    var rm = d.querySelector(".ai-rm");
    if (rm) rm.onclick = function(){TS.roles=TS.roles.filter(function(x){return x.id!==r.id});saveTS();renderAdminView()};
    rl.appendChild(d);
  });
  document.getElementById("admRA").onclick = function(){
    var n = document.getElementById("admRN").value.trim();
    if (!n) return;
    var p = document.getElementById("admRP").value.split(",").map(function(x){return x.trim()}).filter(Boolean);
    TS.roles.push({id:"r"+Date.now(),name:n,perms:p});saveTS();renderAdminView();
  };
  // Statuses
  var sl = document.getElementById("admSts");
  TS.statuses.forEach(function(s){
    var d = document.createElement("div");d.className="adm-item";
    d.innerHTML = '<span class="ai-name" style="color:'+s.color+';font-weight:600">●</span><span style="flex:1">'+escHtml(s.name)+'</span><button class="ai-rm">×</button>';
    d.querySelector(".ai-rm").onclick = function(){TS.statuses=TS.statuses.filter(function(x){return x.id!==s.id});saveTS();renderAdminView()};
    sl.appendChild(d);
  });
  document.getElementById("admSA").onclick = function(){
    var n = document.getElementById("admSN").value.trim();
    if (!n) return;
    var c = document.getElementById("admSC").value;
    TS.statuses.push({id:"s"+Date.now(),name:n,color:c});saveTS();renderAdminView();
  };
  // Git
  document.getElementById("admGP").value = TS.gitProvider;
  document.getElementById("admGR").value = TS.gitRepo;
  document.getElementById("admGP").onchange = function(){TS.gitProvider=this.value;saveTS()};
  document.getElementById("admGR").onchange = function(){TS.gitRepo=this.value;saveTS()};
  document.getElementById("admGT").onclick = function(){
    var msg = document.getElementById("admGC").value.trim();
    if (!msg){toast("メッセージを入力",1);return}
    var hash = "abc"+Math.random().toString(36).substr(2,7);
    linkCommitToTicket(msg, hash, TS.gitRepo);
    toast("仮想コミット送信: "+hash.substring(0,7));
    document.getElementById("admGC").value = "";
  };
  // Me
  var me = document.getElementById("admMe");
  if (TS.currentUser){
    var rl = TS.roles.find(function(r){return r.id===TS.currentUser.roleId});
    me.innerHTML = '<div style="font-size:13px;font-weight:600">'+escHtml(TS.currentUser.name)+'</div><div style="font-size:11px;color:var(--t2);margin-top:4px">ロール: '+escHtml(rl?rl.name:"?")+'</div><div style="font-size:10px;color:var(--t3);margin-top:4px">権限: '+escHtml((rl?rl.perms:[]).join(", "))+'</div><button class="btn" style="margin-top:8px" id="admLO">ログアウト</button><label style="font-size:11px;color:var(--t2);display:block;margin-top:10px;margin-bottom:4px">切替:</label><select id="admSwitchUser" style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;background:var(--b3);color:var(--t1)">'+TS.users.map(function(u){return '<option value="'+u.id+'"'+(TS.currentUser.id===u.id?" selected":"")+'>'+escHtml(u.name)+'</option>'}).join("")+'</select>';
    document.getElementById("admLO").onclick = function(){TS.currentUser=null;saveTS();renderAdminView();updateUserInfo()};
    document.getElementById("admSwitchUser").onchange = function(){TS.currentUser=TS.users.find(function(u){return u.id===this.value});saveTS();renderAdminView();updateUserInfo()}.bind(document.getElementById("admSwitchUser"));
  } else {
    me.innerHTML = '<div style="color:var(--t3);font-size:11px">未ログイン</div><div style="font-size:10px;color:var(--t3);margin-top:6px">ユーザーを追加してください</div>';
  }
  document.getElementById("admReset").onclick = function(){
    if (confirm("全てのチケット・ユーザー・ログを削除します。よろしいですか？")){
      localStorage.removeItem("ganttTicketState");
      location.reload();
    }
  };
  var admAlerts = document.getElementById("admAlerts");
  if (admAlerts) admAlerts.onclick = function(){if(typeof showAlertConfigDlg==="function")showAlertConfigDlg()};
  document.getElementById("admAutoCreate").onchange = function(){
    TS.autoCreateTicket = this.checked;
    saveTS();
    if (this.checked){syncGanttToTickets();toast("自動同期ON")}
  };
  document.getElementById("admManualSync").onclick = function(){
    syncGanttToTickets();
    TS.tickets.forEach(function(t){if(t.ganttTaskId)syncTicketToGantt(t.key)});
    saveTS();
    toast("同期完了");
  };
}

function updateUserInfo(){
  var avatar = document.getElementById("sbAvatar");
  var nameEl = document.getElementById("sbUserName");
  var roleEl = document.getElementById("sbUserRole");
  if (TS.currentUser){
    var rl = TS.roles.find(function(r){return r.id===TS.currentUser.roleId});
    var initial = (TS.currentUser.name||"?").charAt(0).toUpperCase();
    if (avatar) avatar.textContent = initial;
    if (nameEl) nameEl.textContent = TS.currentUser.name;
    if (roleEl) roleEl.textContent = rl ? rl.name : "Member";
  } else {
    if (avatar) avatar.textContent = "?";
    if (nameEl) nameEl.textContent = "Guest";
    if (roleEl) roleEl.textContent = "Not logged in";
  }
  updateBell();
}

