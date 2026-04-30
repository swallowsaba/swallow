/* ============================================================
   SPRINT MANAGEMENT (JIRA級)
   - Active / Planned / Completed タブ
   - Sprint create/edit/start/complete
   - Goal, capacity, dates
   - Burndown chart (SVG)
   - Velocity chart (last 5 sprints)
   - Drag tickets between Backlog and Sprint
   ============================================================ */

var SPRINT_STATE = {
  selectedSprintId: null,
  view: "active"   // "active" | "planned" | "completed"
};

function ensureSprints(){
  if (!TS.sprints) TS.sprints = [];
}

function getActiveSprints(){
  ensureSprints();
  return TS.sprints.filter(function(s){return s.state === "active"});
}
function getPlannedSprints(){
  ensureSprints();
  return TS.sprints.filter(function(s){return !s.state || s.state === "planned"});
}
function getCompletedSprints(){
  ensureSprints();
  return TS.sprints.filter(function(s){return s.state === "completed"});
}

function getSprintTickets(sprintId){
  return TS.tickets.filter(function(t){return t.sprintId === sprintId});
}
function getSprintSP(sprintId){
  return getSprintTickets(sprintId).reduce(function(a,t){return a + (t.storyPoint||0)}, 0);
}
function getSprintDoneSP(sprintId){
  return getSprintTickets(sprintId).filter(function(t){return t.status === "done"}).reduce(function(a,t){return a + (t.storyPoint||0)}, 0);
}

/* ============================================================
   SPRINT VIEW
   ============================================================ */
function renderSprintView(){
  ensureSprints();
  var v = document.getElementById("sprintView");
  if (!v) return;

  var html = '<div class="page-header"><div class="page-bc"><a>プロジェクト</a> / <a>Sprints</a></div><div class="page-title">🏃 Sprints</div><div style="font-size:13px;color:var(--t2);margin-top:4px">アジャイル開発のためのスプリント管理</div></div>';

  // Tabs
  var actCnt = getActiveSprints().length;
  var planCnt = getPlannedSprints().length;
  var compCnt = getCompletedSprints().length;
  html += '<div class="page-toolbar" style="border-bottom:1px solid var(--bd);padding-bottom:0">';
  html += '<div style="display:flex;gap:0;flex:1">';
  ["active","planned","completed"].forEach(function(tab){
    var label = {active:"⚡ Active",planned:"📋 Planned",completed:"✓ Completed"}[tab];
    var cnt = {active:actCnt,planned:planCnt,completed:compCnt}[tab];
    var on = SPRINT_STATE.view === tab;
    html += '<button class="sp-tab'+(on?" on":"")+'" data-sp-tab="'+tab+'" style="padding:10px 18px;background:'+(on?"var(--b1)":"transparent")+';border:none;border-bottom:2px solid '+(on?"var(--ac)":"transparent")+';color:'+(on?"var(--ac)":"var(--t2)")+';font-weight:'+(on?"600":"400")+';cursor:pointer;font-family:inherit;font-size:13px">'+label+' <span style="background:var(--b3);padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px">'+cnt+'</span></button>';
  });
  html += '</div>';
  html += '<button class="btn bp" id="spCreate">+ Sprint作成</button>';
  html += '<button class="btn secondary" id="spVelocity">📊 ベロシティ</button>';
  html += '</div>';

  html += '<div style="flex:1;overflow:auto;padding:20px;background:var(--b2)">';
  if (SPRINT_STATE.view === "active"){
    html += renderActiveSprints();
  } else if (SPRINT_STATE.view === "planned"){
    html += renderPlannedSprints();
  } else {
    html += renderCompletedSprints();
  }
  html += '</div>';

  v.innerHTML = html;

  // Bind tabs
  v.querySelectorAll(".sp-tab").forEach(function(t){
    t.onclick = function(){SPRINT_STATE.view = t.dataset.spTab; renderSprintView()};
  });
  document.getElementById("spCreate").onclick = function(){spCreateDlg()};
  document.getElementById("spVelocity").onclick = function(){spVelocityDlg()};

  bindSprintActions(v);
}

