/* ============================================================
   PROCESS TEMPLATES (Workflow as Template)
   - Templates = parent + subtasks + dependencies + checklists
   - Examples: 新規サーバ構築, 障害対応, 入社対応, リリース作業
   - Visual GUI editor with drag-drop nodes
   - Auto-expansion: applying a template creates the parent + all
     subtasks + dependency links
   ============================================================ */

var TPL_STATE = {
  selectedId: null,
  editing: null,        // working copy
  draggingNode: null,
  drawingEdge: null,
  positions: {},        // nodeId -> {x,y}
  history: [],          // undo stack of editing snapshots
  redoStack: []
};

// Default templates that ship with the app
var DEFAULT_TEMPLATES = [
  {
    id: "tpl-server-build",
    name: "新規サーバ構築",
    description: "新しいサーバを立ち上げる際の標準作業",
    icon: "🖥",
    color: "#1868db",
    parentTitle: "新規サーバ構築: {{server_name}}",
    parentType: "task",
    parentPriority: "medium",
    parentLabels: ["infrastructure"],
    nodes: [
      {id:"n1", title:"IP払い出し依頼",      type:"task", role:"infra", durationDays:1, x:80,  y:80,  desc:"ネットワーク部門にIP発行依頼"},
      {id:"n2", title:"OSインストール",        type:"task", role:"infra", durationDays:1, x:300, y:80,  desc:"OS image適用、初期設定"},
      {id:"n3", title:"監視エージェント設定",   type:"task", role:"infra", durationDays:1, x:520, y:30,  desc:"Datadog/Prometheus等を導入"},
      {id:"n4", title:"バックアップ設定",      type:"task", role:"infra", durationDays:1, x:520, y:140, desc:"バックアップジョブ登録"},
      {id:"n5", title:"運用ドキュメント整備", type:"task", role:"docs",  durationDays:1, x:740, y:80,  desc:"Confluence/Notionに記載"}
    ],
    edges: [
      {from:"n1", to:"n2"},
      {from:"n2", to:"n3"},
      {from:"n2", to:"n4"},
      {from:"n3", to:"n5"},
      {from:"n4", to:"n5"}
    ],
    fields: [
      {key:"server_name", label:"サーバ名", type:"text", required:true, default:""}
    ]
  },
  {
    id: "tpl-incident",
    name: "障害対応",
    description: "本番障害発生時の標準対応フロー",
    icon: "🚨",
    color: "#e2483d",
    parentTitle: "障害対応: {{summary}}",
    parentType: "incident",
    parentPriority: "high",
    parentLabels: ["incident"],
    nodes: [
      {id:"n1", title:"初動・状況確認",  type:"incident", role:"oncall",  durationDays:1, x:80,  y:80,  desc:"影響範囲の確認、ログ採取"},
      {id:"n2", title:"暫定対応",        type:"incident", role:"oncall",  durationDays:1, x:300, y:80,  desc:"サービス復旧を最優先"},
      {id:"n3", title:"恒久対策検討",    type:"task",     role:"dev",     durationDays:3, x:520, y:30,  desc:"根本原因分析、コード修正案"},
      {id:"n4", title:"ユーザー連絡",    type:"task",     role:"support", durationDays:1, x:520, y:140, desc:"ステータスページ更新、メール通知"},
      {id:"n5", title:"ポストモーテム",  type:"task",     role:"dev",     durationDays:2, x:740, y:80,  desc:"再発防止策のドキュメント化"}
    ],
    edges: [
      {from:"n1", to:"n2"},
      {from:"n2", to:"n3"},
      {from:"n2", to:"n4"},
      {from:"n3", to:"n5"}
    ],
    fields: [
      {key:"summary", label:"障害概要", type:"text", required:true, default:""}
    ]
  },
  {
    id: "tpl-onboarding",
    name: "入社対応",
    description: "新メンバー入社時の準備作業",
    icon: "👋",
    color: "#22a06b",
    parentTitle: "入社対応: {{member_name}}",
    parentType: "task",
    parentPriority: "medium",
    parentLabels: ["hr","onboarding"],
    nodes: [
      {id:"n1", title:"入社書類準備",    type:"task", role:"hr",    durationDays:2, x:80,  y:80,  desc:"雇用契約・誓約書"},
      {id:"n2", title:"PC・備品手配",    type:"task", role:"infra", durationDays:3, x:300, y:30,  desc:"PC、モニタ、その他備品"},
      {id:"n3", title:"アカウント発行",  type:"task", role:"infra", durationDays:1, x:300, y:140, desc:"AD, GSuite, Slack, GitHub"},
      {id:"n4", title:"オリエンテーション", type:"task", role:"hr", durationDays:1, x:520, y:80,  desc:"会社制度、ツール説明"},
      {id:"n5", title:"初期研修",        type:"task", role:"manager", durationDays:5, x:740, y:80, desc:"OJT・チュートリアル"}
    ],
    edges: [
      {from:"n1", to:"n2"},
      {from:"n1", to:"n3"},
      {from:"n2", to:"n4"},
      {from:"n3", to:"n4"},
      {from:"n4", to:"n5"}
    ],
    fields: [
      {key:"member_name", label:"新メンバー名", type:"text", required:true, default:""},
      {key:"start_date", label:"入社日", type:"date", required:false, default:""}
    ]
  },
  {
    id: "tpl-release",
    name: "リリース作業",
    description: "本番リリース時の標準手順",
    icon: "🚀",
    color: "#8270db",
    parentTitle: "リリース: {{version}}",
    parentType: "task",
    parentPriority: "high",
    parentLabels: ["release"],
    nodes: [
      {id:"n1", title:"リリース計画作成",  type:"task", role:"pm",    durationDays:1, x:80,  y:80,  desc:"範囲、ロールバック手順"},
      {id:"n2", title:"コードフリーズ",    type:"task", role:"dev",   durationDays:1, x:300, y:30,  desc:"対象ブランチをfreeze"},
      {id:"n3", title:"QAテスト",         type:"task", role:"qa",    durationDays:3, x:300, y:140, desc:"リグレッションテスト"},
      {id:"n4", title:"リリース承認",      type:"task", role:"pm",    durationDays:1, x:520, y:80,  desc:"ステークホルダー承認"},
      {id:"n5", title:"本番デプロイ",      type:"task", role:"infra", durationDays:1, x:740, y:30,  desc:"予定時刻にデプロイ実行"},
      {id:"n6", title:"動作確認",         type:"task", role:"qa",    durationDays:1, x:740, y:140, desc:"スモークテスト"},
      {id:"n7", title:"リリースアナウンス", type:"task", role:"pm",   durationDays:1, x:960, y:80,  desc:"ユーザー通知、ChangeLog更新"}
    ],
    edges: [
      {from:"n1", to:"n2"},
      {from:"n1", to:"n3"},
      {from:"n2", to:"n4"},
      {from:"n3", to:"n4"},
      {from:"n4", to:"n5"},
      {from:"n5", to:"n6"},
      {from:"n6", to:"n7"}
    ],
    fields: [
      {key:"version", label:"バージョン番号", type:"text", required:true, default:"v1.0.0"},
      {key:"release_date", label:"予定日", type:"date", required:false, default:""}
    ]
  }
];

