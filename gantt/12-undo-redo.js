/* ============================================================
   GLOBAL UNDO / REDO
   - Snapshots the entire TS state (tickets, templates, workflows...)
   - Triggered by: Ctrl+Z / Ctrl+Y / Cmd+Z / Cmd+Shift+Z
   - Also exposed via toolbar buttons
   - Captures snapshots BEFORE mutating operations:
     ticket create/update/delete, template add/edit/del,
     workflow change, bulk operations, transition, etc.
   ============================================================ */

var UR = {
  history: [],       // Array of snapshots (most recent at end)
  future: [],        // Redo stack (most recent at end)
  capturing: true,   // Set to false when applying undo/redo (to prevent double-capture)
  transactionDepth: 0, // >0 means inside a multi-op transaction; suppress intermediate captures
  maxHistory: 60,
  lastCaptureMs: 0,
  debounceMs: 250    // Coalesce rapid changes into single undo step
};

// Begin a transaction: only the FIRST urCapture call records, subsequent ones are ignored
function urBegin(label){
  if (UR.transactionDepth === 0){
    urCapture(label, true);
  }
  UR.transactionDepth++;
}
function urEnd(){
  UR.transactionDepth = Math.max(0, UR.transactionDepth - 1);
}

// Build a deep snapshot of mutable TS state
function urSnapshot(){
  // Don't include UI/transient fields like currentView, filter, selectedTicket
  // (so undo doesn't change which screen you're on)
  return JSON.stringify({
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
    templatesInitialized: TS.templatesInitialized,
    ticketHistory: TS.ticketHistory,
    notifications: TS.notifications,
    customFields: TS.customFields,
    ticketSeq: TS.ticketSeq,
    autoCompleteParent: TS.autoCompleteParent,
    alertConfig: TS.alertConfig,
    boardConfig: TS.boardConfig,
    ganttData: (typeof S !== "undefined" && S.data) ? JSON.stringify(S.data) : null
  });
}

function urApplySnapshot(snapStr){
  try {
    var snap = JSON.parse(snapStr);
    UR.capturing = false;
    TS.tickets = snap.tickets || [];
    TS.sprints = snap.sprints || [];
    TS.workflows = snap.workflows || [];
    TS.workflowSchemes = snap.workflowSchemes || [];
    TS.workflowDrafts = snap.workflowDrafts || {};
    TS.statuses = snap.statuses || [];
    TS.priorities = snap.priorities || [];
    TS.types = snap.types || [];
    TS.resolutions = snap.resolutions || [];
    TS.users = snap.users || [];
    TS.roles = snap.roles || [];
    TS.templates = snap.templates || [];
    TS.templatesInitialized = snap.templatesInitialized;
    TS.ticketHistory = snap.ticketHistory || {};
    TS.notifications = snap.notifications || [];
    TS.customFields = snap.customFields || [];
    TS.ticketSeq = snap.ticketSeq || 1;
    TS.autoCompleteParent = snap.autoCompleteParent;
    TS.alertConfig = snap.alertConfig;
    TS.boardConfig = snap.boardConfig;
    if (snap.ganttData && typeof S !== "undefined"){
      try {
        S.data = JSON.parse(snap.ganttData);
        if (typeof flatAll === "function") S.flat = flatAll(S.data.tasks||[]);
        if (typeof resG === "function") resG(S.flat||[]);
        if (typeof yS === "function" && document.getElementById("ye")){
          document.getElementById("ye").value = yS(S.data);
        }
      } catch(e){console.warn("ganttData restore failed",e)}
    }
    saveTS();
    UR.capturing = true;
  } catch(e){
    console.error("urApplySnapshot error:", e);
    UR.capturing = true;
  }
}

// Capture current state. If `force` is false, debounces rapid calls.
function urCapture(label, force){
  if (!UR.capturing) return;
  // Inside a transaction, suppress intermediate captures
  if (UR.transactionDepth > 0) return;
  var now = Date.now();
  if (!force && now - UR.lastCaptureMs < UR.debounceMs && UR.history.length > 0){
    // Replace last entry instead of adding new (debounce coalesce)
    return;
  }
  var snap = urSnapshot();
  // Only push if different from previous
  if (UR.history.length > 0 && UR.history[UR.history.length-1].snap === snap) return;
  UR.history.push({snap: snap, label: label || "", ts: now});
  if (UR.history.length > UR.maxHistory) UR.history.shift();
  UR.future = []; // clear redo stack on new action
  UR.lastCaptureMs = now;
  urUpdateButtons();
}