function renderActiveSprints(){
  var actives = getActiveSprints();
  if (!actives.length){
    return '<div class="empty-state"><div class="empty-state-icon">⚡</div><div class="empty-state-title">アクティブなスプリントがありません</div><div class="empty-state-text">Plannedタブからスプリントを開始してください</div></div>';
  }
  var html = '';
  actives.forEach(function(sp){
    html += renderSprintDetail(sp, true);
  });
  return html;
}

function renderPlannedSprints(){
  var planned = getPlannedSprints();
  if (!planned.length){
    return '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">未開始のスプリントがありません</div><div class="empty-state-text">「+ Sprint作成」で新しいスプリントを作成してください</div></div>';
  }
  var html = '';
  planned.forEach(function(sp){
    html += renderSprintDetail(sp, false);
  });
  return html;
}

function renderCompletedSprints(){
  var comp = getCompletedSprints();
  if (!comp.length){
    return '<div class="empty-state"><div class="empty-state-icon">✓</div><div class="empty-state-title">完了したスプリントがありません</div></div>';
  }
  var html = '';
  comp.forEach(function(sp){
    html += renderSprintDetail(sp, false, true);
  });
  return html;
}

function renderSprintDetail(sp, isActive, isCompleted){
  var tickets = getSprintTickets(sp.id);
  var totalSP = getSprintSP(sp.id);
  var doneSP = getSprintDoneSP(sp.id);
  var pct = totalSP > 0 ? Math.round(doneSP/totalSP*100) : 0;
  var capacity = sp.capacity || 0;
  var capacityPct = capacity > 0 ? Math.round(totalSP/capacity*100) : 0;
  var capacityStatus = capacityPct > 100 ? "over" : (capacityPct > 80 ? "warn" : "ok");

  // Status counts
  var stCounts = {};
  TS.statuses.forEach(function(s){stCounts[s.id] = 0});
  tickets.forEach(function(t){if(stCounts[t.status]!=null)stCounts[t.status]++});

  var html = '<div class="sp-card" data-sp-id="'+sp.id+'">';
  html += '<div class="sp-card-h">';
  html += '<div style="flex:1">';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">';
  html += '<h3 style="margin:0;font-size:18px;color:var(--t1)">🏃 '+escHtml(sp.name)+'</h3>';
  if (isActive) html += '<span class="sp-state-pill active">⚡ ACTIVE</span>';
  else if (isCompleted) html += '<span class="sp-state-pill completed">✓ COMPLETED</span>';
  else html += '<span class="sp-state-pill planned">📋 PLANNED</span>';
  html += '</div>';
  if (sp.goal) html += '<div style="font-size:13px;color:var(--t2);margin-bottom:6px">🎯 '+escHtml(sp.goal)+'</div>';
  var dateInfo = '';
  if (sp.startDate) dateInfo += sp.startDate;
  if (sp.endDate) dateInfo += ' → ' + sp.endDate;
  if (dateInfo) html += '<div style="font-size:11px;color:var(--t3);font-family:monospace">'+dateInfo+'</div>';
  html += '</div>';

  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">';
  if (!isActive && !isCompleted){
    html += '<button class="btn bp btn-sm" data-sp-act="start" data-sp-id="'+sp.id+'">▶ 開始</button>';
  }
  if (isActive){
    html += '<button class="btn bp btn-sm" data-sp-act="complete" data-sp-id="'+sp.id+'">✓ 完了</button>';
    html += '<button class="btn secondary btn-sm" data-sp-act="burndown" data-sp-id="'+sp.id+'">📈 バーンダウン</button>';
  }
  if (isCompleted){
    html += '<button class="btn secondary btn-sm" data-sp-act="report" data-sp-id="'+sp.id+'">📊 レポート</button>';
  }
  html += '<button class="btn secondary btn-sm" data-sp-act="edit" data-sp-id="'+sp.id+'">✎ 編集</button>';
  html += '<button class="btn-icon" data-sp-act="delete" data-sp-id="'+sp.id+'" style="color:var(--dn)">×</button>';
  html += '</div>';
  html += '</div>';

  // Stats row
  html += '<div class="sp-stats">';
  html += '<div class="sp-stat"><div class="sp-stat-l">チケット</div><div class="sp-stat-v">'+tickets.length+'</div></div>';
  html += '<div class="sp-stat"><div class="sp-stat-l">SP合計</div><div class="sp-stat-v">'+totalSP+'</div></div>';
  if (capacity > 0){
    html += '<div class="sp-stat"><div class="sp-stat-l">キャパシティ</div><div class="sp-stat-v">'+capacity+' SP</div></div>';
    html += '<div class="sp-stat"><div class="sp-stat-l">使用率</div><div class="sp-stat-v" style="color:'+(capacityStatus==="over"?"var(--dn)":capacityStatus==="warn"?"var(--wn)":"var(--gn)")+'">'+capacityPct+'%</div></div>';
  }
  html += '<div class="sp-stat"><div class="sp-stat-l">完了率</div><div class="sp-stat-v" style="color:var(--gn)">'+pct+'% ('+doneSP+'/'+totalSP+' SP)</div></div>';
  html += '</div>';

  // Progress bar
  html += '<div class="sp-progress">';
  TS.statuses.forEach(function(st){
    var w = totalSP > 0 ? (tickets.filter(function(t){return t.status===st.id}).reduce(function(a,t){return a+(t.storyPoint||0)},0) / totalSP * 100) : 0;
    if (w > 0){
      html += '<div class="sp-progress-seg" style="width:'+w+'%;background:'+st.color+'" title="'+escHtml(st.name)+': '+stCounts[st.id]+'件"></div>';
    }
  });
  html += '</div>';

  // Status legend
  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--t2);margin-top:6px;margin-bottom:10px">';
  TS.statuses.forEach(function(st){
    html += '<span><span style="display:inline-block;width:8px;height:8px;background:'+st.color+';border-radius:50%;margin-right:4px;vertical-align:middle"></span>'+escHtml(st.name)+': '+stCounts[st.id]+'</span>';
  });
  html += '</div>';

  // Tickets list
  html += '<div class="sp-tickets" data-sp-drop="'+sp.id+'">';
  if (!tickets.length){
    html += '<div class="sp-tickets-empty">チケットがありません。Backlogからドラッグして追加してください</div>';
  } else {
    tickets.forEach(function(t){
      var st = TS.statuses.find(function(s){return s.id===t.status});
      html += '<div class="sp-ticket" draggable="true" data-key="'+t.key+'">';
      html += '<span class="ti '+(t.parentKey?"subtask":t.type)+'">'+(t.parentKey?"S":t.type[0].toUpperCase())+'</span>';
      html += '<span class="sp-ticket-key">'+t.key+'</span>';
      html += '<span class="sp-ticket-title">'+escHtml(t.title)+'</span>';
      html += '<span class="lozenge '+(t.status==="done"?"done":t.status==="inprogress"?"inprogress":"todo")+'" style="background:'+(st?st.color+"22":"var(--b3)")+';color:'+(st?st.color:"var(--t2)")+'">'+escHtml(st?st.name:t.status)+'</span>';
      if (t.storyPoint) html += '<span class="sp-sp-pill">'+t.storyPoint+'</span>';
      html += '<span style="font-size:11px;color:var(--t2);min-width:60px">'+escHtml(t.assignee||"-")+'</span>';
      html += '<button class="btn-icon" data-rm-from-sp="'+t.key+'" title="スプリントから外す">×</button>';
      html += '</div>';
    });
  }
  html += '</div>';
  html += '</div>';
  return html;
}