function ensureTemplates(){
  if (!TS.templates) TS.templates = [];
  // Only seed defaults on truly first load (when the flag is not set yet)
  if (TS.templates.length === 0 && !TS.templatesInitialized){
    TS.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
    TS.templatesInitialized = true;
    saveTS();
  } else if (TS.templates.length > 0){
    // Already have data - mark as initialized
    TS.templatesInitialized = true;
  }
}

/* ===== Apply template: create parent + subtasks + dependency links ===== */
function applyTemplate(templateId, fieldValues, options){
  options = options || {};
  var tpl = TS.templates.find(function(x){return x.id===templateId});
  if (!tpl) return {ok:false, msg:"テンプレートが見つかりません"};

  // Substitute {{field_key}} in title/desc
  function substitute(str){
    if (!str) return str;
    return String(str).replace(/\{\{(\w+)\}\}/g, function(m, k){
      return (fieldValues && fieldValues[k]!=null) ? fieldValues[k] : m;
    });
  }

  // 1. Create parent
  var parentTitle = substitute(tpl.parentTitle || tpl.name);
  var parent = createTicket({
    title: parentTitle,
    description: tpl.description || "",
    type: tpl.parentType || "task",
    priority: tpl.parentPriority || "medium",
    labels: (tpl.parentLabels || []).slice(),
    status: "todo",
    assignee: options.parentAssignee || ""
  });
  if (!parent) return {ok:false, msg:"親チケット作成失敗"};
  // Record template lineage on parent
  parent.templateId = tpl.id;
  parent.templateRole = "parent";
  parent.templateSnapshot = {
    nodes: JSON.parse(JSON.stringify(tpl.nodes||[])),
    edges: JSON.parse(JSON.stringify(tpl.edges||[])),
    name: tpl.name,
    icon: tpl.icon,
    color: tpl.color
  };
  audit("apply_template","ticket",parent.key,"template:"+tpl.name);

  // 2. Create subtasks - keep mapping nodeId -> ticket key
  var nodeToKey = {};
  var startDate = options.startDate ? new Date(options.startDate) : new Date();

  // Compute level (rank) for each node so we can assign due dates by level
  var levels = computeLevels(tpl.nodes, tpl.edges);

  tpl.nodes.forEach(function(n){
    var lvl = levels[n.id] || 0;
    // Each level adds duration of all parents -> approximate by lvl*durationDays
    var due = new Date(startDate);
    due.setDate(due.getDate() + (lvl + (n.durationDays||1)));
    var dueStr = due.toISOString().substr(0,10);

    var sub = createTicket({
      title: substitute(n.title),
      description: substitute(n.desc || ""),
      type: n.type || "task",
      priority: n.priority || tpl.parentPriority || "medium",
      labels: (n.labels || tpl.parentLabels || []).slice(),
      status: "todo",
      assignee: (options.roleAssignees && n.role && options.roleAssignees[n.role]) || "",
      parentKey: parent.key,
      dueDate: dueStr,
      storyPoint: n.durationDays || null
    });
    // Record template lineage on subtask
    sub.templateId = tpl.id;
    sub.templateRole = "subtask";
    sub.templateNodeId = n.id;
    nodeToKey[n.id] = sub.key;
    // Auto subtask link from parent
    parent.links = parent.links || [];
    parent.links.push({type:"subtask", target:sub.key});
  });

  // 3. Create dependency links via blocks/blocked_by
  (tpl.edges || []).forEach(function(e){
    var fromKey = nodeToKey[e.from];
    var toKey = nodeToKey[e.to];
    if (!fromKey || !toKey) return;
    var fromTk = TS.tickets.find(function(x){return x.key===fromKey});
    if (fromTk){
      fromTk.links = fromTk.links || [];
      fromTk.links.push({type:"blocks", target:toKey});
    }
  });

  saveTS();
  return {ok:true, parentKey:parent.key, subtaskKeys:Object.values(nodeToKey)};
}

function computeLevels(nodes, edges){
  var levels = {};
  var visited = {};
  // Start with nodes that have no incoming edge
  var incoming = {};
  nodes.forEach(function(n){incoming[n.id] = 0});
  (edges||[]).forEach(function(e){if(incoming[e.to]!=null)incoming[e.to]++});
  var queue = nodes.filter(function(n){return incoming[n.id]===0}).map(function(n){return {id:n.id, level:0}});
  queue.forEach(function(q){levels[q.id]=0;visited[q.id]=true});
  while (queue.length){
    var cur = queue.shift();
    (edges||[]).forEach(function(e){
      if (e.from === cur.id){
        var nl = cur.level + 1;
        if (levels[e.to] == null || levels[e.to] < nl){
          levels[e.to] = nl;
          if (!visited[e.to]){visited[e.to]=true; queue.push({id:e.to, level:nl})}
          else queue.push({id:e.to, level:nl}); // re-process
        }
      }
    });
  }
  // Any unvisited node gets level 0
  nodes.forEach(function(n){if(levels[n.id]==null)levels[n.id]=0});
  return levels;
}

/* ============================================================
   TEMPLATE GALLERY + EDITOR VIEW
   ============================================================ */

