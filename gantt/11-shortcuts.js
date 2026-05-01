/* ============================================================
   KEYBOARD SHORTCUTS (Linear/Notion-style)
   - g+i / g+b / g+k / g+t / g+w : navigate views (gantt/issues/board/templates/workflows)
   - c    : create new ticket
   - /    : focus global search
   - ?    : show shortcut help
   - j/k  : next/prev ticket in Issues
   - x    : toggle bulk select on focused row
   - Esc  : close modal/popup
   ============================================================ */

var KS = {
  pendingPrefix: null,    // for two-key sequences like "g i"
  prefixTimer: null
};

function isInputFocused(){
  var a = document.activeElement;
  if (!a) return false;
  var tag = a.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || a.contentEditable === "true";
}

function ksClearPrefix(){
  if (KS.prefixTimer){clearTimeout(KS.prefixTimer); KS.prefixTimer=null}
  KS.pendingPrefix = null;
  hideKsHint();
}

function showKsHint(text){
  var hint = document.getElementById("ksHint");
  if (!hint){
    hint = document.createElement("div");
    hint.id = "ksHint";
    hint.style.cssText = "position:fixed;bottom:24px;left:24px;background:#1d2125;color:#fff;padding:8px 14px;border-radius:6px;font-size:12px;z-index:3000;font-family:monospace;box-shadow:0 4px 12px rgba(0,0,0,.3)";
    document.body.appendChild(hint);
  }
  hint.textContent = text;
  hint.style.display = "block";
}
function hideKsHint(){
  var h = document.getElementById("ksHint");
  if (h) h.style.display = "none";
}

function showShortcutHelp(){
  var html = '<h3>⌨ キーボードショートカット</h3>';
  html += '<table style="width:100%;font-size:13px;border-collapse:collapse">';
  var rows = [
    ["ナビゲーション", null],
    ["g i",  "チケット画面へ"],
    ["g b",  "Backlog 画面へ"],
    ["g k",  "Board (Kanban) 画面へ"],
    ["g p",  "Sprints 画面へ"],
    ["g t",  "Templates 画面へ"],
    ["g g",  "Timeline (Gantt) 画面へ"],
    ["g w",  "Status Flows 画面へ"],
    ["g s",  "Settings 画面へ"],
    ["アクション", null],
    ["c",        "新規チケット作成"],
    ["/",        "検索にフォーカス"],
    ["?",        "このヘルプを表示"],
    ["b",        "バックアップダイアログ"],
    ["Ctrl+Z",   "取り消し (Undo)"],
    ["Ctrl+Y",   "やり直し (Redo)"],
    ["Ctrl+Shift+Z", "やり直し (Redo)"],
    ["チケット画面内", null],
    ["j",    "次のチケット"],
    ["k",    "前のチケット"],
    ["x",    "選択中の行を一括選択にトグル"],
    ["o",    "選択中のチケットを開く (Enter)"],
    ["全画面", null],
    ["Esc",  "モーダル/ポップアップを閉じる"]
  ];
  rows.forEach(function(r){
    if (r[1] === null){
      html += '<tr><td colspan="2" style="padding:10px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);letter-spacing:.5px;border-bottom:1px solid var(--bd)">'+r[0]+'</td></tr>';
    } else {
      html += '<tr><td style="padding:6px 12px;width:100px"><kbd style="background:var(--b3);border:1px solid var(--bd);border-radius:3px;padding:2px 6px;font-family:monospace;font-size:11px">'+r[0]+'</kbd></td><td style="padding:6px 0;color:var(--t1)">'+r[1]+'</td></tr>';
    }
  });
  html += '</table>';
  html += '<div class="ma"><button class="btn bp" onclick="closeModal()">閉じる</button></div>';
  showModal(html);
}