function bindSprintActions(v){
  v.querySelectorAll("[data-sp-act]").forEach(function(b){
    b.onclick = function(e){
      e.stopPropagation();
      var act = b.dataset.spAct;
      var id = b.dataset.spId;
      if (act === "start") spStart(id);
      else if (act === "complete") spComplete(id);
      else if (act === "edit") spEditDlg(id);
      else if (act === "delete") spDelete(id);
      else if (act === "burndown") spBurndownDlg(id);
      else if (act === "report") spReportDlg(id);
    };
  });
  v.querySelectorAll("[data-rm-from-sp]").forEach(function(b){
    b.onclick = function(e){
      e.stopPropagation();
      var key = b.dataset.rmFromSp;
      if (typeof urCapture === "function") urCapture("スプリントから外す", true);
      var t = TS.tickets.find(function(x){return x.key===key});
      if (t){t.sprintId = null; t.updatedAt = new Date().toISOString(); audit("update","ticket",key,"removed from sprint")}
      saveTS();
      renderSprintView();
      toast("スプリントから外しました");
    };
  });
  // Drag tickets between sprints / backlog
  v.querySelectorAll(".sp-ticket[draggable]").forEach(function(t){
    t.ondragstart = function(e){
      e.dataTransfer.setData("text/plain", t.dataset.key);
      e.dataTransfer.effectAllowed = "move";
      t.classList.add("dragging");
    };
    t.ondragend = function(){t.classList.remove("dragging")};
  });
  v.querySelectorAll("[data-sp-drop]").forEach(function(zone){
    zone.ondragover = function(e){e.preventDefault(); zone.classList.add("dragover")};
    zone.ondragleave = function(){zone.classList.remove("dragover")};
    zone.ondrop = function(e){
      e.preventDefault();
      zone.classList.remove("dragover");
      var key = e.dataTransfer.getData("text/plain");
      var spId = zone.dataset.spDrop;
      var t = TS.tickets.find(function(x){return x.key===key});
      if (!t || t.sprintId === spId) return;
      if (typeof urCapture === "function") urCapture("スプリントへ移動", true);
      t.sprintId = spId; t.updatedAt = new Date().toISOString();
      audit("update","ticket",key,"moved to sprint "+spId);
      saveTS();
      renderSprintView();
      toast("スプリントへ移動");
    };
  });
}

