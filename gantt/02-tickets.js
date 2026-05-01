/* ============================================================
   TICKET MANAGEMENT EXTENSION
   - LocalStorage persistence
   - Tickets, Kanban, Backlog, Audit, Admin
   - JQL-compatible search
   - Roles, Notifications, Audit log, Git linking
   ============================================================ */

var DEFAULT_STATUSES = [
  {id:"todo", name:"未着手", color:"#95a5a6"},
  {id:"inprogress", name:"進行中", color:"#3498db"},
  {id:"review", name:"レビュー", color:"#f39c12"},
  {id:"done", name:"完了", color:"#27ae60"}
];
var DEFAULT_PRIORITIES = ["highest","high","medium","low","lowest"];
var DEFAULT_TYPES = ["task","bug","story","epic","incident"];
var DEFAULT_ROLES = [
  {id:"admin", name:"管理者", perms:["*"]},
  {id:"editor", name:"編集者", perms:["ticket.create","ticket.edit","ticket.delete","comment.create"]},
  {id:"viewer", name:"閲覧者", perms:["ticket.view","comment.create"]}
];

/* ===== Persistence ===== */
function saveTS(){
  try {
    var snap = {
      tickets:TS.tickets,users:TS.users,roles:TS.roles,statuses:TS.statuses,
      priorities:TS.priorities,types:TS.types,sprints:TS.sprints,
      notifications:TS.notifications,auditLog:TS.auditLog.slice(-500),
      currentUser:TS.currentUser,ticketSeq:TS.ticketSeq,
      autoLink:TS.autoLink,gitProvider:TS.gitProvider,gitRepo:TS.gitRepo,
      workflows:TS.workflows,workflowSchemes:TS.workflowSchemes,workflowDrafts:TS.workflowDrafts,
      resolutions:TS.resolutions,customFields:TS.customFields,ticketHistory:TS.ticketHistory,
      templates:TS.templates,alertConfig:TS.alertConfig,autoCompleteParent:TS.autoCompleteParent,
      templatesInitialized:TS.templatesInitialized,
      yaml: document.getElementById("ye") ? document.getElementById("ye").value : ""
    };
    localStorage.setItem("ganttTicketState", JSON.stringify(snap));
  } catch(e) { console.warn("Save failed:", e); }
}

function loadTS(){
  try {
    var raw = localStorage.getItem("ganttTicketState");
    if (!raw) return false;
    var s = JSON.parse(raw);
    TS.tickets = s.tickets || [];
    TS.users = s.users || [];
    TS.roles = s.roles || DEFAULT_ROLES;
    TS.statuses = s.statuses || DEFAULT_STATUSES;
    TS.priorities = s.priorities || DEFAULT_PRIORITIES;
    TS.types = s.types || DEFAULT_TYPES;
    TS.sprints = s.sprints || [];
    TS.notifications = s.notifications || [];
    TS.auditLog = s.auditLog || [];
    TS.currentUser = s.currentUser || null;
    TS.ticketSeq = s.ticketSeq || 1;
    TS.autoLink = s.autoLink !== false;
    TS.gitProvider = s.gitProvider || "github";
    TS.gitRepo = s.gitRepo || "";
    TS.workflows = s.workflows || [];
    TS.workflowSchemes = s.workflowSchemes || [];
    TS.workflowDrafts = s.workflowDrafts || {};
    TS.resolutions = s.resolutions || [];
    TS.customFields = s.customFields || [];
    TS.ticketHistory = s.ticketHistory || {};
    TS.templates = s.templates || [];
    TS.templatesInitialized = !!s.templatesInitialized;
    TS.alertConfig = s.alertConfig || null;
    TS.autoCompleteParent = s.autoCompleteParent || "prompt";
    if (s.yaml && document.getElementById("ye")) document.getElementById("ye").value = s.yaml;
    return true;
  } catch(e) { console.warn("Load failed:", e); return false; }
}

