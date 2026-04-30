/* ============================================================
   MULTI-PROJECT SUPPORT
   - Multiple projects with isolated data
   - Each project has: tickets, sprints, workflows, templates,
     statuses, priorities, types, ticketHistory, ticketSeq,
     boardConfig, ganttData
   - Switch via topbar dropdown
   - Auto-migration from single-project to multi-project
   ============================================================ */

var PRJ = {
  projects: [],             // Array of {id, name, key, icon, color, createdAt, data}
  activeProjectId: null,
  STORAGE_KEY: "gantt_projects_v1",
  LEGACY_KEY: "ganttTicketState"
};

/* List of TS fields that are project-specific (i.e., snapshotted into project.data) */
var PROJECT_SCOPED_FIELDS = [
  "tickets","sprints","statuses","priorities","types","workflows",
  "workflowSchemes","workflowDrafts","resolutions","customFields",
  "ticketHistory","templates","ticketSeq","alertConfig",
  "autoCompleteParent","templatesInitialized","boardConfig"
];

/* Fields that are GLOBAL (shared across projects, not snapshotted) */
var GLOBAL_FIELDS = ["users","roles","currentUser","notifications","auditLog","autoLink","gitProvider","gitRepo"];

function prjLoad(){
  try {
    var raw = localStorage.getItem(PRJ.STORAGE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    PRJ.projects = data.projects || [];
    PRJ.activeProjectId = data.activeProjectId || null;
    return true;
  } catch(e){console.warn("prjLoad failed:", e);return false}
}

function prjSave(){
  try {
    localStorage.setItem(PRJ.STORAGE_KEY, JSON.stringify({
      projects: PRJ.projects,
      activeProjectId: PRJ.activeProjectId
    }));
  } catch(e){console.warn("prjSave failed:", e)}
}

function getActiveProject(){
  return PRJ.projects.find(function(p){return p.id===PRJ.activeProjectId});
}

/* Snapshot all project-scoped fields from TS into the active project */
function prjSnapshotFromTS(){
  var p = getActiveProject();
  if (!p) return;
  if (!p.data) p.data = {};
  PROJECT_SCOPED_FIELDS.forEach(function(f){
    p.data[f] = TS[f];
  });
  // Also store gantt data
  if (typeof S !== "undefined" && S.data){
    try { p.data._ganttData = JSON.stringify(S.data); } catch(e){}
  }
  // Also store yaml editor content
  if (document.getElementById("ye")){
    p.data._yaml = document.getElementById("ye").value;
  }
}

/* Restore project-scoped fields from project to TS */
function prjRestoreToTS(p){
  if (!p || !p.data) return;
  PROJECT_SCOPED_FIELDS.forEach(function(f){
    if (p.data[f] !== undefined){
      TS[f] = p.data[f];
    } else {
      // Initialize with defaults for missing fields
      if (f === "tickets") TS[f] = [];
      else if (f === "sprints") TS[f] = [];
      else if (f === "statuses") TS[f] = JSON.parse(JSON.stringify(DEFAULT_STATUSES));
      else if (f === "priorities") TS[f] = JSON.parse(JSON.stringify(DEFAULT_PRIORITIES));
      else if (f === "types") TS[f] = JSON.parse(JSON.stringify(DEFAULT_TYPES));
      else if (f === "workflows") TS[f] = [];
      else if (f === "workflowSchemes") TS[f] = [];
      else if (f === "workflowDrafts") TS[f] = {};
      else if (f === "resolutions") TS[f] = [];
      else if (f === "customFields") TS[f] = [];
      else if (f === "ticketHistory") TS[f] = {};
      else if (f === "templates") TS[f] = [];
      else if (f === "ticketSeq") TS[f] = 1;
      else TS[f] = null;
    }
  });
  // Restore gantt data
  if (p.data._ganttData && typeof S !== "undefined"){
    try {
      S.data = JSON.parse(p.data._ganttData);
      if (typeof flatAll === "function") S.flat = flatAll(S.data.tasks||[]);
    } catch(e){console.warn("gantt restore",e)}
  }
  // Restore yaml editor
  if (p.data._yaml && document.getElementById("ye")){
    document.getElementById("ye").value = p.data._yaml;
  }
}

/* Migration: convert old single-project state into project[0] */
function prjMigrateLegacy(){
  if (PRJ.projects.length > 0) return; // already migrated
  var legacy = null;
  try {
    var raw = localStorage.getItem(PRJ.LEGACY_KEY);
    if (raw) legacy = JSON.parse(raw);
  } catch(e){}

  var defaultProj = {
    id: "prj-default",
    name: "サンプルプロジェクト",
    key: "SAMPLE",
    icon: "📋",
    color: "#0c66e4",
    createdAt: new Date().toISOString(),
    data: {}
  };

  if (legacy){
    PROJECT_SCOPED_FIELDS.forEach(function(f){
      if (legacy[f] !== undefined) defaultProj.data[f] = legacy[f];
    });
    if (legacy.yaml) defaultProj.data._yaml = legacy.yaml;
  }

  PRJ.projects = [defaultProj];
  PRJ.activeProjectId = defaultProj.id;
  prjSave();
}

/* Override saveTS to also snapshot to active project */
(function(){
  if (typeof saveTS !== "function") return;
  var _origSave = saveTS;
  window.saveTS = function(){
    _origSave();  // saves the legacy key too (for backward compat)
    prjSnapshotFromTS();
    prjSave();
  };
})();

/* Initialize: called by 07-sync-init.js after init */
function prjInit(){
  if (!prjLoad()){
    // First run - migrate legacy
    prjMigrateLegacy();
    // Restore from active project
    var p = getActiveProject();
    if (p) prjRestoreToTS(p);
  } else {
    // Already have project data - restore active one
    var p = getActiveProject();
    if (p){
      prjRestoreToTS(p);
    } else if (PRJ.projects.length > 0){
      PRJ.activeProjectId = PRJ.projects[0].id;
      prjRestoreToTS(PRJ.projects[0]);
      prjSave();
    }
  }
  // Render switcher
  setTimeout(prjRenderSwitcher, 100);
}

/* ============================================================
   PROJECT SWITCHER UI (topbar)
   ============================================================ */
function prjRenderSwitcher(){
  // Remove existing
  var old = document.getElementById("prjSwitcher");
  if (old) old.remove();

  var topbar = document.querySelector(".tb-actions");
  if (!topbar) return;

  var p = getActiveProject();
  var sw = document.createElement("div");
  sw.id = "prjSwitcher";
  sw.style.cssText = "display:flex;align-items:center;gap:6px;margin-right:8px;padding:4px 10px;border:1px solid var(--bd);border-radius:4px;cursor:pointer;background:var(--b1);font-size:13px;user-select:none;transition:background .1s";
  sw.onmouseenter = function(){sw.style.background = "var(--b2)"};
  sw.onmouseleave = function(){sw.style.background = "var(--b1)"};
  sw.innerHTML = '<span style="font-size:16px">'+(p?p.icon:"📋")+'</span>'+
    '<span style="font-weight:600;color:var(--t1)">'+escHtml(p?p.name:"プロジェクト未選択")+'</span>'+
    '<span style="color:var(--t2);font-size:10px">▼</span>';
  sw.onclick = prjShowDropdown;
  // Insert at front of topbar actions
  topbar.insertBefore(sw, topbar.firstChild);
}

function prjShowDropdown(){
  // Toggle dropdown
  var existing = document.getElementById("prjDropdown");
  if (existing){existing.remove();return}

  var sw = document.getElementById("prjSwitcher");
  var rect = sw.getBoundingClientRect();
  var dd = document.createElement("div");
  dd.id = "prjDropdown";
  dd.style.cssText = "position:fixed;top:"+(rect.bottom+4)+"px;left:"+rect.left+"px;background:var(--b1);border:1px solid var(--bd);border-radius:6px;box-shadow:0 8px 24px rgba(9,30,66,.25);z-index:5000;min-width:280px;max-width:380px;font-size:13px;padding:6px";

  var html = '<div style="padding:6px 12px;font-size:10px;text-transform:uppercase;color:var(--t2);font-weight:700;letter-spacing:.5px">プロジェクト ('+PRJ.projects.length+')</div>';
  PRJ.projects.forEach(function(p){
    var active = p.id === PRJ.activeProjectId;
    html += '<div class="prj-dd-item" data-prj-id="'+p.id+'" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:4px;cursor:pointer;'+(active?"background:var(--ac-bg);":"")+'">';
    html += '<span style="font-size:18px">'+p.icon+'</span>';
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(p.name)+'</div>';
    var ticketCount = (p.data && p.data.tickets) ? p.data.tickets.length : 0;
    var sprintCount = (p.data && p.data.sprints) ? p.data.sprints.length : 0;
    html += '<div style="font-size:10px;color:var(--t3);font-family:monospace">'+escHtml(p.key)+' / '+ticketCount+' tickets'+(sprintCount?", "+sprintCount+" sprints":"")+'</div>';
    html += '</div>';
    if (active) html += '<span style="color:var(--gn);font-size:14px">✓</span>';
    html += '</div>';
  });
  html += '<div style="border-top:1px solid var(--bd);margin:6px 0"></div>';
  html += '<button class="prj-dd-btn" data-act="new" style="display:block;width:100%;padding:8px 10px;background:none;border:none;text-align:left;font-size:13px;color:var(--ac);cursor:pointer;border-radius:4px;font-family:inherit">+ 新規プロジェクト作成</button>';
  html += '<button class="prj-dd-btn" data-act="manage" style="display:block;width:100%;padding:8px 10px;background:none;border:none;text-align:left;font-size:13px;color:var(--t1);cursor:pointer;border-radius:4px;font-family:inherit">⚙ プロジェクト管理</button>';

  dd.innerHTML = html;
  document.body.appendChild(dd);

  // Bind clicks
  dd.querySelectorAll(".prj-dd-item").forEach(function(it){
    it.onmouseenter = function(){if(it.style.background.indexOf("ac-bg")<0)it.style.background = "var(--b2)"};
    it.onmouseleave = function(){
      var active = it.dataset.prjId === PRJ.activeProjectId;
      it.style.background = active ? "var(--ac-bg)" : "";
    };
    it.onclick = function(){
      dd.remove();
      prjSwitch(it.dataset.prjId);
    };
  });
  dd.querySelectorAll(".prj-dd-btn").forEach(function(b){
    b.onmouseenter = function(){b.style.background = "var(--b2)"};
    b.onmouseleave = function(){b.style.background = "none"};
    b.onclick = function(){
      dd.remove();
      if (b.dataset.act === "new") prjCreateDlg();
      else if (b.dataset.act === "manage") prjManageDlg();
    };
  });

  // Close on click outside
  setTimeout(function(){
    var closer = function(ev){
      if (!dd.contains(ev.target) && ev.target.id !== "prjSwitcher" && !document.getElementById("prjSwitcher").contains(ev.target)){
        dd.remove();
        document.removeEventListener("mousedown", closer);
      }
    };
    document.addEventListener("mousedown", closer);
  }, 50);
}

function prjSwitch(projectId){
  if (projectId === PRJ.activeProjectId) return;
  // Save current project state
  prjSnapshotFromTS();
  prjSave();
  // Switch
  PRJ.activeProjectId = projectId;
  var p = getActiveProject();
  if (!p){toast("プロジェクトが見つかりません",1);return}
  prjRestoreToTS(p);
  prjSave();
  // Re-render
  prjRenderSwitcher();
  if (typeof switchView === "function" && TS.currentView){
    switchView(TS.currentView);
  } else if (typeof render === "function") {
    render();
  }
  toast("✓ "+p.name+" に切替");
}

function prjCreateDlg(){
  var html = '<h3>+ 新規プロジェクト作成</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">プロジェクトごとに独立したチケット・スプリント・ワークフロー・テンプレートを管理できます。<br>(ユーザー一覧・通知・監査ログは全プロジェクト共有です)</div>';
  html += '<label>プロジェクト名 *</label><input id="pcName" placeholder="例: モバイルアプリ開発">';
  html += '<label>キー (英数字、チケットIDの先頭) *</label><input id="pcKey" placeholder="例: MOB" maxlength="10">';
  html += '<label>アイコン</label><input id="pcIcon" maxlength="2" value="🚀" style="width:60px;font-size:18px;text-align:center">';
  html += '<label>初期データ</label><select id="pcInit"><option value="empty">空のプロジェクト</option><option value="defaults">デフォルトテンプレ・ワークフローをコピー</option><option value="copy">既存プロジェクトを複製</option></select>';
  html += '<div id="pcCopyFrom" style="display:none"><label>複製元</label><select id="pcCopySrc">';
  PRJ.projects.forEach(function(p){html += '<option value="'+p.id+'">'+escHtml(p.name)+'</option>'});
  html += '</select></div>';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="pcOk">作成</button></div>';
  showModal(html);
  document.getElementById("pcInit").onchange = function(){
    document.getElementById("pcCopyFrom").style.display = this.value === "copy" ? "block" : "none";
  };
  // Auto-uppercase key
  document.getElementById("pcKey").oninput = function(){
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g,"");
  };
  // Auto-fill key from name
  document.getElementById("pcName").oninput = function(){
    var keyEl = document.getElementById("pcKey");
    if (!keyEl.value){
      keyEl.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g,"").substr(0,5) || "PROJ";
    }
  };

  document.getElementById("pcOk").onclick = function(){
    var name = document.getElementById("pcName").value.trim();
    var key = document.getElementById("pcKey").value.trim();
    var icon = document.getElementById("pcIcon").value.trim() || "📋";
    if (!name || !key){toast("名前とキー必須",1);return}
    if (PRJ.projects.find(function(p){return p.key===key})){toast("そのキーは既に使われています",1);return}

    if (typeof urCapture === "function") urCapture("プロジェクト作成", true);

    // Save current project state first
    prjSnapshotFromTS();

    var initMode = document.getElementById("pcInit").value;
    var newPrj = {
      id: "prj-"+Date.now(),
      name: name,
      key: key,
      icon: icon,
      color: "#0c66e4",
      createdAt: new Date().toISOString(),
      data: {}
    };

    if (initMode === "copy"){
      var srcId = document.getElementById("pcCopySrc").value;
      var src = PRJ.projects.find(function(p){return p.id===srcId});
      if (src && src.data){
        // Deep clone
        newPrj.data = JSON.parse(JSON.stringify(src.data));
        // Reset tickets keys to use new project key, reset to ticketSeq=1
        newPrj.data.tickets = (newPrj.data.tickets||[]).map(function(t){
          var oldKey = t.key;
          var newKey = key + "-" + (t.key.split("-")[1] || "1");
          t.key = newKey;
          return t;
        });
        newPrj.data._copiedFrom = src.name;
      }
    } else if (initMode === "defaults"){
      newPrj.data.statuses = JSON.parse(JSON.stringify(DEFAULT_STATUSES));
      newPrj.data.priorities = JSON.parse(JSON.stringify(DEFAULT_PRIORITIES));
      newPrj.data.types = JSON.parse(JSON.stringify(DEFAULT_TYPES));
      newPrj.data.tickets = [];
      newPrj.data.sprints = [];
      newPrj.data.templates = JSON.parse(JSON.stringify(typeof DEFAULT_TEMPLATES !== "undefined" ? DEFAULT_TEMPLATES : []));
      newPrj.data.ticketSeq = 1;
      newPrj.data.workflows = TS.workflows ? JSON.parse(JSON.stringify(TS.workflows)) : [];
    } else {
      newPrj.data.statuses = JSON.parse(JSON.stringify(DEFAULT_STATUSES));
      newPrj.data.priorities = JSON.parse(JSON.stringify(DEFAULT_PRIORITIES));
      newPrj.data.types = JSON.parse(JSON.stringify(DEFAULT_TYPES));
      newPrj.data.tickets = [];
      newPrj.data.sprints = [];
      newPrj.data.templates = [];
      newPrj.data.ticketSeq = 1;
      newPrj.data.workflows = [];
    }

    PRJ.projects.push(newPrj);
    PRJ.activeProjectId = newPrj.id;
    prjSave();
    prjRestoreToTS(newPrj);
    closeModal();
    prjRenderSwitcher();
    if (typeof switchView === "function") switchView(TS.currentView || "gantt");
    toast("✓ 「"+name+"」を作成して切替");
  };
}