/* ============================================================
   SPRINT CREATE / EDIT
   ============================================================ */
function spCreateDlg(){
  var html = '<h3>+ 新規スプリント作成</h3>';
  html += '<label>スプリント名 *</label><input id="spcName" placeholder="例: Sprint 1">';
  html += '<label>ゴール (任意)</label><textarea id="spcGoal" rows="2" placeholder="このスプリントで達成したいこと"></textarea>';
  html += '<div class="fr"><div><label>開始日</label><input id="spcStart" type="date"></div><div><label>終了日</label><input id="spcEnd" type="date"></div></div>';
  html += '<label>キャパシティ (合計SP、任意)</label><input id="spcCap" type="number" placeholder="例: 30">';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="spcOk">作成</button></div>';
  showModal(html);
  // Default dates: today + 14 days
  var today = new Date();
  var twoWeeks = new Date(today.getTime() + 14*86400000);
  document.getElementById("spcStart").value = today.toISOString().substr(0,10);
  document.getElementById("spcEnd").value = twoWeeks.toISOString().substr(0,10);
  document.getElementById("spcOk").onclick = function(){
    var name = document.getElementById("spcName").value.trim();
    if (!name){toast("名前必須",1);return}
    if (typeof urCapture === "function") urCapture("スプリント作成", true);
    ensureSprints();
    var sp = {
      id: "sp-"+Date.now(),
      name: name,
      goal: document.getElementById("spcGoal").value.trim(),
      startDate: document.getElementById("spcStart").value,
      endDate: document.getElementById("spcEnd").value,
      capacity: parseInt(document.getElementById("spcCap").value) || 0,
      state: "planned",
      createdAt: new Date().toISOString()
    };
    TS.sprints.push(sp);
    audit("create","sprint",sp.id,name);
    saveTS();
    closeModal();
    SPRINT_STATE.view = "planned";
    renderSprintView();
    toast("✓ Sprint作成: "+name);
  };
}

function spEditDlg(id){
  var sp = TS.sprints.find(function(x){return x.id===id});
  if (!sp) return;
  var html = '<h3>✎ スプリント編集</h3>';
  html += '<label>名前 *</label><input id="speName" value="'+escHtml(sp.name)+'">';
  html += '<label>ゴール</label><textarea id="speGoal" rows="2">'+escHtml(sp.goal||"")+'</textarea>';
  html += '<div class="fr"><div><label>開始日</label><input id="speStart" type="date" value="'+(sp.startDate||"")+'"></div><div><label>終了日</label><input id="speEnd" type="date" value="'+(sp.endDate||"")+'"></div></div>';
  html += '<label>キャパシティ (SP)</label><input id="speCap" type="number" value="'+(sp.capacity||"")+'">';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="speOk">保存</button></div>';
  showModal(html);
  document.getElementById("speOk").onclick = function(){
    var name = document.getElementById("speName").value.trim();
    if (!name){toast("名前必須",1);return}
    if (typeof urCapture === "function") urCapture("スプリント編集", true);
    sp.name = name;
    sp.goal = document.getElementById("speGoal").value.trim();
    sp.startDate = document.getElementById("speStart").value;
    sp.endDate = document.getElementById("speEnd").value;
    sp.capacity = parseInt(document.getElementById("speCap").value) || 0;
    audit("update","sprint",id,name);
    saveTS();
    closeModal();
    renderSprintView();
    toast("✓ 保存");
  };
}

