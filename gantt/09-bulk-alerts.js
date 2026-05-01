/* ============================================================
   BULK OPERATIONS + ALERT ENGINE
   - Multi-select tickets in Issues view
   - Bulk transition / assign / label / delete
   - Auto-complete parent when all subtasks done
   - Auto-complete with confirmation modal
   - Alert engine: 7d/1d/9am-today/1h/30m/overdue
   - In-app + Webhook + Email/Slack/Discord placeholders
   ============================================================ */

/* ===== Bulk selection state ===== */
var BULK = {
  selected: new Set(),     // ticket keys
  enabled: false
};

function bulkToggle(key){
  if (BULK.selected.has(key)) BULK.selected.delete(key);
  else BULK.selected.add(key);
  updateBulkBar();
}
function bulkClear(){BULK.selected.clear(); BULK.enabled=false; updateBulkBar()}
function bulkSelectAll(){
  // Select all visible (currently filtered) tickets
  var rows = document.querySelectorAll("[data-key]");
  rows.forEach(function(r){if(r.dataset.key)BULK.selected.add(r.dataset.key)});
  updateBulkBar();
}

function updateBulkBar(){
  var bar = document.getElementById("bulkBar");
  if (!bar){
    if (BULK.selected.size === 0) return;
    bar = document.createElement("div");
    bar.id = "bulkBar";
    bar.className = "bulk-bar";
    document.body.appendChild(bar);
  }
  if (BULK.selected.size === 0){bar.style.display="none"; return}
  bar.style.display = "flex";
  bar.innerHTML = '<span class="bulk-cnt">'+BULK.selected.size+'</span><span style="font-size:13px;color:var(--t1)">件選択中</span><div style="flex:1"></div>'+
    '<button class="btn secondary btn-sm" id="bulkSel">全選択</button>'+
    '<button class="btn secondary btn-sm" id="bulkAsg">担当変更</button>'+
    '<button class="btn secondary btn-sm" id="bulkLbl">ラベル追加</button>'+
    '<button class="btn secondary btn-sm" id="bulkSt">ステータス変更</button>'+
    '<button class="btn bp btn-sm" id="bulkDone">✓ Done</button>'+
    '<button class="btn danger btn-sm" id="bulkDel">削除</button>'+
    '<button class="btn-icon" id="bulkClose" title="クリア">×</button>';
  document.getElementById("bulkSel").onclick = bulkSelectAll;
  document.getElementById("bulkClose").onclick = function(){bulkClear(); rerenderCurrent()};
  document.getElementById("bulkAsg").onclick = bulkAsgDlg;
  document.getElementById("bulkLbl").onclick = bulkLblDlg;
  document.getElementById("bulkSt").onclick = bulkStDlg;
  document.getElementById("bulkDone").onclick = bulkDone;
  document.getElementById("bulkDel").onclick = bulkDel;
}

function rerenderCurrent(){
  if (TS.currentView === "ticket" && typeof renderTicketView === "function") renderTicketView();
  else if (TS.currentView === "kanban" && typeof renderKanbanView === "function") renderKanbanView();
  else if (TS.currentView === "backlog" && typeof renderBacklogView === "function") renderBacklogView();
}

function bulkAsgDlg(){
  var opts = '<option value="">- 未割当 -</option>'+TS.users.map(function(u){return '<option value="'+u.id+'">'+escHtml(u.name)+'</option>'}).join("");
  showModal('<h3>📝 一括担当者変更 ('+BULK.selected.size+'件)</h3><label>担当者</label><select id="bAsg">'+opts+'</select><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="bAsgOk">適用</button></div>');
  document.getElementById("bAsgOk").onclick = function(){
    var v = document.getElementById("bAsg").value;
    var n = 0;
    BULK.selected.forEach(function(k){var t=TS.tickets.find(function(x){return x.key===k});if(t){t.assignee=v;t.updatedAt=new Date().toISOString();audit("update","ticket",k,"bulk assignee="+v);n++}});
    saveTS(); closeModal(); toast(n+"件更新"); bulkClear(); rerenderCurrent();
  };
}