document.addEventListener("keydown", function(e){
  // Always allow Esc
  if (e.key === "Escape"){
    // Close modal if open
    var modal = document.getElementById("modal");
    if (modal && modal.style.display === "flex") closeModal();
    // Close process visualizer
    if (typeof PVZ !== "undefined" && PVZ.open && typeof closeProcessVisualizer === "function") closeProcessVisualizer();
    // Close notif
    var n = document.getElementById("notif");
    if (n && n.style.display === "flex") n.style.display = "none";
    ksClearPrefix();
    return;
  }

  if (isInputFocused()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return; // Skip ctrl-combo

  // Two-key sequences (g + ...)
  if (KS.pendingPrefix === "g"){
    e.preventDefault();
    var view = null;
    switch(e.key){
      case "i": view = "ticket"; break;
      case "b": view = "backlog"; break;
      case "k": view = "kanban"; break;
      case "p": view = "sprint"; break;
      case "t": view = "template"; break;
      case "g": view = "gantt"; break;
      case "w": view = "workflow"; break;
      case "s": view = "admin"; break;
      case "a": view = "audit"; break;
    }
    ksClearPrefix();
    if (view && typeof switchView === "function") switchView(view);
    return;
  }

  // Single keys
  switch(e.key){
    case "g":
      KS.pendingPrefix = "g";
      showKsHint("g _ 待機中... (i=Issues, b=Backlog, k=Board, t=Templates, g=Gantt, w=Workflows, s=Settings)");
      KS.prefixTimer = setTimeout(ksClearPrefix, 1500);
      e.preventDefault();
      break;
    case "c":
      e.preventDefault();
      if (typeof newTicketDlg === "function") newTicketDlg();
      break;
    case "/":
      e.preventDefault();
      var s = document.getElementById("globalSearch");
      if (s){s.focus(); s.select()}
      break;
    case "?":
      e.preventDefault();
      showShortcutHelp();
      break;
    case "b":
      e.preventDefault();
      if (typeof showBackupDlg === "function") showBackupDlg();
      break;
    // Issues navigation
    case "j":
    case "k":
      if (TS.currentView === "ticket"){
        e.preventDefault();
        navigateTicketList(e.key === "j" ? 1 : -1);
      }
      break;
    case "x":
      if (TS.currentView === "ticket" && TS.selectedTicket){
        e.preventDefault();
        if (typeof bulkToggle === "function"){
          bulkToggle(TS.selectedTicket);
          if (typeof renderTicketView === "function") renderTicketView();
        }
      }
      break;
    case "o":
    case "Enter":
      if (TS.currentView === "ticket" && TS.selectedTicket){
        // Already showing detail — focus a textarea? scroll into view.
        var det = document.getElementById("ticketDetail");
        if (det) det.scrollIntoView({behavior:"smooth"});
      }
      break;
  }
});

function navigateTicketList(dir){
  if (typeof searchTickets !== "function") return;
  var results = searchTickets(TS.filter || "");
  if (!results.length) return;
  var idx = TS.selectedTicket ? results.findIndex(function(t){return t.key===TS.selectedTicket}) : -1;
  idx = idx + dir;
  if (idx < 0) idx = 0;
  if (idx >= results.length) idx = results.length - 1;
  TS.selectedTicket = results[idx].key;
  if (typeof renderTicketView === "function") renderTicketView();
  // Scroll the row into view
  setTimeout(function(){
    var row = document.querySelector('.tk-row[data-key="'+results[idx].key+'"]');
    if (row) row.scrollIntoView({block:"nearest", behavior:"smooth"});
  }, 50);
}

// Add a help link in topbar
document.addEventListener("DOMContentLoaded", function(){
  // wait for topbar to render
  setTimeout(function(){
    var topbar = document.querySelector(".tb-actions");
    if (topbar && !document.getElementById("topHelp")){
      var help = document.createElement("button");
      help.id = "topHelp";
      help.className = "btn-icon";
      help.title = "Shortcuts (?)";
      help.textContent = "?";
      help.style.fontWeight = "700";
      help.onclick = showShortcutHelp;
      topbar.insertBefore(help, topbar.querySelector("#thBtn"));
    }
  }, 200);
});
