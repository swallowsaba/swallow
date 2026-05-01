
// Forward sync: Gantt task changes -> Ticket fields
function syncGanttToTickets(){
  if (typeof S === "undefined" || !S.flat) return;
  if (typeof TS === "undefined" || !TS || !TS.tickets) return;
  var dirty = false;
  // For each linked ticket, update from gantt task
  TS.tickets.forEach(function(tk){
    if (!tk.ganttTaskId) return;
    var g = S.flat.find(function(x){return x.id===tk.ganttTaskId});
    if (!g){
      // Gantt task was deleted - unlink
      tk.ganttTaskId = null;
      audit("update","ticket",tk.key,"gantt unlinked (task removed)");
      dirty = true;
      return;
    }
    // Sync title (only if ticket title was auto-generated from gantt)
    if (tk._ganttSync){
      if (tk.title !== g.name){tk.title = g.name; dirty = true}
    }
    // Sync due date (gantt end date -> ticket due date)
    if (g.ed && tk.dueDate !== g.ed){tk.dueDate = g.ed; dirty = true}
    // Sync assignee
    if (g.assignee && !tk.assignee){tk.assignee = g.assignee; dirty = true}
    // Sync progress -> status (heuristic)
    if (g.progress != null){
      var newSt = tk.status;
      if (g.progress >= 100 && tk.status !== "done") newSt = "done";
      else if (g.progress > 0 && (tk.status === "todo" || !tk.status)) newSt = "inprogress";
      if (newSt !== tk.status){tk.status = newSt; dirty = true}
    }
  });
  // Auto-create tickets for Gantt small-tasks without a linked ticket (optional)
  // This is opt-in via TS.autoCreateTicket flag
  if (TS.autoCreateTicket){
    S.flat.forEach(function(g){
      if (g.hasC) return; // skip group items
      var existing = TS.tickets.find(function(x){return x.ganttTaskId===g.id});
      if (existing) return;
      var key = newTicketKey();
      TS.tickets.push({
        key: key, title: g.name, description: "", type: "task",
        status: g.progress>=100?"done":(g.progress>0?"inprogress":"todo"),
        priority: "medium",
        assignee: g.assignee || "",
        reporter: TS.currentUser ? TS.currentUser.id : "",
        labels: [], dueDate: g.ed||null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        storyPoint: g.dur || null, sprintId: null, parentKey: null,
        links: [], comments: [], attachments: [], customFields: {},
        ganttTaskId: g.id, gitRefs: [], _ganttSync: true
      });
      audit("create","ticket",key,"auto from gantt: "+g.name);
      dirty = true;
    });
  }
  if (dirty) saveTS();
}

// Backward sync: Ticket changes -> Gantt task fields
function syncTicketToGantt(ticketKey){
  if (typeof S === "undefined" || !S.flat || !S.data) return;
  if (typeof TS === "undefined" || !TS || !TS.tickets) return;
  var tk = TS.tickets.find(function(x){return x.key===ticketKey});
  if (!tk || !tk.ganttTaskId) return;
  var g = S.flat.find(function(x){return x.id===tk.ganttTaskId});
  if (!g) return;
  var changed = false;
  // Sync due date back to gantt end_date
  if (tk.dueDate && g.ed !== tk.dueDate){
    g.ed = tk.dueDate;
    if (g._r) g._r.end_date = tk.dueDate;
    if (g.sd && !g.hasC){g.dur = cW(g.sd, tk.dueDate, S.cH); if(g._r)g._r.duration=g.dur}
    changed = true;
  }
  // Sync assignee
  if (tk.assignee && g.assignee !== tk.assignee){
    g.assignee = tk.assignee;
    if (g._r) g._r.assignee = tk.assignee;
    changed = true;
  }
  // Sync status -> progress
  if (tk.status === "done" && g.progress < 100){
    g.progress = 100;
    if (g._r) g._r.progress = 100;
    changed = true;
  } else if (tk.status === "todo" && g.progress > 0){
    g.progress = 0;
    if (g._r) g._r.progress = 0;
    changed = true;
  } else if (tk.status === "inprogress" && (g.progress === 0 || g.progress === 100)){
    g.progress = 50;
    if (g._r) g._r.progress = 50;
    changed = true;
  }
  if (changed){
    resG(S.flat);
    if (typeof render === "function" && TS.currentView==="gantt") render();
    // Re-serialize YAML
    var ys = yS(S.data);
    document.getElementById("ye").value = ys;
  }
}

// Hook updateTicket to also sync Gantt
var _origUpdateTicket = updateTicket;
updateTicket = function(key, patch){
  var ok = _origUpdateTicket(key, patch);
  if (ok) syncTicketToGantt(key);
  return ok;
};

// Hook deleteTicket: do not delete Gantt task (Gantt is master), just unlink
// (Already handled by deleteTicket - no need to touch Gantt)