function renderTemplateView(){
  ensureTemplates();
  var v = document.getElementById("templateView");
  if (!v) return;

  if (TPL_STATE.editing){
    renderTemplateEditor(v);
    return;
  }

  // Gallery
  var html = '<div class="page-header"><div class="page-bc"><a>テンプレート</a></div><div class="page-title">⚡ Templates</div><div style="font-size:13px;color:var(--t2);margin-top:4px">親チケット + サブタスク + 依存関係を一括生成するテンプレート</div></div>';
  html += '<div class="page-toolbar"><button class="btn bp" id="tplNew">+ Template</button><button class="btn secondary" id="tplImport">📥 Import</button>';
  if (TS.templates.length === 0){
    html += '<button class="btn secondary" id="tplRestoreDef">🔄 サンプルを復元</button>';
  }
  html += '</div>';
  html += '<div style="flex:1;overflow:auto;padding:20px;background:var(--b2)">';

  if (TS.templates.length === 0){
    html += '<div class="empty-state"><div class="empty-state-icon">⚡</div><div class="empty-state-title">テンプレートがありません</div><div class="empty-state-text">「+ Template」で新規作成、または「🔄 サンプルを復元」で初期サンプル（新規サーバ構築・障害対応等）を復元できます。</div></div>';
    html += '</div>';
    v.innerHTML = html;
    document.getElementById("tplNew").onclick = function(){tplCreateDlg()};
    document.getElementById("tplImport").onclick = function(){tplImportDlg()};
    document.getElementById("tplRestoreDef").onclick = function(){
      if (confirm("初期サンプルテンプレート(4種)を復元しますか？")){
        if(typeof urCapture==="function")urCapture("サンプル復元",true);
        TS.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
        TS.templatesInitialized = true;
        audit("restore","template","-","default samples");
        saveTS();
        renderTemplateView();
        toast("✓ サンプルを復元");
      }
    };
    return;
  }

  html += '<div class="tpl-grid">';
  TS.templates.forEach(function(tpl){
    html += '<div class="tpl-card" data-id="'+tpl.id+'">';
    html += '<div class="tpl-card-h"><span class="tpl-icon" style="background:'+escHtml(tpl.color||"#0c66e4")+'">'+(tpl.icon||"⚡")+'</span><div style="flex:1"><div class="tpl-name">'+escHtml(tpl.name)+'</div><div class="tpl-meta">'+(tpl.nodes||[]).length+' tasks · '+(tpl.edges||[]).length+' deps</div></div></div>';
    html += '<div class="tpl-desc">'+escHtml(tpl.description||"")+'</div>';
    html += '<div class="tpl-card-f">';
    html += '<button class="btn bp btn-sm" data-act="apply" data-id="'+tpl.id+'">Apply</button>';
    html += '<button class="btn secondary btn-sm" data-act="edit" data-id="'+tpl.id+'">Edit</button>';
    html += '<button class="btn-icon" data-act="dup" data-id="'+tpl.id+'" title="複製">⎘</button>';
    html += '<button class="btn-icon" data-act="del" data-id="'+tpl.id+'" title="削除" style="color:var(--dn)">×</button>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  v.innerHTML = html;

  document.getElementById("tplNew").onclick = function(){tplCreateDlg()};
  document.getElementById("tplImport").onclick = function(){tplImportDlg()};
  v.querySelectorAll("[data-act]").forEach(function(b){
    b.onclick = function(e){
      e.stopPropagation();
      var act = b.dataset.act;
      var id = b.dataset.id;
      if (act === "apply") tplApplyDlg(id);
      else if (act === "edit"){TPL_STATE.editing = JSON.parse(JSON.stringify(TS.templates.find(function(x){return x.id===id}))); TPL_STATE.history=[]; TPL_STATE.redoStack=[]; renderTemplateView()}
      else if (act === "dup"){
        var orig = TS.templates.find(function(x){return x.id===id});
        if (orig){if(typeof urCapture==="function")urCapture("テンプレート複製",true);var c = JSON.parse(JSON.stringify(orig)); c.id="tpl-"+Date.now(); c.name=c.name+" (copy)"; TS.templates.push(c); saveTS(); renderTemplateView(); toast("複製")}
      }
      else if (act === "del"){if(confirm("削除しますか?\n"+TS.templates.find(function(x){return x.id===id}).name)){if(typeof urCapture==="function")urCapture("テンプレート削除",true);TS.templates = TS.templates.filter(function(x){return x.id!==id}); audit("delete","template",id,""); saveTS(); renderTemplateView()}}
    };
  });
}

function tplCreateDlg(){
  showModal('<h3>+ 新規テンプレート</h3><label>名前</label><input id="tcN" placeholder="例: 新規プロジェクト立ち上げ"><label>アイコン (絵文字1文字)</label><input id="tcI" maxlength="2" value="⚡"><label>説明</label><textarea id="tcD" rows="2"></textarea><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="tcOk">作成して編集</button></div>');
  document.getElementById("tcOk").onclick = function(){
    var n = document.getElementById("tcN").value.trim();
    if (!n){toast("名前必須",1);return}
    var tpl = {
      id:"tpl-"+Date.now(), name:n,
      description:document.getElementById("tcD").value,
      icon:document.getElementById("tcI").value||"⚡",
      color:"#0c66e4",
      parentTitle:n+": {{title}}", parentType:"task", parentPriority:"medium", parentLabels:[],
      nodes:[], edges:[], fields:[{key:"title",label:"タイトル",type:"text",required:true,default:""}]
    };
    if(typeof urCapture==="function")urCapture("テンプレート作成",true);
    TS.templates.push(tpl);
    audit("create","template",tpl.id,n);
    saveTS();
    closeModal();
    TPL_STATE.editing = JSON.parse(JSON.stringify(tpl));
    renderTemplateView();
  };
}

function tplApplyDlg(templateId){
  var tpl = TS.templates.find(function(x){return x.id===templateId});
  if (!tpl) return;
  // Build form for fields
  var html = '<h3><span style="background:'+escHtml(tpl.color||"#0c66e4")+';color:#fff;width:32px;height:32px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;margin-right:10px;vertical-align:middle">'+(tpl.icon||"⚡")+'</span>Apply: '+escHtml(tpl.name)+'</h3>';
  html += '<div style="font-size:12px;color:var(--t2);margin-bottom:12px">'+escHtml(tpl.description||"")+'</div>';
  html += '<div style="background:var(--ac-bg);padding:8px 12px;border-radius:4px;font-size:12px;color:var(--ac);margin-bottom:14px">⚡ <b>'+(tpl.nodes||[]).length+'</b>個のサブタスク + <b>'+(tpl.edges||[]).length+'</b>個の依存関係を自動生成します</div>';

  // Custom fields
  (tpl.fields || []).forEach(function(f){
    var label = escHtml(f.label) + (f.required ? ' <span style="color:var(--dn)">*</span>' : '');
    html += '<label>'+label+'</label>';
    if (f.type === "date") html += '<input id="tplF_'+f.key+'" type="date" value="'+(f.default||"")+'">';
    else html += '<input id="tplF_'+f.key+'" value="'+escHtml(f.default||"")+'">';
  });

  html += '<label>開始日</label><input id="tplStart" type="date" value="'+(new Date().toISOString().substr(0,10))+'">';
  html += '<label>親チケット担当者</label><select id="tplParentAsg"><option value="">- 未設定 -</option>'+TS.users.map(function(u){return '<option value="'+u.id+'">'+escHtml(u.name)+'</option>'}).join("")+'</select>';

  // Role-based assignee mapping
  var roles = [...new Set((tpl.nodes||[]).map(function(n){return n.role}).filter(Boolean))];
  if (roles.length){
    html += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin-bottom:8px;letter-spacing:.5px">ロール → 担当者の割当 (任意)</div>';
    roles.forEach(function(r){
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="background:var(--b3);padding:3px 8px;border-radius:3px;font-size:11px;font-family:monospace;width:80px">'+escHtml(r)+'</span><select id="tplR_'+r+'" style="flex:1;padding:5px 8px;border:1px solid var(--bd);border-radius:3px;background:var(--b1);color:var(--t1);font-size:12px"><option value="">- 未設定 -</option>'+TS.users.map(function(u){return '<option value="'+u.id+'">'+escHtml(u.name)+'</option>'}).join("")+'</select></div>';
    });
    html += '</div>';
  }

  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="tplApplyOk">⚡ 適用 (自動生成)</button></div>';
  showModal(html);

  document.getElementById("tplApplyOk").onclick = function(){
    var fields = {};
    var missing = [];
    (tpl.fields||[]).forEach(function(f){
      var el = document.getElementById("tplF_"+f.key);
      var v = el ? el.value : "";
      if (f.required && !v.trim()) missing.push(f.label);
      fields[f.key] = v;
    });
    if (missing.length){toast("必須項目: "+missing.join(", "),1);return}

    var roleAssignees = {};
    roles.forEach(function(r){var s=document.getElementById("tplR_"+r);if(s&&s.value)roleAssignees[r]=s.value});

    var startDate = document.getElementById("tplStart").value;
    var parentAsg = document.getElementById("tplParentAsg").value;

    var r = applyTemplate(templateId, fields, {startDate:startDate, parentAssignee:parentAsg, roleAssignees:roleAssignees});
    if (r.ok){
      closeModal();
      toast("✓ "+(r.subtaskKeys.length+1)+"件のチケットを生成 (親: "+r.parentKey+")");
      TS.selectedTicket = r.parentKey;
      switchView("ticket");
    } else {
      toast(r.msg || "適用失敗", 1);
    }
  };
}

function tplImportDlg(){
  showModal('<h3>📥 テンプレートをインポート</h3><label>YAML テキスト</label><textarea id="tplImpY" style="width:100%;min-height:240px;font-family:\'SF Mono\',monospace;font-size:11px;padding:8px;border:1px solid var(--bd);border-radius:3px;background:var(--b1);color:var(--t1);outline:none"></textarea><input type="file" id="tplImpFile" accept=".yaml,.yml" style="display:block;margin-top:6px"><div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="tplImpOk">インポート</button></div>');
  document.getElementById("tplImpFile").onchange = function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){document.getElementById("tplImpY").value=ev.target.result};r.readAsText(f)};
  document.getElementById("tplImpOk").onclick = function(){
    var y = document.getElementById("tplImpY").value.trim();
    if (!y){toast("YAMLを入力",1);return}
    try {
      var parsed = yP(y);
      if (!parsed || !parsed.name){toast("無効なYAML",1);return}
      parsed.id = "tpl-"+Date.now();
      if (!parsed.nodes) parsed.nodes = [];
      if (!parsed.edges) parsed.edges = [];
      if (!parsed.fields) parsed.fields = [];
      if(typeof urCapture==="function")urCapture("テンプレートインポート",true);
      TS.templates.push(parsed);
      audit("create","template",parsed.id,"imported: "+parsed.name);
      saveTS();
      closeModal();
      renderTemplateView();
      toast("インポート完了");
    } catch(e){toast("パースエラー: "+e.message,1)}
  };
}