function bulkLblDlg(){
  showModal('<h3>🏷 一括ラベル追加 ('+BULK.selected.size+'件)</h3><label>ラベル (カンマ区切り)</label><input id="bLbl" placeholder="urgent,backend"><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="bLblOk">追加</button></div>');
  document.getElementById("bLblOk").onclick = function(){
    var labels = document.getElementById("bLbl").value.split(",").map(function(x){return x.trim()}).filter(Boolean);
    if (!labels.length){toast("ラベル入力",1);return}
    var n = 0;
    BULK.selected.forEach(function(k){var t=TS.tickets.find(function(x){return x.key===k});if(t){t.labels=t.labels||[];labels.forEach(function(l){if(t.labels.indexOf(l)<0)t.labels.push(l)});t.updatedAt=new Date().toISOString();audit("update","ticket",k,"bulk labels +"+labels.join(","));n++}});
    saveTS(); closeModal(); toast(n+"件更新"); bulkClear(); rerenderCurrent();
  };
}

function bulkStDlg(){
  var opts = TS.statuses.map(function(s){return '<option value="'+s.id+'">'+escHtml(s.name)+'</option>'}).join("");
  showModal('<h3>📊 一括ステータス変更 ('+BULK.selected.size+'件)</h3><label>ステータス</label><select id="bSt">'+opts+'</select><div style="font-size:11px;color:var(--wn);margin-top:8px;padding:6px 8px;background:var(--wn-bg);border-radius:3px">⚠ ワークフローのValidatorはスキップされます</div><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="bStOk">適用</button></div>');
  document.getElementById("bStOk").onclick = function(){
    var v = document.getElementById("bSt").value;
    var n = 0;
    BULK.selected.forEach(function(k){
      var t = TS.tickets.find(function(x){return x.key===k});
      if (!t) return;
      var oldS = t.status;
      t.status = v;
      t.updatedAt = new Date().toISOString();
      if (typeof appendTicketHistory === "function") appendTicketHistory(t.key, {ts:new Date().toISOString(),user:TS.currentUser?TS.currentUser.id:"system",type:"bulk_transition",from:oldS,to:v,comment:"bulk update"});
      audit("transition","ticket",k,"bulk "+oldS+"→"+v);
      if (typeof syncTicketToGantt === "function") syncTicketToGantt(k);
      n++;
    });
    saveTS(); closeModal(); toast(n+"件更新"); bulkClear(); rerenderCurrent();
  };
}

function bulkDone(){
  var doneStatus = TS.statuses.find(function(s){return s.id==="done"}) || TS.statuses[TS.statuses.length-1];
  if (!doneStatus){toast("Doneステータスなし",1);return}
  if (!confirm(BULK.selected.size+"件を完了状態にしますか?")) return;
  var n = 0;
  BULK.selected.forEach(function(k){
    var t = TS.tickets.find(function(x){return x.key===k});
    if (!t) return;
    var oldS = t.status;
    t.status = doneStatus.id;
    t.updatedAt = new Date().toISOString();
    if (typeof appendTicketHistory === "function") appendTicketHistory(t.key,{ts:new Date().toISOString(),user:TS.currentUser?TS.currentUser.id:"system",type:"bulk_done",from:oldS,to:doneStatus.id,comment:"bulk done"});
    audit("transition","ticket",k,"bulk done");
    if (typeof syncTicketToGantt === "function") syncTicketToGantt(k);
    n++;
  });
  // After bulk done, check parent auto-complete
  checkAllParentsAutoComplete();
  saveTS(); toast("✓ "+n+"件完了"); bulkClear(); rerenderCurrent();
}

function bulkDel(){
  if (!confirm(BULK.selected.size+"件削除しますか? この操作は取り消せません")) return;
  var n = 0;
  BULK.selected.forEach(function(k){if(deleteTicket(k))n++});
  saveTS(); toast(n+"件削除"); bulkClear(); rerenderCurrent();
}