function initTS(){
  // Initialize multi-project FIRST (before any saveTS calls happen)
  // This loads PRJ.projects from gantt_projects_v1 OR migrates from legacy ganttTicketState
  // and restores active project's data into TS
  var projectsLoaded = false;
  if (typeof prjInit === "function"){
    prjInit();
    projectsLoaded = PRJ.projects.length > 0;
  }

  // If no projects (very first run), bootstrap with defaults
  if (!projectsLoaded){
    if (!loadTS()){
      TS.roles = DEFAULT_ROLES.slice();
      TS.statuses = DEFAULT_STATUSES.slice();
      TS.priorities = DEFAULT_PRIORITIES.slice();
      TS.types = DEFAULT_TYPES.slice();
      TS.users.push({id:"admin",name:"管理者",roleId:"admin"});
      TS.currentUser = TS.users[0];
      createTicket({title:"サンプルチケット", description:"これはサンプルです", priority:"medium", status:"todo", type:"task"});
    }
  } else {
    // Projects loaded - ensure user data exists (global) BEFORE creating any tickets
    if (!TS.users || TS.users.length === 0){
      TS.users = [{id:"admin",name:"管理者",roleId:"admin"}];
    }
    if (!TS.currentUser){
      TS.currentUser = TS.users[0];
    }
    if (!TS.roles || !TS.roles.length){
      TS.roles = DEFAULT_ROLES.slice();
    }
    // If active project is empty (first run after migration), add sample ticket
    if ((!TS.tickets || TS.tickets.length === 0) && getActiveProject() && !getActiveProject()._sampleAdded){
      createTicket({title:"サンプルチケット", description:"これはサンプルです", priority:"medium", status:"todo", type:"task"});
      var ap = getActiveProject();
      if (ap) ap._sampleAdded = true;
    }
  }
  // Ensure roles/statuses/types exist even if loaded data is missing them
  if (!TS.roles||!TS.roles.length) TS.roles = DEFAULT_ROLES.slice();
  if (!TS.statuses||!TS.statuses.length) TS.statuses = DEFAULT_STATUSES.slice();
  if (!TS.priorities||!TS.priorities.length) TS.priorities = DEFAULT_PRIORITIES.slice();
  if (!TS.types||!TS.types.length) TS.types = DEFAULT_TYPES.slice();
  // Ensure default workflow + scheme + resolutions exist
  if (!TS.workflows||!TS.workflows.length){
    TS.workflows = [JSON.parse(JSON.stringify(DEFAULT_WORKFLOW))];
  }
  if (!TS.workflowSchemes||!TS.workflowSchemes.length){
    TS.workflowSchemes = [JSON.parse(JSON.stringify(DEFAULT_SCHEME))];
  }
  if (!TS.resolutions||!TS.resolutions.length){
    TS.resolutions = DEFAULT_RESOLUTIONS.slice();
  }
  if (!TS.workflowDrafts) TS.workflowDrafts = {};
  if (!TS.ticketHistory) TS.ticketHistory = {};
  // Ensure at least one admin user exists
  if (!TS.users||!TS.users.length){
    TS.users = [{id:"admin",name:"管理者",roleId:"admin"}];
  }
  // Ensure currentUser is set
  if (!TS.currentUser) TS.currentUser = TS.users[0];
  // Ensure currentUser still exists in users list
  if (!TS.users.find(function(u){return u.id===TS.currentUser.id})) TS.currentUser = TS.users[0];

  document.querySelectorAll(".sb-item").forEach(function(b){b.onclick = function(){switchView(b.dataset.v)}});
  // Sidebar collapse toggle
  var sbToggle = document.getElementById("sbToggle");
  if (sbToggle) sbToggle.onclick = function(){
    var sb = document.getElementById("sidebar");
    sb.classList.toggle("collapsed");
    localStorage.setItem("sbCollapsed", sb.classList.contains("collapsed")?"1":"0");
  };
  if (localStorage.getItem("sbCollapsed")==="1") document.getElementById("sidebar").classList.add("collapsed");
  // Mobile menu toggle
  var mobMenu = document.getElementById("mobMenu");
  if (mobMenu) mobMenu.onclick = function(){
    var sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("mobile-open");
  };
  // Close mobile menu when sidebar item clicked
  document.querySelectorAll(".sb-item").forEach(function(it){
    it.addEventListener("click", function(){
      var sb = document.getElementById("sidebar");
      if (sb && window.innerWidth <= 768) sb.classList.remove("mobile-open");
    });
  });
  // Top create button -> new ticket
  var topCreate = document.getElementById("topCreate");
  if (topCreate) topCreate.onclick = function(){newTicketDlg()};
  var topBackup = document.getElementById("topBackup");
  if (topBackup) topBackup.onclick = function(){if(typeof showBackupDlg==="function")showBackupDlg()};
  // Global search -> filter issues view
  var gs = document.getElementById("globalSearch");
  if (gs) gs.oninput = function(){
    TS.filter = this.value;
    if (TS.currentView !== "ticket") switchView("ticket");
    else renderTicketView();
  };
  document.getElementById("bellBtn").onclick = function(){
    var n = document.getElementById("notif");
    n.style.display = n.style.display==="flex" ? "none" : "flex";
    if (n.style.display==="flex") renderNotif();
  };
  document.getElementById("notifClear").onclick = function(){
    if (TS.currentUser){
      TS.notifications.forEach(function(n){if(n.userId===TS.currentUser.id)n.read=true});
      saveTS();updateBell();renderNotif();
    }
  };
  setInterval(saveTS, 5000);
  // Initial bidirectional sync
  syncGanttToTickets();
  // Ensure templates and alerts
  if (typeof ensureTemplates === "function") ensureTemplates();
  if (typeof ensureAlertConfig === "function") ensureAlertConfig();
  if (typeof startAlertEngine === "function") startAlertEngine();
  updateUserInfo();
  // Render project switcher (after topbar is ready)
  if (typeof prjRenderSwitcher === "function") setTimeout(prjRenderSwitcher, 50);
}

// Run after gantt init
setTimeout(initTS, 100);