/* ============================================================
   TEMPLATE EDITOR — Visual Node-Edge GUI with drag & drop
   ============================================================ */

function pushTemplateHistory(){
  if (!TPL_STATE.editing) return;
  TPL_STATE.history.push(JSON.stringify(TPL_STATE.editing));
  if (TPL_STATE.history.length > 50) TPL_STATE.history.shift();
  TPL_STATE.redoStack = [];
}

function tplUndo(){
  if (TPL_STATE.history.length === 0) return;
  TPL_STATE.redoStack.push(JSON.stringify(TPL_STATE.editing));
  TPL_STATE.editing = JSON.parse(TPL_STATE.history.pop());
  renderTemplateView();
}
function tplRedo(){
  if (TPL_STATE.redoStack.length === 0) return;
  TPL_STATE.history.push(JSON.stringify(TPL_STATE.editing));
  TPL_STATE.editing = JSON.parse(TPL_STATE.redoStack.pop());
  renderTemplateView();
}

function renderTemplateEditor(v){
  var t = TPL_STATE.editing;
  var html = '<div class="page-header"><div class="page-bc"><a id="tplBack">⚡ Templates</a> / <span>'+escHtml(t.name)+'</span></div><div class="page-title" style="display:flex;align-items:center;gap:10px"><span style="background:'+escHtml(t.color||"#0c66e4")+';color:#fff;width:36px;height:36px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:20px">'+(t.icon||"⚡")+'</span><input id="tplEdName" value="'+escHtml(t.name)+'" style="font-size:24px;font-weight:600;border:none;background:transparent;color:var(--t1);outline:none;flex:1"></div></div>';

  html += '<div class="page-toolbar">';
  html += '<button class="btn-icon" id="tplUndo" title="Undo (Ctrl+Z)">↶</button>';
  html += '<button class="btn-icon" id="tplRedo" title="Redo (Ctrl+Y)">↷</button>';
  html += '<span class="sep"></span>';
  html += '<button class="btn secondary" id="tplAddNode">+ タスク追加</button>';
  html += '<button class="btn secondary" id="tplAddField">+ フィールド追加</button>';
  html += '<button class="btn secondary" id="tplProps">⚙ プロパティ</button>';
  html += '<button class="btn secondary" id="tplExport">📤 Export YAML</button>';
  html += '<div style="flex:1"></div>';
  html += '<button class="btn secondary" id="tplCancel">キャンセル</button>';
  html += '<button class="btn bp" id="tplSave">💾 保存</button>';
  html += '</div>';

  // Editor: split into canvas + side panel
  html += '<div class="tpl-editor-body">';
  html += '<div class="tpl-canvas-wrap"><div class="tpl-canvas" id="tplCanvas" style="background:var(--b2);background-image:radial-gradient(circle, var(--bd) 1px, transparent 1px);background-size:20px 20px"></div></div>';
  html += '<div class="tpl-sidebar"><h4 style="padding:14px 16px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--t2);font-weight:700;border-bottom:1px solid var(--bd);background:var(--b2);margin:0">タスク一覧 ('+(t.nodes||[]).length+')</h4><div id="tplNodeList" style="padding:8px"></div></div>';
  html += '</div>';

  v.innerHTML = html;

  // Bindings
  document.getElementById("tplBack").onclick = function(){
    if (TPL_STATE.editing && TPL_STATE.history.length){
      if (!confirm("未保存の変更があります。破棄しますか？")) return;
    }
    TPL_STATE.editing = null; TPL_STATE.history=[]; TPL_STATE.redoStack=[];
    renderTemplateView();
  };
  document.getElementById("tplEdName").onchange = function(){pushTemplateHistory();t.name = this.value};
  document.getElementById("tplUndo").onclick = tplUndo;
  document.getElementById("tplRedo").onclick = tplRedo;
  document.getElementById("tplAddNode").onclick = function(){tplAddNodeDlg()};
  document.getElementById("tplAddField").onclick = function(){tplAddFieldDlg()};
  document.getElementById("tplProps").onclick = function(){tplPropsDlg()};
  document.getElementById("tplExport").onclick = function(){
    var yaml = yS(t);
    downloadFile(t.name.replace(/\s+/g,"-").toLowerCase()+".template.yaml", yaml, "text/yaml");
    toast("YAMLエクスポート");
  };
  document.getElementById("tplCancel").onclick = function(){
    if (TPL_STATE.history.length){if(!confirm("変更を破棄しますか？"))return}
    TPL_STATE.editing = null; renderTemplateView();
  };
  document.getElementById("tplSave").onclick = function(){
    if(typeof urCapture==="function")urCapture("テンプレート保存",true);
    var idx = TS.templates.findIndex(function(x){return x.id===t.id});
    if (idx >= 0) TS.templates[idx] = JSON.parse(JSON.stringify(t));
    else TS.templates.push(JSON.parse(JSON.stringify(t)));
    audit("update","template",t.id,t.name);
    saveTS();
    TPL_STATE.editing = null;
    renderTemplateView();
    toast("✓ 保存しました");
  };

  // Render canvas + node list
  renderTemplateCanvas();

  // Keyboard shortcuts
  document.onkeydown = function(e){
    if (!TPL_STATE.editing) return;
    if ((e.ctrlKey||e.metaKey) && e.key === "z"){e.preventDefault(); tplUndo()}
    else if ((e.ctrlKey||e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))){e.preventDefault(); tplRedo()}
    else if (e.key === "Delete" && TPL_STATE.selectedNodeId){
      pushTemplateHistory();
      t.nodes = t.nodes.filter(function(n){return n.id !== TPL_STATE.selectedNodeId});
      t.edges = t.edges.filter(function(e){return e.from !== TPL_STATE.selectedNodeId && e.to !== TPL_STATE.selectedNodeId});
      TPL_STATE.selectedNodeId = null;
      renderTemplateCanvas();
    }
  };
}