function prjManageDlg(){
  var html = '<h3>⚙ プロジェクト管理</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">'+PRJ.projects.length+' 件のプロジェクト。アクティブなプロジェクトは削除できません。</div>';
  html += '<div style="max-height:50vh;overflow:auto;border:1px solid var(--bd);border-radius:4px">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--b2)">';
  html += '<th style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">プロジェクト</th>';
  html += '<th style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">キー</th>';
  html += '<th style="text-align:right;padding:8px;border-bottom:1px solid var(--bd)">チケット</th>';
  html += '<th style="text-align:right;padding:8px;border-bottom:1px solid var(--bd)">スプリント</th>';
  html += '<th style="text-align:right;padding:8px;border-bottom:1px solid var(--bd)">操作</th>';
  html += '</tr></thead><tbody>';
  PRJ.projects.forEach(function(p){
    var active = p.id === PRJ.activeProjectId;
    var tcnt = (p.data && p.data.tickets) ? p.data.tickets.length : 0;
    var scnt = (p.data && p.data.sprints) ? p.data.sprints.length : 0;
    html += '<tr'+(active?' style="background:var(--ac-bg)"':'')+'>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd)"><span style="font-size:16px;margin-right:6px">'+p.icon+'</span><b>'+escHtml(p.name)+'</b>'+(active?' <span style="color:var(--gn);font-size:11px">●ACTIVE</span>':'')+'</td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd);font-family:monospace;color:var(--t2)">'+escHtml(p.key)+'</td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd);text-align:right">'+tcnt+'</td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd);text-align:right">'+scnt+'</td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--bd);text-align:right">';
    if (!active) html += '<button class="btn-icon" data-prj-act="switch" data-prj-id="'+p.id+'" title="切替">▶</button>';
    html += '<button class="btn-icon" data-prj-act="rename" data-prj-id="'+p.id+'" title="名前変更">✎</button>';
    html += '<button class="btn-icon" data-prj-act="export" data-prj-id="'+p.id+'" title="エクスポート">📤</button>';
    if (!active && PRJ.projects.length > 1) html += '<button class="btn-icon" data-prj-act="delete" data-prj-id="'+p.id+'" style="color:var(--dn)" title="削除">×</button>';
    html += '</td></tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="ma"><button class="btn bp" onclick="closeModal()">閉じる</button></div>';
  showModal(html);

  document.querySelectorAll("[data-prj-act]").forEach(function(b){
    b.onclick = function(){
      var act = b.dataset.prjAct;
      var id = b.dataset.prjId;
      if (act === "switch"){closeModal();prjSwitch(id)}
      else if (act === "rename") prjRenameDlg(id);
      else if (act === "export") prjExportYaml(id);
      else if (act === "delete") prjDelete(id);
    };
  });
}

function prjRenameDlg(id){
  var p = PRJ.projects.find(function(x){return x.id===id});
  if (!p) return;
  var html = '<h3>✎ プロジェクト編集</h3>';
  html += '<label>名前</label><input id="prName" value="'+escHtml(p.name)+'">';
  html += '<label>アイコン</label><input id="prIcon" maxlength="2" value="'+p.icon+'" style="width:60px;font-size:18px;text-align:center">';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="prOk">保存</button></div>';
  showModal(html);
  document.getElementById("prOk").onclick = function(){
    if (typeof urCapture === "function") urCapture("プロジェクト名変更", true);
    p.name = document.getElementById("prName").value.trim() || p.name;
    p.icon = document.getElementById("prIcon").value.trim() || p.icon;
    prjSave();
    closeModal();
    prjRenderSwitcher();
    prjManageDlg();
    toast("✓ 保存");
  };
}

function prjDelete(id){
  var p = PRJ.projects.find(function(x){return x.id===id});
  if (!p) return;
  if (p.id === PRJ.activeProjectId){toast("アクティブなプロジェクトは削除できません",1);return}
  var tcnt = (p.data && p.data.tickets) ? p.data.tickets.length : 0;
  if (!confirm("プロジェクト「"+p.name+"」を完全に削除しますか？\nチケット "+tcnt+"件も含め全データが失われます（復元不可）")) return;
  if (typeof urCapture === "function") urCapture("プロジェクト削除", true);
  PRJ.projects = PRJ.projects.filter(function(x){return x.id!==id});
  prjSave();
  closeModal();
  prjManageDlg();
  toast("削除");
}

function prjExportYaml(id){
  var p = PRJ.projects.find(function(x){return x.id===id});
  if (!p) return;
  // Reuse existing yaml export
  var yaml = "# Project: "+p.name+"\n# Key: "+p.key+"\n# Exported: "+new Date().toISOString()+"\n\n";
  yaml += "project:\n  name: "+JSON.stringify(p.name)+"\n  key: "+JSON.stringify(p.key)+"\n  icon: "+JSON.stringify(p.icon)+"\n\n";
  if (p.data){
    PROJECT_SCOPED_FIELDS.forEach(function(f){
      if (p.data[f] !== undefined){
        try { yaml += f+": "+JSON.stringify(p.data[f], null, 2)+"\n\n"; } catch(e){}
      }
    });
  }
  var blob = new Blob([yaml], {type:"text/yaml"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = p.key+"-"+p.name.replace(/[^a-zA-Z0-9_-]+/g,"_")+".yaml";
  a.click();
  setTimeout(function(){URL.revokeObjectURL(url)}, 100);
  toast("📤 "+p.name+" をエクスポート");
}
