/* ============================================================
   JIRA-COMPATIBLE WORKFLOW ENGINE
   - Workflows / Transitions / Conditions / Validators / Post Functions
   - Workflow Schemes (per IssueType)
   - Draft / Publish lifecycle
   - Status Migration Wizard
   - Per-ticket History timeline
   - YAML import / export
   ============================================================ */

var DEFAULT_RESOLUTIONS = [
  {id:"unresolved", name:"Unresolved", isDefault:true},
  {id:"done", name:"Done"},
  {id:"wontdo", name:"Won't Do"},
  {id:"duplicate", name:"Duplicate"},
  {id:"cannotreproduce", name:"Cannot Reproduce"}
];

var DEFAULT_WORKFLOW = {
  id: "default-workflow",
  name: "Default Software Workflow",
  description: "Standard workflow",
  initialStatus: "todo",
  statuses: ["todo","inprogress","review","done"],
  transitions: [
    {id:"t1",name:"Start Progress",from:["todo"],to:"inprogress",conditions:[],validators:[],postFunctions:[],screen:null},
    {id:"t2",name:"Submit for Review",from:["inprogress"],to:"review",conditions:[],validators:[],postFunctions:[],screen:null},
    {id:"t3",name:"Approve",from:["review"],to:"done",conditions:[],validators:[{type:"resolution_required"}],postFunctions:[{type:"set_resolution",value:"done"}],screen:"resolve"},
    {id:"t4",name:"Reject",from:["review"],to:"inprogress",conditions:[],validators:[],postFunctions:[],screen:null},
    {id:"t5",name:"Stop Progress",from:["inprogress"],to:"todo",conditions:[],validators:[],postFunctions:[],screen:null},
    {id:"t6",name:"Reopen",from:["done"],to:"todo",conditions:[],validators:[],postFunctions:[{type:"clear_resolution"}],screen:null}
  ]
};

var DEFAULT_SCHEME = {
  id: "default-scheme",
  name: "Default Workflow Scheme",
  description: "All issue types use the default workflow",
  defaultWorkflowId: "default-workflow",
  mappings: []
};

var WF_CONDITIONS = {
  "assignee_only": {label:"担当者のみ実行可能",check:function(t,tr,ctx){if(!TS.currentUser)return{ok:false,msg:"ログインが必要です"};if(t.assignee!==TS.currentUser.id)return{ok:false,msg:"担当者でないため実行できません"};return{ok:true}}},
  "reporter_only": {label:"報告者のみ実行可能",check:function(t,tr,ctx){if(!TS.currentUser)return{ok:false,msg:"ログインが必要です"};if(t.reporter!==TS.currentUser.id)return{ok:false,msg:"報告者でないため実行できません"};return{ok:true}}},
  "role_admin": {label:"管理者のみ実行可能",check:function(t,tr,ctx){if(!TS.currentUser)return{ok:false,msg:"ログインが必要です"};var rl=TS.roles.find(function(r){return r.id===TS.currentUser.roleId});if(!rl||(rl.perms.indexOf("*")<0&&rl.perms.indexOf("workflow.admin")<0))return{ok:false,msg:"管理者権限が必要です"};return{ok:true}}},
  "subtasks_done": {label:"全サブタスクが完了済み",check:function(t,tr,ctx){var subs=TS.tickets.filter(function(x){return x.parentKey===t.key});var open=subs.filter(function(s){return s.status!=="done"});if(open.length)return{ok:false,msg:"未完了サブタスクが "+open.length+" 件: "+open.map(function(s){return s.key}).join(", ")};return{ok:true}}},
  "no_blockers": {label:"ブロッカー解決済み",check:function(t,tr,ctx){var blockers=(t.links||[]).filter(function(l){return l.type==="blocked_by"});var openBl=blockers.filter(function(l){var b=TS.tickets.find(function(x){return x.key===l.target});return b&&b.status!=="done"});if(openBl.length)return{ok:false,msg:"未解決ブロッカー: "+openBl.map(function(l){return l.target}).join(", ")};return{ok:true}}}
};
var WF_VALIDATORS = {
  "comment_required": {label:"コメント必須",check:function(t,tr,ctx){if(!ctx||!ctx.comment||!ctx.comment.trim())return{ok:false,msg:"コメントを入力してください"};return{ok:true}}},
  "resolution_required": {label:"Resolution必須",check:function(t,tr,ctx){if(!ctx||!ctx.resolution)return{ok:false,msg:"Resolutionを選択してください"};return{ok:true}}},
  "assignee_required": {label:"担当者必須",check:function(t,tr,ctx){if(!t.assignee&&!(ctx&&ctx.assignee))return{ok:false,msg:"担当者を設定してください"};return{ok:true}}},
  "duedate_required": {label:"期限必須",check:function(t,tr,ctx){if(!t.dueDate&&!(ctx&&ctx.dueDate))return{ok:false,msg:"期限日を設定してください"};return{ok:true}}}
};
var WF_POSTFUNCTIONS = {
  "assign_to_me": {label:"自分にアサイン",run:function(t,tr,ctx){if(TS.currentUser)t.assignee=TS.currentUser.id}},
  "assign_to_reporter": {label:"報告者にアサイン",run:function(t,tr,ctx){if(t.reporter)t.assignee=t.reporter}},
  "clear_assignee": {label:"担当者を解除",run:function(t,tr,ctx){t.assignee=""}},
  "set_resolution": {label:"Resolutionを設定",run:function(t,tr,ctx,arg){t.resolution=arg||(ctx&&ctx.resolution)||"done"}},
  "clear_resolution": {label:"Resolutionをクリア",run:function(t,tr,ctx){t.resolution=null}},
  "add_comment": {label:"コメントを追加",run:function(t,tr,ctx){if(ctx&&ctx.comment)addComment(t.key,ctx.comment)}},
  "notify_assignee": {label:"担当者に通知",run:function(t,tr,ctx){if(t.assignee&&TS.currentUser&&t.assignee!==TS.currentUser.id)notify(t.assignee,t.key+": "+tr.name+" が実行されました",t.key)}},
  "log_to_history": {label:"履歴に記録",run:function(t,tr,ctx){}}
};