function renderTemplateCanvas(){
  var t = TPL_STATE.editing;
  var canvas = document.getElementById("tplCanvas");
  var list = document.getElementById("tplNodeList");
  if (!canvas || !t) return;

  // Compute bounding box
  var maxX = 0, maxY = 0;
  (t.nodes||[]).forEach(function(n){
    if (n.x + 200 > maxX) maxX = n.x + 200;
    if (n.y + 100 > maxY) maxY = n.y + 100;
  });
  var W = Math.max(1200, maxX + 100);
  var H = Math.max(600, maxY + 100);

  // Build SVG
  canvas.innerHTML = '';
  var svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.style.cssText = "display:block";
  svg.innerHTML = '<defs><marker id="tplArr" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto"><path d="M0,0 L12,5 L0,10 L3,5 Z" fill="#5e6c84"/></marker><filter id="tplShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/></filter></defs>';

  // Edges
  var edgesG = document.createElementNS("http://www.w3.org/2000/svg","g");
  edgesG.setAttribute("class","tpl-edges");
  (t.edges||[]).forEach(function(e, i){
    var fromN = t.nodes.find(function(n){return n.id===e.from});
    var toN = t.nodes.find(function(n){return n.id===e.to});
    if (!fromN || !toN) return;
    var x1 = fromN.x + 180, y1 = fromN.y + 32;
    var x2 = toN.x, y2 = toN.y + 32;
    var midX = (x1 + x2) / 2;
    var pathD = "M "+x1+","+y1+" C "+midX+","+y1+" "+midX+","+y2+" "+x2+","+y2;
    var hit = document.createElementNS("http://www.w3.org/2000/svg","path");
    hit.setAttribute("d", pathD);
    hit.setAttribute("stroke","transparent");
    hit.setAttribute("stroke-width","18");
    hit.setAttribute("fill","none");
    hit.style.cursor = "pointer";
    hit.dataset.edgeIdx = i;
    edgesG.appendChild(hit);
    var path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", pathD);
    path.setAttribute("stroke","#5e6c84");
    path.setAttribute("stroke-width","2");
    path.setAttribute("fill","none");
    path.setAttribute("marker-end","url(#tplArr)");
    edgesG.appendChild(path);
  });
  svg.appendChild(edgesG);

  // Drawing edge preview
  var drawingG = document.createElementNS("http://www.w3.org/2000/svg","g");
  drawingG.setAttribute("id","tplDrawingEdge");
  svg.appendChild(drawingG);

  // Nodes
  var nodesG = document.createElementNS("http://www.w3.org/2000/svg","g");
  (t.nodes||[]).forEach(function(n){
    var g = document.createElementNS("http://www.w3.org/2000/svg","g");
    g.setAttribute("transform","translate("+n.x+","+n.y+")");
    g.dataset.nodeId = n.id;
    g.style.cursor = "grab";

    var rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
    rect.setAttribute("width", 180);
    rect.setAttribute("height", 64);
    rect.setAttribute("rx", 8);
    rect.setAttribute("fill", "#fff");
    rect.setAttribute("stroke", TPL_STATE.selectedNodeId===n.id ? "#0c66e4" : "#dfe1e6");
    rect.setAttribute("stroke-width", TPL_STATE.selectedNodeId===n.id ? "2" : "1");
    rect.setAttribute("filter", "url(#tplShadow)");
    g.appendChild(rect);

    // Type stripe
    var typeColor = ({task:"#1868db",bug:"#e2483d",story:"#22a06b",epic:"#8270db",incident:"#f5a623"})[n.type||"task"]||"#1868db";
    var stripe = document.createElementNS("http://www.w3.org/2000/svg","rect");
    stripe.setAttribute("x",0); stripe.setAttribute("y",0); stripe.setAttribute("width",4); stripe.setAttribute("height",64); stripe.setAttribute("rx",8);
    stripe.setAttribute("fill", typeColor);
    g.appendChild(stripe);

    // Title
    var title = document.createElementNS("http://www.w3.org/2000/svg","text");
    title.setAttribute("x",14); title.setAttribute("y",24);
    title.setAttribute("fill","#172b4d");
    title.setAttribute("font-size","13");
    title.setAttribute("font-weight","600");
    title.setAttribute("font-family","-apple-system,sans-serif");
    var txt = n.title || "Untitled";
    title.textContent = txt.length > 22 ? txt.substring(0,20)+"…" : txt;
    g.appendChild(title);

    // Meta
    var meta = document.createElementNS("http://www.w3.org/2000/svg","text");
    meta.setAttribute("x",14); meta.setAttribute("y",44);
    meta.setAttribute("fill","#5e6c84");
    meta.setAttribute("font-size","11");
    meta.setAttribute("font-family","-apple-system,sans-serif");
    var metaTxt = (n.role || n.type || "task");
    if (n.durationDays) metaTxt += " · "+n.durationDays+"d";
    meta.textContent = metaTxt;
    g.appendChild(meta);

    // Output port (right circle)
    var port = document.createElementNS("http://www.w3.org/2000/svg","circle");
    port.setAttribute("cx", 180); port.setAttribute("cy", 32); port.setAttribute("r", 7);
    port.setAttribute("fill","#0c66e4");
    port.setAttribute("stroke","#fff");
    port.setAttribute("stroke-width","2");
    port.style.cursor = "crosshair";
    port.classList.add("tpl-port-out");
    port.dataset.nodeId = n.id;
    g.appendChild(port);

    // Delete button (× top-right) shown on hover via CSS
    var del = document.createElementNS("http://www.w3.org/2000/svg","g");
    del.setAttribute("transform","translate(168,-6)");
    del.classList.add("tpl-node-del");
    del.style.cursor = "pointer";
    del.style.opacity = "0";
    var delBg = document.createElementNS("http://www.w3.org/2000/svg","circle");
    delBg.setAttribute("r",10); delBg.setAttribute("fill","#c9372c");
    del.appendChild(delBg);
    var delX = document.createElementNS("http://www.w3.org/2000/svg","text");
    delX.setAttribute("text-anchor","middle"); delX.setAttribute("y",4);
    delX.setAttribute("fill","#fff"); delX.setAttribute("font-size","12"); delX.setAttribute("font-weight","700");
    delX.textContent = "×";
    del.appendChild(delX);
    del.dataset.delNode = n.id;
    g.appendChild(del);

    // Show del on hover
    g.addEventListener("mouseenter",function(){del.style.opacity="1"});
    g.addEventListener("mouseleave",function(){del.style.opacity="0"});

    nodesG.appendChild(g);
  });
  svg.appendChild(nodesG);
  canvas.appendChild(svg);

  // === Drag & Drop & edge-creation handlers ===
  var dragState = null;
  var edgeState = null;

  svg.addEventListener("mousedown", function(e){
    var target = e.target;
    // Edge port click
    if (target.classList && target.classList.contains("tpl-port-out")){
      e.stopPropagation();
      edgeState = {fromId: target.dataset.nodeId, x: e.offsetX, y: e.offsetY};
      return;
    }
    // Delete node
    var delEl = target.closest && target.closest(".tpl-node-del");
    if (delEl){
      pushTemplateHistory();
      var nid = delEl.dataset.delNode;
      t.nodes = t.nodes.filter(function(n){return n.id !== nid});
      t.edges = t.edges.filter(function(ed){return ed.from!==nid && ed.to!==nid});
      renderTemplateCanvas();
      return;
    }
    // Node drag
    var nodeG = target.closest && target.closest("[data-node-id]");
    if (nodeG){
      var nid = nodeG.dataset.nodeId;
      var node = t.nodes.find(function(n){return n.id===nid});
      if (!node) return;
      TPL_STATE.selectedNodeId = nid;
      var rect = svg.getBoundingClientRect();
      dragState = {nid:nid, offX:e.clientX-rect.left-node.x, offY:e.clientY-rect.top-node.y, moved:false};
    }
  });

  // Document-level mousemove for drag (not bound to SVG, so drag continues outside SVG bounds)
  // Remove previous handlers if present (re-renders)
  if (TPL_STATE._docMove) document.removeEventListener("mousemove", TPL_STATE._docMove);
  if (TPL_STATE._docUp) document.removeEventListener("mouseup", TPL_STATE._docUp);

  TPL_STATE._docMove = function(e){
    if (!dragState && !edgeState) return;
    var rect = svg.getBoundingClientRect();
    if (dragState){
      e.preventDefault();
      var node = t.nodes.find(function(n){return n.id===dragState.nid});
      if (!node) return;
      if (!dragState.moved) {pushTemplateHistory(); dragState.moved = true}
      node.x = Math.max(0, Math.round((e.clientX - rect.left - dragState.offX)/10)*10);
      node.y = Math.max(0, Math.round((e.clientY - rect.top - dragState.offY)/10)*10);
      // Update only this node's transform - avoid rebuilding entire SVG which kills drag
      var nodeEl = svg.querySelector('[data-node-id="'+node.id+'"]');
      if (nodeEl) nodeEl.setAttribute("transform","translate("+node.x+","+node.y+")");
      // Grow SVG if dragging near edge
      var curW = parseInt(svg.getAttribute("width"));
      var curH = parseInt(svg.getAttribute("height"));
      if (node.x + 280 > curW) svg.setAttribute("width", node.x + 400);
      if (node.y + 200 > curH) svg.setAttribute("height", node.y + 300);
      // Update edges connected to this node
      tplRedrawEdges(svg, t);
    } else if (edgeState){
      var dgEl = document.getElementById("tplDrawingEdge");
      if (!dgEl) return;
      var fromN = t.nodes.find(function(n){return n.id===edgeState.fromId});
      if (!fromN) return;
      var x1 = fromN.x + 180, y1 = fromN.y + 32;
      var x2 = e.clientX - rect.left, y2 = e.clientY - rect.top;
      var midX = (x1+x2)/2;
      var d = "M "+x1+","+y1+" C "+midX+","+y1+" "+midX+","+y2+" "+x2+","+y2;
      dgEl.innerHTML = '<path d="'+d+'" stroke="#0c66e4" stroke-width="2" fill="none" stroke-dasharray="4,3" marker-end="url(#tplArr)"/>';
    }
  };

  TPL_STATE._docUp = function(e){
    if (edgeState){
      // Find target node under cursor
      var rect = svg.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var targetNode = t.nodes.find(function(n){return mx >= n.x && mx <= n.x+180 && my >= n.y && my <= n.y+64 && n.id !== edgeState.fromId});
      if (targetNode){
        // Avoid duplicate
        var dup = (t.edges||[]).find(function(e){return e.from===edgeState.fromId && e.to===targetNode.id});
        if (!dup){
          pushTemplateHistory();
          t.edges = t.edges || [];
          t.edges.push({from:edgeState.fromId, to:targetNode.id});
        }
      }
      var dgEl = document.getElementById("tplDrawingEdge");
      if (dgEl) dgEl.innerHTML = "";
      edgeState = null;
      renderTemplateCanvas();
    }
    if (dragState && dragState.moved){
      // Full rerender to update sidebar list and ensure consistency
      renderTemplateCanvas();
    }
    dragState = null;
  };

  document.addEventListener("mousemove", TPL_STATE._docMove);
  document.addEventListener("mouseup", TPL_STATE._docUp);

  // Edge click to delete
  svg.addEventListener("click", function(e){
    var hitPath = e.target;
    if (hitPath.dataset && hitPath.dataset.edgeIdx != null){
      if (confirm("この依存関係を削除しますか？")){
        pushTemplateHistory();
        t.edges.splice(parseInt(hitPath.dataset.edgeIdx), 1);
        renderTemplateCanvas();
      }
    }
  });

  // Double-click node = edit
  svg.addEventListener("dblclick", function(e){
    var nodeG = e.target.closest && e.target.closest("[data-node-id]");
    if (nodeG){tplEditNodeDlg(nodeG.dataset.nodeId)}
  });

  // Sidebar list
  list.innerHTML = "";
  (t.nodes||[]).forEach(function(n, i){
    var item = document.createElement("div");
    item.className = "tpl-list-item"+(TPL_STATE.selectedNodeId===n.id?" active":"");
    item.innerHTML = '<span class="ti '+(n.type||"task")+'">'+(n.type||"T")[0].toUpperCase()+'</span><span class="tpl-li-title">'+escHtml(n.title||"Untitled")+'</span><button class="tpl-li-edit">✎</button>';
    item.querySelector(".tpl-li-title").onclick = function(){TPL_STATE.selectedNodeId=n.id; renderTemplateCanvas()};
    item.querySelector(".tpl-li-edit").onclick = function(e){e.stopPropagation(); tplEditNodeDlg(n.id)};
    list.appendChild(item);
  });
}