/* ===== Auto-complete parent when all subtasks done ===== */
function checkAllParentsAutoComplete(){
  var doneId = "done";
  var checked = {};
  TS.tickets.forEach(function(t){
    if (t.parentKey && !checked[t.parentKey]){
      checked[t.parentKey] = true;
      var parent = TS.tickets.find(function(x){return x.key===t.parentKey});
      if (!parent || parent.status === doneId) return;
      var subs = TS.tickets.filter(function(x){return x.parentKey===parent.key});
      if (subs.length && subs.every(function(s){return s.status===doneId})){
        // Ask user
        if (TS.autoCompleteParent === "auto"){
          parent.status = doneId;
          parent.updatedAt = new Date().toISOString();
          if (typeof appendTicketHistory === "function") appendTicketHistory(parent.key,{ts:new Date().toISOString(),user:"system",type:"auto_complete",from:parent.status,to:doneId,comment:"全サブタスク完了で自動完了"});
          audit("auto_complete","ticket",parent.key,"all subtasks done");
        } else if (TS.autoCompleteParent !== "off"){
          // Prompt
          setTimeout(function(){
            if (confirm("親チケット "+parent.key+" の全サブタスクが完了しました。\n親も完了にしますか?")){
              parent.status = doneId;
              parent.updatedAt = new Date().toISOString();
              if (typeof appendTicketHistory === "function") appendTicketHistory(parent.key,{ts:new Date().toISOString(),user:TS.currentUser?TS.currentUser.id:"system",type:"auto_complete",from:parent.status,to:doneId,comment:"全サブタスク完了で完了"});
              audit("auto_complete","ticket",parent.key,"manual confirm");
              saveTS();
              rerenderCurrent();
            }
          }, 100);
        }
      }
    }
  });
}

// Hook into updateTicket to check parent auto-complete
if (typeof updateTicket === "function"){
  var _origUpdateTicketBulk = updateTicket;
  updateTicket = function(key, patch){
    var ok = _origUpdateTicketBulk(key, patch);
    if (ok && patch && patch.status === "done"){
      var t = TS.tickets.find(function(x){return x.key===key});
      if (t && t.parentKey) checkAllParentsAutoComplete();
    }
    return ok;
  };
}

/* ============================================================
   ALERT ENGINE
   - Per-user alert rules: 7d, 1d, today9am, 1h, 30m, overdue, daily
   - Channels: in-app, webhook, email/slack/discord (config only)
   ============================================================ */

var DEFAULT_ALERT_RULES = [
  {id:"r-7d",     name:"7日前",   when:"days_before", value:7,    enabled:true},
  {id:"r-1d",     name:"1日前",   when:"days_before", value:1,    enabled:true},
  {id:"r-9am",    name:"当日9時",  when:"today_at",    value:"09:00", enabled:true},
  {id:"r-1h",     name:"1時間前", when:"hours_before",value:1,    enabled:false},
  {id:"r-30m",    name:"30分前",  when:"min_before",  value:30,   enabled:false},
  {id:"r-over",   name:"締切超過", when:"after_due",   value:5,    enabled:true},
  {id:"r-daily",  name:"毎日",    when:"daily",       value:"09:00",enabled:false}
];

function ensureAlertConfig(){
  if (!TS.alertConfig){
    TS.alertConfig = {
      rules: DEFAULT_ALERT_RULES.slice(),
      channels: {inApp:true, webhook:"", email:"", slack:"", discord:""},
      lastFired: {}    // key: ruleId+ticketKey -> timestamp
    };
    saveTS();
  }
  if (!TS.alertConfig.rules) TS.alertConfig.rules = DEFAULT_ALERT_RULES.slice();
  if (!TS.alertConfig.channels) TS.alertConfig.channels = {inApp:true, webhook:"", email:"", slack:"", discord:""};
  if (!TS.alertConfig.lastFired) TS.alertConfig.lastFired = {};
}