function getTicketWorkflow(ticket){
  var schemeId = ticket.workflowSchemeId || (TS.workflowSchemes[0] && TS.workflowSchemes[0].id);
  var scheme = TS.workflowSchemes.find(function(s){return s.id===schemeId});
  if (!scheme) return TS.workflows[0] || null;
  var mapping = (scheme.mappings||[]).find(function(m){return m.issueType===ticket.type});
  var wfId = mapping ? mapping.workflowId : scheme.defaultWorkflowId;
  return TS.workflows.find(function(w){return w.id===wfId}) || TS.workflows[0] || null;
}
function getAvailableTransitions(ticket){
  var wf = getTicketWorkflow(ticket);
  if (!wf) return [];
  return wf.transitions.filter(function(tr){
    if (!tr.from || !tr.from.length) return true;
    return tr.from.indexOf(ticket.status) >= 0 || tr.from.indexOf("*") >= 0;
  });
}
function executeTransition(ticketKey, transitionId, ctx){
  ctx = ctx || {};
  var t = TS.tickets.find(function(x){return x.key===ticketKey});
  if (!t) return {ok:false,msg:"チケットが見つかりません"};
  var wf = getTicketWorkflow(t);
  if (!wf) return {ok:false,msg:"ワークフローが定義されていません"};
  var tr = wf.transitions.find(function(x){return x.id===transitionId});
  if (!tr) return {ok:false,msg:"遷移が見つかりません"};
  var fromOk = !tr.from || !tr.from.length || tr.from.indexOf(t.status)>=0 || tr.from.indexOf("*")>=0;
  if (!fromOk) return {ok:false,msg:t.status+" からは実行できません"};
  for (var i=0;i<(tr.conditions||[]).length;i++){var cond=tr.conditions[i];var fn=WF_CONDITIONS[cond.type||cond];if(!fn)continue;var r=fn.check(t,tr,ctx);if(!r.ok)return{ok:false,msg:"条件NG: "+r.msg,phase:"condition"}}
  for (var j=0;j<(tr.validators||[]).length;j++){var v=tr.validators[j];var vf=WF_VALIDATORS[v.type||v];if(!vf)continue;var vr=vf.check(t,tr,ctx);if(!vr.ok)return{ok:false,msg:"検証NG: "+vr.msg,phase:"validator"}}
  var oldStatus = t.status;
  t.status = tr.to;
  t.updatedAt = new Date().toISOString();
  for (var k=0;k<(tr.postFunctions||[]).length;k++){var pf=tr.postFunctions[k];var pfn=WF_POSTFUNCTIONS[pf.type||pf];if(!pfn)continue;try{pfn.run(t,tr,ctx,pf.value)}catch(e){console.warn("PF error",e)}}
  if (ctx.assignee) t.assignee = ctx.assignee;
  if (ctx.comment) addComment(t.key, ctx.comment);
  if (ctx.dueDate) t.dueDate = ctx.dueDate;
  appendTicketHistory(t.key,{ts:new Date().toISOString(),user:TS.currentUser?TS.currentUser.id:"system",type:"transition",transition:tr.name,from:oldStatus,to:tr.to,comment:ctx.comment||""});
  audit("transition","ticket",t.key,tr.name+" ("+oldStatus+"→"+tr.to+")");
  if (typeof syncTicketToGantt==="function") syncTicketToGantt(t.key);
  saveTS();
  return {ok:true,oldStatus:oldStatus,newStatus:tr.to};
}
function appendTicketHistory(key, entry){
  if (!TS.ticketHistory[key]) TS.ticketHistory[key] = [];
  TS.ticketHistory[key].push(entry);
  if (TS.ticketHistory[key].length>200) TS.ticketHistory[key] = TS.ticketHistory[key].slice(-200);
}
function createWorkflow(name){
  var id="wf-"+Date.now();
  TS.workflows.push({id:id,name:name||"New Workflow",description:"",initialStatus:TS.statuses[0]?TS.statuses[0].id:"todo",statuses:TS.statuses.map(function(s){return s.id}),transitions:[]});
  audit("create","workflow",id,name);saveTS();return id;
}
function deleteWorkflow(id){
  var inUse = TS.workflowSchemes.some(function(s){return s.defaultWorkflowId===id||(s.mappings||[]).some(function(m){return m.workflowId===id})});
  if (inUse){toast("使用中のワークフローは削除できません",1);return false}
  TS.workflows = TS.workflows.filter(function(w){return w.id!==id});
  delete TS.workflowDrafts[id];
  audit("delete","workflow",id,"");saveTS();return true;
}
function saveDraft(workflowId, draft){TS.workflowDrafts[workflowId]=draft;audit("update","workflow_draft",workflowId,"");saveTS()}
function discardDraft(workflowId){delete TS.workflowDrafts[workflowId];saveTS()}
function publishDraft(workflowId){
  var draft = TS.workflowDrafts[workflowId];
  if (!draft) return {ok:false,msg:"草案がありません"};
  var v = validateWorkflow(draft);
  if (!v.ok) return v;
  var oldWf = TS.workflows.find(function(w){return w.id===workflowId});
  var oldStatuses = oldWf ? oldWf.statuses : [];
  var newStatuses = draft.statuses;
  var removed = oldStatuses.filter(function(s){return newStatuses.indexOf(s)<0});
  var migrationNeeded = [];
  if (removed.length){
    TS.tickets.forEach(function(t){
      var wf = getTicketWorkflow(t);
      if (wf && wf.id===workflowId && removed.indexOf(t.status)>=0) migrationNeeded.push({key:t.key,oldStatus:t.status});
    });
  }
  if (migrationNeeded.length) return {ok:false,requiresMigration:true,migrationNeeded:migrationNeeded,removed:removed,draft:draft};
  var idx = TS.workflows.findIndex(function(w){return w.id===workflowId});
  if (idx>=0) TS.workflows[idx]=draft;else TS.workflows.push(draft);
  delete TS.workflowDrafts[workflowId];
  audit("publish","workflow",workflowId, oldWf?"replaced":"created");
  saveTS();return {ok:true};
}
function publishWithMigration(workflowId, migrationMap){
  var draft = TS.workflowDrafts[workflowId];
  if (!draft) return {ok:false,msg:"草案がありません"};
  TS.tickets.forEach(function(t){
    var wf = getTicketWorkflow(t);
    if (wf && wf.id===workflowId && migrationMap[t.status]){
      var oldS = t.status;
      t.status = migrationMap[t.status];
      appendTicketHistory(t.key,{ts:new Date().toISOString(),user:TS.currentUser?TS.currentUser.id:"system",type:"migration",from:oldS,to:t.status,comment:"Workflow migration"});
      audit("migrate","ticket",t.key,oldS+"→"+t.status);
    }
  });
  var idx = TS.workflows.findIndex(function(w){return w.id===workflowId});
  if (idx>=0) TS.workflows[idx]=draft;else TS.workflows.push(draft);
  delete TS.workflowDrafts[workflowId];
  audit("publish","workflow",workflowId,"with migration");saveTS();return {ok:true};
}
function validateWorkflow(wf){
  if (!wf.name) return {ok:false,msg:"ワークフロー名が必要です"};
  if (!wf.statuses||!wf.statuses.length) return {ok:false,msg:"少なくとも1つのStatusが必要です"};
  if (!wf.initialStatus||wf.statuses.indexOf(wf.initialStatus)<0) return {ok:false,msg:"初期Statusが無効です"};
  for (var i=0;i<(wf.transitions||[]).length;i++){
    var tr = wf.transitions[i];
    if (!tr.name) return {ok:false,msg:"遷移名が必要です (#"+(i+1)+")"};
    if (!tr.to||wf.statuses.indexOf(tr.to)<0) return {ok:false,msg:"遷移先 '"+tr.to+"' が無効です ("+tr.name+")"};
    for (var j=0;j<(tr.from||[]).length;j++){if(tr.from[j]!=="*"&&wf.statuses.indexOf(tr.from[j])<0)return{ok:false,msg:"遷移元 '"+tr.from[j]+"' が無効 ("+tr.name+")"}}
  }
  return {ok:true};
}
function exportWorkflowYaml(wf){
  function ys(s){s=String(s||"");if(/[:\#\[\]\{\},&\*\!\|\>\'\"\%\@\`]/.test(s)||s===""||s==="true"||s==="false"||s==="null"||/^\d/.test(s))return JSON.stringify(s);return s}
  var lines = [];
  lines.push("name: "+ys(wf.name));
  if (wf.description) lines.push("description: "+ys(wf.description));
  lines.push("initialStatus: "+ys(wf.initialStatus));
  lines.push("statuses:");
  wf.statuses.forEach(function(s){var st=TS.statuses.find(function(x){return x.id===s});lines.push("  - "+ys(st?st.name:s)+" # id: "+s)});
  lines.push("transitions:");
  (wf.transitions||[]).forEach(function(tr){
    lines.push("  - name: "+ys(tr.name));
    lines.push("    from: ["+(tr.from||[]).map(function(f){return ys(f)}).join(", ")+"]");
    lines.push("    to: "+ys(tr.to));
    if ((tr.conditions||[]).length){lines.push("    conditions:");tr.conditions.forEach(function(c){lines.push("      - "+ys(c.type||c))})}
    if ((tr.validators||[]).length){lines.push("    validators:");tr.validators.forEach(function(v){lines.push("      - "+ys(v.type||v))})}
    if ((tr.postFunctions||[]).length){lines.push("    postFunctions:");tr.postFunctions.forEach(function(p){if(p.value)lines.push("      - {type: "+ys(p.type)+", value: "+ys(p.value)+"}");else lines.push("      - "+ys(p.type||p))})}
  });
  return lines.join("\n")+"\n";
}
function downloadFile(name, content, mime){
  var b = new Blob([content], {type:mime||"text/plain"});
  var a = document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href);
}

/* ===== Workflow Designer UI ===== */
var WF_STATE = {selectedWorkflowId:null};

function renderWorkflowView(){
  var v = document.getElementById("workflowView");
  if (!TS.workflows.length){
    TS.workflows.push(JSON.parse(JSON.stringify(DEFAULT_WORKFLOW)));
    TS.workflowSchemes.push(JSON.parse(JSON.stringify(DEFAULT_SCHEME)));
    saveTS();
  }
  if (!TS.resolutions||!TS.resolutions.length) TS.resolutions = DEFAULT_RESOLUTIONS.slice();
  if (!WF_STATE.selectedWorkflowId) WF_STATE.selectedWorkflowId = TS.workflows[0].id;

  var html = '<div class="page-header"><div class="page-bc"><a>管理</a></div><div class="page-title">🔀 Workflows</div></div>';
  html += '<div class="page-toolbar"><button class="btn bp" id="wfNew">+ Workflow</button><button class="btn secondary" id="wfImport">📥 Import YAML</button><button class="btn secondary" id="wfExport">📤 Export YAML</button><div style="flex:1"></div><button class="btn secondary" id="wfSchemes">⚙ Schemes</button><button class="btn secondary" id="wfResolutions">🏷 Resolutions</button></div>';
  html += '<div class="wf-layout">';
  html += '<div class="wf-sidebar"><h4>Workflows<button class="btn-icon" id="wfNewSm">+</button></h4><div class="wf-list" id="wfList"></div></div>';
  html += '<div class="wf-canvas" id="wfCanvas"></div>';
  html += '</div>';
  v.innerHTML = html;
  renderWorkflowList();renderWorkflowCanvas();
  document.getElementById("wfNew").onclick=wfCreateDlg;
  document.getElementById("wfNewSm").onclick=wfCreateDlg;
  document.getElementById("wfImport").onclick=wfImportDlg;
  document.getElementById("wfExport").onclick=function(){var wf=TS.workflows.find(function(w){return w.id===WF_STATE.selectedWorkflowId});if(!wf){toast("ワークフローを選択",1);return}downloadFile(wf.name.replace(/\s+/g,"-").toLowerCase()+".workflow.yaml",exportWorkflowYaml(wf),"text/yaml");toast("YAMLをエクスポート")};
  document.getElementById("wfSchemes").onclick=wfSchemesDlg;
  document.getElementById("wfResolutions").onclick=wfResolutionsDlg;
}

function renderWorkflowList(){
  var el=document.getElementById("wfList");if(!el)return;el.innerHTML="";
  TS.workflows.forEach(function(wf){
    var d=document.createElement("div");
    d.className="wf-list-item"+(WF_STATE.selectedWorkflowId===wf.id?" active":"")+(TS.workflowDrafts[wf.id]?" draft":"");
    d.innerHTML='<span>🔀</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(wf.name)+'</span><span class="wf-list-status">'+(TS.workflowDrafts[wf.id]?"DRAFT":"")+'</span>';
    d.onclick=function(){WF_STATE.selectedWorkflowId=wf.id;renderWorkflowList();renderWorkflowCanvas()};
    el.appendChild(d);
  });
}

function renderWorkflowCanvas(){
  var c=document.getElementById("wfCanvas");if(!c)return;
  var wfId=WF_STATE.selectedWorkflowId;
  var draft=TS.workflowDrafts[wfId];
  var published=TS.workflows.find(function(w){return w.id===wfId});
  var wf=draft||published;
  if (!wf){c.innerHTML='<div class="empty-state"><div class="empty-state-icon">🔀</div><div class="empty-state-title">ワークフロー未選択</div><div class="empty-state-text">左から選択または新規作成</div></div>';return}
  if (!WF_STATE.viewMode) WF_STATE.viewMode = "diagram";
  var isDraft=!!draft;
  var html='<div class="wf-canvas-h"><h3>'+escHtml(wf.name)+'</h3><span class="wf-status-pill '+(isDraft?"draft":"published")+'">'+(isDraft?"DRAFT":"PUBLISHED")+'</span>';
  // View mode toggle
  html+='<div class="wf-view-toggle" style="display:flex;border:1px solid var(--bd);border-radius:3px;overflow:hidden">';
  html+='<button class="wf-vm '+(WF_STATE.viewMode==="diagram"?"on":"")+'" data-vm="diagram" style="padding:5px 10px;background:'+(WF_STATE.viewMode==="diagram"?"var(--ac)":"transparent")+';color:'+(WF_STATE.viewMode==="diagram"?"#fff":"var(--t2)")+';font-size:12px;border:none;cursor:pointer">📊 Diagram</button>';
  html+='<button class="wf-vm '+(WF_STATE.viewMode==="list"?"on":"")+'" data-vm="list" style="padding:5px 10px;background:'+(WF_STATE.viewMode==="list"?"var(--ac)":"transparent")+';color:'+(WF_STATE.viewMode==="list"?"#fff":"var(--t2)")+';font-size:12px;border:none;cursor:pointer">≡ List</button>';
  html+='</div>';
  if (isDraft){html+='<button class="btn bp" id="wfPublish">✓ Publish</button><button class="btn secondary" id="wfDiscard">Discard</button>'}
  else {html+='<button class="btn secondary" id="wfEdit">✎ Edit</button>'}
  html+='<button class="btn danger" id="wfDel">🗑</button></div>';

  if (WF_STATE.viewMode === "diagram"){
    // Diagram view container
    html += '<div class="wf-canvas-body wf-diagram-body" style="display:flex;flex-direction:column;overflow:hidden"></div>';
    c.innerHTML = html;
    var body = c.querySelector(".wf-diagram-body");
    if (typeof renderWorkflowVisualizer === "function") renderWorkflowVisualizer(body, wf, {wfId: wfId, isDraft: isDraft, draft: draft});
    else body.innerHTML = '<div class="empty-state"><div class="empty-state-text">可視化モジュール未読込</div></div>';
    bindCanvasButtons(c, wfId, wf, draft, published, isDraft);
    return;
  }

  html+='<div class="wf-canvas-body">';
  // Statuses
  html+='<div class="wf-statuses"><div class="wf-section-h"><span>Statuses ('+wf.statuses.length+')</span>'+(isDraft?'<button class="btn-icon" id="wfAddStatus">+</button>':'')+'</div>';
  wf.statuses.forEach(function(sid){
    var st=TS.statuses.find(function(x){return x.id===sid});
    var isInit=wf.initialStatus===sid;
    html+='<div class="wf-status-card"><span class="wf-status-dot" style="background:'+(st?st.color:"#888")+'"></span><span class="wf-status-name">'+escHtml(st?st.name:sid)+'</span>';
    if(isInit)html+='<span class="wf-init">INITIAL</span>';
    html+='<span class="wf-status-cat">'+(sid==="done"?"done":sid==="inprogress"||sid==="review"?"in-progress":"to-do")+'</span>';
    if(isDraft)html+='<button class="wf-rm-btn" data-rm-status="'+sid+'">×</button>';
    html+='</div>';
  });
  html+='</div>';
  // Transitions
  html+='<div class="wf-transitions"><div class="wf-section-h"><span>Transitions ('+wf.transitions.length+')</span>'+(isDraft?'<button class="btn-icon" id="wfAddTrans">+</button>':'')+'</div>';
  if (!wf.transitions.length){html+='<div style="color:var(--t3);text-align:center;padding:30px 10px;font-size:12px">遷移なし</div>'}
  else {
    wf.transitions.forEach(function(tr){
      var fromNames=(tr.from||[]).map(function(f){if(f==="*")return"(any)";var s=TS.statuses.find(function(x){return x.id===f});return s?s.name:f}).join(", ");
      var toSt=TS.statuses.find(function(x){return x.id===tr.to});
      html+='<div class="wf-trans-card"><div class="wf-trans-h"><span class="wf-trans-name">'+escHtml(tr.name)+'</span>';
      if(isDraft)html+='<button class="btn-icon" data-edit-trans="'+tr.id+'">✎</button><button class="btn-icon" data-rm-trans="'+tr.id+'" style="color:var(--dn)">×</button>';
      html+='</div><div class="wf-trans-flow"><span class="wf-from">'+escHtml(fromNames||"(any)")+'</span><span class="wf-arrow">→</span><span class="wf-to">'+escHtml(toSt?toSt.name:tr.to)+'</span></div>';
      html+='<div class="wf-trans-cv"><span>条件:<b>'+(tr.conditions||[]).length+'</b></span><span>検証:<b>'+(tr.validators||[]).length+'</b></span><span>ポスト関数:<b>'+(tr.postFunctions||[]).length+'</b></span></div></div>';
    });
  }
  html+='</div></div>';
  c.innerHTML=html;
  bindCanvasButtons(c, wfId, wf, draft, published, isDraft);
}

function bindCanvasButtons(c, wfId, wf, draft, published, isDraft){
  // View mode toggle
  c.querySelectorAll(".wf-vm").forEach(function(b){
    b.onclick = function(){
      WF_STATE.viewMode = b.dataset.vm;
      renderWorkflowCanvas();
    };
  });
  if (isDraft){
    var pb = document.getElementById("wfPublish"); if (pb) pb.onclick=function(){wfPublishHandler(wfId)};
    var db = document.getElementById("wfDiscard"); if (db) db.onclick=function(){if(confirm("草案を破棄しますか？")){discardDraft(wfId);renderWorkflowView();toast("破棄")}};
    var addS=document.getElementById("wfAddStatus");if(addS)addS.onclick=function(){wfAddStatusDlg(wfId)};
    var addT=document.getElementById("wfAddTrans");if(addT)addT.onclick=function(){wfTransitionDlg(wfId,null)};
    c.querySelectorAll("[data-edit-trans]").forEach(function(b){b.onclick=function(e){e.stopPropagation();wfTransitionDlg(wfId,b.dataset.editTrans)}});
    c.querySelectorAll("[data-rm-trans]").forEach(function(b){b.onclick=function(e){e.stopPropagation();if(confirm("この遷移を削除しますか？")){draft.transitions=draft.transitions.filter(function(x){return x.id!==b.dataset.rmTrans});saveDraft(wfId,draft);renderWorkflowCanvas()}}});
    c.querySelectorAll("[data-rm-status]").forEach(function(b){b.onclick=function(){var sid=b.dataset.rmStatus;if(draft.statuses.length<=1){toast("最低1つ必要",1);return}if(draft.initialStatus===sid){toast("初期Statusは削除不可",1);return}if(confirm("Status '"+sid+"' を草案から削除しますか？")){draft.statuses=draft.statuses.filter(function(s){return s!==sid});draft.transitions=draft.transitions.filter(function(tr){return tr.to!==sid&&(!tr.from||tr.from.indexOf(sid)<0)});saveDraft(wfId,draft);renderWorkflowCanvas()}}});
  } else {
    var eb = document.getElementById("wfEdit"); if (eb) eb.onclick=function(){TS.workflowDrafts[wfId]=JSON.parse(JSON.stringify(published));saveTS();renderWorkflowView();toast("編集モード開始")};
  }
  var delBtn = document.getElementById("wfDel"); if (delBtn) delBtn.onclick=function(){if(confirm("ワークフローを完全削除しますか？\n"+wf.name)){if(deleteWorkflow(wfId)){WF_STATE.selectedWorkflowId=TS.workflows[0]?TS.workflows[0].id:null;renderWorkflowView();toast("削除")}}};
}

function wfPublishHandler(wfId){
  var r=publishDraft(wfId);
  if (r.ok){toast("公開しました");renderWorkflowView();return}
  if (r.requiresMigration){wfMigrationWizard(wfId,r.migrationNeeded,r.removed);return}
  toast(r.msg||"公開失敗",1);
}

function wfMigrationWizard(wfId, needed, removed){
  var draft=TS.workflowDrafts[wfId];if(!draft)return;
  var newOpts=draft.statuses.map(function(s){var st=TS.statuses.find(function(x){return x.id===s});return '<option value="'+s+'">'+escHtml(st?st.name:s)+'</option>'}).join("");
  var byOld={};needed.forEach(function(n){if(!byOld[n.oldStatus])byOld[n.oldStatus]=[];byOld[n.oldStatus].push(n.key)});
  var html='<h3>🔄 Status Migration Wizard</h3><p style="font-size:13px;color:var(--t2);margin-bottom:14px">削除されるStatusに該当するチケットの移行先を指定してください。</p>';
  removed.forEach(function(oldS){
    var st=TS.statuses.find(function(x){return x.id===oldS});var keys=byOld[oldS]||[];
    html+='<div class="mw-row"><div class="mw-old">'+escHtml(st?st.name:oldS)+' <span style="font-size:10px;opacity:.7">('+keys.length+'件)</span></div><div class="mw-arrow">→</div><select class="mw-new" data-old="'+oldS+'">'+newOpts+'</select></div>';
    html+='<div style="font-size:10px;color:var(--t3);margin:-4px 0 8px;padding-left:8px">対象: '+keys.slice(0,10).join(", ")+(keys.length>10?(" ...他"+(keys.length-10)+"件"):"")+'</div>';
  });
  html+='<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="mwOk">移行して公開</button></div>';
  showModal(html);
  document.getElementById("mwOk").onclick=function(){
    var map={};document.querySelectorAll(".mw-new").forEach(function(s){map[s.dataset.old]=s.value});
    var r=publishWithMigration(wfId,map);
    if(r.ok){closeModal();renderWorkflowView();toast(needed.length+"件移行+公開完了")}else{toast(r.msg||"失敗",1)}
  };
}

function wfCreateDlg(){
  showModal('<h3>+ 新規ワークフロー</h3><label>名前</label><input id="wfcN" placeholder="My Workflow"><label>説明</label><textarea id="wfcD" rows="2"></textarea><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="wfcOk">作成</button></div>');
  document.getElementById("wfcOk").onclick=function(){var n=document.getElementById("wfcN").value.trim();if(!n){toast("名前必須",1);return}var id=createWorkflow(n);var wf=TS.workflows.find(function(w){return w.id===id});wf.description=document.getElementById("wfcD").value;TS.workflowDrafts[id]=JSON.parse(JSON.stringify(wf));saveTS();WF_STATE.selectedWorkflowId=id;closeModal();renderWorkflowView()};
}

function wfAddStatusDlg(wfId){
  var draft=TS.workflowDrafts[wfId];
  if (!draft){toast("Edit ボタンを押して Draft モードに入ってください",1);return}
  var avail=TS.statuses.filter(function(s){return draft.statuses.indexOf(s.id)<0});
  var html='<h3>+ Status追加</h3>';
  html+='<div style="font-size:12px;color:var(--t2);margin-bottom:14px">既存のステータスから選ぶか、新しいステータスを作成できます</div>';

  // Tab switcher
  html+='<div style="display:flex;gap:0;border-bottom:1px solid var(--bd);margin-bottom:14px">';
  html+='<button class="wfas-tab on" data-tab="new" style="padding:8px 14px;background:none;border:none;border-bottom:2px solid var(--ac);color:var(--ac);font-weight:600;cursor:pointer;font-family:inherit">✨ 新規作成</button>';
  if (avail.length){
    html+='<button class="wfas-tab" data-tab="exist" style="padding:8px 14px;background:none;border:none;border-bottom:2px solid transparent;color:var(--t2);cursor:pointer;font-family:inherit">既存から選択 ('+avail.length+')</button>';
  }
  html+='</div>';

  // New status pane (default)
  html+='<div class="wfas-pane" data-pane="new">';
  html+='<label>ステータス名 *</label><input id="wfasNewName" placeholder="例: 対応待ち" autofocus>';
  html+='<label>カテゴリ</label><select id="wfasNewCat"><option value="todo">To Do (グレー系)</option><option value="inprogress">In Progress (青系)</option><option value="review">Review (黄系)</option><option value="done">Done (緑系)</option></select>';
  html+='<label>色 (任意)</label><input type="color" id="wfasNewColor" value="#5e6c84" style="width:60px;height:34px;border:1px solid var(--bd);border-radius:3px;cursor:pointer">';
  html+='</div>';

  // Existing pane
  if (avail.length){
    var opts=avail.map(function(s){return '<option value="'+s.id+'">'+escHtml(s.name)+'</option>'}).join("");
    html+='<div class="wfas-pane" data-pane="exist" style="display:none"><label>ステータス</label><select id="wfasS">'+opts+'</select></div>';
  }

  html+='<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="wfasOk">追加</button></div>';
  showModal(html);

  var activeTab = "new";
  document.querySelectorAll(".wfas-tab").forEach(function(t){
    t.onclick=function(){
      activeTab = t.dataset.tab;
      document.querySelectorAll(".wfas-tab").forEach(function(x){
        var on = x.dataset.tab === activeTab;
        x.classList.toggle("on", on);
        x.style.color = on ? "var(--ac)" : "var(--t2)";
        x.style.borderBottomColor = on ? "var(--ac)" : "transparent";
        x.style.fontWeight = on ? "600" : "400";
      });
      document.querySelectorAll(".wfas-pane").forEach(function(p){
        p.style.display = (p.dataset.pane === activeTab) ? "block" : "none";
      });
    };
  });

  // Default category color preset
  var catColors = {todo:"#5e6c84", inprogress:"#0c66e4", review:"#a54800", done:"#216e4e"};
  document.getElementById("wfasNewCat").onchange = function(){
    document.getElementById("wfasNewColor").value = catColors[this.value] || "#5e6c84";
  };

  document.getElementById("wfasOk").onclick=function(){
    if (typeof urCapture === "function") urCapture("Status追加", true);
    if (activeTab === "new"){
      var name = document.getElementById("wfasNewName").value.trim();
      if (!name){toast("ステータス名必須",1);return}
      // Auto-generate id
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
      if (!id) id = "status_"+Date.now();
      // Make unique
      var orig = id; var n = 2;
      while (TS.statuses.find(function(s){return s.id===id})){id = orig+"_"+n; n++}
      var color = document.getElementById("wfasNewColor").value;
      var category = document.getElementById("wfasNewCat").value;
      TS.statuses.push({id:id, name:name, color:color, category:category});
      draft.statuses.push(id);
      saveDraft(wfId,draft);
      saveTS();
      closeModal();
      toast("✓ "+name+" を作成して追加");
      renderWorkflowCanvas();
    } else {
      var sid = document.getElementById("wfasS").value;
      if (!sid) return;
      draft.statuses.push(sid);
      saveDraft(wfId,draft);
      closeModal();
      toast("✓ ステータス追加");
      renderWorkflowCanvas();
    }
  };
}

function wfTransitionDlg(wfId, transitionId){
  var draft=TS.workflowDrafts[wfId];
  var tr=transitionId?draft.transitions.find(function(x){return x.id===transitionId}):{id:"tr-"+Date.now(),name:"",from:[],to:draft.statuses[0],conditions:[],validators:[],postFunctions:[]};
  var statusOpts=draft.statuses.map(function(s){var st=TS.statuses.find(function(x){return x.id===s});return '<option value="'+s+'"'+(tr.to===s?" selected":"")+'>'+escHtml(st?st.name:s)+'</option>'}).join("");
  var fromOpts='<option value="*"'+(tr.from&&tr.from.indexOf("*")>=0?" selected":"")+'>(Any status / Global)</option>'+draft.statuses.map(function(s){var st=TS.statuses.find(function(x){return x.id===s});var sel=tr.from&&tr.from.indexOf(s)>=0?" selected":"";return '<option value="'+s+'"'+sel+'>'+escHtml(st?st.name:s)+'</option>'}).join("");
  var html='<h3>'+(transitionId?"✎ 遷移編集":"+ 遷移追加")+'</h3>';
  html+='<div class="wf-tab-bar"><div class="wf-tab on" data-tab="basic">Basic</div><div class="wf-tab" data-tab="cond">Conditions</div><div class="wf-tab" data-tab="val">Validators</div><div class="wf-tab" data-tab="pf">Post Functions</div></div>';
  html+='<div class="wf-tab-pane" data-pane="basic"><label>遷移名</label><input id="wftN" value="'+escHtml(tr.name||"")+'" placeholder="Start Progress"><label>From (元Status, 複数可)</label><select id="wftF" multiple style="height:100px">'+fromOpts+'</select><div style="font-size:10px;color:var(--t3);margin-top:-6px;margin-bottom:8px">複数選択可</div><label>To (遷移先)</label><select id="wftT">'+statusOpts+'</select></div>';
  html+='<div class="wf-tab-pane" data-pane="cond" style="display:none"><div style="font-size:11px;color:var(--t2);margin-bottom:8px">遷移を実行できる条件</div><div class="wf-cond-list" id="wftCondList"></div><select id="wftCondSel" style="margin-top:8px">'+Object.keys(WF_CONDITIONS).map(function(k){return '<option value="'+k+'">'+escHtml(WF_CONDITIONS[k].label)+'</option>'}).join("")+'</select><button class="btn secondary" id="wftCondAdd" style="margin-left:6px">+ 追加</button></div>';
  html+='<div class="wf-tab-pane" data-pane="val" style="display:none"><div style="font-size:11px;color:var(--t2);margin-bottom:8px">遷移実行時にチェックされる必須項目</div><div class="wf-cond-list" id="wftValList"></div><select id="wftValSel" style="margin-top:8px">'+Object.keys(WF_VALIDATORS).map(function(k){return '<option value="'+k+'">'+escHtml(WF_VALIDATORS[k].label)+'</option>'}).join("")+'</select><button class="btn secondary" id="wftValAdd" style="margin-left:6px">+ 追加</button></div>';
  html+='<div class="wf-tab-pane" data-pane="pf" style="display:none"><div style="font-size:11px;color:var(--t2);margin-bottom:8px">遷移成功後の自動処理</div><div class="wf-cond-list" id="wftPfList"></div><select id="wftPfSel" style="margin-top:8px">'+Object.keys(WF_POSTFUNCTIONS).map(function(k){return '<option value="'+k+'">'+escHtml(WF_POSTFUNCTIONS[k].label)+'</option>'}).join("")+'</select><button class="btn secondary" id="wftPfAdd" style="margin-left:6px">+ 追加</button></div>';
  html+='<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="wftOk">'+(transitionId?"保存":"追加")+'</button></div>';
  showModal(html);
  document.querySelectorAll(".wf-tab").forEach(function(t){t.onclick=function(){document.querySelectorAll(".wf-tab").forEach(function(x){x.classList.toggle("on",x===t)});document.querySelectorAll(".wf-tab-pane").forEach(function(p){p.style.display=p.dataset.pane===t.dataset.tab?"block":"none"})}});
  function renderCV(){
    var cl=document.getElementById("wftCondList");cl.innerHTML="";
    (tr.conditions||[]).forEach(function(c,i){var d=document.createElement("div");d.className="wf-cond-row";var typ=c.type||c;d.innerHTML='<span>📋</span><span style="flex:1">'+escHtml(WF_CONDITIONS[typ]?WF_CONDITIONS[typ].label:typ)+'</span><button class="wf-cond-rm">×</button>';d.querySelector(".wf-cond-rm").onclick=function(){tr.conditions.splice(i,1);renderCV()};cl.appendChild(d)});
    var vl=document.getElementById("wftValList");vl.innerHTML="";
    (tr.validators||[]).forEach(function(v,i){var d=document.createElement("div");d.className="wf-cond-row";var typ=v.type||v;d.innerHTML='<span>✓</span><span style="flex:1">'+escHtml(WF_VALIDATORS[typ]?WF_VALIDATORS[typ].label:typ)+'</span><button class="wf-cond-rm">×</button>';d.querySelector(".wf-cond-rm").onclick=function(){tr.validators.splice(i,1);renderCV()};vl.appendChild(d)});
    var pl=document.getElementById("wftPfList");pl.innerHTML="";
    (tr.postFunctions||[]).forEach(function(p,i){var d=document.createElement("div");d.className="wf-cond-row";var typ=p.type||p;var lbl=WF_POSTFUNCTIONS[typ]?WF_POSTFUNCTIONS[typ].label:typ;if(p.value)lbl+=" (= "+p.value+")";d.innerHTML='<span>⚡</span><span style="flex:1">'+escHtml(lbl)+'</span><button class="wf-cond-rm">×</button>';d.querySelector(".wf-cond-rm").onclick=function(){tr.postFunctions.splice(i,1);renderCV()};pl.appendChild(d)});
  }
  renderCV();
  document.getElementById("wftCondAdd").onclick=function(){tr.conditions=tr.conditions||[];tr.conditions.push({type:document.getElementById("wftCondSel").value});renderCV()};
  document.getElementById("wftValAdd").onclick=function(){tr.validators=tr.validators||[];tr.validators.push({type:document.getElementById("wftValSel").value});renderCV()};
  document.getElementById("wftPfAdd").onclick=function(){var v=document.getElementById("wftPfSel").value;var pf={type:v};if(v==="set_resolution"){pf.value=prompt("Resolution値","done");if(!pf.value)return}tr.postFunctions=tr.postFunctions||[];tr.postFunctions.push(pf);renderCV()};
  document.getElementById("wftOk").onclick=function(){
    tr.name=document.getElementById("wftN").value.trim();
    if(!tr.name){toast("遷移名必須",1);return}
    var fSel=document.getElementById("wftF");tr.from=[];for(var i=0;i<fSel.options.length;i++)if(fSel.options[i].selected)tr.from.push(fSel.options[i].value);
    tr.to=document.getElementById("wftT").value;
    if(!transitionId)draft.transitions.push(tr);
    saveDraft(wfId,draft);closeModal();renderWorkflowCanvas();
  };
}

function wfImportDlg(){
  showModal('<h3>📥 ワークフローYAMLインポート</h3><textarea id="wfImpY" style="width:100%;min-height:200px;padding:8px;border:1px solid var(--bd);border-radius:3px;background:var(--b1);color:var(--t1);font-family:\'SF Mono\',monospace;font-size:11px;outline:none"></textarea><input type="file" id="wfImpFile" accept=".yaml,.yml" style="display:block;margin-top:6px"><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="wfImpOk">インポート</button></div>');
  document.getElementById("wfImpFile").onchange=function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){document.getElementById("wfImpY").value=ev.target.result};r.readAsText(f)};
  document.getElementById("wfImpOk").onclick=function(){
    var y=document.getElementById("wfImpY").value.trim();if(!y){toast("YAMLを入力",1);return}
    try{
      var parsed=(typeof yP==="function")?yP(y):null;
      if(!parsed||!parsed.name){toast("無効なYAML",1);return}
      var statusIds=(parsed.statuses||[]).map(function(s){var f=TS.statuses.find(function(x){return x.name===s||x.id===s});return f?f.id:(TS.statuses[0]?TS.statuses[0].id:"todo")});
      var wf={id:"wf-"+Date.now(),name:parsed.name,description:parsed.description||"",initialStatus:statusIds[0],statuses:statusIds,transitions:[]};
      (parsed.transitions||[]).forEach(function(tr,i){
        var fromIds=(tr.from||[]).map(function(f){var fnd=TS.statuses.find(function(x){return x.name===f||x.id===f});return fnd?fnd.id:f});
        var toFnd=TS.statuses.find(function(x){return x.name===tr.to||x.id===tr.to});
        wf.transitions.push({id:"tr-imp-"+i+"-"+Date.now(),name:tr.name,from:fromIds,to:toFnd?toFnd.id:tr.to,conditions:(tr.conditions||[]).map(function(c){return typeof c==="string"?{type:c}:c}),validators:(tr.validators||[]).map(function(c){return typeof c==="string"?{type:c}:c}),postFunctions:(tr.postFunctions||[]).map(function(c){return typeof c==="string"?{type:c}:c})});
      });
      TS.workflowDrafts[wf.id]=wf;
      TS.workflows.push(JSON.parse(JSON.stringify(wf)));
      WF_STATE.selectedWorkflowId=wf.id;
      saveTS();closeModal();renderWorkflowView();toast("インポート完了 (草案として保存)");
    }catch(e){console.error(e);toast("パースエラー: "+e.message,1)}
  };
}