function tplAddNodeDlg(){
  tplEditNodeDlg(null);
}

/* Redraw edges only (used during drag to avoid full re-render) */
function tplRedrawEdges(svg, t){
  if (!svg || !t) return;
  var oldEdges = svg.querySelector(".tpl-edges");
  if (!oldEdges) return;
  var edgesG = document.createElementNS("http://www.w3.org/2000/svg","g");
  edgesG.setAttribute("class","tpl-edges");
  (t.edges||[]).forEach(function(e, i){
    var fromN = t.nodes.find(function(n){return n.id===e.from});
    var toN = t.nodes.find(function(n){return n.id===e.to});
    if (!fromN || !toN) return;
    var x1 = fromN.x + 180, y1 = fromN.y + 32;
    var x2 = toN.x, y2 = toN.y + 32;
    var midX = (x1 + x2) / 2;
    var pathD = "M "+x1+","+y1+" C "+midX+","+y1+" "+midX+","+y2+" "+x2+","+y2;
    var hit = document.createElementNS("http://www.w3.org/2000/svg","path");
    hit.setAttribute("d", pathD);
    hit.setAttribute("stroke","transparent");
    hit.setAttribute("stroke-width","18");
    hit.setAttribute("fill","none");
    hit.style.cursor = "pointer";
    hit.dataset.edgeIdx = i;
    edgesG.appendChild(hit);
    var path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", pathD);
    path.setAttribute("stroke","#5e6c84");
    path.setAttribute("stroke-width","2");
    path.setAttribute("fill","none");
    path.setAttribute("marker-end","url(#tplArr)");
    edgesG.appendChild(path);
  });
  oldEdges.parentNode.replaceChild(edgesG, oldEdges);
}