function spStart(id){
  var sp = TS.sprints.find(function(x){return x.id===id});
  if (!sp) return;
  var actives = getActiveSprints();
  if (actives.length > 0 && !confirm("既にアクティブなスプリント "+actives[0].name+" があります。このまま開始しますか？(複数アクティブ可)")) return;
  var tcnt = getSprintTickets(id).length;
  if (tcnt === 0){
    if (!confirm("チケットが0件です。本当に開始しますか？")) return;
  }
  if (typeof urCapture === "function") urCapture("スプリント開始", true);
  sp.state = "active";
  sp.actualStartDate = new Date().toISOString().substr(0,10);
  // Snapshot initial SP for burndown
  sp.initialSP = getSprintSP(id);
  sp.dailySnapshots = [{date: sp.actualStartDate, remaining: sp.initialSP}];
  audit("update","sprint",id,"started");
  saveTS();
  SPRINT_STATE.view = "active";
  renderSprintView();
  toast("⚡ Sprint開始: "+sp.name);
}

function spComplete(id){
  var sp = TS.sprints.find(function(x){return x.id===id});
  if (!sp) return;
  var tickets = getSprintTickets(id);
  var done = tickets.filter(function(t){return t.status==="done"});
  var notDone = tickets.filter(function(t){return t.status!=="done"});

  var html = '<h3>✓ Sprint完了</h3>';
  html += '<div style="font-size:13px;color:var(--t1);margin-bottom:14px">'+escHtml(sp.name)+'</div>';
  html += '<div class="sp-stats" style="background:var(--b2);padding:12px;border-radius:4px;margin-bottom:14px">';
  html += '<div class="sp-stat"><div class="sp-stat-l">完了</div><div class="sp-stat-v" style="color:var(--gn)">'+done.length+' (' +done.reduce(function(a,t){return a+(t.storyPoint||0)},0) + ' SP)</div></div>';
  html += '<div class="sp-stat"><div class="sp-stat-l">未完了</div><div class="sp-stat-v" style="color:var(--wn)">'+notDone.length+' ('+notDone.reduce(function(a,t){return a+(t.storyPoint||0)},0) + ' SP)</div></div>';
  html += '</div>';
  if (notDone.length){
    html += '<label>未完了チケットの行き先</label>';
    var sprintOpts = '<option value="__backlog__">Backlogに戻す</option>';
    var planned = getPlannedSprints();
    planned.forEach(function(p){sprintOpts += '<option value="'+p.id+'">'+escHtml(p.name)+' に移動</option>'});
    html += '<select id="spcMoveTo">'+sprintOpts+'</select>';
  }
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="spcCompOk">完了</button></div>';
  showModal(html);
  document.getElementById("spcCompOk").onclick = function(){
    if (typeof urCapture === "function") urCapture("スプリント完了", true);
    var moveTo = notDone.length ? document.getElementById("spcMoveTo").value : null;
    if (moveTo === "__backlog__"){
      notDone.forEach(function(t){t.sprintId = null});
    } else if (moveTo){
      notDone.forEach(function(t){t.sprintId = moveTo});
    }
    sp.state = "completed";
    sp.actualEndDate = new Date().toISOString().substr(0,10);
    sp.completedSP = done.reduce(function(a,t){return a+(t.storyPoint||0)},0);
    sp.completedCount = done.length;
    sp.notCompletedCount = notDone.length;
    audit("update","sprint",id,"completed");
    saveTS();
    closeModal();
    SPRINT_STATE.view = "completed";
    renderSprintView();
    toast("✓ Sprint完了: "+sp.name);
  };
}

function spDelete(id){
  var sp = TS.sprints.find(function(x){return x.id===id});
  if (!sp) return;
  if (sp.state === "active"){toast("アクティブなSprintは削除できません。先に完了してください",1);return}
  var tcnt = getSprintTickets(id).length;
  var msg = "Sprint「"+sp.name+"」を削除しますか？";
  if (tcnt > 0) msg += "\n所属チケット "+tcnt+"件はBacklogに戻されます。";
  if (!confirm(msg)) return;
  if (typeof urCapture === "function") urCapture("スプリント削除", true);
  // Move tickets back to backlog
  TS.tickets.forEach(function(t){if(t.sprintId===id)t.sprintId=null});
  TS.sprints = TS.sprints.filter(function(x){return x.id!==id});
  audit("delete","sprint",id,sp.name);
  saveTS();
  renderSprintView();
  toast("削除");
}