function wfSchemesDlg(){
  var html='<h3>⚙ Workflow Schemes</h3><p style="font-size:12px;color:var(--t2);margin-bottom:10px">IssueTypeごとに使うWorkflowを指定</p>';
  TS.workflowSchemes.forEach(function(sc){
    html+='<div style="background:var(--b2);padding:12px;border-radius:4px;margin-bottom:10px"><div style="font-weight:600;margin-bottom:6px">'+escHtml(sc.name)+'</div>';
    var defOpts=TS.workflows.map(function(w){return '<option value="'+w.id+'"'+(sc.defaultWorkflowId===w.id?" selected":"")+'>'+escHtml(w.name)+'</option>'}).join("");
    html+='<label>Default Workflow</label><select data-scheme="'+sc.id+'" data-field="default">'+defOpts+'</select><label style="margin-top:8px">Type別マッピング</label>';
    TS.types.forEach(function(tp){
      var m=(sc.mappings||[]).find(function(x){return x.issueType===tp});
      var opts='<option value="">(default)</option>'+TS.workflows.map(function(w){return '<option value="'+w.id+'"'+(m&&m.workflowId===w.id?" selected":"")+'>'+escHtml(w.name)+'</option>'}).join("");
      html+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px"><span style="width:80px;font-size:12px;color:var(--t2)">'+tp+'</span><select data-scheme="'+sc.id+'" data-type="'+tp+'" style="flex:1">'+opts+'</select></div>';
    });
    html+='</div>';
  });
  html+='<div class="ma"><button class="btn bp" onclick="closeModal()">閉じる</button></div>';
  showModal(html);
  document.querySelectorAll("[data-scheme]").forEach(function(el){el.onchange=function(){var sc=TS.workflowSchemes.find(function(x){return x.id===el.dataset.scheme});if(!sc)return;if(el.dataset.field==="default")sc.defaultWorkflowId=el.value;else if(el.dataset.type){sc.mappings=sc.mappings||[];sc.mappings=sc.mappings.filter(function(m){return m.issueType!==el.dataset.type});if(el.value)sc.mappings.push({issueType:el.dataset.type,workflowId:el.value})}audit("update","workflow_scheme",sc.id,"");saveTS()}});
}