function tplEditNodeDlg(nodeId){
  var t = TPL_STATE.editing;
  var n = nodeId ? t.nodes.find(function(x){return x.id===nodeId}) : null;
  var isNew = !n;
  if (isNew){n = {id:"n"+Date.now(), title:"", type:"task", role:"", durationDays:1, x:80, y:80, desc:""}}
  var typeOpts = ["task","bug","story","epic","incident"].map(function(tp){return '<option value="'+tp+'"'+(n.type===tp?" selected":"")+'>'+tp+'</option>'}).join("");
  var prOpts = ["highest","high","medium","low","lowest"].map(function(p){return '<option value="'+p+'"'+(n.priority===p?" selected":"")+'>'+p+'</option>'}).join("");
  var html = '<h3>'+(isNew?"+ タスク追加":"✎ タスク編集")+'</h3>';
  html += '<label>タイトル *</label><input id="nE_t" value="'+escHtml(n.title||"")+'" placeholder="例: OSインストール">';
  html += '<div class="fr"><div><label>種別</label><select id="nE_ty">'+typeOpts+'</select></div><div><label>優先度</label><select id="nE_pr">'+prOpts+'</select></div></div>';
  html += '<div class="fr"><div><label>ロール</label><input id="nE_r" value="'+escHtml(n.role||"")+'" placeholder="infra, dev, qa等"></div><div><label>所要日数</label><input id="nE_d" type="number" value="'+(n.durationDays||1)+'"></div></div>';
  html += '<label>説明</label><textarea id="nE_de" rows="3">'+escHtml(n.desc||"")+'</textarea>';
  html += '<div class="ma">';
  if (!isNew) html += '<button class="btn danger" id="nE_del">削除</button>';
  html += '<div style="flex:1"></div><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="nE_ok">'+(isNew?"追加":"保存")+'</button></div>';
  showModal(html);
  document.getElementById("nE_ok").onclick = function(){
    var newTitle = document.getElementById("nE_t").value.trim();
    if (!newTitle){toast("タイトル必須",1);return}
    pushTemplateHistory();
    n.title = newTitle;
    n.type = document.getElementById("nE_ty").value;
    n.priority = document.getElementById("nE_pr").value;
    n.role = document.getElementById("nE_r").value;
    n.durationDays = parseInt(document.getElementById("nE_d").value)||1;
    n.desc = document.getElementById("nE_de").value;
    if (isNew){
      // Auto-position
      var maxX = (t.nodes||[]).reduce(function(a,nn){return Math.max(a,nn.x)}, 0);
      n.x = maxX + 220;
      n.y = 80;
      t.nodes = t.nodes || [];
      t.nodes.push(n);
    }
    closeModal();
    renderTemplateCanvas();
  };
  if (!isNew){
    document.getElementById("nE_del").onclick = function(){
      if (confirm("削除しますか？")){
        pushTemplateHistory();
        t.nodes = t.nodes.filter(function(x){return x.id !== n.id});
        t.edges = t.edges.filter(function(e){return e.from!==n.id && e.to!==n.id});
        closeModal();
        renderTemplateCanvas();
      }
    };
  }
}