/* ===== Audit Log ===== */
function audit(action, entity, entityId, detail){
  TS.auditLog.push({
    ts: new Date().toISOString(),
    user: TS.currentUser ? TS.currentUser.id : "system",
    action: action, entity: entity, entityId: entityId, detail: detail||""
  });
  if (TS.auditLog.length > 500) TS.auditLog.shift();
}

/* ===== Permission ===== */
function hasPerm(perm){
  if (!TS.currentUser) return false;
  var role = TS.roles.find(function(r){return r.id===TS.currentUser.roleId});
  if (!role) return false;
  return role.perms.indexOf("*")>=0 || role.perms.indexOf(perm)>=0;
}

/* ===== Notifications ===== */
function notify(userId, msg, ticketId){
  TS.notifications.push({
    id: "n"+Date.now()+Math.random().toString(36).substr(2,4),
    userId: userId, msg: msg, ticketId: ticketId||null,
    ts: new Date().toISOString(), read: false
  });
  updateBell();
}
function updateBell(){
  var bc = document.getElementById("bellCnt");
  if (!bc || !TS.currentUser) return;
  if (!TS.notifications) TS.notifications = [];
  var unread = TS.notifications.filter(function(n){return n.userId===TS.currentUser.id && !n.read}).length;
  bc.textContent = unread;
  bc.classList.toggle("on", unread>0);
}
function renderNotif(){
  var nl = document.getElementById("notifList");
  if (!nl) return;
  nl.innerHTML = "";
  if (!TS.currentUser){nl.innerHTML='<div class="notif-item">ログインしてください</div>';return}
  if (!TS.notifications) TS.notifications = [];
  var mine = TS.notifications.filter(function(n){return n.userId===TS.currentUser.id}).slice().reverse();
  if (!mine.length){nl.innerHTML='<div class="notif-item" style="color:var(--t3)">通知なし</div>';return}
  mine.forEach(function(n){
    var d = document.createElement("div");
    d.className = "notif-item"+(n.read?"":" unread");
    var t = new Date(n.ts);
    d.innerHTML = '<div>'+escHtml(n.msg)+'</div><div class="nf-time">'+t.toLocaleString("ja-JP")+'</div>';
    d.onclick = function(){
      n.read = true;
      if (n.ticketId){TS.selectedTicket = n.ticketId;switchView("ticket")}
      saveTS();updateBell();renderNotif();
      document.getElementById("notif").style.display = "none";
    };
    nl.appendChild(d);
  });
}

