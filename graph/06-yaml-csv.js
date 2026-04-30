/* ============================================================
   YAML/CSV EXPORT/IMPORT for tickets, workflows, history
   - Tickets:  YAML + CSV
   - Workflows: YAML
   - History:  CSV
   - Sprints:  CSV
   - Bulk export (ZIP-like) -> not possible without lib;
     instead provide a "Download All" that triggers multiple files
   ============================================================ */

// ===== Ticket export to YAML =====
function exportTicketsYaml(tickets){
  var data = {tickets: tickets.map(function(t){
    var o = {
      key: t.key, title: t.title, type: t.type, status: t.status,
      priority: t.priority, assignee: t.assignee||"", reporter: t.reporter||"",
      labels: t.labels||[], dueDate: t.dueDate||null,
      storyPoint: t.storyPoint||null, sprintId: t.sprintId||null,
      parentKey: t.parentKey||null, ganttTaskId: t.ganttTaskId||null,
      description: t.description||"",
      links: (t.links||[]).map(function(l){return {type:l.type, target:l.target}}),
      comments: (t.comments||[]).map(function(c){return {user:c.user, ts:c.ts, body:c.body}}),
      createdAt: t.createdAt, updatedAt: t.updatedAt
    };
    return o;
  })};
  return yS(data);
}