function tplAddFieldDlg(){
  var t = TPL_STATE.editing;
  t.fields = t.fields || [];
  var html = '<h3>📋 カスタムフィールド管理</h3>';
  html += '<div style="font-size:12px;color:var(--t2);background:var(--ac-bg);padding:10px 12px;border-radius:4px;margin-bottom:12px;line-height:1.5">';
  html += '💡 <b>カスタムフィールドの使い方</b><br>';
  html += '・テンプレート適用時のダイアログに入力欄として表示されます<br>';
  html += '・親チケットのタイトル/説明や子タスクのタイトルに <code style="background:var(--b3);padding:1px 4px;border-radius:2px">{{key名}}</code> を埋め込むと、適用時の入力値で置換されます<br>';
  html += '・例: 親タイトル「構築: <code style="background:var(--b3);padding:1px 4px;border-radius:2px">{{server_name}}</code>」 → 適用時「web-01」を入力すれば「構築: web-01」になる';
  html += '</div>';

  // Existing fields
  if (t.fields.length){
    html += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin-bottom:6px;letter-spacing:.5px">既存フィールド ('+t.fields.length+')</div>';
    html += '<div style="margin-bottom:14px">';
    t.fields.forEach(function(f, i){
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--b2);border-radius:3px;margin-bottom:4px">';
      html += '<span style="font-family:monospace;background:var(--b3);padding:2px 6px;border-radius:2px;font-size:11px;color:var(--ac)">{{'+escHtml(f.key)+'}}</span>';
      html += '<span style="flex:1;font-size:13px">'+escHtml(f.label)+'</span>';
      html += '<span style="font-size:11px;color:var(--t3)">'+escHtml(f.type)+(f.required?", 必須":"")+'</span>';
      html += '<button class="btn-icon" data-rmf="'+i+'" style="color:var(--dn)">×</button>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="border-top:1px solid var(--bd);margin:14px 0;padding-top:12px"></div>';
  }

  html += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t2);margin-bottom:6px;letter-spacing:.5px">+ 新規追加</div>';
  html += '<label>キー (英数字)</label><input id="fE_k" placeholder="例: server_name">';
  html += '<label>ラベル (適用ダイアログでの表示名)</label><input id="fE_l" placeholder="例: サーバ名">';
  html += '<div class="fr"><div><label>種別</label><select id="fE_ty"><option value="text">テキスト</option><option value="date">日付</option><option value="number">数値</option></select></div><div><label>必須</label><select id="fE_req"><option value="false">No</option><option value="true">Yes</option></select></div></div>';
  html += '<label>デフォルト値 (任意)</label><input id="fE_d">';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">閉じる</button><button class="btn bp" id="fE_ok">+ 追加</button></div>';
  showModal(html);

  // Delete buttons
  document.querySelectorAll("[data-rmf]").forEach(function(b){
    b.onclick = function(){
      pushTemplateHistory();
      t.fields.splice(parseInt(b.dataset.rmf), 1);
      tplAddFieldDlg(); // re-render
    };
  });

  document.getElementById("fE_ok").onclick = function(){
    var k = document.getElementById("fE_k").value.trim();
    var l = document.getElementById("fE_l").value.trim();
    if (!k || !l){toast("キーとラベル必須",1);return}
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)){toast("キーは英数字で開始、英数字とアンダースコアのみ",1);return}
    if (t.fields.some(function(f){return f.key===k})){toast("そのキーは既に存在します",1);return}
    pushTemplateHistory();
    t.fields.push({key:k, label:l, type:document.getElementById("fE_ty").value, required:document.getElementById("fE_req").value==="true", default:document.getElementById("fE_d").value});
    closeModal();
    toast("✓ フィールド追加: {{"+k+"}}");
    // Re-open dialog to show updated list
    setTimeout(tplAddFieldDlg, 100);
  };
}

function tplPropsDlg(){
  var t = TPL_STATE.editing;
  var prOpts = ["highest","high","medium","low","lowest"].map(function(p){return '<option value="'+p+'"'+(t.parentPriority===p?" selected":"")+'>'+p+'</option>'}).join("");
  var typeOpts = ["task","bug","story","epic","incident"].map(function(tp){return '<option value="'+tp+'"'+(t.parentType===tp?" selected":"")+'>'+tp+'</option>'}).join("");
  var fieldsList = (t.fields||[]).map(function(f,i){return '<div class="adm-item"><span class="ai-name">'+escHtml(f.label)+' ('+f.key+', '+f.type+(f.required?", req":"")+')</span><button class="ai-rm" data-fi="'+i+'">×</button></div>'}).join("");
  var html = '<h3>⚙ テンプレートプロパティ</h3>';
  html += '<label>説明</label><textarea id="pr_de" rows="2">'+escHtml(t.description||"")+'</textarea>';
  html += '<label>アイコン</label><input id="pr_ic" maxlength="2" value="'+escHtml(t.icon||"⚡")+'">';
  html += '<label>カラー</label><input id="pr_co" type="color" value="'+escHtml(t.color||"#0c66e4")+'" style="width:60px;height:34px">';
  html += '<hr style="margin:14px 0;border:none;border-top:1px solid var(--bd)">';
  html += '<label>親チケット タイトルテンプレ</label><input id="pr_pt" value="'+escHtml(t.parentTitle||"")+'" placeholder="例: 構築: {{server_name}}">';
  html += '<div style="font-size:10px;color:var(--t3);margin-top:-6px;margin-bottom:8px">フィールド名を {{key}} で参照可能</div>';
  html += '<div class="fr"><div><label>親 種別</label><select id="pr_pty">'+typeOpts+'</select></div><div><label>親 優先度</label><select id="pr_ppr">'+prOpts+'</select></div></div>';
  html += '<label>親 ラベル (カンマ区切り)</label><input id="pr_pl" value="'+escHtml((t.parentLabels||[]).join(","))+'">';
  html += '<hr style="margin:14px 0;border:none;border-top:1px solid var(--bd)">';
  html += '<label>カスタムフィールド</label><div>'+fieldsList+'</div>';
  html += '<div class="ma"><button class="btn" onclick="closeModal()">キャンセル</button><button class="btn bp" id="pr_ok">保存</button></div>';
  showModal(html);
  document.querySelectorAll("[data-fi]").forEach(function(b){b.onclick=function(){pushTemplateHistory(); t.fields.splice(parseInt(b.dataset.fi),1); tplPropsDlg()}});
  document.getElementById("pr_ok").onclick = function(){
    pushTemplateHistory();
    t.description = document.getElementById("pr_de").value;
    t.icon = document.getElementById("pr_ic").value || "⚡";
    t.color = document.getElementById("pr_co").value;
    t.parentTitle = document.getElementById("pr_pt").value;
    t.parentType = document.getElementById("pr_pty").value;
    t.parentPriority = document.getElementById("pr_ppr").value;
    t.parentLabels = document.getElementById("pr_pl").value.split(",").map(function(x){return x.trim()}).filter(Boolean);
    closeModal();
    renderTemplateView();
  };
}