function escHtml(s){return String(s||"").replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

/* ===== Ticket CRUD ===== */
function newTicketKey(){return "TK-"+(TS.ticketSeq++)}

function createTicket(data){
  if (!hasPerm("ticket.create")){toast("権限がありません",1);return null}
  var t = {
    key: data.key || newTicketKey(),
    title: data.title || "",
    description: data.description || "",
    type: data.type || "task",
    status: data.status || "todo",
    priority: data.priority || "medium",
    assignee: data.assignee || "",
    reporter: data.reporter || (TS.currentUser?TS.currentUser.id:""),
    labels: data.labels || [],
    dueDate: data.dueDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    storyPoint: data.storyPoint || null,
    sprintId: data.sprintId || null,
    parentKey: data.parentKey || null,
    links: data.links || [],
    comments: [],
    attachments: [],
    customFields: data.customFields || {},
    ganttTaskId: data.ganttTaskId || null,
    gitRefs: data.gitRefs || []
  };
  TS.tickets.push(t);
  // Auto-create Gantt task and link, unless one was provided or _skipGantt is set
  if (!t.ganttTaskId && !data._skipGantt && typeof S !== "undefined" && S.data){
    autoCreateGanttForTicket(t);
  }
  audit("create","ticket",t.key,t.title);
  if (t.assignee && t.assignee !== (TS.currentUser?TS.currentUser.id:""))
    notify(t.assignee, t.key+" があなたにアサインされました: "+t.title, t.key);
  saveTS();
  return t;
}

/* Helper: create a Gantt task linked to the ticket */
function autoCreateGanttForTicket(t){
  if (typeof S === "undefined" || !S.data) return;
  if (!S.data.tasks) S.data.tasks = [];
  // Ensure project dates are set so render() doesn't NaN
  if (!S.data.project || typeof S.data.project === "string"){
    var pn = (typeof S.data.project === "string") ? S.data.project : ((typeof getActiveProject === "function" && getActiveProject()) ? getActiveProject().name : "Project");
    S.data.project = {name: pn};
  }
  if (!S.data.project.start_date){
    var t0 = new Date();
    S.data.project.start_date = t0.toISOString().substr(0,10);
    S.data.project.end_date = new Date(t0.getTime() + 30*86400000).toISOString().substr(0,10);
  }
  // Generate gantt id from ticket key (e.g. SAMPLE-3 -> sample_3)
  var gid = t.key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  // Ensure unique
  var orig = gid, n = 2;
  while (typeof S.flat !== "undefined" && S.flat && S.flat.find(function(x){return x.id===gid})){
    gid = orig+"_"+n; n++;
  }
  // Default dates: today to today+ (storyPoint or 3) days
  var today = new Date();
  var sd = today.toISOString().substr(0,10);
  var dur = t.storyPoint || 3;
  var ed = new Date(today.getTime() + dur*86400000);
  var edStr = (t.dueDate || ed.toISOString().substr(0,10));
  var ganttTask = {
    id: gid,
    name: t.title,
    sd: sd,
    ed: edStr,
    progress: t.status === "done" ? 100 : (t.status === "inprogress" ? 50 : 0),
    assignee: t.assignee || "",
    color: ""
  };
  S.data.tasks.push(ganttTask);
  t.ganttTaskId = gid;
  // Refresh flat list and re-render
  if (typeof flatAll === "function") S.flat = flatAll(S.data.tasks);
  if (typeof yS === "function" && document.getElementById("ye")){
    document.getElementById("ye").value = yS(S.data);
  }
  if (typeof resG === "function") resG(S.flat||[]);
  if (typeof render === "function") render();
}

function updateTicket(key, patch){
  if (!hasPerm("ticket.edit")){toast("権限がありません",1);return false}
  var t = TS.tickets.find(function(x){return x.key===key});
  if (!t) return false;
  var oldAsg = t.assignee;
  Object.keys(patch).forEach(function(k){t[k]=patch[k]});
  t.updatedAt = new Date().toISOString();
  audit("update","ticket",key,Object.keys(patch).join(","));
  if (patch.assignee && patch.assignee !== oldAsg && patch.assignee !== (TS.currentUser?TS.currentUser.id:""))
    notify(patch.assignee, key+" があなたにアサインされました: "+t.title, key);
  // Sync to Gantt
  if (t.ganttTaskId && typeof S !== "undefined" && S.flat){
    var g = S.flat.find(function(x){return x.id===t.ganttTaskId});
    if (g){
      var changed = false;
      if (patch.title !== undefined && g.name !== patch.title){g.name = patch.title; changed = true}
      if (patch.assignee !== undefined && g.assignee !== patch.assignee){g.assignee = patch.assignee; changed = true}
      if (patch.dueDate !== undefined && g.ed !== patch.dueDate){g.ed = patch.dueDate; changed = true}
      if (patch.status !== undefined){
        var newProgress = patch.status === "done" ? 100 : (patch.status === "inprogress" ? 50 : 0);
        if (g.progress !== newProgress){g.progress = newProgress; changed = true}
      }
      if (changed){
        if (typeof yS === "function" && document.getElementById("ye")){
          document.getElementById("ye").value = yS(S.data);
        }
        if (typeof resG === "function") resG(S.flat);
        if (typeof render === "function") render();
      }
    }
  }
  saveTS();
  return true;
}

function deleteTicket(key){
  if (!hasPerm("ticket.delete")){toast("権限がありません",1);return false}
  var idx = TS.tickets.findIndex(function(x){return x.key===key});
  if (idx<0) return false;
  var t = TS.tickets[idx];
  // Also delete linked Gantt task
  if (t.ganttTaskId && typeof S !== "undefined" && S.data && S.data.tasks){
    var gid = t.ganttTaskId;
    var rmF = function(ts){
      for (var i=0;i<ts.length;i++){
        if (ts[i].id===gid){ts.splice(i,1);return true}
        if (ts[i].children && rmF(ts[i].children)) return true;
      }
      return false;
    };
    rmF(S.data.tasks);
    // Also remove dependencies pointing to it
    var rd = function(ts){
      for (var i=0;i<ts.length;i++){
        if (ts[i].depends_on){
          ts[i].depends_on = ts[i].depends_on.filter(function(d){return d!==gid});
          if (!ts[i].depends_on.length) delete ts[i].depends_on;
        }
        if (ts[i].children) rd(ts[i].children);
      }
    };
    rd(S.data.tasks);
    if (typeof flatAll === "function") S.flat = flatAll(S.data.tasks);
    if (typeof yS === "function" && document.getElementById("ye")){
      document.getElementById("ye").value = yS(S.data);
    }
    if (typeof resG === "function") resG(S.flat||[]);
    if (typeof render === "function") render();
  }
  TS.tickets.splice(idx,1);
  // Remove backlinks
  TS.tickets.forEach(function(t){
    t.links = (t.links||[]).filter(function(l){return l.target!==key});
  });
  audit("delete","ticket",key,"");
  saveTS();
  return true;
}

function addComment(key, body){
  if (!hasPerm("comment.create")){toast("権限がありません",1);return false}
  var t = TS.tickets.find(function(x){return x.key===key});
  if (!t) return false;
  t.comments.push({
    id: "c"+Date.now(),
    user: TS.currentUser?TS.currentUser.id:"anonymous",
    body: body,
    ts: new Date().toISOString()
  });
  audit("update","comment",key,"add");
  // Notify assignee + reporter
  [t.assignee, t.reporter].forEach(function(u){
    if (u && TS.currentUser && u!==TS.currentUser.id) notify(u, key+" にコメント: "+body.substring(0,40), key);
  });
  saveTS();
  return true;
}

/* ===== Git Reference Auto-link ===== */
function extractGitRefs(text){
  var refs = [];
  var re = /\b(TK-\d+|[A-Z]+-\d+)\b/g;
  var m;
  while ((m = re.exec(text))) refs.push(m[1]);
  return refs;
}
function linkCommitToTicket(commitMsg, commitHash, repoUrl){
  var refs = extractGitRefs(commitMsg);
  refs.forEach(function(key){
    var t = TS.tickets.find(function(x){return x.key===key});
    if (t){
      t.gitRefs = t.gitRefs || [];
      if (!t.gitRefs.find(function(r){return r.hash===commitHash}))
        t.gitRefs.push({hash:commitHash, msg:commitMsg, url:repoUrl, ts:new Date().toISOString()});
      audit("update","ticket",key,"git: "+commitHash.substring(0,7));
    }
  });
  saveTS();
}

/* ===== JQL-Compatible Search ===== */
function parseJQL(q){
  q = q.trim();
  if (!q) return function(){return true};
  // Tokenize: status = "Done" AND priority != Low ORDER BY ...
  var orderMatch = q.match(/\s+ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?$/i);
  var orderField = null, orderDir = "ASC";
  if (orderMatch){orderField=orderMatch[1].toLowerCase();orderDir=(orderMatch[2]||"ASC").toUpperCase();q=q.substring(0,orderMatch.index)}

  // Parse expression with AND/OR
  function parseExpr(s){
    s = s.trim();
    var orParts = splitTop(s, /\s+OR\s+/i);
    if (orParts.length>1) return function(t){return orParts.some(function(p){return parseExpr(p)(t)})};
    var andParts = splitTop(s, /\s+AND\s+/i);
    if (andParts.length>1) return function(t){return andParts.every(function(p){return parseExpr(p)(t)})};
    return parseClause(s);
  }
  function splitTop(s, re){
    // Simple split (no nested parens for now)
    return s.split(re);
  }
  function parseClause(s){
    s = s.trim();
    // Handle "field IN (a, b, c)"
    var inMatch = s.match(/^(\w+)\s+(NOT\s+)?IN\s*\((.*)\)$/i);
    if (inMatch){
      var f = inMatch[1].toLowerCase(), neg = !!inMatch[2];
      var vals = inMatch[3].split(",").map(function(v){return v.trim().replace(/^["']|["']$/g,"")});
      return function(t){var v=getField(t,f);var has=vals.indexOf(String(v))>=0;return neg?!has:has};
    }
    // Handle "field operator value"
    var m = s.match(/^(\w+)\s*(=|!=|>=|<=|>|<|~|!~)\s*(.+)$/);
    if (!m) return function(){return true};
    var field = m[1].toLowerCase(), op = m[2], val = m[3].trim().replace(/^["']|["']$/g,"");
    return function(t){
      var fv = getField(t, field);
      if (fv == null) fv = "";
      switch(op){
        case "=": return String(fv) === val;
        case "!=": return String(fv) !== val;
        case ">": return String(fv) > val;
        case "<": return String(fv) < val;
        case ">=": return String(fv) >= val;
        case "<=": return String(fv) <= val;
        case "~": return String(fv).toLowerCase().indexOf(val.toLowerCase()) >= 0;
        case "!~": return String(fv).toLowerCase().indexOf(val.toLowerCase()) < 0;
      }
      return false;
    };
  }
  function getField(t, f){
    var aliases = {assignee:"assignee",status:"status",priority:"priority",type:"type",reporter:"reporter",title:"title",summary:"title",key:"key",sprint:"sprintId",sprintid:"sprintId",duedate:"dueDate",storypoint:"storyPoint",storypoints:"storyPoint",description:"description",label:"labels",labels:"labels",gantt:"ganttTaskId",gantttaskid:"ganttTaskId",parent:"parentKey",parentkey:"parentKey"};
    var k = aliases[f] || f;
    if (k === "labels") return (t.labels||[]).join(",");
    return t[k];
  }
  var pred = parseExpr(q);
  return function(list){
    var r = list.filter(pred);
    if (orderField){
      r.sort(function(a,b){
        var av=a[orderField]||"", bv=b[orderField]||"";
        return orderDir==="DESC" ? (av<bv?1:av>bv?-1:0) : (av<bv?-1:av>bv?1:0);
      });
    }
    return r;
  };
}

function searchTickets(q){
  if (!q.trim()) return TS.tickets.slice();
  // If looks like JQL (has = or AND), use parser. Else fulltext.
  if (/[=!<>~]|\bAND\b|\bOR\b|\bIN\b|\bORDER\s+BY\b/i.test(q)){
    try { return parseJQL(q)(TS.tickets); }
    catch(e){ console.warn("JQL error",e); }
  }
  var ql = q.toLowerCase();
  return TS.tickets.filter(function(t){
    return (t.title||"").toLowerCase().indexOf(ql)>=0 ||
           (t.description||"").toLowerCase().indexOf(ql)>=0 ||
           (t.key||"").toLowerCase().indexOf(ql)>=0 ||
           (t.labels||[]).some(function(l){return l.toLowerCase().indexOf(ql)>=0});
  });
}

/* ===== View Switching ===== */
function switchView(v){
  TS.currentView = v;
  document.querySelectorAll(".sb-item").forEach(function(b){b.classList.toggle("active", b.dataset.v===v)});
  document.querySelectorAll(".vw").forEach(function(d){d.classList.remove("active");d.style.display="none"});
  var view = document.getElementById(v+"View");
  if (view){view.classList.add("active");view.style.display="flex";if(v!=="gantt")view.style.flexDirection="column"}
  if (v==="gantt") {
    if (typeof render === "function") render();
  } else if (v==="ticket") renderTicketView();
  else if (v==="kanban") renderKanbanView();
  else if (v==="backlog") renderBacklogView();
  else if (v==="workflow") renderWorkflowView();
  else if (v==="template") renderTemplateView();
  else if (v==="audit") renderAuditView();
  else if (v==="admin") renderAdminView();
  else if (v==="sprint" && typeof renderSprintView === "function") renderSprintView();
}