function evaluateAlerts(){
  ensureAlertConfig();
  if (!TS.currentUser) return;
  var now = new Date();
  var nowMs = now.getTime();
  var fired = [];

  TS.tickets.forEach(function(t){
    if (!t.dueDate || t.status === "done") return;
    if (TS.currentUser && t.assignee && t.assignee !== TS.currentUser.id) return; // only my tickets

    var due = new Date(t.dueDate + "T18:00:00");
    var dueMs = due.getTime();

    TS.alertConfig.rules.forEach(function(rule){
      if (!rule.enabled) return;
      var key = rule.id + ":" + t.key;
      var last = TS.alertConfig.lastFired[key];
      var shouldFire = false;
      var msg = "";

      if (rule.when === "days_before"){
        var triggerMs = dueMs - rule.value * 24 * 3600 * 1000;
        var window = 60*60*1000; // 1 hour window
        if (nowMs >= triggerMs && nowMs - triggerMs < 24*3600*1000){
          if (!last || (nowMs - last) > 12*3600*1000){
            shouldFire = true;
            msg = t.key+": 期限まで"+rule.value+"日 ("+t.title+")";
          }
        }
      } else if (rule.when === "hours_before"){
        var triggerMs = dueMs - rule.value * 3600 * 1000;
        if (nowMs >= triggerMs && nowMs < dueMs){
          if (!last || (nowMs - last) > 30*60*1000){
            shouldFire = true;
            msg = t.key+": 期限まで"+rule.value+"時間 ("+t.title+")";
          }
        }
      } else if (rule.when === "min_before"){
        var triggerMs = dueMs - rule.value * 60 * 1000;
        if (nowMs >= triggerMs && nowMs < dueMs){
          if (!last || (nowMs - last) > 10*60*1000){
            shouldFire = true;
            msg = t.key+": 期限まで"+rule.value+"分 ("+t.title+")";
          }
        }
      } else if (rule.when === "today_at"){
        var ttoday = new Date(now);
        var parts = (rule.value||"09:00").split(":");
        ttoday.setHours(parseInt(parts[0])||9, parseInt(parts[1])||0, 0, 0);
        var todayMs = ttoday.getTime();
        var dueDay = new Date(t.dueDate); dueDay.setHours(0,0,0,0);
        var nowDay = new Date(now); nowDay.setHours(0,0,0,0);
        if (dueDay.getTime() === nowDay.getTime() && nowMs >= todayMs && (nowMs - todayMs) < 60*60*1000){
          if (!last || (nowMs - last) > 12*3600*1000){
            shouldFire = true;
            msg = t.key+": 本日が期限です ("+t.title+")";
          }
        }
      } else if (rule.when === "after_due"){
        if (nowMs > dueMs && (nowMs - dueMs) < (rule.value+30)*60*1000){
          if (!last || (nowMs - last) > 60*60*1000){
            shouldFire = true;
            msg = t.key+": ⚠ 期限超過 ("+t.title+")";
          }
        }
      } else if (rule.when === "daily"){
        var ttoday = new Date(now);
        var parts = (rule.value||"09:00").split(":");
        ttoday.setHours(parseInt(parts[0])||9, parseInt(parts[1])||0, 0, 0);
        var todayMs = ttoday.getTime();
        if (nowMs >= todayMs && (nowMs - todayMs) < 60*60*1000){
          if (!last || (nowMs - last) > 12*3600*1000){
            shouldFire = true;
            msg = t.key+": 本日のリマインダー ("+t.title+")";
          }
        }
      }

      if (shouldFire){
        TS.alertConfig.lastFired[key] = nowMs;
        fired.push({ticket:t, rule:rule, msg:msg});
      }
    });
  });

  if (fired.length){
    fired.forEach(function(f){
      // In-app notification
      if (TS.alertConfig.channels.inApp && typeof notify === "function"){
        notify(TS.currentUser.id, f.msg, f.ticket.key);
      }
      // Webhook (fire-and-forget)
      if (TS.alertConfig.channels.webhook){
        try {
          fetch(TS.alertConfig.channels.webhook, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({
              type:"alert", rule:f.rule.name, ticket:f.ticket.key, title:f.ticket.title,
              dueDate:f.ticket.dueDate, message:f.msg, ts:new Date().toISOString()
            })
          }).catch(function(){});
        } catch(e){}
      }
    });
    saveTS();
  }
}