function wfResolutionsDlg(){
  var html='<h3>🏷 Resolutions</h3><p style="font-size:12px;color:var(--t2);margin-bottom:10px">チケットの解決状態</p><div id="rsList"></div><div class="adm-add" style="margin-top:10px"><input id="rsName" placeholder="新規Resolution名"><button class="btn bp" id="rsAdd">+ 追加</button></div><div class="ma"><button class="btn bp" onclick="closeModal()">閉じる</button></div>';
  showModal(html);
  function renderR(){var l=document.getElementById("rsList");l.innerHTML="";TS.resolutions.forEach(function(r,i){var d=document.createElement("div");d.className="adm-item";d.innerHTML='<span class="ai-name">'+escHtml(r.name)+'</span><span style="font-size:10px;color:var(--t3)">'+r.id+'</span>'+(r.isDefault?'<span style="font-size:9px;color:var(--gn);background:var(--gn-bg);padding:1px 6px;border-radius:3px;margin-left:6px">DEFAULT</span>':'')+'<button class="ai-rm">×</button>';d.querySelector(".ai-rm").onclick=function(){if(r.isDefault){toast("デフォルトは削除不可",1);return}TS.resolutions.splice(i,1);saveTS();renderR()};l.appendChild(d)})}
  renderR();
  document.getElementById("rsAdd").onclick=function(){var n=document.getElementById("rsName").value.trim();if(!n)return;TS.resolutions.push({id:n.toLowerCase().replace(/\s+/g,"_"),name:n});document.getElementById("rsName").value="";saveTS();renderR()};
}