// ===== Ticket import from YAML =====
function importTicketsYaml(yamlText){
  try {
    var parsed = yP(yamlText);
    if (!parsed || !parsed.tickets || !Array.isArray(parsed.tickets)){
      return {ok:false, msg:"YAML に 'tickets:' 配列が必要です"};
    }
    var added = 0, updated = 0;
    parsed.tickets.forEach(function(yt){
      if (!yt.title) return;
      var existing = TS.tickets.find(function(x){return x.key===yt.key});
      var t = {
        key: yt.key || newTicketKey(),
        title: yt.title,
        description: yt.description || "",
        type: yt.type || "task",
        status: yt.status || "todo",
        priority: yt.priority || "medium",
        assignee: yt.assignee || "",
        reporter: yt.reporter || (TS.currentUser?TS.currentUser.id:""),
        labels: Array.isArray(yt.labels) ? yt.labels : [],
        dueDate: yt.dueDate || null,
        storyPoint: yt.storyPoint || null,
        sprintId: yt.sprintId || null,
        parentKey: yt.parentKey || null,
        ganttTaskId: yt.ganttTaskId || null,
        links: Array.isArray(yt.links) ? yt.links : [],
        comments: Array.isArray(yt.comments) ? yt.comments.map(function(c){return {id:"c"+Date.now()+Math.random().toString(36).substr(2,4), user:c.user||"system", ts:c.ts||new Date().toISOString(), body:c.body||""}}) : [],
        attachments: [],
        customFields: yt.customFields || {},
        gitRefs: yt.gitRefs || [],
        createdAt: yt.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (existing){
        var idx = TS.tickets.findIndex(function(x){return x.key===yt.key});
        TS.tickets[idx] = t;
        updated++;
        audit("update","ticket",t.key,"yaml import");
      } else {
        TS.tickets.push(t);
        // Update sequence number if key is TK-N
        var m = (yt.key||"").match(/^TK-(\d+)$/);
        if (m){var n = parseInt(m[1]); if (n >= TS.ticketSeq) TS.ticketSeq = n+1}
        added++;
        audit("create","ticket",t.key,"yaml import");
      }
    });
    saveTS();
    return {ok:true, added:added, updated:updated};
  } catch(e){
    return {ok:false, msg:"YAMLパースエラー: "+e.message};
  }
}

// ===== Tickets CSV export (richer than the built-in) =====
function exportTicketsCsvFull(){
  var hdr = ["key","title","type","status","priority","assignee","reporter","parentKey","ganttTaskId","sprintId","storyPoint","dueDate","labels","createdAt","updatedAt","description","links"];
  var rows = TS.tickets.map(function(t){
    return hdr.map(function(h){
      var v;
      if (h === "labels") v = (t.labels||[]).join(";");
      else if (h === "links") v = (t.links||[]).map(function(l){return l.type+":"+l.target}).join(";");
      else v = t[h];
      v = (v == null) ? "" : String(v);
      // Escape: replace " with ""
      return '"' + v.replace(/"/g,'""').replace(/\r?\n/g, "\\n") + '"';
    }).join(",");
  });
  return hdr.join(",") + "\n" + rows.join("\n");
}

// ===== Tickets CSV import (richer) =====
function importTicketsCsvFull(csvText){
  try {
    var lines = csvText.split(/\r?\n/).filter(function(l){return l.trim()});
    if (!lines.length) return {ok:false, msg:"CSV が空です"};
    var hdr = parseCsvLine(lines[0]);
    var added = 0, updated = 0;
    for (var i = 1; i < lines.length; i++){
      var cells = parseCsvLine(lines[i]);
      var obj = {};
      hdr.forEach(function(h, j){obj[h] = cells[j] != null ? cells[j].replace(/\\n/g, "\n") : ""});
      if (!obj.title && !obj.key) continue;
      if (obj.labels) obj.labels = obj.labels.split(";").filter(Boolean);
      else obj.labels = [];
      if (obj.links){
        obj.links = obj.links.split(";").filter(Boolean).map(function(l){
          var p = l.split(":");
          return {type:p[0], target:p.slice(1).join(":")};
        });
      } else obj.links = [];
      if (obj.storyPoint) obj.storyPoint = parseInt(obj.storyPoint) || null;
      // Detect existing
      var existing = TS.tickets.find(function(x){return x.key===obj.key});
      if (existing){
        Object.assign(existing, obj);
        existing.updatedAt = new Date().toISOString();
        updated++;
      } else {
        var t = createTicket(obj);
        if (t){
          var m = (obj.key||"").match(/^TK-(\d+)$/);
          if (m){var n = parseInt(m[1]); if (n >= TS.ticketSeq) TS.ticketSeq = n+1; t.key = obj.key}
          added++;
        }
      }
    }
    saveTS();
    return {ok:true, added:added, updated:updated};
  } catch(e){
    return {ok:false, msg:"CSV パースエラー: "+e.message};
  }
}

// ===== History CSV export =====
function exportHistoryCsv(){
  var hdr = ["ticketKey","timestamp","user","type","transition","fromStatus","toStatus","comment"];
  var rows = [];
  Object.keys(TS.ticketHistory||{}).forEach(function(key){
    (TS.ticketHistory[key]||[]).forEach(function(h){
      rows.push([
        '"'+key+'"',
        '"'+(h.ts||"")+'"',
        '"'+(h.user||"")+'"',
        '"'+(h.type||"")+'"',
        '"'+(h.transition||"").replace(/"/g,'""')+'"',
        '"'+(h.from||"")+'"',
        '"'+(h.to||"")+'"',
        '"'+(h.comment||"").replace(/"/g,'""').replace(/\r?\n/g,"\\n")+'"'
      ].join(","));
    });
  });
  return hdr.join(",") + "\n" + rows.join("\n");
}

// ===== Sprints CSV export =====
function exportSprintsCsv(){
  var hdr = ["id","name","startDate","endDate","active","ticketCount","totalSP"];
  var rows = (TS.sprints||[]).map(function(sp){
    var its = TS.tickets.filter(function(t){return t.sprintId===sp.id});
    var sp1 = its.reduce(function(a,t){return a+(t.storyPoint||0)},0);
    return [
      '"'+sp.id+'"',
      '"'+(sp.name||"").replace(/"/g,'""')+'"',
      '"'+(sp.startDate||"")+'"',
      '"'+(sp.endDate||"")+'"',
      sp.active?"true":"false",
      its.length, sp1
    ].join(",");
  });
  return hdr.join(",") + "\n" + rows.join("\n");
}

// ===== Audit log CSV export =====
function exportAuditCsv(){
  var hdr = ["timestamp","user","action","entity","entityId","detail"];
  var rows = (TS.auditLog||[]).map(function(a){
    return [
      '"'+(a.ts||"")+'"',
      '"'+(a.user||"")+'"',
      '"'+(a.action||"")+'"',
      '"'+(a.entity||"")+'"',
      '"'+(a.entityId||"")+'"',
      '"'+String(a.detail||"").replace(/"/g,'""').replace(/\r?\n/g,"\\n")+'"'
    ].join(",");
  });
  return hdr.join(",") + "\n" + rows.join("\n");
}

// ===== Full state YAML export (everything except yaml editor) =====
function exportFullStateYaml(){
  var snapshot = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    project: (typeof S !== "undefined" && S.data) ? S.data.project : null,
    ganttTasks: (typeof S !== "undefined" && S.data) ? S.data.tasks : null,
    customHolidays: (typeof S !== "undefined" && S.data && S.data.project) ? S.data.project.custom_holidays : null,
    tickets: TS.tickets,
    sprints: TS.sprints,
    workflows: TS.workflows,
    workflowSchemes: TS.workflowSchemes,
    workflowDrafts: TS.workflowDrafts,
    statuses: TS.statuses,
    priorities: TS.priorities,
    types: TS.types,
    resolutions: TS.resolutions,
    users: TS.users,
    roles: TS.roles,
    templates: TS.templates,
    ticketHistory: TS.ticketHistory,
    auditLog: TS.auditLog,
    notifications: TS.notifications,
    alertConfig: TS.alertConfig,
    autoCompleteParent: TS.autoCompleteParent,
    customFields: TS.customFields,
    ticketSeq: TS.ticketSeq,
    currentUser: TS.currentUser,
    autoLink: TS.autoLink,
    autoCreateTicket: TS.autoCreateTicket,
    gitProvider: TS.gitProvider,
    gitRepo: TS.gitRepo
  };
  return yS(snapshot);
}

// ===== Full state import from YAML =====
function importFullStateYaml(yamlText){
  try {
    var parsed = yP(yamlText);
    if (!parsed) return {ok:false, msg:"パース失敗"};
    function asArr(v){return Array.isArray(v) ? v : (v && typeof v === "object" && Object.keys(v).length===0 ? [] : (v||[]))}
    function asObj(v){return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}}
    var counts = {};
    // Tickets
    if (parsed.tickets !== undefined){TS.tickets = asArr(parsed.tickets); counts.tickets = TS.tickets.length}
    if (parsed.sprints !== undefined){TS.sprints = asArr(parsed.sprints); counts.sprints = TS.sprints.length}
    // Workflows
    if (parsed.workflows !== undefined){TS.workflows = asArr(parsed.workflows); counts.workflows = TS.workflows.length}
    if (parsed.workflowSchemes !== undefined){TS.workflowSchemes = asArr(parsed.workflowSchemes)}
    if (parsed.workflowDrafts !== undefined){TS.workflowDrafts = asObj(parsed.workflowDrafts)}
    // Master data
    if (parsed.statuses !== undefined){TS.statuses = asArr(parsed.statuses); counts.statuses = TS.statuses.length}
    if (parsed.users !== undefined){TS.users = asArr(parsed.users); counts.users = TS.users.length}
    if (parsed.roles !== undefined){TS.roles = asArr(parsed.roles)}
    if (parsed.resolutions !== undefined){TS.resolutions = asArr(parsed.resolutions)}
    if (parsed.types !== undefined){TS.types = asArr(parsed.types)}
    if (parsed.priorities !== undefined){TS.priorities = asArr(parsed.priorities)}
    // Templates / History / Logs
    if (parsed.templates !== undefined){TS.templates = asArr(parsed.templates); counts.templates = TS.templates.length}
    if (parsed.ticketHistory !== undefined){TS.ticketHistory = asObj(parsed.ticketHistory); counts.history = Object.keys(TS.ticketHistory).length}
    if (parsed.auditLog !== undefined){TS.auditLog = asArr(parsed.auditLog); counts.auditLog = TS.auditLog.length}
    if (parsed.notifications !== undefined){TS.notifications = asArr(parsed.notifications)}
    // Settings
    if (parsed.alertConfig){TS.alertConfig = asObj(parsed.alertConfig)}
    if (parsed.autoCompleteParent){TS.autoCompleteParent = parsed.autoCompleteParent}
    if (parsed.customFields !== undefined){TS.customFields = asArr(parsed.customFields)}
    if (parsed.ticketSeq){TS.ticketSeq = parsed.ticketSeq}
    if (parsed.currentUser){TS.currentUser = parsed.currentUser}
    if (parsed.autoLink !== undefined) TS.autoLink = parsed.autoLink;
    if (parsed.autoCreateTicket !== undefined) TS.autoCreateTicket = parsed.autoCreateTicket;
    if (parsed.gitProvider) TS.gitProvider = parsed.gitProvider;
    if (parsed.gitRepo) TS.gitRepo = parsed.gitRepo;
    // Gantt project & tasks
    if (parsed.project && typeof S !== "undefined"){
      if (!S.data) S.data = {};
      S.data.project = parsed.project;
      if (parsed.ganttTasks) S.data.tasks = asArr(parsed.ganttTasks);
      if (parsed.customHolidays) S.data.project.custom_holidays = asArr(parsed.customHolidays);
      if (S.data.tasks && typeof flatAll === "function") S.flat = flatAll(S.data.tasks);
      if (typeof yS === "function" && document.getElementById("ye")){
        document.getElementById("ye").value = yS(S.data);
      }
      counts.ganttTasks = (S.flat||[]).length;
    }
    audit("import","fullstate","-",JSON.stringify(counts));
    saveTS();
    return {ok:true, counts:counts};
  } catch(e){
    return {ok:false, msg:"YAML パースエラー: "+e.message};
  }
}

// ===== Backup-all dialog =====
function showBackupDlg(){
  var html = '<h3>📦 Data Backup / Restore</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">全データをYAMLでバックアップ・復元できます。</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  html += '<button class="btn bp" id="bkpAll">📤 Backup All (YAML)</button>';
  html += '<button class="btn secondary" id="bkpTickets">🎫 Tickets only (YAML)</button>';
  html += '<button class="btn secondary" id="bkpTicketsCsv">🎫 Tickets (CSV)</button>';
  html += '<button class="btn secondary" id="bkpHist">📜 History (CSV)</button>';
  html += '<button class="btn secondary" id="bkpSp">🏃 Sprints (CSV)</button>';
  html += '<button class="btn secondary" id="bkpAud">📋 Audit Log (CSV)</button>';
  html += '</div>';
  html += '<hr style="margin:18px 0;border:none;border-top:1px solid var(--bd)">';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:8px">復元 (上書きされます)</div>';
  html += '<input type="file" id="bkpFile" accept=".yaml,.yml,.csv" style="display:block;margin-bottom:8px;padding:6px">';
  html += '<select id="bkpKind" class="tb-input" style="width:100%;margin-bottom:8px"><option value="full">Full state (YAML)</option><option value="tickets-yaml">Tickets only (YAML)</option><option value="tickets-csv">Tickets only (CSV)</option></select>';
  html += '<button class="btn danger" id="bkpRestore" style="width:100%">⚠ Restore from file</button>';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">閉じる</button></div>';
  showModal(html);

  document.getElementById("bkpAll").onclick = function(){
    downloadFile("backup-all-" + (new Date().toISOString().substr(0,10)) + ".yaml", exportFullStateYaml(), "text/yaml");
    toast("全データをエクスポート");
  };
  document.getElementById("bkpTickets").onclick = function(){
    downloadFile("tickets-" + (new Date().toISOString().substr(0,10)) + ".yaml", exportTicketsYaml(TS.tickets), "text/yaml");
    toast("チケットYAMLエクスポート");
  };
  document.getElementById("bkpTicketsCsv").onclick = function(){
    downloadFile("tickets-" + (new Date().toISOString().substr(0,10)) + ".csv", exportTicketsCsvFull(), "text/csv");
    toast("チケットCSVエクスポート");
  };
  document.getElementById("bkpHist").onclick = function(){
    downloadFile("history-" + (new Date().toISOString().substr(0,10)) + ".csv", exportHistoryCsv(), "text/csv");
    toast("履歴CSVエクスポート");
  };
  document.getElementById("bkpSp").onclick = function(){
    downloadFile("sprints-" + (new Date().toISOString().substr(0,10)) + ".csv", exportSprintsCsv(), "text/csv");
    toast("スプリントCSVエクスポート");
  };
  document.getElementById("bkpAud").onclick = function(){
    downloadFile("audit-" + (new Date().toISOString().substr(0,10)) + ".csv", exportAuditCsv(), "text/csv");
    toast("監査ログCSVエクスポート");
  };

  document.getElementById("bkpRestore").onclick = function(){
    var f = document.getElementById("bkpFile").files[0];
    if (!f){toast("ファイルを選択してください",1);return}
    if (!confirm("既存のデータが上書きされます。続行しますか？")) return;
    var kind = document.getElementById("bkpKind").value;
    var r = new FileReader();
    r.onload = function(ev){
      var text = ev.target.result;
      var result;
      if (kind === "full") result = importFullStateYaml(text);
      else if (kind === "tickets-yaml") result = importTicketsYaml(text);
      else if (kind === "tickets-csv") result = importTicketsCsvFull(text);
      if (result && result.ok){
        toast("復元成功: " + JSON.stringify(result.counts || {added:result.added, updated:result.updated}));
        closeModal();
        // Re-render Gantt if loaded
        if (typeof S !== "undefined" && S.data && typeof render === "function"){
          if (typeof flatAll === "function") S.flat = flatAll(S.data.tasks||[]);
          if (typeof resG === "function") resG(S.flat);
          render();
        }
        if (typeof updateUserInfo === "function") updateUserInfo();
        if (typeof TS !== "undefined" && TS.currentView) {
          if (typeof switchView === "function") switchView(TS.currentView);
        }
      } else {
        toast("復元失敗: " + (result ? result.msg : "unknown"), 1);
      }
    };
    r.readAsText(f);
  };
}