/* Run alerts every 60 seconds */
function startAlertEngine(){
  ensureAlertConfig();
  evaluateAlerts();
  setInterval(evaluateAlerts, 60000);
}

/* ============================================================
   Alert configuration UI (called from settings)
   ============================================================ */
function showAlertConfigDlg(){
  ensureAlertConfig();
  var html = '<h3>🔔 アラート設定</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">期限が近づいたチケット（自分が担当）に対する通知ルール</div>';

  html += '<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin-bottom:8px;letter-spacing:.5px">ルール</div>';
  TS.alertConfig.rules.forEach(function(r, i){
    html += '<div class="alert-rule-row" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--b2);border-radius:3px;margin-bottom:4px">';
    html += '<input type="checkbox" id="ar_'+r.id+'" '+(r.enabled?"checked":"")+' style="width:16px;height:16px;margin:0">';
    html += '<span style="flex:1;font-size:13px;color:var(--t1)">'+escHtml(r.name)+'</span>';
    html += '<span style="font-size:11px;color:var(--t3);font-family:monospace">'+escHtml(r.when)+': '+escHtml(String(r.value))+'</span>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin-bottom:8px;letter-spacing:.5px">通知方法</div>';
  html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="ch_inApp" '+(TS.alertConfig.channels.inApp?"checked":"")+'>画面通知 (ベル)</label>';
  html += '<label style="margin-top:8px">Webhook URL</label><input id="ch_wh" value="'+escHtml(TS.alertConfig.channels.webhook||"")+'" placeholder="https://hooks.slack.com/...">';
  html += '<label>Email (memo)</label><input id="ch_em" value="'+escHtml(TS.alertConfig.channels.email||"")+'" placeholder="alerts@example.com">';
  html += '<label>Slack/Discord通知設定 (memo)</label><input id="ch_sl" value="'+escHtml(TS.alertConfig.channels.slack||"")+'" placeholder="チャネル名等の備考">';
  html += '</div>';

  html += '<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin-bottom:8px;letter-spacing:.5px">親チケット自動完了</div>';
  var apOpts = ["off","prompt","auto"];
  var apLbls = {"off":"無効","prompt":"確認後に完了","auto":"自動で完了"};
  html += '<select id="autoComp">';
  apOpts.forEach(function(o){html += '<option value="'+o+'"'+((TS.autoCompleteParent||"prompt")===o?" selected":"")+'>'+apLbls[o]+'</option>'});
  html += '</select>';
  html += '<div style="font-size:10px;color:var(--t3);margin-top:4px">サブタスクが全て完了した時の親チケットの動作</div></div>';

  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="alOk">保存</button></div>';
  showModal(html);

  document.getElementById("alOk").onclick = function(){
    TS.alertConfig.rules.forEach(function(r){
      var cb = document.getElementById("ar_"+r.id);
      if (cb) r.enabled = cb.checked;
    });
    TS.alertConfig.channels.inApp = document.getElementById("ch_inApp").checked;
    TS.alertConfig.channels.webhook = document.getElementById("ch_wh").value;
    TS.alertConfig.channels.email = document.getElementById("ch_em").value;
    TS.alertConfig.channels.slack = document.getElementById("ch_sl").value;
    TS.autoCompleteParent = document.getElementById("autoComp").value;
    saveTS();
    closeModal();
    toast("✓ 設定保存");
  };
}