/* ===== Transition Dialog (per-ticket execution) ===== */
function showTransitionDlg(ticket, transition){
  var needComment=(transition.validators||[]).some(function(v){return (v.type||v)==="comment_required"});
  var needResolution=(transition.validators||[]).some(function(v){return (v.type||v)==="resolution_required"});
  var needAssignee=(transition.validators||[]).some(function(v){return (v.type||v)==="assignee_required"});
  var needDue=(transition.validators||[]).some(function(v){return (v.type||v)==="duedate_required"});
  var fromSt=TS.statuses.find(function(x){return x.id===ticket.status});
  var toSt=TS.statuses.find(function(x){return x.id===transition.to});
  var html='<h3>🔄 '+escHtml(transition.name)+'</h3><div class="wf-trans-flow" style="margin-bottom:14px"><span class="wf-from">'+escHtml(fromSt?fromSt.name:ticket.status)+'</span><span class="wf-arrow">→</span><span class="wf-to">'+escHtml(toSt?toSt.name:transition.to)+'</span></div>';
  if (needAssignee){var asgOpts='<option value="">-- 選択 --</option>'+TS.users.map(function(u){return '<option value="'+u.id+'"'+(ticket.assignee===u.id?" selected":"")+'>'+escHtml(u.name)+'</option>'}).join("");html+='<label>担当者 *</label><select id="trDlgAsg">'+asgOpts+'</select>'}
  if (needDue){html+='<label>期限 *</label><input id="trDlgDue" type="date" value="'+(ticket.dueDate||"")+'">'}
  if (needResolution){var resOpts='<option value="">-- 選択 --</option>'+TS.resolutions.map(function(r){return '<option value="'+r.id+'">'+escHtml(r.name)+'</option>'}).join("");html+='<label>Resolution *</label><select id="trDlgRes">'+resOpts+'</select>'}
  html+='<label>'+(needComment?"コメント *":"コメント (任意)")+'</label><textarea id="trDlgCmt" style="width:100%;min-height:60px;padding:6px 10px;border:1px solid var(--bd);border-radius:3px;background:var(--b1);color:var(--t1);font-family:inherit;font-size:13px;outline:none"></textarea>';
  if ((transition.conditions||[]).length||(transition.validators||[]).length||(transition.postFunctions||[]).length){
    html+='<div style="margin-top:10px;padding:8px 10px;background:var(--b2);border-radius:3px;font-size:11px;color:var(--t2)"><b>このアクションには以下が適用されます:</b><br>';
    (transition.conditions||[]).forEach(function(c){var t=c.type||c;html+='・条件: '+(WF_CONDITIONS[t]?WF_CONDITIONS[t].label:t)+'<br>'});
    (transition.validators||[]).forEach(function(v){var t=v.type||v;html+='・検証: '+(WF_VALIDATORS[t]?WF_VALIDATORS[t].label:t)+'<br>'});
    (transition.postFunctions||[]).forEach(function(p){var t=p.type||p;html+='・自動: '+(WF_POSTFUNCTIONS[t]?WF_POSTFUNCTIONS[t].label:t)+(p.value?(" ("+p.value+")"):'')+'<br>'});
    html+='</div>';
  }
  html+='<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="trDlgOk">'+escHtml(transition.name)+'</button></div>';
  showModal(html);
  document.getElementById("trDlgOk").onclick=function(){
    var ctx={comment:document.getElementById("trDlgCmt").value};
    var trAsg=document.getElementById("trDlgAsg");if(trAsg)ctx.assignee=trAsg.value;
    var trDue=document.getElementById("trDlgDue");if(trDue)ctx.dueDate=trDue.value;
    var trRes=document.getElementById("trDlgRes");if(trRes)ctx.resolution=trRes.value;
    var r=executeTransition(ticket.key,transition.id,ctx);
    if(r.ok){closeModal();toast("'"+transition.name+"' 実行成功");if(TS.currentView==="ticket"&&typeof renderTicketView==="function")renderTicketView();else if(TS.currentView==="kanban"&&typeof renderKanbanView==="function")renderKanbanView();else if(TS.currentView==="backlog"&&typeof renderBacklogView==="function")renderBacklogView()}
    else{toast(r.msg||"失敗",1)}
  };
}