function urUndo(){
  if (UR.history.length === 0){toast("これ以上戻せません",1);return}
  var current = urSnapshot();
  var last = UR.history.pop();
  UR.future.push({snap: current, label: last.label, ts: Date.now()});
  urApplySnapshot(last.snap);
  rerenderAfterUndo();
  toast("↶ 取り消し" + (last.label ? " ("+last.label+")" : ""));
  urUpdateButtons();
}

function urRedo(){
  if (UR.future.length === 0){toast("これ以上やり直せません",1);return}
  var current = urSnapshot();
  var next = UR.future.pop();
  UR.history.push({snap: current, label: next.label, ts: Date.now()});
  urApplySnapshot(next.snap);
  rerenderAfterUndo();
  toast("↷ やり直し" + (next.label ? " ("+next.label+")" : ""));
  urUpdateButtons();
}

function rerenderAfterUndo(){
  var v = TS.currentView || "gantt";
  if (v === "gantt" && typeof render === "function") render();
  else if (v === "ticket" && typeof renderTicketView === "function") renderTicketView();
  else if (v === "kanban" && typeof renderKanbanView === "function") renderKanbanView();
  else if (v === "backlog" && typeof renderBacklogView === "function") renderBacklogView();
  else if (v === "template" && typeof renderTemplateView === "function") renderTemplateView();
  else if (v === "workflow" && typeof renderWorkflowView === "function") renderWorkflowView();
  else if (v === "audit" && typeof renderAuditView === "function") renderAuditView();
  else if (v === "admin" && typeof renderAdminView === "function") renderAdminView();
}

function urUpdateButtons(){
  var u = document.getElementById("topUndo");
  var r = document.getElementById("topRedo");
  if (u) {u.disabled = UR.history.length===0; u.title = UR.history.length===0 ? "取り消し (履歴なし)" : "取り消し ("+UR.history.length+"ステップ) [Ctrl+Z]"}
  if (r) {r.disabled = UR.future.length===0; r.title = UR.future.length===0 ? "やり直し (履歴なし)" : "やり直し ("+UR.future.length+"ステップ) [Ctrl+Y]"}
}

/* ===== Hook into mutating functions ===== */

(function(){
  // Wait until other modules are loaded
  function tryHook(){
    if (typeof updateTicket !== "function" || typeof createTicket !== "function" || typeof deleteTicket !== "function") {
      setTimeout(tryHook, 50); return;
    }

    // Wrap createTicket
    var _origCreate = createTicket;
    createTicket = function(p){urCapture("チケット作成", true); return _origCreate(p)};

    // Wrap updateTicket - debounce so dropdown changes coalesce
    var _origUpdate = updateTicket;
    updateTicket = function(key, patch){
      urCapture("チケット更新", false);
      return _origUpdate(key, patch);
    };

    // Wrap deleteTicket
    var _origDelete = deleteTicket;
    deleteTicket = function(key){urCapture("チケット削除", true); return _origDelete(key)};

    // Wrap addComment if exists
    if (typeof addComment === "function"){
      var _origAddCmt = addComment;
      addComment = function(key, body){urCapture("コメント追加", true); return _origAddCmt(key, body)};
    }

    // Wrap applyTemplate - one transaction = one undo step
    if (typeof applyTemplate === "function"){
      var _origApplyTpl = applyTemplate;
      applyTemplate = function(id, fields, opts){
        urBegin("テンプレート適用");
        try { return _origApplyTpl(id, fields, opts); }
        finally { urEnd(); }
      };
    }

    // Wrap executeTransition
    if (typeof executeTransition === "function"){
      var _origExec = executeTransition;
      executeTransition = function(key, trId, ctx){urCapture("ワークフロー遷移", true); return _origExec(key, trId, ctx)};
    }

    // Wrap workflow ops
    if (typeof publishDraft === "function"){
      var _origPub = publishDraft;
      publishDraft = function(id){urCapture("ワークフロー公開", true); return _origPub(id)};
    }
    if (typeof saveDraft === "function"){
      var _origSDraft = saveDraft;
      saveDraft = function(id, draft){urCapture("ワークフロー編集", false); return _origSDraft(id, draft)};
    }
    if (typeof deleteWorkflow === "function"){
      var _origDelWf = deleteWorkflow;
      deleteWorkflow = function(id){urCapture("ワークフロー削除", true); return _origDelWf(id)};
    }

    // Wrap bulk operations - each is one undo step
    ["bulkDone", "bulkDel"].forEach(function(name){
      if (typeof window[name] === "function"){
        var orig = window[name];
        window[name] = function(){
          urBegin(name === "bulkDone" ? "一括完了" : "一括削除");
          try { return orig.apply(this, arguments); }
          finally { urEnd(); }
        };
      }
    });

    // Initial baseline snapshot (so first action can be undone back to baseline)
    setTimeout(function(){
      urCapture("初期状態", true);
      // The above adds initial state to history. Pop it so users don't have a
      // useless "undo" that does nothing meaningful before any change.
      UR.history.pop();
      urUpdateButtons();
    }, 500);
  }
  tryHook();
})();