/* ============================================================
   BURNDOWN CHART (SVG)
   ============================================================ */
function spBurndownDlg(id){
  var sp = TS.sprints.find(function(x){return x.id===id});
  if (!sp) return;

  // Compute current remaining
  var totalSP = getSprintSP(id);
  var remainingSP = totalSP - getSprintDoneSP(id);

  // Update today's snapshot
  if (!sp.dailySnapshots) sp.dailySnapshots = [];
  var today = new Date().toISOString().substr(0,10);
  var existing = sp.dailySnapshots.find(function(s){return s.date===today});
  if (existing) existing.remaining = remainingSP;
  else sp.dailySnapshots.push({date: today, remaining: remainingSP});
  saveTS();

  // Compute date range
  var startDate = sp.actualStartDate || sp.startDate || today;
  var endDate = sp.endDate || today;
  var start = new Date(startDate);
  var end = new Date(endDate);
  var totalDays = Math.max(1, Math.round((end - start)/86400000));
  var initialSP = sp.initialSP || totalSP;

  var W = 620, H = 320, ML = 50, MR = 20, MT = 30, MB = 40;
  var pw = W - ML - MR;
  var ph = H - MT - MB;

  // Ideal line: from (0, initialSP) to (totalDays, 0)
  var idealX1 = ML, idealY1 = MT;
  var idealX2 = ML + pw, idealY2 = MT + ph;

  var svg = '<svg width="'+W+'" height="'+H+'" style="background:var(--b1);border:1px solid var(--bd);border-radius:4px">';
  // Grid
  for (var i = 0; i <= 5; i++){
    var y = MT + (ph * i / 5);
    svg += '<line x1="'+ML+'" y1="'+y+'" x2="'+(ML+pw)+'" y2="'+y+'" stroke="var(--bd)" stroke-width="0.5"/>';
    var v = Math.round(initialSP * (5-i) / 5);
    svg += '<text x="'+(ML-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="var(--t2)" font-family="sans-serif">'+v+'</text>';
  }
  // Date axis
  for (var d = 0; d <= totalDays; d += Math.max(1, Math.ceil(totalDays/7))){
    var x = ML + (pw * d / totalDays);
    var dt = new Date(start.getTime() + d*86400000);
    var lbl = (dt.getMonth()+1)+"/"+dt.getDate();
    svg += '<line x1="'+x+'" y1="'+MT+'" x2="'+x+'" y2="'+(MT+ph)+'" stroke="var(--bd)" stroke-width="0.5"/>';
    svg += '<text x="'+x+'" y="'+(MT+ph+15)+'" text-anchor="middle" font-size="9" fill="var(--t2)" font-family="sans-serif">'+lbl+'</text>';
  }
  // Ideal burndown
  svg += '<line x1="'+idealX1+'" y1="'+idealY1+'" x2="'+idealX2+'" y2="'+idealY2+'" stroke="#5e6c84" stroke-width="1.5" stroke-dasharray="4,3"/>';
  svg += '<text x="'+(ML+pw)+'" y="'+(MT-8)+'" text-anchor="end" font-size="10" fill="#5e6c84" font-family="sans-serif">理想ライン</text>';

  // Actual burndown
  if (sp.dailySnapshots && sp.dailySnapshots.length){
    var pts = sp.dailySnapshots.map(function(s){
      var dayIdx = Math.round((new Date(s.date) - start)/86400000);
      var x = ML + (pw * dayIdx / totalDays);
      var y = MT + ph - (ph * s.remaining / Math.max(1, initialSP));
      return [x, Math.max(MT, Math.min(MT+ph, y))];
    }).filter(function(p){return !isNaN(p[0]) && !isNaN(p[1])});

    if (pts.length > 1){
      var pathD = "M " + pts.map(function(p){return p[0]+","+p[1]}).join(" L ");
      svg += '<path d="'+pathD+'" stroke="#0c66e4" stroke-width="2.5" fill="none"/>';
    }
    pts.forEach(function(p){
      svg += '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="#0c66e4" stroke="#fff" stroke-width="2"/>';
    });
  }

  svg += '<text x="'+(W/2)+'" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="var(--t1)" font-family="sans-serif">バーンダウンチャート</text>';
  svg += '<text x="'+ML+'" y="'+MT-8+'" font-size="10" fill="#0c66e4" font-family="sans-serif">SP残り</text>';
  svg += '</svg>';

  var html = '<h3>📈 '+escHtml(sp.name)+' バーンダウン</h3>';
  html += '<div style="display:flex;gap:12px;margin-bottom:14px;font-size:12px">';
  html += '<div>初期SP: <b>'+initialSP+'</b></div>';
  html += '<div>残SP: <b style="color:var(--ac)">'+remainingSP+'</b></div>';
  html += '<div>完了SP: <b style="color:var(--gn)">'+getSprintDoneSP(id)+'</b></div>';
  html += '<div>進捗: <b>'+(initialSP>0?Math.round((initialSP-remainingSP)/initialSP*100):0)+'%</b></div>';
  html += '</div>';
  html += '<div style="display:flex;justify-content:center">'+svg+'</div>';
  html += '<div class="ma"><button class="btn bp" onclick="closeModal()">閉じる</button></div>';
  showModal(html);
}

function spReportDlg(id){
  var sp = TS.sprints.find(function(x){return x.id===id});
  if (!sp) return;
  var tickets = getSprintTickets(id);
  var done = tickets.filter(function(t){return t.status==="done"});
  var notDone = tickets.filter(function(t){return t.status!=="done"});
  var doneSP = done.reduce(function(a,t){return a+(t.storyPoint||0)},0);
  var notDoneSP = notDone.reduce(function(a,t){return a+(t.storyPoint||0)},0);
  var initial = sp.initialSP || (doneSP + notDoneSP);
  var pct = initial > 0 ? Math.round(doneSP/initial*100) : 0;

  var html = '<h3>📊 '+escHtml(sp.name)+' レポート</h3>';
  if (sp.goal) html += '<div style="background:var(--ac-bg);padding:10px;border-radius:4px;margin-bottom:14px;font-size:13px">🎯 '+escHtml(sp.goal)+'</div>';
  html += '<div class="sp-stats">';
  html += '<div class="sp-stat"><div class="sp-stat-l">期間</div><div class="sp-stat-v" style="font-size:12px">'+(sp.actualStartDate||sp.startDate||"-")+' 〜 '+(sp.actualEndDate||sp.endDate||"-")+'</div></div>';
  html += '<div class="sp-stat"><div class="sp-stat-l">初期SP</div><div class="sp-stat-v">'+initial+'</div></div>';
  html += '<div class="sp-stat"><div class="sp-stat-l">完了SP</div><div class="sp-stat-v" style="color:var(--gn)">'+doneSP+'</div></div>';
  html += '<div class="sp-stat"><div class="sp-stat-l">未完了SP</div><div class="sp-stat-v" style="color:var(--wn)">'+notDoneSP+'</div></div>';
  html += '<div class="sp-stat"><div class="sp-stat-l">達成率</div><div class="sp-stat-v" style="color:'+(pct>=80?"var(--gn)":pct>=50?"var(--wn)":"var(--dn)")+'">'+pct+'%</div></div>';
  html += '</div>';

  html += '<div style="margin-top:14px"><h4 style="font-size:11px;text-transform:uppercase;color:var(--t2);margin-bottom:8px">完了チケット ('+done.length+')</h4>';
  if (done.length){
    done.forEach(function(t){
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--b2);border-radius:3px;margin-bottom:3px;font-size:12px">';
      html += '<span style="font-family:monospace;color:var(--t3);min-width:60px">'+t.key+'</span>';
      html += '<span style="flex:1">'+escHtml(t.title)+'</span>';
      if (t.storyPoint) html += '<span class="sp-sp-pill">'+t.storyPoint+'</span>';
      html += '</div>';
    });
  } else html += '<div style="color:var(--t3);padding:6px;font-size:12px">なし</div>';
  html += '</div>';

  if (notDone.length){
    html += '<div style="margin-top:14px"><h4 style="font-size:11px;text-transform:uppercase;color:var(--wn);margin-bottom:8px">未完了チケット ('+notDone.length+')</h4>';
    notDone.forEach(function(t){
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--b2);border-radius:3px;margin-bottom:3px;font-size:12px">';
      html += '<span style="font-family:monospace;color:var(--t3);min-width:60px">'+t.key+'</span>';
      html += '<span style="flex:1">'+escHtml(t.title)+'</span>';
      if (t.storyPoint) html += '<span class="sp-sp-pill">'+t.storyPoint+'</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<div class="ma"><button class="btn bp" onclick="closeModal()">閉じる</button></div>';
  showModal(html);
}

function spVelocityDlg(){
  ensureSprints();
  var completed = getCompletedSprints().slice(-5);
  var W = 600, H = 280, ML = 60, MR = 20, MT = 30, MB = 50;
  var pw = W - ML - MR;
  var ph = H - MT - MB;
  var maxSP = Math.max.apply(null, completed.map(function(s){return Math.max(s.completedSP||0, s.initialSP||0)}).concat([10]));

  var svg = '<svg width="'+W+'" height="'+H+'" style="background:var(--b1);border:1px solid var(--bd);border-radius:4px">';
  // Grid + Y labels
  for (var i = 0; i <= 5; i++){
    var y = MT + (ph * i / 5);
    svg += '<line x1="'+ML+'" y1="'+y+'" x2="'+(ML+pw)+'" y2="'+y+'" stroke="var(--bd)" stroke-width="0.5"/>';
    var v = Math.round(maxSP * (5-i) / 5);
    svg += '<text x="'+(ML-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="var(--t2)" font-family="sans-serif">'+v+'</text>';
  }
  // Bars
  if (completed.length){
    var bw = pw / completed.length * 0.6;
    var gap = pw / completed.length;
    completed.forEach(function(sp, idx){
      var cx = ML + gap*idx + gap/2;
      var commitH = ph * (sp.initialSP||0) / maxSP;
      var doneH = ph * (sp.completedSP||0) / maxSP;
      // Commit bar (background)
      svg += '<rect x="'+(cx-bw/2)+'" y="'+(MT+ph-commitH)+'" width="'+bw+'" height="'+commitH+'" fill="#a5b3c2" opacity="0.4"/>';
      // Done bar (foreground)
      svg += '<rect x="'+(cx-bw/2)+'" y="'+(MT+ph-doneH)+'" width="'+bw+'" height="'+doneH+'" fill="#0c66e4"/>';
      // Label
      svg += '<text x="'+cx+'" y="'+(MT+ph+15)+'" text-anchor="middle" font-size="10" fill="var(--t1)" font-family="sans-serif">'+escHtml(sp.name.substring(0,12))+'</text>';
      svg += '<text x="'+cx+'" y="'+(MT+ph+28)+'" text-anchor="middle" font-size="9" fill="var(--t2)" font-family="sans-serif">'+(sp.completedSP||0)+' / '+(sp.initialSP||0)+'</text>';
    });
    // Average line
    var avg = completed.reduce(function(a,s){return a+(s.completedSP||0)},0) / completed.length;
    var avgY = MT + ph - (ph * avg / maxSP);
    svg += '<line x1="'+ML+'" y1="'+avgY+'" x2="'+(ML+pw)+'" y2="'+avgY+'" stroke="var(--gn)" stroke-width="2" stroke-dasharray="4,3"/>';
    svg += '<text x="'+(ML+pw)+'" y="'+(avgY-4)+'" text-anchor="end" font-size="10" fill="var(--gn)" font-family="sans-serif" font-weight="700">平均: '+Math.round(avg)+' SP</text>';
  }
  svg += '<text x="'+(W/2)+'" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="var(--t1)" font-family="sans-serif">ベロシティ (直近5スプリント)</text>';
  svg += '</svg>';

  var html = '<h3>📊 ベロシティチャート</h3>';
  if (!completed.length){
    html += '<div class="empty-state"><div class="empty-state-text">完了したスプリントがありません</div></div>';
  } else {
    html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">グレー = コミットメント / 青 = 完了SP / 緑線 = 平均ベロシティ</div>';
    html += '<div style="display:flex;justify-content:center">'+svg+'</div>';
  }
  html += '<div class="ma"><button class="btn bp" onclick="closeModal()">閉じる</button></div>';
  showModal(html);
}