/* ===== Keyboard shortcuts ===== */

document.addEventListener("keydown", function(e){
  // Skip when input/textarea is focused (let native undo work)
  var a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)){
    // Exception: Ctrl+Shift+Z always triggers app-level redo (not used by inputs typically)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "z" || e.key === "Z")){
      e.preventDefault();
      urRedo();
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z"){
    e.preventDefault();
    urUndo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))){
    e.preventDefault();
    urRedo();
  }
}, true);

/* ===== Topbar buttons ===== */

document.addEventListener("DOMContentLoaded", function(){
  setTimeout(function(){
    var topbar = document.querySelector(".tb-actions");
    if (!topbar) return;
    if (document.getElementById("topUndo")) return;
    var refBtn = document.getElementById("topCreate");
    var undoBtn = document.createElement("button");
    undoBtn.id = "topUndo";
    undoBtn.className = "btn-icon";
    undoBtn.innerHTML = "↶";
    undoBtn.title = "取り消し [Ctrl+Z]";
    undoBtn.disabled = true;
    undoBtn.style.cssText = "font-size:18px;font-weight:600";
    undoBtn.onclick = urUndo;

    var redoBtn = document.createElement("button");
    redoBtn.id = "topRedo";
    redoBtn.className = "btn-icon";
    redoBtn.innerHTML = "↷";
    redoBtn.title = "やり直し [Ctrl+Y]";
    redoBtn.disabled = true;
    redoBtn.style.cssText = "font-size:18px;font-weight:600";
    redoBtn.onclick = urRedo;

    if (refBtn){
      topbar.insertBefore(undoBtn, refBtn);
      topbar.insertBefore(redoBtn, refBtn);
    } else {
      topbar.appendChild(undoBtn);
      topbar.appendChild(redoBtn);
    }
    urUpdateButtons();
  }, 300);
});

/* ===== History viewer ===== */
function showUndoHistoryDlg(){
  var html = '<h3>↶ 操作履歴</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:10px">最大'+UR.maxHistory+'ステップまで保持</div>';
  html += '<div style="max-height:50vh;overflow:auto"><h4 style="font-size:11px;text-transform:uppercase;color:var(--t2);margin:6px 0">取り消し可能 ('+UR.history.length+'件)</h4>';
  if (UR.history.length === 0) html += '<div style="color:var(--t3);padding:8px;font-size:12px">履歴なし</div>';
  else {
    UR.history.slice().reverse().forEach(function(h, i){
      var ago = Math.round((Date.now()-h.ts)/1000);
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--b2);border-radius:3px;margin-bottom:3px;font-size:12px"><span style="color:var(--t3);font-family:monospace;font-size:10px">#'+(UR.history.length-i)+'</span><span style="flex:1">'+escHtml(h.label||"(無題)")+'</span><span style="color:var(--t3);font-size:10px">'+ago+'s前</span></div>';
    });
  }
  html += '<h4 style="font-size:11px;text-transform:uppercase;color:var(--t2);margin:14px 0 6px">やり直し可能 ('+UR.future.length+'件)</h4>';
  if (UR.future.length === 0) html += '<div style="color:var(--t3);padding:8px;font-size:12px">なし</div>';
  else {
    UR.future.slice().reverse().forEach(function(h){
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--ac-bg);border-radius:3px;margin-bottom:3px;font-size:12px"><span style="flex:1">'+escHtml(h.label||"(無題)")+'</span></div>';
    });
  }
  html += '</div><div class="ma"><button class="btn" onclick="closeModal()">閉じる</button></div>';
  showModal(html);
}
