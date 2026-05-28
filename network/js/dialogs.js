// NetSim — property panel, dialogs (CLI, pcap, scenarios, MAC audit, comm sim, templates, anim toggle)
/* ====== PROPERTY PANEL ====== */
function openPropertyPanel(){
  const p = $("#prop-panel");
  if(!App.selected){ p.classList.add("hidden"); return; }
  p.classList.remove("hidden");
  const { kind, id } = App.selected;
  // AWS VPC / K8s cluster are not in the standard collections — handle them specially
  if(kind === "aws-vpc"){
    const vpc = (App.config.aws&&App.config.aws.vpcs||[]).find(v=>v.name===id||v.id===id);
    if(!vpc){ p.classList.add("hidden"); return; }
    $("#ph-title").textContent = `AWS VPC: ${vpc.name}`;
    const body = $("#ph-body"); body.innerHTML = "";
    renderVpcInlineProps(body, vpc);
    return;
  }
  if(kind === "k8s-cluster"){
    const cl = (App.config.k8s&&App.config.k8s.clusters||[]).find(c=>c.name===id);
    if(!cl){ p.classList.add("hidden"); return; }
    $("#ph-title").textContent = `K8s クラスタ: ${cl.name}`;
    const body = $("#ph-body"); body.innerHTML = "";
    renderClusterInlineProps(body, cl);
    return;
  }
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj){ p.classList.add("hidden"); return; }
  $("#ph-title").textContent = `${kindLabel(kind)}: ${obj.label||id}`;
  renderPropertyForm(kind, obj);
}
function closePropertyPanel(){ $("#prop-panel").classList.add("hidden"); }

// Inline property panel for an AWS VPC (right-side panel, like a server/device)
function renderVpcInlineProps(body, vpc){
  helpBox(body, "VPCの設定", [
    "VPCの基本設定、サブネット、セキュリティグループを編集できます。",
    "詳細な追加(EC2配置など)は『詳細管理を開く』から。"
  ], false);
  addField(body, "VPC名", "text", vpc.name||"", v=>{ const old=vpc.name; vpc.name=v;
    // keep EC2 placements in sync
    for(const s of (App.config.servers||[])){ if(s.aws&&s.aws.vpc===old) s.aws.vpc=v; }
    App.selected={kind:"aws-vpc",id:v}; renderAndSync(); openPropertyPanel(); });
  addField(body, "CIDR", "text", vpc.cidr||"", v=>{ vpc.cidr=v; renderAndSync(); });
  addField(body, "リージョン", "text", vpc.region||"", v=>{ vpc.region=v; renderAndSync(); });
  addSelectField(body, "Internet Gateway", ["true","false"], String(!!vpc.igw), v=>{ vpc.igw=(v==="true"); renderAndSync(); });
  // subnets
  const ss=ch("div",{class:"sub-section"},body);
  ch("h4",{text:"サブネット",style:{margin:0,fontSize:"12px"}},ss);
  (vpc.subnets||[]).forEach((sn,i)=>{
    const r=ch("div",{style:{display:"flex",gap:"4px",alignItems:"center",marginBottom:"3px",flexWrap:"wrap"}},ss);
    const nmI=ch("input",{type:"text",value:sn.name||"",placeholder:"name",style:{width:"70px",padding:"3px",fontSize:"10px"}},r);
    nmI.addEventListener("change",()=>{sn.name=nmI.value;renderAndSync();});
    const cI=ch("input",{type:"text",value:sn.cidr||"",placeholder:"10.0.1.0/24",style:{flex:"1",padding:"3px",fontSize:"10px"}},r);
    cI.addEventListener("change",()=>{sn.cidr=cI.value;renderAndSync();});
    const pubS=ch("select",{style:{padding:"3px",fontSize:"10px"}},r);
    ch("option",{value:"public",text:"public"},pubS); ch("option",{value:"private",text:"private"},pubS); pubS.value=sn.public?"public":"private";
    pubS.addEventListener("change",()=>{sn.public=(pubS.value==="public");renderAndSync();});
    ch("button",{text:"✕",style:{padding:"1px 5px",fontSize:"9px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)"},
      on:{click:()=>{vpc.subnets.splice(i,1);renderAndSync();openPropertyPanel();}}},r);
  });
  ch("button",{text:"+ サブネット",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",marginTop:"3px"},
    on:{click:()=>{(vpc.subnets=vpc.subnets||[]).push({name:"subnet"+((vpc.subnets||[]).length+1),cidr:"10.0."+((vpc.subnets||[]).length+1)+".0/24",public:false});renderAndSync();openPropertyPanel();}}},ss);
  // security groups
  const sg=ch("div",{class:"sub-section"},body);
  ch("h4",{text:"セキュリティグループ",style:{margin:0,fontSize:"12px"}},sg);
  (vpc.security_groups||[]).forEach((g,i)=>{
    const r=ch("div",{style:{display:"flex",gap:"4px",alignItems:"center",marginBottom:"3px"}},sg);
    const nmI=ch("input",{type:"text",value:g.name||"",placeholder:"sg名",style:{width:"80px",padding:"3px",fontSize:"10px"}},r);
    nmI.addEventListener("change",()=>{g.name=nmI.value;renderAndSync();});
    const ibI=ch("input",{type:"text",value:(g.inbound||[]).map(x=>typeof x==="string"?x:(x.proto+"/"+x.port+(x.source?(" "+x.source):""))).join(", "),placeholder:"tcp/443 0.0.0.0/0, ...",style:{flex:"1",padding:"3px",fontSize:"10px"}},r);
    ibI.addEventListener("change",()=>{ g.inbound = ibI.value.split(",").map(s=>s.trim()).filter(Boolean).map(s=>{ const m=s.match(/^(\w+)\/(\d+)\s*(.*)$/); return m?{proto:m[1],port:+m[2],source:m[3]||"0.0.0.0/0"}:{raw:s}; }); renderAndSync(); });
    ch("button",{text:"✕",style:{padding:"1px 5px",fontSize:"9px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)"},
      on:{click:()=>{vpc.security_groups.splice(i,1);renderAndSync();openPropertyPanel();}}},r);
  });
  ch("button",{text:"+ セキュリティグループ",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",marginTop:"3px"},
    on:{click:()=>{(vpc.security_groups=vpc.security_groups||[]).push({name:"sg-"+((vpc.security_groups||[]).length+1),inbound:[{proto:"tcp",port:443,source:"0.0.0.0/0"}],outbound:[]});renderAndSync();openPropertyPanel();}}},sg);
  // EC2 list
  const ec2s=(App.config.servers||[]).filter(s=>s.aws&&s.aws.vpc===vpc.name);
  ch("div",{text:`配置EC2: ${ec2s.length}台 — ${ec2s.map(s=>s.label||s.id).join(", ")||"(なし)"}`,style:{fontSize:"10px",color:"var(--text-dim)",margin:"8px 0"}},body);
  const btns=ch("div",{style:{display:"flex",gap:"6px",marginTop:"8px",flexWrap:"wrap"}},body);
  ch("button",{text:"⚙ 詳細管理を開く",style:{flex:"1",padding:"7px",fontSize:"11px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"5px",fontWeight:"700"},
    on:{click:()=>showAwsManager(vpc.name)}},btns);
  ch("button",{text:"🗑 VPC削除",style:{flex:"1",padding:"7px",fontSize:"11px",cursor:"pointer",background:"var(--red)",border:"none",color:"#fff",borderRadius:"5px",fontWeight:"700"},
    on:{click:()=>{ deleteAwsVpc(vpc.name); closePropertyPanel(); }}},btns);
}

// Inline property panel for a K8s cluster
function renderClusterInlineProps(body, cl){
  helpBox(body, "Kubernetesクラスタの設定", [
    "クラスタの基本設定・ノード・Pod・Serviceを編集できます。",
    "ノードを追加するとPodを配置できます。詳細は『詳細管理を開く』から。"
  ], false);
  addField(body, "クラスタ名", "text", cl.name||"", v=>{ cl.name=v; App.selected={kind:"k8s-cluster",id:v}; renderAndSync(); openPropertyPanel(); });
  addField(body, "Pod CIDR", "text", cl.pod_cidr||"", v=>{ cl.pod_cidr=v; renderAndSync(); });
  addField(body, "Service CIDR", "text", cl.service_cidr||"", v=>{ cl.service_cidr=v; renderAndSync(); });
  // nodes with roles
  const cp = new Set(cl.control_plane && cl.control_plane.masters || []);
  const ns=ch("div",{class:"sub-section"},body);
  ch("h4",{text:`ノード (${(cl.nodes||[]).length})`,style:{margin:0,fontSize:"12px"}},ns);
  (cl.nodes||[]).forEach(nid=>{
    const r=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"3px",fontSize:"10.5px"}},ns);
    const isMaster = cp.has(nid);
    ch("span",{text:isMaster?"👑":"⚙",title:isMaster?"control-plane":"worker"},r);
    ch("span",{text:nid,style:{flex:"1",fontFamily:"var(--mono)"}},r);
    const s=Cfg.byId("servers",nid);
    ch("span",{text:isMaster?"master":"worker",style:{fontSize:"9px",color:isMaster?"var(--orange)":"var(--cyan)"}},r);
    ch("span",{text:s?(s.status||"?"):"未存在",style:{fontSize:"9px",color:s&&s.status==="running"?"var(--green)":"var(--red)"}},r);
  });
  const podsByNode={};
  for(const pod of (cl.pods||[])){ (podsByNode[pod.node||"(未割当)"]=podsByNode[pod.node||"(未割当)"]||[]).push(pod.name); }
  ch("div",{text:`Pod配置: ${Object.entries(podsByNode).map(([n,ps])=>n+"→["+ps.join(",")+"]").join(" / ")||"(なし)"}`,style:{fontSize:"10px",color:"var(--text-dim)",margin:"6px 0",lineHeight:"1.4"}},body);
  const btns=ch("div",{style:{display:"flex",gap:"6px",marginTop:"8px",flexWrap:"wrap"}},body);
  ch("button",{text:"⚙ 詳細管理を開く",style:{flex:"1",padding:"7px",fontSize:"11px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"5px",fontWeight:"700"},
    on:{click:()=>showK8sManager(cl.name)}},btns);
  ch("button",{text:"🗑 クラスタ削除",style:{flex:"1",padding:"7px",fontSize:"11px",cursor:"pointer",background:"var(--red)",border:"none",color:"#fff",borderRadius:"5px",fontWeight:"700"},
    on:{click:()=>{ deleteK8sCluster(cl.name); closePropertyPanel(); }}},btns);
}

function renderPropertyForm(kind, obj){
  const body = $("#ph-body"); body.innerHTML = "";
  // ID closure
  let cid = obj.id;
  addField(body, "ID", "text", cid, (v)=>{
    if(!v || v===cid) return;
    renameId(kind, cid, v);
    cid = v;
  });
  addField(body, "ラベル", "text", obj.label||"", (v)=>{ obj.label = v; renderAndSync(); });
  if(kind !== "connection"){
    addSelectField(body, "ステータス", ["running","stopped","error","maintenance"], obj.status||"running",
      (v)=>{ setStatus(kind, cid, v); });
  }
  if(kind === "network" || kind === "device" || kind === "server" || kind === "annotation"){
    const row = ch("div", { class:"field-grid" }, body);
    addField(row, "X", "number", obj.x||0, v=>{ obj.x = +v; renderAndSync(); });
    addField(row, "Y", "number", obj.y||0, v=>{ obj.y = +v; renderAndSync(); });
    addField(row, "W", "number", obj.width||120, v=>{ obj.width = +v; renderAndSync(); });
    addField(row, "H", "number", obj.height||70, v=>{ obj.height = +v; renderAndSync(); });
  }
  if(kind === "network") renderNetworkProps(body, obj);
  if(kind === "device") renderDeviceProps(body, obj);
  if(kind === "server") renderServerProps(body, obj);
  if(kind === "service") renderServiceProps(body, obj);
  if(kind === "connection") renderConnectionProps(body, obj);
  if(kind === "annotation") renderAnnotationProps(body, obj);

  const row = ch("div", { class:"btn-row" }, body);
  ch("button", { text:"削除", class:"del", on:{ click:()=>deleteElement(kind, cid) } }, row);
}

function renderAndSync(){ syncYamlFromConfig(); render(); updateStatusBar(); }

function addField(parent, label, type, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const inp = ch("input", { type, value: value==null ? "" : String(value) }, f);
  // Auto-suggest existing IPs/CIDRs for address-like fields (gateway, IP, CIDR, next-hop, 宛先)
  if(type==="text" && /IP|CIDR|Gateway|ゲートウェイ|next.?hop|ネクストホップ|宛先|ネットワーク|アドレス|address|route|ルート/i.test(label)){
    try{
      const sug = ipSuggestions();
      const isV6 = /v6|IPv6/i.test(label);
      const vals = isV6 ? sug.v6 : sug.v4.concat(sug.cidr.filter(c=>!sug.v4.includes(c)));
      const id = makeSuggestDatalist(f, vals);
      inp.setAttribute("list", id);
    }catch(e){}
  }
  inp.addEventListener("change", ()=>onChange(inp.value));
  return inp;
}
function addTextareaField(parent, label, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const ta = ch("textarea", { rows:4 }, f);
  ta.value = value || "";
  ta.addEventListener("change", ()=>onChange(ta.value));
  return ta;
}
function addSelectField(parent, label, options, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const sel = ch("select", {}, f);
  for(const o of options){
    const opt = ch("option", { value:o, text:o }, sel);
    if(o === value) opt.selected = true;
  }
  sel.addEventListener("change", ()=>onChange(sel.value));
  return sel;
}
function addCheckbox(parent, label, checked, onChange){
  const f = ch("div", { class:"field" }, parent);
  const lab = ch("label", { style:{display:"flex",gap:"6px",alignItems:"center",cursor:"pointer"} }, f);
  const cb = ch("input", { type:"checkbox" }, lab);
  if(checked) cb.checked = true;
  ch("span", { text:label }, lab);
  cb.addEventListener("change", ()=>onChange(cb.checked));
  return cb;
}
function addColorField(parent, label, value, onChange){
  const f = ch("div", { class:"field" }, parent);
  ch("label", { text:label }, f);
  const wrap = ch("div", { class:"color-field" }, f);
  let r=100, g=150, b=250, a=0.15;
  if(value){
    const m = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
    if(m){ r=+m[1]; g=+m[2]; b=+m[3]; a = m[4]!==undefined ? +m[4] : 1; }
  }
  const toHex = n => n.toString(16).padStart(2,"0");
  const color = ch("input", { type:"color", value:"#"+toHex(r)+toHex(g)+toHex(b) }, wrap);
  const alpha = ch("input", { type:"range", min:"0", max:"1", step:"0.05" }, wrap);
  alpha.value = a;
  const text = ch("input", { type:"text", value: value || `rgba(${r},${g},${b},${a})` }, wrap);
  function update(){
    const h = color.value;
    const rr=parseInt(h.slice(1,3),16), gg=parseInt(h.slice(3,5),16), bb=parseInt(h.slice(5,7),16);
    const aa = parseFloat(alpha.value);
    const v = `rgba(${rr},${gg},${bb},${aa})`;
    text.value = v;
    onChange(v);
  }
  color.addEventListener("input", update);
  alpha.addEventListener("input", update);
  text.addEventListener("change", ()=>onChange(text.value));
}

function renderAnnotationProps(body, obj){
  const f = ch("div", { class:"field" }, body);
  ch("label", { text:"テキスト (改行可)" }, f);
  const ta = ch("textarea", { rows:"4" }, f);
  ta.value = obj.text || "";
  ta.style.width = "100%";
  ta.style.minHeight = "60px";
  ta.style.background = "var(--bg)";
  ta.style.color = "var(--text)";
  ta.style.border = "1px solid var(--border)";
  ta.style.borderRadius = "3px";
  ta.style.padding = "4px";
  ta.style.fontFamily = "var(--mono)";
  ta.addEventListener("input", ()=>{ obj.text = ta.value; renderAndSync(); });
  addField(body, "フォントサイズ", "number", obj.fontSize||12, v=>{ obj.fontSize = Math.max(8,+v||12); renderAndSync(); });
  addColorField(body, "背景色", obj.color||"rgba(255,235,100,0.85)", v=>{ obj.color=v; renderAndSync(); });
}

function renderNetworkProps(body, obj){
  addSelectField(body, "種別 (Type)", ["vlan","vpc","subnet","vpn-overlay"], obj.type||"subnet",
    v=>{
      obj.type=v;
      if(!obj._kindManual){
        obj.kind = (v === "vxlan" || v === "vpn-overlay") ? "virtual" : "physical";
      }
      renderAndSync();
    });
  addSelectField(body, "ネットワーク種別 (Physical/Virtual)",
    ["physical","virtual"],
    obj.kind || (obj.type==="vxlan"||obj.type==="vpn-overlay"?"virtual":"physical"),
    v=>{ obj.kind = v; obj._kindManual = true; renderAndSync(); toast(`Network kind: ${v}`, "ok"); });

  // ---- IPv4 CIDR with suggestions (existing networks + common ranges) + free-CIDR proposal ----
  const cidrField = ch("div",{class:"field"},body);
  ch("label",{text:"IPv4 CIDR"},cidrField);
  const cidrWrap = ch("div",{style:{display:"flex",gap:"6px"}},cidrField);
  const cidrIn = ch("input",{type:"text",value:obj.cidr||"",list:"net-cidr-suggest",placeholder:"例: 10.0.1.0/24",style:{flex:"1"}},cidrWrap);
  cidrIn.addEventListener("change",()=>{ obj.cidr=cidrIn.value; renderAndSync(); });
  ch("button",{text:"空き提案",title:"既存と重複しない次の/24を提案",
    style:{padding:"4px 8px",fontSize:"10px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"4px",whiteSpace:"nowrap"},
    on:{click:()=>{ const c=suggestFreeCidr(); cidrIn.value=c; obj.cidr=c; renderAndSync(); toast("空きCIDRを提案: "+c,"ok"); }}},cidrWrap);
  // datalist: existing network CIDRs + common private ranges
  const dl = ch("datalist",{id:"net-cidr-suggest"},cidrField);
  const seen=new Set();
  for(const n of (App.config.networks||[])){
    if(n.id!==obj.id && n.cidr && !seen.has(n.cidr)){ seen.add(n.cidr); ch("option",{value:n.cidr,text:(n.label||n.id)},dl); }
  }
  ["10.0.0.0/24","10.0.1.0/24","10.1.0.0/24","172.16.0.0/24","192.168.0.0/24","192.168.1.0/24","192.168.10.0/24"].forEach(c=>{ if(!seen.has(c)){ seen.add(c); ch("option",{value:c},dl); } });

  addField(body, "IPv4 Gateway", "text", obj.gateway||"", v=>{ obj.gateway=v; renderAndSync(); });

  // ---- IPv6 CIDR with suggestions ----
  const v6Field = ch("div",{class:"field"},body);
  ch("label",{text:"IPv6 CIDR"},v6Field);
  const v6In = ch("input",{type:"text",value:obj.cidr_v6||"",list:"net-cidr6-suggest",placeholder:"例: 2001:db8:1::/64",style:{width:"100%",boxSizing:"border-box"}},v6Field);
  v6In.addEventListener("change",()=>{ obj.cidr_v6=v6In.value; renderAndSync(); });
  const dl6 = ch("datalist",{id:"net-cidr6-suggest"},v6Field);
  const seen6=new Set();
  for(const n of (App.config.networks||[])){
    if(n.id!==obj.id && n.cidr_v6 && !seen6.has(n.cidr_v6)){ seen6.add(n.cidr_v6); ch("option",{value:n.cidr_v6,text:(n.label||n.id)},dl6); }
  }
  ["2001:db8:1::/64","2001:db8:2::/64","fd00::/64"].forEach(c=>{ if(!seen6.has(c)){ seen6.add(c); ch("option",{value:c},dl6); } });

  addField(body, "IPv6 Gateway", "text", obj.gateway_v6||"", v=>{ obj.gateway_v6=v; renderAndSync(); });
  addField(body, "VLAN ID", "number", obj.vlan_id==null?"":obj.vlan_id, v=>{ obj.vlan_id = v?+v:null; renderAndSync(); });
  addColorField(body, "色", obj.color||"rgba(100,150,250,0.15)", v=>{ obj.color=v; renderAndSync(); });

  // ---- Existing networks list (for reference) ----
  const others = (App.config.networks||[]).filter(n=>n.id!==obj.id);
  if(others.length){
    const sec = ch("div",{class:"sub-section"},body);
    ch("h4",{text:"既存ネットワーク一覧",style:{margin:"0 0 4px"}},sec);
    for(const n of others){
      const row=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",padding:"3px 4px",fontSize:"10.5px",borderBottom:"1px solid var(--border)",fontFamily:"var(--mono)"}},sec);
      ch("span",{text:(n.label||n.id),style:{flex:"1",fontWeight:"600",fontFamily:"var(--font)"}},row);
      ch("span",{text:n.cidr||n.cidr_v6||"-",style:{color:"var(--text-dim)"}},row);
      if(n.vlan_id) ch("span",{text:"VLAN"+n.vlan_id,style:{color:"var(--accent2)",fontSize:"9px"}},row);
    }
  }
}

// Suggest the next free 10.0.x.0/24 (or 172.16.x / 192.168.x) not overlapping existing networks
function suggestFreeCidr(){
  const used = new Set((App.config.networks||[]).map(n=>n.cidr).filter(Boolean));
  for(const base of ["10.0.","10.1.","172.16.","192.168."]){
    for(let i=0;i<256;i++){
      const c = `${base}${i}.0/24`;
      if(!used.has(c)) return c;
    }
  }
  return "10.0.0.0/24";
}

// AWS-specific property panel — switches on aws_kind and shows service-specific fields.
function renderAwsKindProps(body, obj){
  obj.aws_config = obj.aws_config || {};
  const cfg = obj.aws_config;
  ch("div",{text:`☁ AWS — ${obj.label||obj.id}`,style:{fontSize:"12px",fontWeight:"700",color:"#ff9900",marginBottom:"6px"}},body);
  ch("div",{text:`種別: ${obj.aws_kind} / FQDN: ${obj.fqdn||"-"}`,style:{fontSize:"10px",color:"var(--text-dim)",fontFamily:"var(--mono)",marginBottom:"8px"}},body);
  addField(body,"ラベル","text",obj.label||"",v=>{obj.label=v;renderAndSync();});
  // Region + VPC association (so the service belongs somewhere, not isolated)
  const reg = ["ap-northeast-1","ap-northeast-3","us-east-1","us-west-2","eu-west-1","eu-central-1","ap-southeast-1","global"];
  addSelectField(body,"リージョン", reg, obj.aws_region||"ap-northeast-1", v=>{ obj.aws_region=v; renderAndSync(); });
  const vpcNames = ["(なし / グローバル)"].concat(((App.config.aws&&App.config.aws.vpcs)||[]).map(v=>v.name));
  const curVpc = obj.aws_vpc || "(なし / グローバル)";
  addSelectField(body,"所属VPC", vpcNames, curVpc, v=>{
    obj.aws_vpc = (v==="(なし / グローバル)") ? "" : v;
    // when attaching to a VPC, also adopt its region and move inside its area
    if(obj.aws_vpc){
      const vpc=(App.config.aws.vpcs||[]).find(x=>x.name===obj.aws_vpc);
      if(vpc&&vpc.region) obj.aws_region=vpc.region;
      const members=(App.config.servers||[]).filter(s=>s.aws&&s.aws.vpc===obj.aws_vpc);
      if(members.length){ obj.x=(members[0].x||100)+180; obj.y=(members[0].y||100); }
    }
    renderAndSync(); openPropertyPanel();
  });
  // Public IP (single interface)
  const pubIf=(obj.interfaces||[])[0];
  if(pubIf) addField(body,"パブリックIP","text",pubIf.ip||"",v=>{pubIf.ip=v;renderAndSync();});

  const sec=ch("div",{class:"sub-section",style:{marginTop:"8px"}},body);
  ch("h4",{text:"AWSサービス固有設定",style:{margin:0,fontSize:"12px",color:"#ff9900"}},sec);
  const helpLines = {
    "aws-s3":["S3バケットの設定。bucket policyで送信元CIDRを絞れます。"," allowed_cidrsに無いアドレスからの通信はエンジンが拒否します。"],
    "aws-igw":["VPCをアタッチし、VPC内からインターネットへの出口とします。"],
    "aws-natgw":["プライベートサブネットからインターネットへNAT。Elastic IPでアウトバウンド。"],
    "aws-vpce":["VPC内からマネージドサービスへの私設経路。Gateway型(S3/DynamoDB)とInterface型。"],
    "aws-dx":["オンプレ↔AWSの専用線。statusをdownにすると到達不可。"],
    "aws-alb":["L7ロードバランサ。リスナとターゲットグループでトラフィックを振分け。"],
    "aws-nlb":["L4ロードバランサ。低遅延。リスナ+ターゲットグループ。"],
    "aws-ecs":["タスク定義(コンテナ仕様)とdesired_countで運用。"],
    "aws-eks":["マネージドK8sコントロールプレーン。ノードグループでWorker提供。"],
    "aws-route53":["DNSホストゾーン+レコード。"],
    "aws-tgw":["複数VPC/オンプレを相互接続するTransit Gateway。"],
    "aws-apigw":["REST/HTTP APIゲートウェイ。エンドポイントとIntegration。"],
    "aws-lambda":["FaaS。トリガと関数定義。"],
    "aws-cloudfront":["CDN。Originと配信設定。"],
    "aws-rds":["マネージドRDB。エンジンとマルチAZで冗長化。"],
    "aws-dynamodb":["フルマネージドNoSQL。"],
    "aws-sqs":["キューサービス。"]
  };
  for(const ln of (helpLines[obj.aws_kind]||[])) ch("div",{text:"💡 "+ln,style:{fontSize:"10px",color:"var(--text-mute)",lineHeight:"1.4",margin:"2px 0"}},sec);

  const k = obj.aws_kind;
  if(k==="aws-s3"){
    addField(sec,"バケット名","text",cfg.bucket_name||"",v=>{cfg.bucket_name=v;renderAndSync();});
    addField(sec,"リージョン","text",cfg.region||"ap-northeast-1",v=>{cfg.region=v;renderAndSync();});
    addSelectField(sec,"公開","yes,no".split(",").map(x=>x==="yes"?"public":"private"),(cfg.public?"public":"private"),v=>{cfg.public=(v==="public");renderAndSync();});
    addField(sec,"許可CIDR (カンマ区切り)","text",(cfg.allowed_cidrs||[]).join(","),v=>{cfg.allowed_cidrs=v.split(",").map(x=>x.trim()).filter(Boolean);renderAndSync();});
    addSelectField(sec,"暗号化",["none","SSE-S3","SSE-KMS"],cfg.encryption||"SSE-S3",v=>{cfg.encryption=v;renderAndSync();});
    addSelectField(sec,"バージョニング",["true","false"],String(!!cfg.versioning),v=>{cfg.versioning=(v==="true");renderAndSync();});
    ch("div",{text:"※エンジン効果: allowed_cidrs外からの通信は拒否されます",style:{fontSize:"9px",color:"var(--text-mute)",marginTop:"4px"}},sec);
  }
  else if(k==="aws-igw"){
    addField(sec,"アタッチVPC名","text",cfg.attached_vpc||"",v=>{cfg.attached_vpc=v;renderAndSync();});
    ch("div",{text:"※IGWアタッチが無いVPCからインターネットへ通信不可(エンジン効果)",style:{fontSize:"9px",color:"var(--text-mute)",marginTop:"4px"}},sec);
  }
  else if(k==="aws-natgw"){
    addField(sec,"配置サブネット","text",cfg.subnet||"",v=>{cfg.subnet=v;renderAndSync();});
    addField(sec,"Elastic IP","text",cfg.elastic_ip||"",v=>{cfg.elastic_ip=v;renderAndSync();});
    addSelectField(sec,"接続性",["public","private"],cfg.connectivity||"public",v=>{cfg.connectivity=v;renderAndSync();});
  }
  else if(k==="aws-vpce"){
    addSelectField(sec,"タイプ",["interface","gateway"],cfg.endpoint_type||"interface",v=>{cfg.endpoint_type=v;renderAndSync();});
    addField(sec,"対象サービス","text",cfg.service||"",v=>{cfg.service=v;renderAndSync();});
    addField(sec,"許可サブネット (カンマ区切り)","text",(cfg.allowed_subnets||[]).join(","),v=>{cfg.allowed_subnets=v.split(",").map(x=>x.trim()).filter(Boolean);renderAndSync();});
  }
  else if(k==="aws-dx"){
    addField(sec,"帯域 (Gbps)","number",cfg.bandwidth_gbps||1,v=>{cfg.bandwidth_gbps=+v||1;renderAndSync();});
    addField(sec,"BGP ASN","number",cfg.bgp_asn||65000,v=>{cfg.bgp_asn=+v||65000;renderAndSync();});
    addField(sec,"VLAN ID","number",cfg.vlan||100,v=>{cfg.vlan=+v||100;renderAndSync();});
    addSelectField(sec,"ステータス",["up","down"],cfg.status||"up",v=>{cfg.status=v;renderAndSync();});
    ch("div",{text:"※statusをdownにするとオンプレ↔AWSが切断されます",style:{fontSize:"9px",color:"var(--text-mute)",marginTop:"4px"}},sec);
  }
  else if(k==="aws-alb"||k==="aws-nlb"){
    addSelectField(sec,"スキーム",["internet-facing","internal"],cfg.scheme||"internet-facing",v=>{cfg.scheme=v;renderAndSync();});
    ch("h5",{text:"リスナ",style:{margin:"6px 0 2px",fontSize:"11px"}},sec);
    (cfg.listeners||[]).forEach((l,i)=>{
      const r=ch("div",{style:{display:"flex",gap:"4px",alignItems:"center",marginBottom:"3px"}},sec);
      const pi=ch("input",{type:"number",value:l.port||443,style:{width:"60px",padding:"3px",fontSize:"11px"}},r);
      pi.addEventListener("change",()=>{l.port=+pi.value;renderAndSync();});
      const ps=ch("select",{style:{padding:"3px",fontSize:"11px"}},r);
      ["HTTP","HTTPS","TCP","TLS","UDP"].forEach(p=>ch("option",{value:p,text:p},ps)); ps.value=l.proto||"HTTPS";
      ps.addEventListener("change",()=>{l.proto=ps.value;renderAndSync();});
      ch("span",{text:"→",style:{fontSize:"10px"}},r);
      const ti=ch("input",{type:"text",value:l.target_group||"tg-web",placeholder:"target group",style:{flex:"1",padding:"3px",fontSize:"11px"}},r);
      ti.addEventListener("change",()=>{l.target_group=ti.value;renderAndSync();});
      ch("button",{text:"✕",style:{padding:"2px 6px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)"},
        on:{click:()=>{cfg.listeners.splice(i,1);renderAndSync();openPropertyPanel();}}},r);
    });
    ch("button",{text:"+ リスナ追加",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",marginTop:"3px"},
      on:{click:()=>{(cfg.listeners=cfg.listeners||[]).push({port:80,proto:"HTTP",target_group:"tg-web"});renderAndSync();openPropertyPanel();}}},sec);
    ch("h5",{text:"ターゲットグループ",style:{margin:"6px 0 2px",fontSize:"11px"}},sec);
    cfg.target_group = cfg.target_group||{name:"tg-web",port:8080,health_check:"/health",targets:[]};
    const tg=cfg.target_group;
    addField(sec,"TG名","text",tg.name||"",v=>{tg.name=v;renderAndSync();});
    addField(sec,"ターゲットポート","number",tg.port||8080,v=>{tg.port=+v;renderAndSync();});
    addField(sec,"ヘルスチェックパス","text",tg.health_check||"/",v=>{tg.health_check=v;renderAndSync();});
    addField(sec,"ターゲット (サーバID, カンマ区切り)","text",(tg.targets||[]).join(","),v=>{tg.targets=v.split(",").map(x=>x.trim()).filter(Boolean);renderAndSync();});
  }
  else if(k==="aws-ecs"){
    addField(sec,"クラスタ名","text",cfg.cluster_name||"",v=>{cfg.cluster_name=v;renderAndSync();});
    addSelectField(sec,"起動タイプ",["FARGATE","EC2"],cfg.launch_type||"FARGATE",v=>{cfg.launch_type=v;renderAndSync();});
    addField(sec,"desired_count","number",cfg.desired_count||1,v=>{cfg.desired_count=+v||1;renderAndSync();});
    const td = cfg.task_definition = cfg.task_definition||{family:"web",containers:[]};
    ch("h5",{text:"タスク定義",style:{margin:"6px 0 2px",fontSize:"11px"}},sec);
    addField(sec,"family","text",td.family||"",v=>{td.family=v;renderAndSync();});
    (td.containers||[]).forEach((c,i)=>{
      const box=ch("div",{style:{border:"1px solid var(--border)",padding:"4px",borderRadius:"4px",marginBottom:"3px"}},sec);
      addField(box,"コンテナ名","text",c.name||"",v=>{c.name=v;renderAndSync();});
      addField(box,"イメージ","text",c.image||"",v=>{c.image=v;renderAndSync();});
      addField(box,"ポート (container:host, カンマ区切り)","text",(c.ports||[]).map(p=>p.container+":"+p.host).join(","),
        v=>{c.ports=v.split(",").map(s=>{const[a,b]=s.split(":");return{container:+a,host:+b};}).filter(p=>p.container);renderAndSync();});
      ch("button",{text:"このコンテナを削除",style:{padding:"2px 6px",fontSize:"9px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)"},
        on:{click:()=>{td.containers.splice(i,1);renderAndSync();openPropertyPanel();}}},box);
    });
    ch("button",{text:"+ コンテナ追加",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer"},
      on:{click:()=>{(td.containers=td.containers||[]).push({name:"app",image:"nginx:latest",ports:[{container:80,host:8080}]});renderAndSync();openPropertyPanel();}}},sec);
  }
  else if(k==="aws-eks"){
    addField(sec,"クラスタ名","text",cfg.cluster_name||"",v=>{cfg.cluster_name=v;renderAndSync();});
    addField(sec,"K8sバージョン","text",cfg.k8s_version||"1.29",v=>{cfg.k8s_version=v;renderAndSync();});
    const ng=cfg.node_group=cfg.node_group||{name:"ng1",instance_type:"t3.medium",desired:3};
    ch("h5",{text:"ノードグループ",style:{margin:"6px 0 2px",fontSize:"11px"}},sec);
    addField(sec,"ノードグループ名","text",ng.name||"",v=>{ng.name=v;renderAndSync();});
    addField(sec,"インスタンスタイプ","text",ng.instance_type||"",v=>{ng.instance_type=v;renderAndSync();});
    addField(sec,"desired数","number",ng.desired||1,v=>{ng.desired=+v||1;renderAndSync();});
    addSelectField(sec,"Fargate併用",["true","false"],String(!!cfg.fargate),v=>{cfg.fargate=(v==="true");renderAndSync();});
  }
  else if(k==="aws-route53"){
    ch("h5",{text:"ホストゾーン",style:{margin:"6px 0 2px",fontSize:"11px"}},sec);
    cfg.hosted_zones=cfg.hosted_zones||[];
    cfg.hosted_zones.forEach((z,zi)=>{
      const box=ch("div",{style:{border:"1px solid var(--border)",padding:"4px",borderRadius:"4px",marginBottom:"4px"}},sec);
      addField(box,"ゾーン名","text",z.name||"",v=>{z.name=v;renderAndSync();});
      (z.records||[]).forEach((r,ri)=>{
        const rr=ch("div",{style:{display:"flex",gap:"3px",alignItems:"center",marginBottom:"2px"}},box);
        const ni=ch("input",{type:"text",value:r.name||"",placeholder:"name",style:{width:"60px",padding:"2px",fontSize:"10px"}},rr);
        ni.addEventListener("change",()=>{r.name=ni.value;renderAndSync();});
        const ts=ch("select",{style:{padding:"2px",fontSize:"10px"}},rr); ["A","AAAA","CNAME","MX","TXT","NS"].forEach(t=>ch("option",{value:t,text:t},ts)); ts.value=r.type||"A";
        ts.addEventListener("change",()=>{r.type=ts.value;renderAndSync();});
        const vi=ch("input",{type:"text",value:r.value||"",placeholder:"value",style:{flex:"1",padding:"2px",fontSize:"10px"}},rr);
        vi.addEventListener("change",()=>{r.value=vi.value;renderAndSync();});
        const ti=ch("input",{type:"number",value:r.ttl||300,style:{width:"50px",padding:"2px",fontSize:"10px"}},rr);
        ti.addEventListener("change",()=>{r.ttl=+ti.value;renderAndSync();});
        ch("button",{text:"✕",style:{padding:"1px 4px",fontSize:"9px",cursor:"pointer"},on:{click:()=>{z.records.splice(ri,1);renderAndSync();openPropertyPanel();}}},rr);
      });
      ch("button",{text:"+ レコード",style:{padding:"2px 6px",fontSize:"9px",cursor:"pointer"},
        on:{click:()=>{(z.records=z.records||[]).push({name:"app",type:"A",value:"203.0.113.10",ttl:300});renderAndSync();openPropertyPanel();}}},box);
    });
    ch("button",{text:"+ ホストゾーン",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",marginTop:"3px"},
      on:{click:()=>{cfg.hosted_zones.push({name:"example.com",records:[]});renderAndSync();openPropertyPanel();}}},sec);
  }
  else if(k==="aws-tgw"){
    addField(sec,"BGP ASN","number",cfg.asn||64512,v=>{cfg.asn=+v||64512;renderAndSync();});
    addSelectField(sec,"ルート伝播",["true","false"],String(!!cfg.propagation),v=>{cfg.propagation=(v==="true");renderAndSync();});
    addField(sec,"アタッチメント (VPC名/ID, カンマ区切り)","text",(cfg.attachments||[]).join(","),v=>{cfg.attachments=v.split(",").map(x=>x.trim()).filter(Boolean);renderAndSync();});
  }
  else if(k==="aws-apigw"){
    addField(sec,"API名","text",cfg.api_name||"",v=>{cfg.api_name=v;renderAndSync();});
    addField(sec,"ステージ","text",cfg.stage||"prod",v=>{cfg.stage=v;renderAndSync();});
    cfg.endpoints=cfg.endpoints||[];
    ch("h5",{text:"エンドポイント",style:{margin:"6px 0 2px",fontSize:"11px"}},sec);
    cfg.endpoints.forEach((ep,ei)=>{
      const r=ch("div",{style:{display:"flex",gap:"3px",alignItems:"center",marginBottom:"3px"}},sec);
      const ms=ch("select",{style:{padding:"2px",fontSize:"10px"}},r); ["GET","POST","PUT","DELETE","PATCH"].forEach(m=>ch("option",{value:m,text:m},ms)); ms.value=ep.method||"GET";
      ms.addEventListener("change",()=>{ep.method=ms.value;renderAndSync();});
      const pi=ch("input",{type:"text",value:ep.path||"",placeholder:"/path",style:{flex:"1",padding:"2px",fontSize:"10px"}},r);
      pi.addEventListener("change",()=>{ep.path=pi.value;renderAndSync();});
      const ii=ch("input",{type:"text",value:ep.integration||"lambda",placeholder:"integration",style:{width:"80px",padding:"2px",fontSize:"10px"}},r);
      ii.addEventListener("change",()=>{ep.integration=ii.value;renderAndSync();});
      ch("button",{text:"✕",style:{padding:"1px 4px",fontSize:"9px",cursor:"pointer"},on:{click:()=>{cfg.endpoints.splice(ei,1);renderAndSync();openPropertyPanel();}}},r);
    });
    ch("button",{text:"+ エンドポイント",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer"},
      on:{click:()=>{cfg.endpoints.push({path:"/api",method:"GET",integration:"lambda"});renderAndSync();openPropertyPanel();}}},sec);
  }
  else if(k==="aws-lambda"){
    addField(sec,"関数名","text",cfg.function_name||"",v=>{cfg.function_name=v;renderAndSync();});
    addField(sec,"ランタイム","text",cfg.runtime||"nodejs20.x",v=>{cfg.runtime=v;renderAndSync();});
    addField(sec,"メモリ (MB)","number",cfg.memory_mb||128,v=>{cfg.memory_mb=+v||128;renderAndSync();});
    addField(sec,"タイムアウト (秒)","number",cfg.timeout_sec||30,v=>{cfg.timeout_sec=+v||30;renderAndSync();});
    addField(sec,"トリガ","text",cfg.trigger||"apigw",v=>{cfg.trigger=v;renderAndSync();});
  }
  else if(k==="aws-cloudfront"){
    addField(sec,"ディストリビューションID","text",cfg.distribution_id||"",v=>{cfg.distribution_id=v;renderAndSync();});
    addField(sec,"Origin (ドメイン)","text",cfg.origin_domain||"",v=>{cfg.origin_domain=v;renderAndSync();});
    addField(sec,"Default TTL (秒)","number",cfg.default_ttl||86400,v=>{cfg.default_ttl=+v||86400;renderAndSync();});
    addField(sec,"SSL証明書","text",cfg.ssl_cert||"acm-default",v=>{cfg.ssl_cert=v;renderAndSync();});
  }
  else if(k==="aws-rds"){
    addSelectField(sec,"エンジン",["mysql","postgres","mariadb","aurora-mysql","aurora-postgresql","oracle","sqlserver"],cfg.engine||"mysql",v=>{cfg.engine=v;renderAndSync();});
    addField(sec,"エンジンバージョン","text",cfg.engine_version||"",v=>{cfg.engine_version=v;renderAndSync();});
    addField(sec,"インスタンスクラス","text",cfg.instance_class||"db.t3.micro",v=>{cfg.instance_class=v;renderAndSync();});
    addSelectField(sec,"Multi-AZ",["true","false"],String(!!cfg.multi_az),v=>{cfg.multi_az=(v==="true");renderAndSync();});
    addField(sec,"ポート","number",cfg.port||3306,v=>{cfg.port=+v||3306;renderAndSync();});
    addField(sec,"ストレージ (GB)","number",cfg.allocated_gb||20,v=>{cfg.allocated_gb=+v||20;renderAndSync();});
  }
  else if(k==="aws-dynamodb"){
    addField(sec,"テーブル名","text",cfg.table_name||"",v=>{cfg.table_name=v;renderAndSync();});
    addField(sec,"パーティションキー","text",cfg.partition_key||"id",v=>{cfg.partition_key=v;renderAndSync();});
    addSelectField(sec,"課金モード",["PAY_PER_REQUEST","PROVISIONED"],cfg.billing_mode||"PAY_PER_REQUEST",v=>{cfg.billing_mode=v;renderAndSync();});
    addField(sec,"Read Capacity","number",cfg.read_capacity||5,v=>{cfg.read_capacity=+v||5;renderAndSync();});
    addField(sec,"Write Capacity","number",cfg.write_capacity||5,v=>{cfg.write_capacity=+v||5;renderAndSync();});
  }
  else if(k==="aws-sqs"){
    addField(sec,"キュー名","text",cfg.queue_name||"",v=>{cfg.queue_name=v;renderAndSync();});
    addSelectField(sec,"タイプ",["standard","fifo"],cfg.type||"standard",v=>{cfg.type=v;renderAndSync();});
    addField(sec,"可視性タイムアウト (秒)","number",cfg.visibility_timeout||30,v=>{cfg.visibility_timeout=+v||30;renderAndSync();});
    addField(sec,"保持期間 (日)","number",cfg.retention_days||4,v=>{cfg.retention_days=+v||4;renderAndSync();});
  }
  // Common: still allow interfaces (for connection wiring)
  renderInterfaceTable(body, obj, "device");
}

function renderDeviceProps(body, obj){
  // AWS-specific node: render the service-specific config first (before generic device fields)
  if(obj.aws_kind){
    renderAwsKindProps(body, obj);
    return;
  }
  addSelectField(body, "種別", ["router","l3switch","l2switch","firewall","loadbalancer","waf"], obj.type||"router",
    v=>{ obj.type=v; renderAndSync(); openPropertyPanel(); });
  addField(body, "Model", "text", obj.model||"", v=>{ obj.model=v; renderAndSync(); });

  // Routing / ARP table quick-access buttons
  const tblBar = ch("div", { style:{display:"flex",gap:"6px",margin:"8px 0"} }, body);
  ch("button", { text:"🗺 ルーティングテーブル編集",
    style:{flex:"1",padding:"6px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
      background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",fontWeight:"600"},
    on:{ click:()=>showRoutingTable(obj.id) }
  }, tblBar);
  ch("button", { text:"📇 ARPテーブル編集",
    style:{flex:"1",padding:"6px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
      background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",fontWeight:"600"},
    on:{ click:()=>showArpTable("device", obj.id) }
  }, tblBar);

  renderInterfaceTable(body, obj, "device");

  // STP / Root Bridge — for L2/L3 switches
  if(obj.type === "l2switch" || obj.type === "l3switch"){
    const stpSec = ch("div", { class:"sub-section" }, body);
    ch("h4", { text:"スパニングツリー (STP) / ルートブリッジ" }, stpSec);
    const curPri = (obj.stp_priority==null ? 32768 : obj.stp_priority);
    // Show whether this switch is currently the root bridge (VLAN1)
    let isRoot=false, rootId=null, rootPri=null;
    try{
      const sd = computeStpForSwitch(obj);
      const v1 = (sd.vlans||[]).find(v=>v.vlan===1) || (sd.vlans||[])[0];
      if(v1){ isRoot=v1.isRoot; rootPri=v1.rootPriority; }
    }catch(e){}
    // find global root for VLAN1 using the same basis as the engine (priority, then lowest MAC)
    let best=null;
    const baseMacOf=(d)=>{ let b=null; for(const i of (d.interfaces||[])){ if(i.mac){ const m=i.mac.toLowerCase(); if(b===null||m<b)b=m; } } return b||"ff:ff:ff:ff:ff:ff"; };
    for(const d of (App.config.devices||[])){
      if(d.type!=="l2switch" && d.type!=="l3switch") continue;
      const pri=(d.stp_priority==null?32768:d.stp_priority);
      const mac=baseMacOf(d);
      if(!best || pri<best.pri || (pri===best.pri && mac<best.mac)) best={id:d.id,pri,mac};
    }
    rootId = best && best.id;
    ch("div",{ text: (rootId===obj.id? "✓ このスイッチが現在のルートブリッジです" : `現在のルートブリッジ: ${rootId||"-"}`),
      style:{fontSize:"11px",color:(rootId===obj.id?"var(--green)":"var(--text-dim)"),padding:"2px 0 4px",fontWeight:"700"} }, stpSec);
    // show this switch's bridge ID (priority + base MAC) — the election basis
    let baseMac="-";
    { let best=null; for(const i of (obj.interfaces||[])){ if(i.mac){ const m=i.mac.toLowerCase(); if(best===null||m<best)best=m; } } baseMac=best||"(MAC未設定)"; }
    ch("div",{ text:`Bridge ID = priority ${(obj.stp_priority==null?32768:obj.stp_priority)} / MAC ${baseMac}`,
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"0 0 6px",fontFamily:"var(--mono)"} }, stpSec);
    ch("div",{ text:"※ ルートは Bridge ID 最小（プライオリティ→MAC最小）で選定。未指定時は最小MACのスイッチが自動でルートになります。",
      style:{fontSize:"9px",color:"var(--text-mute)",padding:"0 0 6px",lineHeight:"1.4"} }, stpSec);
    addSelectField(stpSec, "STPモード", ["rstp","pvst","mst","off"], (obj.stp&&obj.stp.mode)||"rstp",
      v=>{ obj.stp=obj.stp||{}; obj.stp.mode=v; renderAndSync(); });
    // BPDU Guard: when a loop drives MAC flapping to the max, an err-disable trips and converges it
    const bg = ch("label",{style:{display:"flex",gap:"5px",alignItems:"center",fontSize:"11px",cursor:"pointer",padding:"2px 0"}},stpSec);
    const bgC = ch("input",{type:"checkbox"},bg); bgC.checked=!!obj.bpdu_guard;
    bgC.addEventListener("change",()=>{ obj.bpdu_guard=bgC.checked; renderAndSync(); });
    ch("span",{text:"BPDU Guard (ループ激化時にポートを err-disable して収束)"},bg);
    // Bridge priority (lower = more likely root; multiple of 4096)
    const pf=ch("div",{class:"field"},stpSec);
    ch("label",{text:"ブリッジプライオリティ (低いほど優先 / 4096刻み)"},pf);
    const prow=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center"}},pf);
    const psel=ch("select",{style:{flex:"1",padding:"5px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"4px"}},prow);
    for(let pv=0; pv<=61440; pv+=4096){ const o=ch("option",{value:String(pv),text:String(pv)+(pv===32768?" (既定)":"")},psel); if(pv===curPri)o.selected=true; }
    psel.addEventListener("change",()=>{ obj.stp_priority=+psel.value; renderAndSync(); openPropertyPanel(); });
    ch("button",{text:"👑 ルートブリッジにする",style:{whiteSpace:"nowrap",padding:"5px 8px",fontSize:"10px",cursor:"pointer",background:"#f59e0b",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
      on:{click:()=>{
        // set this switch to the lowest priority among all switches
        let minOther=32768;
        for(const d of (App.config.devices||[])){ if((d.type==="l2switch"||d.type==="l3switch") && d.id!==obj.id){ minOther=Math.min(minOther,(d.stp_priority==null?32768:d.stp_priority)); } }
        obj.stp_priority = Math.max(0, (minOther>=4096?minOther-4096:0));
        renderAndSync(); openPropertyPanel(); toast(`${obj.label||obj.id} をルートブリッジに設定 (priority=${obj.stp_priority})`,"ok");
      }}},prow);
    ch("div",{text:"💡 「STP表示」ボタンで全体のルート/ブロックポートを可視化できます。ルートブリッジには👑が表示されます。",
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"6px 0 0",lineHeight:"1.4"}},stpSec);
  }

  // Firewall policy editor — for firewall / WAF devices
  if(obj.type === "firewall" || obj.type === "waf"){
    const fwBar = ch("div", { style:{margin:"8px 0"} }, body);
    ch("button", { text:"🛡 ファイアウォールポリシー編集",
      style:{width:"100%",padding:"7px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
        background:"var(--bg3)",border:"1px solid var(--red)",color:"var(--red)",fontWeight:"700"},
      on:{ click:()=>showFirewallPolicy(obj.id) }
    }, fwBar);
  }

  // Policy-Based Routing — for L3-capable devices
  if(obj.type === "router" || obj.type === "l3switch" || obj.type === "firewall"){
    const pbrBar = ch("div", { style:{margin:"8px 0"} }, body);
    ch("button", { text:"🧭 ポリシーベースルーティング(PBR)編集",
      style:{width:"100%",padding:"7px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
        background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",fontWeight:"700"},
      on:{ click:()=>showPbrEditor(obj.id) }
    }, pbrBar);
  }

  // NAT — full editor (SNAT / DNAT / masquerade) for routers & firewalls
  if(obj.type === "router" || obj.type === "l3switch" || obj.type === "firewall"){
    const natBar = ch("div", { style:{margin:"8px 0"} }, body);
    ch("button", { text:"🔁 NAT設定 (SNAT/DNAT/Masquerade)",
      style:{width:"100%",padding:"7px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
        background:"var(--bg3)",border:"1px solid var(--green)",color:"var(--green)",fontWeight:"700"},
      on:{ click:()=>showNatEditor(obj.id) }
    }, natBar);
  }
}

// NAT editor: source NAT (SNAT/masquerade) + destination NAT (DNAT / port-forwarding)
function showNatEditor(id){
  const dev = Cfg.byId("devices", id);
  if(!dev) return;
  dev.nat = dev.nat || { enabled:false, snat:[], dnat:[], masquerade:false };
  const nat = dev.nat;
  openDialog(`🔁 NAT設定 — ${dev.label||id}`, (body)=>{
    const fStyle={padding:"4px 6px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",fontFamily:"var(--mono)"};
    function refresh(){
      body.innerHTML="";
      const top=ch("div",{style:{display:"flex",gap:"12px",alignItems:"center",marginBottom:"8px"}},body);
      const en=ch("label",{style:{display:"flex",gap:"4px",alignItems:"center",fontSize:"11px",cursor:"pointer"}},top);
      const enChk=ch("input",{type:"checkbox"},en); enChk.checked=!!nat.enabled;
      enChk.addEventListener("change",()=>{ nat.enabled=enChk.checked; renderAndSync(); });
      ch("span",{text:"NAT有効"},en);
      const mq=ch("label",{style:{display:"flex",gap:"4px",alignItems:"center",fontSize:"11px",cursor:"pointer"}},top);
      const mqChk=ch("input",{type:"checkbox"},mq); mqChk.checked=!!nat.masquerade;
      mqChk.addEventListener("change",()=>{ nat.masquerade=mqChk.checked; renderAndSync(); });
      ch("span",{text:"Masquerade(出力IFでPAT)"},mq);

      // SNAT
      const s1=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"送信元NAT (SNAT)"},s1);
      ch("div",{text:"指定の送信元を別アドレスに変換して送出します。",style:{fontSize:"10px",color:"var(--text-dim)",padding:"0 0 4px"}},s1);
      (nat.snat||[]).forEach((r,i)=>{
        const row=ch("div",{style:{display:"flex",gap:"5px",alignItems:"center",marginBottom:"3px",flexWrap:"wrap"}},s1);
        ch("span",{text:"src",style:{fontSize:"9px",color:"var(--text-dim)"}},row);
        const a=ch("input",{type:"text",value:r.src||"",placeholder:"10.0.0.0/24/セグメント",list:"nat-seg",style:Object.assign({width:"140px"},fStyle)},row); a.addEventListener("change",()=>{r.src=a.value;renderAndSync();});
        ch("span",{text:"→",style:{fontSize:"11px"}},row);
        const b=ch("input",{type:"text",value:r.translated_src||"",placeholder:"変換後IP",style:Object.assign({width:"120px"},fStyle)},row); b.addEventListener("change",()=>{r.translated_src=b.value;renderAndSync();});
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},on:{click:()=>{nat.snat.splice(i,1);renderAndSync();refresh();}}},row);
      });
      ch("button",{text:"+ SNATルール",style:{padding:"3px 10px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},on:{click:()=>{nat.snat=nat.snat||[];nat.snat.push({src:"",translated_src:"",status:"enabled"});renderAndSync();refresh();}}},s1);

      // DNAT
      const s2=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"宛先NAT (DNAT / ポートフォワード)"},s2);
      ch("div",{text:"外部宛先(IP:ポート)を内部のサーバ(IP:ポート)へ転送します。",style:{fontSize:"10px",color:"var(--text-dim)",padding:"0 0 4px"}},s2);
      (nat.dnat||[]).forEach((r,i)=>{
        const row=ch("div",{style:{display:"flex",gap:"4px",alignItems:"center",marginBottom:"3px",flexWrap:"wrap"}},s2);
        const od=ch("input",{type:"text",value:r.orig_dst||"",placeholder:"元宛先IP",style:Object.assign({width:"105px"},fStyle)},row); od.addEventListener("change",()=>{r.orig_dst=od.value;renderAndSync();});
        ch("span",{text:":"},row);
        const op=ch("input",{type:"number",value:r.orig_port!=null?r.orig_port:"",placeholder:"port",style:Object.assign({width:"56px"},fStyle)},row); op.addEventListener("change",()=>{r.orig_port=op.value===""?null:+op.value;renderAndSync();});
        const pr=ch("select",{style:fStyle},row);["any","tcp","udp"].forEach(x=>ch("option",{value:x,text:x},pr));pr.value=r.proto||"tcp";pr.addEventListener("change",()=>{r.proto=pr.value;renderAndSync();});
        ch("span",{text:"→",style:{fontSize:"11px"}},row);
        const td=ch("input",{type:"text",value:r.translated_dst||"",placeholder:"内部IP",style:Object.assign({width:"105px"},fStyle)},row); td.addEventListener("change",()=>{r.translated_dst=td.value;renderAndSync();});
        ch("span",{text:":"},row);
        const tp=ch("input",{type:"number",value:r.translated_port!=null?r.translated_port:"",placeholder:"port",style:Object.assign({width:"56px"},fStyle)},row); tp.addEventListener("change",()=>{r.translated_port=tp.value===""?null:+tp.value;renderAndSync();});
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},on:{click:()=>{nat.dnat.splice(i,1);renderAndSync();refresh();}}},row);
      });
      ch("button",{text:"+ DNATルール",style:{padding:"3px 10px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},on:{click:()=>{nat.dnat=nat.dnat||[];nat.dnat.push({orig_dst:"",orig_port:null,proto:"tcp",translated_dst:"",translated_port:null,status:"enabled"});renderAndSync();refresh();}}},s2);

      const dl=ch("datalist",{id:"nat-seg"},body);
      for(const n of (typeof segmentRefOptions==="function"?segmentRefOptions():[])) ch("option",{value:n},dl);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

// Firewall policy editor — ordered rules (first match wins, implicit deny at end)
function showFirewallPolicy(id){
  const dev = Cfg.byId("devices", id);
  if(!dev) return;
  App.config.policies = App.config.policies || [];
  let pol = App.config.policies.find(p=>p.device===id);
  if(!pol){ pol = { device:id, rules:[] }; App.config.policies.push(pol); }
  openDialog(`🛡 ファイアウォールポリシー — ${dev.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      ch("div",{text:"ルールは上から順に評価され、最初に一致したものが適用されます (first-match)。どれにも一致しない場合は末尾の暗黙deny。送信元/宛先にはセグメント名も指定可。",
        style:{fontSize:"10px",color:"var(--text-dim)",padding:"4px 2px 10px",lineHeight:"1.4"}},body);
      const fStyle={padding:"5px 7px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"4px",fontFamily:"var(--mono)",boxSizing:"border-box"};
      const lblStyle={fontSize:"9px",color:"var(--text-dim)",display:"block",marginBottom:"2px",fontWeight:"700"};

      if(!(pol.rules||[]).length){
        ch("div",{text:"ルールがありません。「+ ルール追加」で作成してください。",style:{color:"var(--text-mute)",fontSize:"11px",padding:"8px 2px"}},body);
      }

      (pol.rules||[]).forEach((r,i)=>{
        const card=ch("div",{style:{border:"1px solid var(--border)",borderLeft:"3px solid "+(r.action==="allow"?"var(--green)":"var(--red)"),
          borderRadius:"6px",padding:"8px 10px",marginBottom:"8px",background:"var(--bg2)",opacity:(r.status==="disabled"?"0.55":"1")}},body);
        // header row: number + action + status + ops
        const hd=ch("div",{style:{display:"flex",gap:"8px",alignItems:"center",marginBottom:"8px"}},card);
        ch("span",{text:"#"+(i+1),style:{fontSize:"11px",color:"var(--text-dim)",fontWeight:"700",minWidth:"24px"}},hd);
        const aSel=ch("select",{style:Object.assign({},fStyle,{color:r.action==="allow"?"var(--green)":"var(--red)",fontWeight:"700",flex:"0 0 90px"})},hd);
        ch("option",{value:"allow",text:"✓ allow"},aSel);ch("option",{value:"deny",text:"✕ deny"},aSel);
        aSel.value=r.action||"deny";
        aSel.addEventListener("change",()=>{ r.action=aSel.value; renderAndSync(); refresh(); });
        const stSel=ch("select",{style:Object.assign({},fStyle,{flex:"0 0 76px"})},hd);
        ch("option",{value:"enabled",text:"有効"},stSel);ch("option",{value:"disabled",text:"無効"},stSel);
        stSel.value=r.status||"enabled";
        stSel.addEventListener("change",()=>{ r.status=stSel.value; renderAndSync(); refresh(); });
        const ops=ch("div",{style:{display:"flex",gap:"3px",marginLeft:"auto"}},hd);
        ch("button",{text:"▲",title:"上へ",style:{padding:"2px 7px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"},
          on:{click:()=>{ if(i>0){ const t=pol.rules[i-1]; pol.rules[i-1]=pol.rules[i]; pol.rules[i]=t; renderAndSync(); refresh(); } }}},ops);
        ch("button",{text:"▼",title:"下へ",style:{padding:"2px 7px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"},
          on:{click:()=>{ if(i<pol.rules.length-1){ const t=pol.rules[i+1]; pol.rules[i+1]=pol.rules[i]; pol.rules[i]=t; renderAndSync(); refresh(); } }}},ops);
        ch("button",{text:"🗑",title:"削除",style:{padding:"2px 7px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ pol.rules.splice(i,1); renderAndSync(); refresh(); }}},ops);

        // fields grid: src / dst / proto / port
        const grid=ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}},card);
        const fSrc=ch("div",{},grid); ch("label",{text:"送信元 (IP/CIDR/セグメント名)",style:lblStyle},fSrc);
        const srcIn=ch("input",{type:"text",value:r.src||"0.0.0.0/0",list:"fw-seg-list",style:Object.assign({width:"100%"},fStyle)},fSrc);
        srcIn.addEventListener("change",()=>{ r.src=srcIn.value; renderAndSync(); });
        const fDst=ch("div",{},grid); ch("label",{text:"宛先 (IP/CIDR/セグメント名)",style:lblStyle},fDst);
        const dstIn=ch("input",{type:"text",value:r.dst||"0.0.0.0/0",list:"fw-seg-list",style:Object.assign({width:"100%"},fStyle)},fDst);
        dstIn.addEventListener("change",()=>{ r.dst=dstIn.value; renderAndSync(); });
        const fPr=ch("div",{},grid); ch("label",{text:"プロトコル",style:lblStyle},fPr);
        const prSel=ch("select",{style:Object.assign({width:"100%"},fStyle)},fPr);
        ["any","tcp","udp","icmp"].forEach(pp=>ch("option",{value:pp,text:pp.toUpperCase()},prSel));
        prSel.value=r.protocol||"any";
        const fPt=ch("div",{},grid); ch("label",{text:"宛先ポート (空欄=any)",style:lblStyle},fPt);
        const ptIn=ch("input",{type:"number",min:"0",max:"65535",value:r.dst_port!=null?r.dst_port:"",placeholder:"例: 443 (空欄=全ポート)",style:Object.assign({width:"100%"},fStyle)},fPt);
        // port is meaningless for icmp/any → disable + hint
        function syncPortEnable(){
          const noPort = (prSel.value==="icmp" || prSel.value==="any");
          ptIn.disabled = noPort;
          ptIn.style.opacity = noPort ? "0.4" : "1";
          if(noPort){ ptIn.value=""; r.dst_port=null; }
        }
        syncPortEnable();
        prSel.addEventListener("change",()=>{ r.protocol=prSel.value; syncPortEnable(); renderAndSync(); });
        ptIn.addEventListener("change",()=>{ r.dst_port = (ptIn.value===""? null : +ptIn.value); renderAndSync(); });
        // common-port quick buttons
        const quick=ch("div",{style:{display:"flex",gap:"4px",flexWrap:"wrap",marginTop:"6px"}},card);
        ch("span",{text:"よく使うポート:",style:{fontSize:"9px",color:"var(--text-dim)",alignSelf:"center"}},quick);
        [["HTTP",80],["HTTPS",443],["SSH",22],["DNS",53],["MySQL",3306],["PostgreSQL",5432]].forEach(([nm,pt])=>{
          ch("button",{text:`${nm}(${pt})`,style:{padding:"1px 6px",fontSize:"9px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text-dim)",borderRadius:"3px"},
            on:{click:()=>{ if(prSel.value==="any"||prSel.value==="icmp"){ r.protocol="tcp"; } r.dst_port=pt; renderAndSync(); refresh(); }}},quick);
        });
      });

      ch("div",{text:"⊘ 暗黙のdeny — 上記いずれにも一致しない通信は全て遮断されます",
        style:{fontSize:"10px",color:"var(--red)",padding:"6px 2px",fontFamily:"var(--mono)"}},body);
      const dl=ch("datalist",{id:"fw-seg-list"},body);
      for(const n of segmentRefOptions()) ch("option",{value:n},dl);
      ["any","0.0.0.0/0","::/0"].forEach(v=>ch("option",{value:v},dl));

      ch("button",{text:"+ ルール追加",style:{width:"100%",padding:"8px",fontSize:"12px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"5px",fontWeight:"700",marginTop:"4px"},
        on:{click:()=>{ pol.rules.push({ id:"rule-"+(pol.rules.length+1), action:"allow", src:"0.0.0.0/0", dst:"0.0.0.0/0", protocol:"tcp", dst_port:null, status:"enabled", log:false }); renderAndSync(); refresh(); }}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

function renderServerProps(body, obj){
  addSelectField(body, "種別", ["physical","virtual","container"], obj.type||"virtual",
    v=>{ obj.type=v; renderAndSync(); });
  addField(body, "OS", "text", obj.os||"", v=>{ obj.os=v; renderAndSync(); });
  const row = ch("div", { class:"field-grid" }, body);
  addField(row, "CPU", "number", obj.cpu||1, v=>{ obj.cpu=+v; renderAndSync(); });
  addField(row, "Memory (MB)", "number", obj.memory||1024, v=>{ obj.memory=+v; renderAndSync(); });
  addField(body, "Gateway (IPv4)", "text", obj.gateway||"", v=>{ obj.gateway=v; renderAndSync(); });
  addField(body, "Gateway (IPv6)", "text", obj.gateway_v6||"", v=>{ obj.gateway_v6=v; renderAndSync(); });
  // ARP table button (servers have ARP too)
  const arpBar = ch("div", { style:{margin:"8px 0",display:"flex",gap:"6px"} }, body);
  ch("button", { text:"📇 ARP",
    style:{flex:"1",padding:"6px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
      background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",fontWeight:"600"},
    on:{ click:()=>showArpTable("server", obj.id) }
  }, arpBar);
  ch("button", { text:"📢 GARP送信",
    style:{flex:"1",padding:"6px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
      background:"var(--bg3)",border:"1px solid var(--green)",color:"var(--green)",fontWeight:"600"},
    title:"Gratuitous ARP を送信し、近隣のARPキャッシュを更新・IP重複を検知します",
    on:{ click:()=>{ const ifc=(obj.interfaces||[]).find(i=>i.ip)||(obj.interfaces||[])[0]; sendGarp("server", obj.id, ifc&&ifc.id); }}
  }, arpBar);
  ch("button", { text:"🔌 ポート/FW",
    style:{flex:"1",padding:"6px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
      background:"var(--bg3)",border:"1px solid var(--orange)",color:"var(--orange)",fontWeight:"600"},
    on:{ click:()=>showServerPorts(obj.id) }
  }, arpBar);

  // Container networking (container hosts) / Hypervisor (physical/virtual hosts)
  const virtBar = ch("div", { style:{margin:"6px 0",display:"flex",gap:"6px"} }, body);
  ch("button", { text:"🐳 コンテナNW",
    style:{flex:"1",padding:"6px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
      background:"var(--bg3)",border:"1px solid var(--cyan)",color:"var(--cyan)",fontWeight:"600"},
    on:{ click:()=>showContainerManager(obj.id) }
  }, virtBar);
  ch("button", { text:"🖥 仮想基盤(vCenter)",
    style:{flex:"1",padding:"6px",fontSize:"11px",cursor:"pointer",borderRadius:"4px",
      background:"var(--bg3)",border:"1px solid var(--purple)",color:"var(--purple)",fontWeight:"600"},
    on:{ click:()=>showHypervisorManager(obj.id) }
  }, virtBar);

  // Services hosted on THIS server — list + add (configure services from the selected server)
  const svcSec = ch("div", { class:"sub-section" }, body);
  const svcHead = ch("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},svcSec);
  ch("h4", { text:"サービス", style:{margin:0} }, svcHead);
  ch("button", { text:"+ サービス追加",
    style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",borderRadius:"4px",
      background:"var(--accent)",border:"none",color:"#fff",fontWeight:"700"},
    on:{ click:()=>addServiceToServer(obj.id) }
  }, svcHead);
  const hosted = (App.config.services||[]).filter(s=>s.server===obj.id);
  if(!hosted.length){
    ch("div",{text:"(このサーバにサービスはありません)",style:{color:"var(--text-mute)",fontSize:"11px",padding:"4px 2px"}},svcSec);
  }
  for(const sv of hosted){
    const row = ch("div",{style:{display:"flex",alignItems:"center",gap:"6px",padding:"4px 6px",fontSize:"11px",borderBottom:"1px solid var(--border)"}},svcSec);
    const st = (sv.status||"running")==="running";
    ch("span",{text:st?"●":"○",style:{color:st?"var(--green)":"var(--red)"}},row);
    ch("span",{text:sv.label||sv.id,style:{flex:"1",fontWeight:"600"}},row);
    ch("span",{text:`${sv.protocol||"TCP"}/${sv.port||"-"}`,style:{fontFamily:"var(--mono)",color:"var(--text-dim)",fontSize:"10px"}},row);
    ch("button",{text:"設定",style:{padding:"1px 7px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"3px"},
      on:{click:()=>selectElement("service", sv.id)}},row);
    ch("button",{text:st?"停止":"起動",style:{padding:"1px 7px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid "+(st?"var(--red)":"var(--green)"),color:(st?"var(--red)":"var(--green)"),borderRadius:"3px"},
      on:{click:()=>{ sv.status = st?"stopped":"running"; renderAndSync(); openPropertyPanel(); }}},row);
    ch("button",{text:"✕",style:{padding:"1px 6px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
      on:{click:()=>{ App.config.services=App.config.services.filter(x=>x.id!==sv.id); renderAndSync(); openPropertyPanel(); toast("サービス削除","ok"); }}},row);
  }

  // AWS placement (VPC / Subnet / Security Groups) — if any VPC is defined
  if(App.config.aws && (App.config.aws.vpcs||[]).length){
    obj.aws = obj.aws || {};
    const awsSec = ch("div",{class:"sub-section"},body);
    ch("h4",{text:"☁ AWS 配置"},awsSec);
    const vpcNames = App.config.aws.vpcs.map(v=>v.name);
    addSelectField(awsSec, "VPC", ["",...vpcNames], obj.aws.vpc||"", v=>{ obj.aws.vpc=v; renderAndSync(); openPropertyPanel(); });
    const vpc = App.config.aws.vpcs.find(v=>v.name===obj.aws.vpc);
    if(vpc){
      addSelectField(awsSec, "サブネット", ["",...(vpc.subnets||[]).map(s=>s.name)], obj.aws.subnet||"", v=>{ obj.aws.subnet=v; renderAndSync(); });
      ch("label",{text:"セキュリティグループ (複数選択可)",style:{fontSize:"9px",color:"var(--text-dim)",display:"block",margin:"4px 0 2px"}},awsSec);
      for(const sg of (vpc.security_groups||[])){
        const l=ch("label",{style:{display:"flex",gap:"5px",alignItems:"center",fontSize:"11px",cursor:"pointer",padding:"1px 0"}},awsSec);
        const c=ch("input",{type:"checkbox"},l); c.checked=(obj.aws.security_groups||[]).includes(sg.name);
        c.addEventListener("change",()=>{ obj.aws.security_groups=obj.aws.security_groups||[]; if(c.checked){ if(!obj.aws.security_groups.includes(sg.name)) obj.aws.security_groups.push(sg.name);} else { obj.aws.security_groups=obj.aws.security_groups.filter(x=>x!==sg.name);} renderAndSync(); });
        ch("span",{text:`${sg.name} (inbound: ${(sg.inbound||[]).map(r=>r.proto+"/"+(r.port||"*")).join(", ")||"none"})`},l);
      }
    }
  }

  renderInterfaceTable(body, obj, "server");
}

// Named-segment manager — define named segments mapping to one or more CIDRs (v4/v6)
function showSegmentManager(){
  App.config.segments = App.config.segments || [];
  openDialog("🏷 ネットワークセグメント管理", (body)=>{
    function refresh(){
      body.innerHTML = "";
      ch("div",{text:"セグメントに名前を付けると、FWポリシー・PBR で IP/CIDR の代わりに名前で制御できます。1つのセグメントに複数CIDR(v4/v6混在可)を割当可能。",
        style:{fontSize:"10px",color:"var(--text-dim)",padding:"4px 2px 8px",lineHeight:"1.4"}},body);
      const fStyle={padding:"4px 6px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",fontFamily:"var(--mono)"};
      (App.config.segments||[]).forEach((s,i)=>{
        const card=ch("div",{style:{border:"1px solid var(--border)",borderRadius:"5px",padding:"8px",marginBottom:"6px",background:"var(--bg2)"}},body);
        const hd=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"4px"}},card);
        const swatch=ch("input",{type:"color",value:s.color||"#a371f7",style:{width:"28px",height:"24px",padding:"0",border:"none",background:"none",cursor:"pointer"}},hd);
        swatch.addEventListener("change",()=>{ s.color=swatch.value; renderAndSync(); });
        const nameIn=ch("input",{type:"text",value:s.name||"",placeholder:"セグメント名 (例: DMZ)",style:Object.assign({flex:"1",fontWeight:"700"},fStyle)},hd);
        nameIn.addEventListener("change",()=>{ s.name=nameIn.value.trim(); renderAndSync(); });
        ch("button",{text:"🗑",style:{padding:"3px 8px",fontSize:"11px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ App.config.segments.splice(i,1); renderAndSync(); refresh(); }}},hd);
        ch("label",{text:"CIDR (カンマ区切り, v4/v6可)",style:{fontSize:"9px",color:"var(--text-dim)",display:"block",marginTop:"2px"}},card);
        const cidrIn=ch("input",{type:"text",value:(s.cidrs||[]).join(", "),placeholder:"10.1.0.0/24, 2001:db8:1::/64",style:Object.assign({width:"100%",boxSizing:"border-box"},fStyle)},card);
        cidrIn.addEventListener("change",()=>{ s.cidrs=cidrIn.value.split(",").map(x=>x.trim()).filter(Boolean); renderAndSync(); });
      });
      ch("button",{text:"+ セグメント追加",style:{width:"100%",padding:"7px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700",marginTop:"4px"},
        on:{click:()=>{ App.config.segments.push({name:"segment-"+(App.config.segments.length+1),cidrs:[],color:"#a371f7"}); renderAndSync(); refresh(); }}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}
function segmentRefOptions(){ return (App.config.segments||[]).map(s=>s.name).filter(Boolean); }

// Policy-Based Routing editor (per device)
function showPbrEditor(id){
  const dev = Cfg.byId("devices", id);
  if(!dev) return;
  dev.pbr = dev.pbr || [];
  const ifaceIds = (dev.interfaces||[]).map(i=>i.id);
  openDialog(`🧭 ポリシーベースルーティング — ${dev.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      ch("div",{text:"送信元/条件に基づき通常の宛先ルーティングを上書きします。上から順に評価し最初に一致したルールを適用。送信元・宛先には『セグメント名』も指定可。",
        style:{fontSize:"10px",color:"var(--text-dim)",padding:"4px 2px 8px",lineHeight:"1.4"}},body);
      const fStyle={padding:"3px 5px",fontSize:"10.5px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",fontFamily:"var(--mono)"};
      const cols="30px 1fr 1fr 46px 48px 1.3fr 60px 44px";
      const head=ch("div",{style:{display:"grid",gridTemplateColumns:cols,gap:"4px",fontSize:"9px",color:"var(--text-dim)",fontWeight:"700",padding:"2px 0",borderBottom:"1px solid var(--border)"}},body);
      ["Seq","送信元","宛先","Proto","Port","Next-Hop / IF","状態","削除"].forEach(h=>ch("span",{text:h},head));
      dev.pbr.sort((a,b)=>(a.seq||0)-(b.seq||0));
      dev.pbr.forEach((r,i)=>{
        const row=ch("div",{style:{display:"grid",gridTemplateColumns:cols,gap:"4px",alignItems:"center",padding:"3px 0",borderBottom:"1px solid var(--border)",opacity:(r.status==="disabled"?"0.5":"1")}},body);
        const seqIn=ch("input",{type:"number",value:r.seq||((i+1)*10),style:Object.assign({width:"28px"},fStyle)},row);
        seqIn.addEventListener("change",()=>{ r.seq=+seqIn.value||0; renderAndSync(); refresh(); });
        const srcIn=ch("input",{type:"text",value:r.src||"any",list:"seg-list",style:fStyle},row);
        srcIn.addEventListener("change",()=>{ r.src=srcIn.value; renderAndSync(); });
        const dstIn=ch("input",{type:"text",value:r.dst||"any",list:"seg-list",style:fStyle},row);
        dstIn.addEventListener("change",()=>{ r.dst=dstIn.value; renderAndSync(); });
        const prSel=ch("select",{style:fStyle},row);
        ["any","tcp","udp","icmp"].forEach(pp=>ch("option",{value:pp,text:pp},prSel)); prSel.value=r.proto||"any";
        prSel.addEventListener("change",()=>{ r.proto=prSel.value; renderAndSync(); });
        const ptIn=ch("input",{type:"number",value:r.dst_port!=null?r.dst_port:"",placeholder:"any",style:fStyle},row);
        ptIn.addEventListener("change",()=>{ r.dst_port=ptIn.value===""?null:+ptIn.value; renderAndSync(); });
        const nhWrap=ch("div",{style:{display:"flex",gap:"3px"}},row);
        const nhIn=ch("input",{type:"text",value:r.next_hop||"",placeholder:"next-hop IP",style:Object.assign({flex:"1",minWidth:"0"},fStyle)},nhWrap);
        nhIn.addEventListener("change",()=>{ r.next_hop=nhIn.value; renderAndSync(); });
        const ifSel=ch("select",{style:Object.assign({width:"50px"},fStyle)},nhWrap);
        ch("option",{value:"",text:"IF"},ifSel);
        for(const id2 of ifaceIds) ch("option",{value:id2,text:id2},ifSel);
        ifSel.value=r.egress_iface||"";
        ifSel.addEventListener("change",()=>{ r.egress_iface=ifSel.value||null; renderAndSync(); });
        const stSel=ch("select",{style:fStyle},row);
        ch("option",{value:"enabled",text:"有効"},stSel);ch("option",{value:"disabled",text:"無効"},stSel); stSel.value=r.status||"enabled";
        stSel.addEventListener("change",()=>{ r.status=stSel.value; renderAndSync(); refresh(); });
        ch("button",{text:"✕",style:{padding:"1px 5px",fontSize:"9px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ dev.pbr.splice(i,1); renderAndSync(); refresh(); }}},row);
      });
      const dl=ch("datalist",{id:"seg-list"},body);
      for(const n of segmentRefOptions()) ch("option",{value:n},dl);
      ch("option",{value:"any"},dl);
      ch("button",{text:"+ PBRルール追加",style:{width:"100%",padding:"6px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700",marginTop:"6px"},
        on:{click:()=>{ dev.pbr.push({seq:(dev.pbr.length+1)*10,src:"any",dst:"any",proto:"any",dst_port:null,next_hop:"",egress_iface:null,status:"enabled"}); renderAndSync(); refresh(); }}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

// Server port / host-firewall manager: see listening sockets, open/close ports, set FW rules
function showServerPorts(id){
  const obj = Cfg.byId("servers", id);
  if(!obj) return;
  obj.firewall = obj.firewall || { enabled:false, default_inbound:"allow", rules:[] };
  obj.listen_ports = obj.listen_ports || [];
  openDialog(`🔌 ポート / ホストFW — ${obj.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      // --- Listening sockets (live, derived) ---
      const s1 = ch("div",{class:"sub-section"},body);
      ch("h4",{text:"待ち受けポート (LISTEN)"},s1);
      const sockets = (typeof buildServerPorts==="function") ? buildServerPorts(obj) : [];
      if(!sockets.length) ch("div",{text:"(待ち受けポートなし)",style:{color:"var(--text-mute)",fontSize:"11px"}},s1);
      for(const sk of sockets){
        const stateColor = sk.state==="LISTEN"?"var(--green)":(sk.state==="DOWN"?"var(--orange)":"var(--text-mute)");
        const rowEl = ch("div",{style:{display:"flex",alignItems:"center",gap:"8px",padding:"3px 6px",fontSize:"11px",fontFamily:"var(--mono)",borderBottom:"1px solid var(--border)"}},s1);
        ch("span",{text:sk.proto+"/"+sk.port,style:{minWidth:"70px",fontWeight:"700"}},rowEl);
        ch("span",{text:sk.state,style:{color:stateColor,minWidth:"54px"}},rowEl);
        ch("span",{text:sk.source,style:{color:"var(--text-dim)",flex:"1"}},rowEl);
        if(sk.source==="manual"){
          ch("button",{text:"✕",style:{padding:"1px 6px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
            on:{click:()=>{ obj.listen_ports=obj.listen_ports.filter(l=>!(+l.port===sk.port && (l.proto||"tcp").toLowerCase()===sk.proto)); renderAndSync(); refresh(); }}},rowEl);
        }
      }
      // add manual listen port
      const addRow = ch("div",{style:{display:"flex",gap:"6px",marginTop:"6px"}},s1);
      const fStyle={padding:"4px 6px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"};
      const pIn=ch("input",{type:"number",placeholder:"port",style:Object.assign({width:"80px"},fStyle)},addRow);
      const prSel=ch("select",{style:fStyle},addRow);
      ch("option",{value:"tcp",text:"tcp"},prSel); ch("option",{value:"udp",text:"udp"},prSel);
      ch("button",{text:"+ ポート開放",style:{padding:"4px 10px",fontSize:"11px",cursor:"pointer",background:"var(--green)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ const pv=+pIn.value; if(!pv){toast("ポート番号を入力","err");return;} obj.listen_ports.push({port:pv,proto:prSel.value}); renderAndSync(); refresh(); toast(`${prSel.value}/${pv} を開放`,"ok"); }}},addRow);

      // --- Host firewall ---
      const s2 = ch("div",{class:"sub-section"},body);
      const hHead=ch("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},s2);
      ch("h4",{text:"ホストファイアウォール (受信制御)",style:{margin:0}},hHead);
      const tgL=ch("label",{style:{display:"flex",gap:"4px",alignItems:"center",cursor:"pointer",fontSize:"11px"}},hHead);
      const tg=ch("input",{type:"checkbox"},tgL); tg.checked=!!obj.firewall.enabled;
      ch("span",{text:obj.firewall.enabled?"有効":"無効"},tgL);
      tg.addEventListener("change",()=>{ obj.firewall.enabled=tg.checked; renderAndSync(); refresh(); });
      if(obj.firewall.enabled){
        const defRow=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",margin:"6px 0",fontSize:"11px"}},s2);
        ch("span",{text:"デフォルト受信:"},defRow);
        const defSel=ch("select",{style:fStyle},defRow);
        ch("option",{value:"allow",text:"allow (許可)"},defSel);
        ch("option",{value:"deny",text:"deny (遮断)"},defSel);
        defSel.value=obj.firewall.default_inbound||"allow";
        defSel.addEventListener("change",()=>{ obj.firewall.default_inbound=defSel.value; renderAndSync(); refresh(); });
        // rules
        ch("div",{text:"ルール (上から順に評価):",style:{fontSize:"10px",color:"var(--text-dim)",marginTop:"4px"}},s2);
        (obj.firewall.rules||[]).forEach((r,i)=>{
          const rr=ch("div",{style:{display:"flex",alignItems:"center",gap:"6px",padding:"3px 6px",fontSize:"11px",fontFamily:"var(--mono)"}},s2);
          ch("span",{text:`${i+1}.`,style:{color:"var(--text-dim)"}},rr);
          ch("span",{text:`${r.proto||"any"}/${r.port!=null?r.port:"any"}`,style:{minWidth:"80px"}},rr);
          ch("span",{text:r.action,style:{color:r.action==="allow"?"var(--green)":"var(--red)",fontWeight:"700",minWidth:"50px"}},rr);
          ch("button",{text:"✕",style:{padding:"1px 6px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
            on:{click:()=>{ obj.firewall.rules.splice(i,1); renderAndSync(); refresh(); }}},rr);
        });
        const arRow=ch("div",{style:{display:"flex",gap:"6px",marginTop:"6px",flexWrap:"wrap"}},s2);
        const arPort=ch("input",{type:"number",placeholder:"port",style:Object.assign({width:"70px"},fStyle)},arRow);
        const arProto=ch("select",{style:fStyle},arRow);
        ch("option",{value:"any",text:"any"},arProto);ch("option",{value:"tcp",text:"tcp"},arProto);ch("option",{value:"udp",text:"udp"},arProto);
        const arAct=ch("select",{style:fStyle},arRow);
        ch("option",{value:"allow",text:"allow"},arAct);ch("option",{value:"deny",text:"deny"},arAct);
        ch("button",{text:"+ ルール追加",style:{padding:"4px 10px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
          on:{click:()=>{ const pv=arPort.value===""?null:+arPort.value; obj.firewall.rules.push({port:pv,proto:arProto.value,action:arAct.value}); renderAndSync(); refresh(); }}},arRow);
      }
      ch("div",{text:"💡 待ち受けていないポート宛は『接続拒否』、ホストFWで遮断したポートは『FW遮断』として通信テストで検出されます。",style:{fontSize:"10px",color:"var(--text-mute)",padding:"8px 4px",lineHeight:"1.4"}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

// Container manager — networks + containers + published ports (container networking)
function showContainerManager(id){
  const obj = Cfg.byId("servers", id);
  if(!obj) return;
  obj.container_networks = obj.container_networks || [];
  obj.containers = obj.containers || [];
  openDialog(`🐳 コンテナネットワーク — ${obj.label||id}`, (body)=>{
    const fStyle={padding:"4px 6px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",fontFamily:"var(--mono)"};
    function refresh(){
      body.innerHTML = "";
      helpBox(body, "コンテナホストの使い方", [
        "これは何: 1台のホスト上で複数のコンテナを動かす環境(Docker相当)。",
        "手順:",
        "1. 『コンテナネットワーク』でブリッジ等を作成(例: bridge0, 172.18.0.0/16)。",
        "2. 『+コンテナ追加』でコンテナを作成し、イメージ名(nginx:latest等)を設定。",
        "3. コンテナを所属させるネットワークを選択、IPを設定。",
        "4. ホストOSのポート → コンテナ内ポート の『ポートマッピング』を設定(例 8080→80)。",
        "5. 公開ポートは通信テストの宛先になります(他ホストから host:port で到達)。",
        "ポイント: 既存のdocker-compose.ymlは『📋 docker-compose 取込/書出』で一括取込可。",
        "サービス設定はサーバ本体の🔌ポート/ファイアウォールで(コンテナの公開ポートは自動でホストのlistenにマップ)。"
      ], false);
      // --- Container networks ---
      const s1=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"コンテナネットワーク"},s1);
      (obj.container_networks||[]).forEach((n,i)=>{
        const row=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"4px"}},s1);
        const nm=ch("input",{type:"text",value:n.name||"",placeholder:"net名",style:Object.assign({flex:"1"},fStyle)},row);
        nm.addEventListener("change",()=>{ n.name=nm.value; renderAndSync(); });
        const dv=ch("select",{style:fStyle},row);
        ["bridge","overlay","host","macvlan"].forEach(d=>ch("option",{value:d,text:d},dv)); dv.value=n.driver||"bridge";
        dv.addEventListener("change",()=>{ n.driver=dv.value; renderAndSync(); });
        const sn=ch("input",{type:"text",value:n.subnet||"",placeholder:"172.18.0.0/16",style:Object.assign({flex:"1"},fStyle)},row);
        sn.addEventListener("change",()=>{ n.subnet=sn.value; renderAndSync(); });
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px",fontSize:"10px"},
          on:{click:()=>{ obj.container_networks.splice(i,1); renderAndSync(); refresh(); }}},row);
      });
      ch("button",{text:"+ ネットワーク追加",style:{padding:"4px 10px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700",marginTop:"2px"},
        on:{click:()=>{ obj.container_networks.push({name:"bridge"+(obj.container_networks.length),driver:"bridge",subnet:"172.18.0.0/16"}); renderAndSync(); refresh(); }}},s1);

      // --- Containers ---
      const s2=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"コンテナ"},s2);
      const netNames=(obj.container_networks||[]).map(n=>n.name);
      (obj.containers||[]).forEach((c,i)=>{
        const card=ch("div",{style:{border:"1px solid var(--border)",borderRadius:"5px",padding:"6px",marginBottom:"6px",background:"var(--bg2)"}},s2);
        const hd=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center"}},card);
        ch("span",{text:(c.status||"running")==="running"?"🟢":"⚪",style:{fontSize:"11px"}},hd);
        const nm=ch("input",{type:"text",value:c.name||"",placeholder:"name",style:Object.assign({width:"100px"},fStyle)},hd);
        nm.addEventListener("change",()=>{ c.name=nm.value; renderAndSync(); });
        const img=ch("input",{type:"text",value:c.image||"",placeholder:"image (nginx:latest)",style:Object.assign({flex:"1"},fStyle)},hd);
        img.addEventListener("change",()=>{ c.image=img.value; renderAndSync(); });
        ch("button",{text:(c.status||"running")==="running"?"停止":"起動",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"},
          on:{click:()=>{ c.status=(c.status||"running")==="running"?"stopped":"running"; renderAndSync(); refresh(); }}},hd);
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ obj.containers.splice(i,1); renderAndSync(); refresh(); }}},hd);
        // network attachment
        const netRow=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginTop:"4px"}},card);
        ch("span",{text:"NW:",style:{fontSize:"10px",color:"var(--text-dim)"}},netRow);
        const netSel=ch("select",{style:fStyle},netRow);
        ch("option",{value:"",text:"-"},netSel);
        for(const nn of netNames) ch("option",{value:nn,text:nn},netSel);
        netSel.value=(c.networks&&c.networks[0]&&c.networks[0].net)||"";
        const ipIn=ch("input",{type:"text",value:(c.networks&&c.networks[0]&&c.networks[0].ip)||"",placeholder:"172.18.0.2",style:Object.assign({width:"110px"},fStyle)},netRow);
        function saveNet(){ c.networks=[{net:netSel.value,ip:ipIn.value}]; renderAndSync(); }
        netSel.addEventListener("change",saveNet); ipIn.addEventListener("change",saveNet);
        // port mappings
        const pmHead=ch("div",{style:{fontSize:"10px",color:"var(--text-dim)",marginTop:"4px"}},card);
        pmHead.textContent="ポート公開 (host:container):";
        (c.port_mappings||[]).forEach((pm,pi)=>{
          const pr=ch("div",{style:{display:"flex",gap:"4px",alignItems:"center",fontSize:"10px",fontFamily:"var(--mono)",marginTop:"2px"}},card);
          ch("span",{text:`${pm.host_port} : ${pm.container_port} / ${pm.proto||"tcp"}`,style:{flex:"1"}},pr);
          ch("button",{text:"✕",style:{padding:"0 5px",cursor:"pointer",fontSize:"9px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
            on:{click:()=>{ c.port_mappings.splice(pi,1); renderAndSync(); refresh(); }}},pr);
        });
        const addPm=ch("div",{style:{display:"flex",gap:"4px",marginTop:"3px"}},card);
        const hp=ch("input",{type:"number",placeholder:"host",style:Object.assign({width:"56px"},fStyle)},addPm);
        const cp=ch("input",{type:"number",placeholder:"cont",style:Object.assign({width:"56px"},fStyle)},addPm);
        ch("button",{text:"+ 公開",style:{padding:"1px 8px",cursor:"pointer",fontSize:"10px",background:"var(--green)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
          on:{click:()=>{ if(!hp.value||!cp.value){toast("ポートを入力","err");return;} c.port_mappings=c.port_mappings||[]; c.port_mappings.push({host_port:+hp.value,container_port:+cp.value,proto:"tcp"}); renderAndSync(); refresh(); }}},addPm);
      });
      ch("button",{text:"+ コンテナ追加",style:{width:"100%",padding:"6px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
        on:{click:()=>{ obj.containers.push({name:"ctr"+(obj.containers.length+1),image:"nginx:latest",status:"running",networks:[],port_mappings:[]}); renderAndSync(); refresh(); }}},s2);
      // docker-compose import/export
      ch("button",{text:"📋 docker-compose 取込 / 書出",style:{width:"100%",padding:"6px",fontSize:"11px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--cyan)",color:"var(--cyan)",borderRadius:"4px",fontWeight:"700",marginTop:"6px"},
        on:{click:()=>showComposeDialog(id, refresh)}},s2);
      ch("div",{text:"💡 公開ポート(host_port)はサーバの待ち受けポートとして通信シミュレーションの宛先になります。",style:{fontSize:"10px",color:"var(--text-mute)",padding:"6px 2px"}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

// ====== docker-compose 取込 / 書出 ======
// Indentation-based parser for the common docker-compose structure (services + networks).
function parseDockerCompose(text){
  const lines = String(text).replace(/\t/g,"  ").split(/\r?\n/);
  const indent = (s)=> s.match(/^ */)[0].length;
  const result = { services:[], networks:[] };
  let section=null;       // "services" | "networks"
  let curSvc=null, curNet=null, sub=null;  // sub: "ports"|"networks"|"environment"|"depends_on"|"ipam"
  for(let raw of lines){
    if(!raw.trim() || /^\s*#/.test(raw)) continue;
    const ind = indent(raw);
    const line = raw.trim();
    if(ind===0){
      if(/^services:/.test(line)){ section="services"; curSvc=null; }
      else if(/^networks:/.test(line)){ section="networks"; curNet=null; }
      else { section=null; }
      continue;
    }
    if(section==="services"){
      if(ind===2 && /^[\w.-]+:\s*$/.test(line)){
        curSvc={ name:line.replace(/:\s*$/,""), image:"", ports:[], networks:[], environment:[], depends_on:[], status:"running" };
        result.services.push(curSvc); sub=null; continue;
      }
      if(!curSvc) continue;
      if(ind===4){
        const m=line.match(/^([\w.-]+):\s*(.*)$/);
        if(m){
          const key=m[1], val=m[2];
          if(key==="image") curSvc.image=val.replace(/^["']|["']$/g,"");
          else if(key==="ports"||key==="networks"||key==="environment"||key==="depends_on"||key==="expose"){ sub=key; if(val){ /* inline */ } }
          else if(key==="ipam") sub="ipam";
          else sub=null;
        }
        continue;
      }
      if(ind>=6 && /^- /.test(line)){
        const item=line.replace(/^- /,"").replace(/^["']|["']$/g,"").trim();
        if(sub==="ports"||sub==="expose"){
          const pm=item.replace(/^["']|["']$/g,"");
          const mm=pm.match(/^(?:[\d.]+:)?(\d+):(\d+)(?:\/(tcp|udp))?$/) || pm.match(/^(\d+)(?:\/(tcp|udp))?$/);
          if(mm){ if(mm.length>=3 && mm[2]!=null && /^\d+$/.test(mm[2])) curSvc.ports.push({host:+mm[1],container:+mm[2],proto:mm[3]||"tcp"}); else curSvc.ports.push({host:+mm[1],container:+mm[1],proto:mm[2]||"tcp"}); }
        } else if(sub==="networks") curSvc.networks.push(item);
        else if(sub==="depends_on") curSvc.depends_on.push(item);
        else if(sub==="environment") curSvc.environment.push(item);
      }
    } else if(section==="networks"){
      if(ind===2 && /^[\w.-]+:\s*$/.test(line)){ curNet={ name:line.replace(/:\s*$/,""), driver:"bridge", subnet:"" }; result.networks.push(curNet); sub=null; continue; }
      if(!curNet) continue;
      const dm=line.match(/^driver:\s*(.+)$/); if(dm){ curNet.driver=dm[1].trim(); continue; }
      const sm=line.match(/subnet:\s*(.+)$/); if(sm){ curNet.subnet=sm[1].trim().replace(/^["']|["']$/g,""); }
    }
  }
  return result;
}
function applyComposeToServer(obj, parsed){
  obj.container_networks = obj.container_networks || [];
  obj.containers = obj.containers || [];
  // merge networks
  for(const n of parsed.networks){
    if(!obj.container_networks.some(x=>x.name===n.name))
      obj.container_networks.push({ name:n.name, driver:n.driver||"bridge", subnet:n.subnet||"172.18.0.0/16" });
  }
  // ensure any network referenced by a service exists
  for(const s of parsed.services){
    for(const nn of (s.networks||[])){
      if(!obj.container_networks.some(x=>x.name===nn)) obj.container_networks.push({name:nn,driver:"bridge",subnet:"172.18.0.0/16"});
    }
  }
  // services → containers
  for(const s of parsed.services){
    const c = {
      name:s.name, image:s.image||"nginx:latest", status:s.status||"running",
      networks: (s.networks||[]).map(nn=>({net:nn,ip:""})),
      port_mappings: (s.ports||[]).map(p=>({host_port:p.host,container_port:p.container,proto:p.proto||"tcp"})),
      depends_on: s.depends_on||[], environment: s.environment||[]
    };
    const ex = obj.containers.findIndex(x=>x.name===s.name);
    if(ex>=0) obj.containers[ex]=c; else obj.containers.push(c);
  }
}
function serverToComposeText(obj){
  let out = 'services:\n';
  for(const c of (obj.containers||[])){
    out += '  '+(c.name||"svc")+':\n';
    out += '    image: '+(c.image||"nginx:latest")+'\n';
    if((c.port_mappings||[]).length){
      out += '    ports:\n';
      for(const p of c.port_mappings) out += '      - "'+p.host_port+':'+p.container_port+(p.proto&&p.proto!=="tcp"?"/"+p.proto:"")+'"\n';
    }
    const nets=(c.networks||[]).map(n=>n.net).filter(Boolean);
    if(nets.length){ out += '    networks:\n'; for(const n of nets) out += '      - '+n+'\n'; }
    if((c.depends_on||[]).length){ out += '    depends_on:\n'; for(const d of c.depends_on) out += '      - '+d+'\n'; }
    if((c.environment||[]).length){ out += '    environment:\n'; for(const e of c.environment) out += '      - '+e+'\n'; }
  }
  if((obj.container_networks||[]).length){
    out += 'networks:\n';
    for(const n of obj.container_networks){
      out += '  '+(n.name||"bridge")+':\n';
      out += '    driver: '+(n.driver||"bridge")+'\n';
      if(n.subnet){ out += '    ipam:\n      config:\n        - subnet: '+n.subnet+'\n'; }
    }
  }
  return out;
}
function showComposeDialog(serverId, onDone){
  const obj = Cfg.byId("servers", serverId); if(!obj) return;
  openDialog("📋 docker-compose 取込 / 書出", (body)=>{
    helpBox(body, "docker-compose とは？", [
      "これは何: 複数コンテナの構成(イメージ/ポート/ネットワーク/依存)を1ファイルで定義する仕組み。",
      "取込: 既存のdocker-compose.yml(services/networks)を貼り付けて『取込』すると、このホストのコンテナとして反映されます。",
      "書出: 現在のコンテナ構成をdocker-compose形式で出力します。",
      "例: services.web.image / ports(\"8080:80\") / networks / depends_on を解釈します。"
    ], true);
    const ta = ch("textarea",{style:{width:"100%",height:"240px",fontFamily:"var(--mono)",fontSize:"11px",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:"4px",padding:"8px",boxSizing:"border-box"},
      placeholder:'services:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n    networks: [frontend]\nnetworks:\n  frontend:\n    driver: bridge'},body);
    ta.value = (obj.containers||[]).length ? serverToComposeText(obj) : "";
    const btns = ch("div",{style:{display:"flex",gap:"8px",marginTop:"10px"}},body);
    ch("button",{text:"⬇ 取込 (compose→コンテナ)",style:{flex:"1",padding:"8px",fontSize:"11px",fontWeight:"700",cursor:"pointer",background:"var(--green)",border:"none",color:"#fff",borderRadius:"5px"},
      on:{click:()=>{
        try{
          const parsed=parseDockerCompose(ta.value);
          if(!parsed.services.length){ toast("servicesが見つかりません","err"); return; }
          pushUndo(); applyComposeToServer(obj, parsed); renderAndSync();
          toast(`取込完了: ${parsed.services.length}サービス / ${parsed.networks.length}ネットワーク`,"ok");
          closeDialog(); if(onDone) onDone();
        }catch(e){ toast("取込エラー: "+e.message,"err"); }
      }}},btns);
    ch("button",{text:"⬆ 書出 (コンテナ→compose)",style:{flex:"1",padding:"8px",fontSize:"11px",fontWeight:"700",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"5px"},
      on:{click:()=>{ ta.value = serverToComposeText(obj); toast("現在の構成をcompose形式で出力しました","ok"); }}},btns);
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

// Hypervisor / vCenter manager — ESXi host with VMs, vSwitches/port groups, datastores
function showHypervisorManager(id){
  const obj = Cfg.byId("servers", id);
  if(!obj) return;
  obj.hypervisor = obj.hypervisor || { type:"esxi", vms:[], vswitches:[], datastores:[] };
  const hv = obj.hypervisor;
  openDialog(`🖥 仮想基盤 (vCenter/ESXi) — ${obj.label||id}`, (body)=>{
    const fStyle={padding:"4px 6px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",fontFamily:"var(--mono)"};
    function refresh(){
      body.innerHTML = "";
      helpBox(body, "vCenter/ESXi(仮想基盤)の使い方", [
        "これは何: 1台の物理サーバ上で複数の仮想マシン(VM)を動かす仮想化基盤(VMware ESXi)。",
        "手順:",
        "1. 種別を選択(ESXi/KVM/Hyper-V)。",
        "2. vSwitch/ポートグループでVM用の仮想ネットワークを定義。",
        "3. 『+VM追加』でこのホスト内にVMを作成(=サーバとして扱われ、ホストにバインドされます)。",
        "4. データストアで仮想ディスク領域を定義(別サーバをストレージとして指定可能)。",
        "5. VMの『マイグレーション』でホスト間の移動シミュレーション。",
        "ポイント: VMは『このホスト内に』作成され、ホスト経由で物理ネットワークへ通信します。"
      ], false);
      // host summary
      const hsum=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"ハイパーバイザ"},hsum);
      const hr=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center"}},hsum);
      ch("span",{text:"種別:",style:{fontSize:"10px",color:"var(--text-dim)"}},hr);
      const tSel=ch("select",{style:fStyle},hr);
      ["esxi","kvm","hyper-v","proxmox"].forEach(x=>ch("option",{value:x,text:x},tSel)); tSel.value=hv.type||"esxi";
      tSel.addEventListener("change",()=>{ hv.type=tSel.value; renderAndSync(); });
      // capacity
      addField(hr,"","",""); // spacer noop
      // vSwitches / port groups
      const sw=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"仮想スイッチ / ポートグループ"},sw);
      (hv.vswitches||[]).forEach((vs,i)=>{
        const row=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"3px"}},sw);
        const nm=ch("input",{type:"text",value:vs.name||"",placeholder:"vSwitch0",style:Object.assign({width:"110px"},fStyle)},row);
        nm.addEventListener("change",()=>{ vs.name=nm.value; renderAndSync(); });
        const pg=ch("input",{type:"text",value:(vs.portgroups||[]).join(", "),placeholder:"PG-Web, PG-DB",style:Object.assign({flex:"1"},fStyle)},row);
        pg.addEventListener("change",()=>{ vs.portgroups=pg.value.split(",").map(x=>x.trim()).filter(Boolean); renderAndSync(); });
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ hv.vswitches.splice(i,1); renderAndSync(); refresh(); }}},row);
      });
      ch("button",{text:"+ vSwitch追加",style:{padding:"3px 10px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ hv.vswitches.push({name:"vSwitch"+(hv.vswitches.length),portgroups:["VM Network"]}); renderAndSync(); refresh(); }}},sw);
      // VMs (each VM is a full server object pinned to this host via server.host)
      migrateLegacyVms(obj);
      const vmsec=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"仮想マシン (VM)"},vmsec);
      ch("div",{text:"VMはサーバとして扱われます。「詳細設定」でインターフェース・IP・サービス等を設定できます。",
        style:{fontSize:"10px",color:"var(--text-dim)",padding:"2px 0 6px",lineHeight:"1.4"}},vmsec);
      const pgOptions=[].concat(...(hv.vswitches||[]).map(v=>v.portgroups||[]));
      const vmList = vmServersOf(obj.id);
      vmList.forEach((vm)=>{
        const on = (vm.status||"running")==="running";
        const card=ch("div",{style:{border:"1px solid var(--border)",borderRadius:"5px",padding:"6px",marginBottom:"5px",background:"var(--bg2)"}},vmsec);
        const hd=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}},card);
        ch("span",{text:on?"🟢":"⚪"},hd);
        const nm=ch("input",{type:"text",value:vm.label||vm.id,placeholder:"vm名",style:Object.assign({width:"100px"},fStyle)},hd);
        nm.addEventListener("change",()=>{ vm.label=nm.value; renderAndSync(); });
        const cpu=ch("input",{type:"number",value:vm.vcpu||2,title:"vCPU",style:Object.assign({width:"42px"},fStyle)},hd);
        cpu.addEventListener("change",()=>{ vm.vcpu=+cpu.value; renderAndSync(); });
        ch("span",{text:"vCPU",style:{fontSize:"9px",color:"var(--text-dim)"}},hd);
        const ram=ch("input",{type:"number",value:vm.ram_gb||4,title:"RAM(GB)",style:Object.assign({width:"42px"},fStyle)},hd);
        ram.addEventListener("change",()=>{ vm.ram_gb=+ram.value; renderAndSync(); });
        ch("span",{text:"GB",style:{fontSize:"9px",color:"var(--text-dim)"}},hd);
        // memory write workload — affects live-migration convergence (heavy = pre-copy may fail)
        ch("span",{text:"負荷",style:{fontSize:"9px",color:"var(--text-dim)"}},hd);
        const wlSel=ch("select",{title:"メモリ書込負荷(マイグレーション収束に影響)",style:Object.assign({width:"70px"},fStyle)},hd);
        for(const w of [["idle","低"],["normal","中"],["heavy","高"]]){ const o=ch("option",{value:w[0],text:w[1]},wlSel); if((vm.workload||"normal")===w[0])o.selected=true; }
        wlSel.addEventListener("change",()=>{ vm.workload=wlSel.value; renderAndSync(); });
        // power
        ch("button",{text:on?"停止":"起動",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"},
          on:{click:()=>{ vm.status=on?"stopped":"running"; vm.power=on?"off":"on"; renderAndSync(); refresh(); }}},hd);
        // vMotion-like LIVE migration to another ESXi host (pre-copy + stop-and-copy + resume)
        ch("button",{text:"🚚 ライブvMotion",title:"別のESXi/vCenterホストへライブマイグレーション(メモリpre-copy+TCP継続)",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"3px"},
          on:{click:()=>{
            const others=(App.config.servers||[]).filter(s=>s.hypervisor && s.id!==obj.id && s.status==="running");
            if(!others.length){ toast("移動先となる別のESXi/vCenterホストがありません","warn"); return; }
            const target = others[0];
            pushUndo();
            const mig = runLiveMigration("vm", vm.id, target.id, vm._tcp_sessions||0);
            if(mig.failed) toast(`ライブマイグレーション失敗: ${mig.reason}`,"err");
            else toast(`ライブvMotion完了: ${vm.label||vm.id} → ${target.id} (ダウンタイム${mig.downtime_ms}ms)`,"ok");
            refresh();
          }}},hd);
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ App.config.servers=App.config.servers.filter(s=>s.id!==vm.id); renderAndSync(); refresh(); }}},hd);
        // portgroup + primary IP summary
        const r2=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginTop:"4px",flexWrap:"wrap"}},card);
        ch("span",{text:"PG:",style:{fontSize:"10px",color:"var(--text-dim)"}},r2);
        const pgSel=ch("select",{style:fStyle},r2);
        ch("option",{value:"",text:"-"},pgSel);
        for(const pg of pgOptions) ch("option",{value:pg,text:pg},pgSel);
        pgSel.value=vm.portgroup||"";
        pgSel.addEventListener("change",()=>{ vm.portgroup=pgSel.value; renderAndSync(); });
        const primaryIp = (typeof elementPrimaryIp==="function") ? (elementPrimaryIp("server",vm.id,"v4")||elementPrimaryIp("server",vm.id,"v6")) : null;
        ch("span",{text:"IP: "+(primaryIp||"(未設定)"),style:{fontSize:"10px",color:"var(--text-dim)",fontFamily:"var(--mono)"}},r2);
        const svcCount=(App.config.services||[]).filter(s=>s.server===vm.id).length;
        ch("span",{text:"サービス: "+svcCount,style:{fontSize:"10px",color:"var(--text-dim)"}},r2);
        // full-config button → open the server property editor for this VM
        ch("button",{text:"🖧 詳細設定 (IF / IP / サービス)",style:{width:"100%",marginTop:"5px",padding:"5px",cursor:"pointer",fontSize:"10.5px",background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"4px",fontWeight:"700"},
          on:{click:()=>{ closeDialog(); selectElement("server", vm.id); openPropertyPanel(); }}},card);
      });
      if(!vmList.length) ch("div",{text:"(VMがありません)",style:{color:"var(--text-mute)",fontSize:"11px",padding:"4px 2px"}},vmsec);
      ch("button",{text:"+ VM追加",style:{width:"100%",padding:"6px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
        on:{click:()=>{
          pushUndo();
          const id=uid("vm");
          const n = vmServersOf(obj.id).length;
          // VM grid INSIDE the host body. Auto-grow the host so VMs visually sit within its rectangle.
          const vmW=70, vmH=38, gap=6, headerH=28, padX=10;
          const cols=3, col=n%cols, row=Math.floor(n/cols);
          const totalRows = Math.floor(n/cols)+1;
          const reqW = padX*2 + cols*vmW + (cols-1)*gap;
          const reqH = headerH + totalRows*(vmH+gap) + 8;
          if((obj.width||0) < reqW) obj.width = reqW;
          if((obj.height||0) < reqH) obj.height = reqH;
          const vx = (obj.x||0) + padX + col*(vmW+gap);
          const vy = (obj.y||0) + headerH + row*(vmH+gap);
          App.config.servers.push({ id, label:id, host:obj.id, vm:true, type:"virtual", os:"linux",
            status:"running", power:"on", vcpu:2, ram_gb:4, portgroup:(pgOptions[0]||""),
            x:vx, y:vy, width:vmW, height:vmH,
            interfaces:[{id:"eth0", ip:_autoFreeIp(), mac:genUniqueMac(), status:"up"}], gateway:"" });
          renderAndSync(); refresh();
          toast("VM追加: "+id+" (ホスト内に配置)","ok");
        }}},vmsec);
      // datastores
      const ds=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"データストア (仮想ディスク領域)"},ds);
      hv.datastores = hv.datastores || [];
      (hv.datastores||[]).forEach((d,di)=>{
        const dso = (typeof d==="string") ? { name:d.split(":")[0]||"datastore"+(di+1), capacity_gb: parseInt((d.split(":")[1]||"500"),10)||500, backing:"" } : d;
        hv.datastores[di] = dso;
        const dr=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"4px",flexWrap:"wrap"}},ds);
        const nmI=ch("input",{type:"text",value:dso.name||"",placeholder:"datastore名",style:Object.assign({width:"110px"},fStyle)},dr);
        nmI.addEventListener("change",()=>{ dso.name=nmI.value; renderAndSync(); });
        const capI=ch("input",{type:"number",value:dso.capacity_gb||500,style:Object.assign({width:"70px"},fStyle)},dr);
        capI.addEventListener("change",()=>{ dso.capacity_gb=+capI.value||500; renderAndSync(); });
        ch("span",{text:"GB",style:{fontSize:"9px",color:"var(--text-dim)"}},dr);
        ch("span",{text:"ストレージサーバ:",style:{fontSize:"9px",color:"var(--text-dim)"}},dr);
        const bSel=ch("select",{style:Object.assign({flex:"1",minWidth:"120px"},fStyle)},dr);
        ch("option",{value:"",text:"(ローカル)"},bSel);
        for(const s of (App.config.servers||[])){
          if(s.id===obj.id||s.vm) continue;
          const o=ch("option",{value:s.id,text:(s.label||s.id)+" ("+(s.type||"server")+")"},bSel);
          if(dso.backing===s.id) o.selected=true;
        }
        bSel.addEventListener("change",()=>{ dso.backing=bSel.value; renderAndSync(); });
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ hv.datastores.splice(di,1); renderAndSync(); refresh(); }}},dr);
      });
      ch("button",{text:"+ データストア追加",style:{padding:"4px 10px",fontSize:"10px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ hv.datastores.push({name:"datastore"+(hv.datastores.length+1),capacity_gb:500,backing:""}); renderAndSync(); refresh(); }}},ds);
      // capacity summary
      const vmsForCap = vmServersOf(obj.id);
      const usedCpu=vmsForCap.reduce((s,v)=>s+(+v.vcpu||0),0);
      const usedRam=vmsForCap.reduce((s,v)=>s+(+v.ram_gb||0),0);
      ch("div",{text:`割当: ${vmsForCap.length} VM / ${usedCpu} vCPU / ${usedRam} GB RAM`,
        style:{fontSize:"11px",color:"var(--text-dim)",padding:"8px 2px",fontFamily:"var(--mono)"}},body);
      ch("div",{text:"💡 VMはサーバとして通信シミュレーションの送信元/到達先になります。IF/IP未配線でもホスト経由で同一PG/サブネットに到達します。",style:{fontSize:"10px",color:"var(--text-mute)",padding:"2px",lineHeight:"1.4"}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

// AWS environment manager — VPC / Subnet / Security Group / Internet Gateway
// ====== LEARNING / HELP PANEL ======
// Explains how to reproduce each fault and perform key operations. Sections are collapsible
// so users can show/hide explanations and learn interactively.
var LEARN_TOPICS = [
  { id:"flap-loop", icon:"🔁", title:"MACフラッピング① — L2ループ", body:[
    "原因: STPが無効/未対応の冗長リンクでブロードキャストが無限ループする。",
    "再現手順:",
    "1. スイッチを2台配置し、接続モードで2本のリンクで相互接続する。",
    "2. 両スイッチのプロパティで STPモード を「off」にする(またはSTP非対応にする)。",
    "3. どちらかのスイッチ配下に端末(サーバ)を接続する。",
    "4. 数秒待つと上部に異常バナーが出て、重大度・CPUが上昇し、ループポート間でMACが揺れる。",
    "観察: %SW_MATM-4-MACFLAP_NOTIF ログ、リンクの赤色化、隣接スイッチへのストーム波及。",
    "収束: 片方のリンクを削除する / STPを有効化する / BPDU Guardを有効化する。"
  ]},
  { id:"flap-dup", icon:"👯", title:"MACフラッピング② — MACアドレス重複(ループ以外)", body:[
    "原因: 同一VLAN内で、同じMACアドレスを持つ機器が複数の異なるポートに存在する。",
    "(仮想NICのMACコピー、テンプレートからの複製で発生しやすい)",
    "再現手順:",
    "1. サーバを2台用意し、同じスイッチの別ポートに接続する(同一VLAN)。",
    "2. 両サーバのインターフェースMACを同一の値に設定する。",
    "   (例: 両方とも 00:50:56:aa:bb:cc にする)",
    "3. 数秒待つと、そのMACが2ポート間でフラップし duplicate として検知される。",
    "観察: ループ無しでもMACFLAPログが出る。CPU上昇はループより緩やか、ストーム波及は限定的。",
    "ヒント: Ctrl+Cで複製したサーバはMACが自動再生成されるため、意図的に同じMACにする必要があります。"
  ]},
  { id:"flap-roam", icon:"📶", title:"MACフラッピング③ — 無線ローミング(無害な揺れ)", body:[
    "原因: 端末がAP/スイッチ間を移動し、短時間で学習ポートが変わる。多くは正常動作で無害。",
    "ポイント: roaming は重大度が上がりにくく、通信影響もほぼ無い。loop/duplicate と区別して扱われます。"
  ]},
  { id:"storm", icon:"🌊", title:"ブロードキャストストームの波及", body:[
    "ループ起因のストームは同一L2ドメイン全体に氾濫し、間接接続の機器も影響を受ける。",
    "再現手順: 「MACフラッピング①」を作り、ループスイッチの先にさらにスイッチ→サーバを数珠つなぎにする。",
    "観察: 発生源100% → 1ホップ先 → 2ホップ先 と距離減衰しながら波及。ARPブロードキャストが消失し、",
    "      遠くの機器同士の通信もタイムアウトする(通信テストで確認)。"
  ]},
  { id:"ipdup", icon:"⚠️", title:"IPアドレス重複", body:[
    "原因: 同一サブネット内に同じIPを持つ機器が複数存在する。",
    "再現手順:",
    "1. 同一ネットワークのサーバ2台に、同じIP(例 10.0.0.10/24)を設定する。",
    "2. 両機器に「⚠ IP重複」バッジが表示され、ステータスバーに警告が出る。",
    "3. その重複IP宛て/発の通信テストを行うとエラーになる。",
    "補足: FHRP/VRRPの仮想IP(意図的な共有)は競合扱いされません。"
  ]},
  { id:"arp", icon:"📇", title:"ARP / GARP", body:[
    "ARP: 通信前に宛先(または既定GW)のMACを解決する。通信テストのログに who-has / is-at が出る。",
    "GARP: サーバのプロパティの「📢 GARP送信」で、自IP→MACを一斉通知。",
    "  ・近隣のARPキャッシュを更新する。",
    "  ・同一IPの別機器があれば %IP-DUP でIP重複を検知する。",
    "障害との関係: ストーム中はARPブロードキャストが消失し『ARP解決失敗』で通信不能になります。"
  ]},
  { id:"stp", icon:"👑", title:"STP ルートブリッジの選定", body:[
    "ルートは Bridge ID 最小(プライオリティ→MAC最小)で決まる。",
    "操作: スイッチのプロパティ →「STP」セクションで、",
    "  ・ブリッジプライオリティを設定する(低いほど優先 / 4096刻み)。",
    "  ・「👑 ルートブリッジにする」で最小プライオリティを自動設定。",
    "  ・プライオリティ未指定なら、MACアドレス最小のスイッチが自動でルートになる。",
    "表示: ルートには👑 ROOT BRIDGEが常時表示。「STP表示」ボタンでブロックポートも可視化。"
  ]},
  { id:"lacp", icon:"🔗", title:"リンクアグリゲーション (LACP / ボンディング)", body:[
    "複数の物理リンクを束ねて1本の論理リンクにし、帯域増加と冗長化を行う。",
    "操作: 機器/サーバのプロパティ →「インターフェース」→「🔗 ボンディング/LACP設定」で、",
    "  ・モードを選択: LACP(802.3ad / 動的), static(固定), active-backup(冗長のみ) など。",
    "  ・束ねるメンバーポートを選ぶ。LACPなら相手と自動ネゴシエーション。",
    "可視化: 束ねたリンクは太線+「LAG/LACP」バッジで表示。LACPは Actor/Partner の状態を表示。"
  ]},
  { id:"multisel", icon:"⬚", title:"複数選択(まとめて移動・削除)", body:[
    "操作:",
    "  ・ツールバーの「複数選択」ボタンを押す → 空白をドラッグして範囲選択(PowerPoint風)。",
    "  ・または Shift+クリック で要素を1つずつ選択に追加/解除。",
    "  ・選択した複数要素は、どれかをドラッグすると まとめて移動。",
    "  ・Delete キーで まとめて削除。",
    "  ・Esc または 「複数選択」再押下で解除。"
  ]},
  { id:"frames", icon:"▭", title:"VPC / vPC / K8s 枠の操作", body:[
    "移動: 枠の本体(空き部分)またはラベルをドラッグ → 中の機器ごと移動。",
    "サイズ変更: 枠の右下のハンドルをドラッグ → 枠を拡大(中身は自動で内包)。",
    "AWS: ☁ボタンでVPC/サブネット/SG/EC2を管理。VPC削除も可能。",
    "K8s: ☸ボタンでクラスタ/ノード/Pod/Serviceを管理。"
  ]}
];
// A collapsible beginner-friendly help box to embed at the top of managers/sections.
function helpBox(parent, title, lines, openByDefault){
  const box = ch("div",{style:{border:"1px solid var(--accent)",borderRadius:"6px",margin:"0 0 10px",background:"rgba(88,166,255,0.05)",overflow:"hidden"}},parent);
  const head = ch("div",{style:{display:"flex",alignItems:"center",gap:"6px",padding:"6px 10px",cursor:"pointer",fontWeight:"700",fontSize:"11.5px",color:"var(--accent)"}},box);
  ch("span",{text:"💡"},head);
  ch("span",{text:title,style:{flex:"1"}},head);
  const chev=ch("span",{text:openByDefault?"▲":"▼",style:{fontSize:"10px"}},head);
  const bodyEl=ch("div",{style:{display:openByDefault?"block":"none",padding:"6px 12px 10px",fontSize:"11px",lineHeight:"1.7",color:"var(--text)"}},box);
  for(const ln of lines){
    const isHead=/^(これは何|手順|ポイント|注意|例):/.test(ln.trim());
    const isStep=/^[0-9]+\./.test(ln.trim());
    ch("div",{text:ln,style:{paddingLeft:isStep?"12px":"0",fontWeight:isHead?"700":"400",color:isHead?"var(--accent)":"var(--text)",margin:isHead?"3px 0 1px":"1px 0"}},bodyEl);
  }
  head.addEventListener("click",()=>{ const o=bodyEl.style.display==="none"; bodyEl.style.display=o?"block":"none"; chev.textContent=o?"▲":"▼"; });
  return box;
}
function showLearnPanel(openTopicId){
  openDialog("📖 学習モード — 障害の発生手順と操作ガイド", (body)=>{
    ch("div",{ text:"各トピックをクリックすると説明を表示/非表示できます。実際に手を動かして障害を再現し、挙動を観察しながら学習できます。",
      style:{fontSize:"12px",color:"var(--text-dim)",lineHeight:"1.6",marginBottom:"10px"} }, body);
    // expand/collapse all
    const ctrl = ch("div",{style:{display:"flex",gap:"6px",marginBottom:"10px"}}, body);
    ch("button",{text:"すべて開く",style:{padding:"4px 10px",fontSize:"11px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"4px"},
      on:{click:()=>{ body.querySelectorAll(".learn-body").forEach(e=>e.style.display="block"); }}}, ctrl);
    ch("button",{text:"すべて閉じる",style:{padding:"4px 10px",fontSize:"11px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"4px"},
      on:{click:()=>{ body.querySelectorAll(".learn-body").forEach(e=>e.style.display="none"); }}}, ctrl);
    for(const topic of LEARN_TOPICS){
      const card = ch("div",{style:{border:"1px solid var(--border)",borderRadius:"6px",marginBottom:"6px",overflow:"hidden"}}, body);
      const head = ch("div",{style:{display:"flex",alignItems:"center",gap:"8px",padding:"8px 10px",cursor:"pointer",background:"var(--bg3)",fontWeight:"700",fontSize:"12px"}}, card);
      ch("span",{text:topic.icon,style:{fontSize:"15px"}}, head);
      ch("span",{text:topic.title,style:{flex:"1"}}, head);
      const chevron = ch("span",{text:"▼",style:{fontSize:"10px",color:"var(--text-mute)"}}, head);
      const _isOpen = (typeof openTopicId==="string" && openTopicId===topic.id);
      const bodyEl = ch("div",{class:"learn-body",style:{display:_isOpen?"block":"none",padding:"8px 12px",fontSize:"11.5px",lineHeight:"1.7",color:"var(--text)",background:"var(--bg)"}}, card);
      if(_isOpen) chevron.textContent="▲";
      for(const line of topic.body){
        const isStep = /^[0-9]+\./.test(line.trim());
        const isHead = /^(原因|再現手順|観察|操作|収束|表示|補足|ヒント|ポイント|障害との関係):/.test(line.trim());
        ch("div",{ text:line,
          style:{ paddingLeft:isStep?"12px":"0", fontWeight:isHead?"700":"400",
            color:isHead?"var(--accent)":"var(--text)", margin:isHead?"4px 0 2px":"1px 0" } }, bodyEl);
      }
      head.addEventListener("click",()=>{ const open=bodyEl.style.display==="none"; bodyEl.style.display=open?"block":"none"; chevron.textContent=open?"▲":"▼"; });
    }
  });
}

// Delete an AWS VPC by name/id (detaches EC2 placements, keeps the servers).
function deleteAwsVpc(vpcRef){
  const vpcs = (App.config.aws && App.config.aws.vpcs) || [];
  const vpc = vpcs.find(v=>v.name===vpcRef || v.id===vpcRef);
  if(!vpc) return;
  const ec2s = (App.config.servers||[]).filter(s=>s.aws && s.aws.vpc===vpc.name);
  const msg = ec2s.length
    ? `VPC「${vpc.name}」を削除しますか？\n配置中のEC2 ${ec2s.length}台のAWS割り当ても解除されます（サーバ自体は残ります）。`
    : `VPC「${vpc.name}」を削除しますか？`;
  if(!((typeof confirm==="function")?confirm(msg):true)) return;
  pushUndo();
  for(const s of ec2s){ delete s.aws; }
  App.config.aws.vpcs = vpcs.filter(v=>v!==vpc);
  renderAndSync(); updateStatusBar();
  toast(`VPC「${vpc.name}」を削除しました`,"ok");
}
// Delete a Kubernetes cluster by name (keeps the node servers).
function deleteK8sCluster(clRef){
  const cls = (App.config.k8s && App.config.k8s.clusters) || [];
  const cl = cls.find(c=>c.name===clRef);
  if(!cl) return;
  if(!((typeof confirm==="function")?confirm(`Kubernetesクラスタ「${cl.name}」を削除しますか？\nノードのサーバ自体は残ります。`):true)) return;
  pushUndo();
  App.config.k8s.clusters = cls.filter(c=>c!==cl);
  renderAndSync(); updateStatusBar();
  toast(`クラスタ「${cl.name}」を削除しました`,"ok");
}

function showAwsManager(focusVpc){
  App.config.aws = App.config.aws || { vpcs:[] };
  openDialog("☁ AWS 環境管理 (VPC / Subnet / Security Group)", (body)=>{
    const fStyle={padding:"4px 6px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",fontFamily:"var(--mono)"};
    let active=0;
    if(focusVpc){ const fi=(App.config.aws.vpcs||[]).findIndex(v=>v.name===focusVpc||v.id===focusVpc); if(fi>=0) active=fi; }
    function refresh(){
      body.innerHTML="";
      helpBox(body, "AWS VPCとは？ 作り方ガイド", [
        "これは何: VPC(Virtual Private Cloud)はAWS上の仮想ネットワーク。中にサブネットを切り、EC2(仮想サーバ)を配置します。",
        "手順:",
        "1. 「+ VPC」でVPCを作成し、CIDR(例 10.0.0.0/16)とリージョンを設定。",
        "2. 「+ サブネット」で用途別にサブネットを作る(public=外部公開, private=内部のみ)。",
        "3. 「+ セキュリティグループ」で通信を許可するポート/送信元を定義(インバウンド許可)。",
        "4. 「+ EC2インスタンス追加」でサーバをVPC/サブネット/SGに配置。",
        "ポイント: セキュリティグループは許可リスト方式。許可が無い通信は拒否されます(通信テストで確認可)。",
        "注意: VPC削除はEC2のAWS割り当てを解除します(サーバ自体は残ります)。"
      ], true);
      const vpcs=App.config.aws.vpcs;
      const top=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"8px"}},body);
      ch("span",{text:"VPC:",style:{fontSize:"11px"}},top);
      const sel=ch("select",{style:fStyle},top);
      vpcs.forEach((v,i)=>{const o=ch("option",{value:String(i),text:`${v.name} (${v.cidr})`},sel);if(i===active)o.selected=true;});
      sel.addEventListener("change",()=>{active=+sel.value;refresh();});
      ch("button",{text:"+ VPC",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ vpcs.push({id:uid("vpc"),name:"vpc-"+(vpcs.length+1),cidr:"10.0.0.0/16",region:"ap-northeast-1",igw:true,subnets:[],security_groups:[]}); active=vpcs.length-1; renderAndSync(); refresh(); }}},top);
      if(vpcs.length){
        ch("button",{text:"🗑 VPC削除",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px",fontWeight:"700"},
          on:{click:()=>{
            const target=vpcs[active]; if(!target) return;
            const ec2s=(App.config.servers||[]).filter(s=>s.aws && s.aws.vpc===target.name);
            const msg = ec2s.length
              ? `VPC「${target.name}」を削除しますか？\n配置中のEC2インスタンス ${ec2s.length}台 のAWS割り当ても解除されます（サーバ自体は残ります）。`
              : `VPC「${target.name}」を削除しますか？`;
            if(!((typeof confirm==="function") ? confirm(msg) : true)) return;
            pushUndo();
            // detach EC2 instances from this VPC (keep the servers, clear their aws placement)
            for(const s of ec2s){ delete s.aws; }
            vpcs.splice(active,1);
            active=Math.max(0,active-1);
            renderAndSync(); refresh();
            toast(`VPC「${target.name}」を削除しました`,"ok");
          }}},top);
      }
      if(!vpcs.length){ ch("div",{text:"VPCを追加してください。",style:{color:"var(--text-mute)",fontSize:"11px",padding:"10px"}},body); return; }
      const vpc=vpcs[active]; if(!vpc){active=0;return refresh();}

      // VPC settings
      const cfg=ch("div",{class:"sub-section"},body);
      const cr=ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px"}},cfg);
      const f1=ch("div",{},cr);ch("label",{text:"VPC名",style:{fontSize:"9px",color:"var(--text-dim)"}},f1);
      const nm=ch("input",{type:"text",value:vpc.name,style:Object.assign({width:"100%",boxSizing:"border-box"},fStyle)},f1);nm.addEventListener("change",()=>{vpc.name=nm.value;renderAndSync();});
      const f2=ch("div",{},cr);ch("label",{text:"CIDR",style:{fontSize:"9px",color:"var(--text-dim)"}},f2);
      const cd=ch("input",{type:"text",value:vpc.cidr,style:Object.assign({width:"100%",boxSizing:"border-box"},fStyle)},f2);cd.addEventListener("change",()=>{vpc.cidr=cd.value;renderAndSync();});
      const f3=ch("div",{},cr);ch("label",{text:"リージョン",style:{fontSize:"9px",color:"var(--text-dim)"}},f3);
      const rg=ch("input",{type:"text",value:vpc.region,style:Object.assign({width:"100%",boxSizing:"border-box"},fStyle)},f3);rg.addEventListener("change",()=>{vpc.region=rg.value;renderAndSync();});
      const igwL=ch("label",{style:{display:"flex",gap:"4px",alignItems:"center",fontSize:"11px",marginTop:"6px",cursor:"pointer"}},cfg);
      const igwC=ch("input",{type:"checkbox"},igwL);igwC.checked=!!vpc.igw;igwC.addEventListener("change",()=>{vpc.igw=igwC.checked;renderAndSync();});
      ch("span",{text:"Internet Gateway (IGW) アタッチ"},igwL);

      // Subnets
      const s1=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"サブネット"},s1);
      (vpc.subnets||[]).forEach((sn,i)=>{
        const row=ch("div",{style:{display:"flex",gap:"5px",alignItems:"center",marginBottom:"3px",flexWrap:"wrap"}},s1);
        const n=ch("input",{type:"text",value:sn.name||"",placeholder:"subnet名",style:Object.assign({width:"100px"},fStyle)},row);n.addEventListener("change",()=>{sn.name=n.value;renderAndSync();});
        const c=ch("input",{type:"text",value:sn.cidr||"",placeholder:"10.0.1.0/24",style:Object.assign({width:"110px"},fStyle)},row);c.addEventListener("change",()=>{sn.cidr=c.value;renderAndSync();});
        const az=ch("input",{type:"text",value:sn.az||"",placeholder:"az-a",style:Object.assign({width:"56px"},fStyle)},row);az.addEventListener("change",()=>{sn.az=az.value;renderAndSync();});
        const pubL=ch("label",{style:{display:"flex",gap:"3px",alignItems:"center",fontSize:"10px",cursor:"pointer"}},row);
        const pub=ch("input",{type:"checkbox"},pubL);pub.checked=!!sn.public;pub.addEventListener("change",()=>{sn.public=pub.checked;renderAndSync();});
        ch("span",{text:"public"},pubL);
        ch("button",{text:"✕",style:{padding:"1px 6px",cursor:"pointer",fontSize:"10px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},on:{click:()=>{vpc.subnets.splice(i,1);renderAndSync();refresh();}}},row);
      });
      ch("button",{text:"+ サブネット",style:{padding:"3px 10px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ const n=(vpc.subnets=vpc.subnets||[]).length; vpc.subnets.push({name:(n%2?"private":"public")+"-"+(n+1),cidr:`10.0.${n+1}.0/24`,az:"az-"+String.fromCharCode(97+(n%3)),public:n%2===0}); renderAndSync(); refresh(); }}},s1);

      // Security Groups
      const s2=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"セキュリティグループ"},s2);
      (vpc.security_groups||[]).forEach((sg,i)=>{
        const card=ch("div",{style:{border:"1px solid var(--border)",borderRadius:"5px",padding:"6px",marginBottom:"6px",background:"var(--bg2)"}},s2);
        const hd=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center"}},card);
        const n=ch("input",{type:"text",value:sg.name||"",placeholder:"sg名",style:Object.assign({flex:"1",fontWeight:"700"},fStyle)},hd);n.addEventListener("change",()=>{sg.name=n.value;renderAndSync();});
        ch("button",{text:"🗑",style:{padding:"2px 8px",cursor:"pointer",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},on:{click:()=>{vpc.security_groups.splice(i,1);renderAndSync();refresh();}}},hd);
        // inbound rules
        ch("div",{text:"インバウンド許可ルール (proto / port / source)",style:{fontSize:"9px",color:"var(--text-dim)",margin:"4px 0 2px"}},card);
        (sg.inbound||[]).forEach((r,ri)=>{
          const rr=ch("div",{style:{display:"flex",gap:"4px",alignItems:"center",marginBottom:"2px"}},card);
          const pr=ch("select",{style:fStyle},rr);["tcp","udp","icmp","any"].forEach(x=>ch("option",{value:x,text:x},pr));pr.value=r.proto||"tcp";pr.addEventListener("change",()=>{r.proto=pr.value;renderAndSync();});
          const pt=ch("input",{type:"number",value:r.port!=null?r.port:"",placeholder:"port",style:Object.assign({width:"60px"},fStyle)},rr);pt.addEventListener("change",()=>{r.port=pt.value===""?null:+pt.value;renderAndSync();});
          const sc=ch("input",{type:"text",value:r.source||"0.0.0.0/0",placeholder:"source",style:Object.assign({flex:"1"},fStyle)},rr);sc.addEventListener("change",()=>{r.source=sc.value;renderAndSync();});
          ch("button",{text:"✕",style:{padding:"0 5px",cursor:"pointer",fontSize:"9px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},on:{click:()=>{sg.inbound.splice(ri,1);renderAndSync();refresh();}}},rr);
        });
        ch("button",{text:"+ インバウンド",style:{padding:"2px 8px",fontSize:"9px",cursor:"pointer",background:"var(--green)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700",marginTop:"2px"},
          on:{click:()=>{sg.inbound=sg.inbound||[];sg.inbound.push({proto:"tcp",port:443,source:"0.0.0.0/0"});renderAndSync();refresh();}}},card);
      });
      ch("button",{text:"+ セキュリティグループ",style:{width:"100%",padding:"6px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
        on:{click:()=>{ vpc.security_groups=vpc.security_groups||[]; vpc.security_groups.push({name:"sg-"+(vpc.security_groups.length+1),inbound:[{proto:"tcp",port:443,source:"0.0.0.0/0"}],outbound:[{proto:"any",port:null,dest:"0.0.0.0/0"}]}); renderAndSync(); refresh(); }}},s2);

      // EC2 instances (servers placed in this VPC)
      const s3=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"EC2 インスタンス"},s3);
      const ec2s=(App.config.servers||[]).filter(sv=>sv.aws && sv.aws.vpc===vpc.name);
      ec2s.forEach(sv=>{
        const row=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"3px",flexWrap:"wrap",padding:"3px",border:"1px solid var(--border)",borderRadius:"4px"}},s3);
        ch("span",{text:(sv.status||"running")==="running"?"🟢":"⚪"},row);
        ch("span",{text:sv.label||sv.id,style:{flex:"1",fontWeight:"600",fontSize:"11px"}},row);
        ch("span",{text:(sv.aws.subnet||"-"),style:{fontSize:"9px",color:"var(--text-dim)"}},row);
        ch("span",{text:"SG:"+((sv.aws.security_groups||[]).join(",")||"-"),style:{fontSize:"9px",color:"var(--text-dim)"}},row);
        ch("button",{text:"設定",style:{padding:"1px 7px",fontSize:"10px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"3px"},
          on:{click:()=>{ closeDialog(); selectElement("server",sv.id); openPropertyPanel(); }}},row);
        ch("button",{text:"✕",style:{padding:"1px 6px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ App.config.servers=App.config.servers.filter(x=>x.id!==sv.id); renderAndSync(); refresh(); }}},row);
      });
      if(!ec2s.length) ch("div",{text:"(このVPCにEC2インスタンスがありません)",style:{color:"var(--text-mute)",fontSize:"11px",padding:"4px 2px"}},s3);
      ch("button",{text:"+ EC2インスタンス追加",style:{width:"100%",padding:"7px",fontSize:"11px",cursor:"pointer",background:"#ff9900",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
        on:{click:()=>{
          pushUndo();
          const id=uid("ec2");
          const subnet=(vpc.subnets||[])[0];
          // derive an IP from the subnet CIDR if present
          let ip="10.0.1.10/24";
          if(subnet && subnet.cidr){ const m=subnet.cidr.match(/^(\d+)\.(\d+)\.(\d+)\./); if(m) ip=`${m[1]}.${m[2]}.${m[3]}.${10+ec2s.length}/24`; }
          App.config.servers.push({ id, label:id, type:"server", os:"Amazon Linux", status:"running",
            x:(App.view.x||0)+260, y:(App.view.y||0)+200+ec2s.length*90, width:130, height:65,
            interfaces:[{id:"eth0",ip,mac:genUniqueMac(),speed:1000,port_type:"rj45",status:"up"}],
            aws:{ vpc:vpc.name, subnet:(subnet&&subnet.name)||"", security_groups:(vpc.security_groups||[]).slice(0,1).map(g=>g.name) } });
          renderAndSync(); refresh();
          toast("EC2インスタンスを追加: "+id,"ok");
        }}},s3);
      ch("div",{text:"💡 サーバのプロパティでVPC/サブネット/SGを割り当てると、SGのインバウンド許可がそのサーバへの通信制御として適用されます。",style:{fontSize:"10px",color:"var(--text-mute)",padding:"8px 2px",lineHeight:"1.4"}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

// Kubernetes cluster manager — nodes, pods, services (ClusterIP/NodePort/LoadBalancer)
// Ensure a K8s cluster has its own L2 switch fabric and every node is connected to it.
// Also create etcd peer links between masters (HA visualization).
function _ensureClusterFabric(cl){
  if(!cl) return;
  // 1) ensure cluster switch exists
  let swId = cl.cluster_switch_id;
  let sw = swId ? Cfg.byId("devices", swId) : null;
  if(!sw){
    swId = uid("k8s-sw");
    cl.cluster_switch_id = swId;
    // place near nodes (or default)
    const ns = (cl.nodes||[]).map(n=>Cfg.byId("servers",n)).filter(Boolean);
    let sx=400, sy=420;
    if(ns.length){
      const xs=ns.map(n=>n.x||0), ys=ns.map(n=>n.y||0);
      sx = (Math.min(...xs)+Math.max(...xs))/2;
      sy = Math.max(...ys) + 120;
    }
    sw = { id:swId, label:`${cl.name}-sw`, type:"l2switch", status:"running",
      x:sx, y:sy, width:140, height:54,
      interfaces:Array.from({length: Math.max(8,(cl.nodes||[]).length+4)},(_,i)=>({id:"g"+i,status:"up"})) };
    App.config.devices.push(sw);
  }
  // 2) ensure each node is connected to the cluster switch
  let portIdx = 0;
  for(const nid of (cl.nodes||[])){
    const exists = (App.config.connections||[]).some(c=>{
      const a = c.from && (c.from.server===nid||c.from.device===nid);
      const b = c.to && (c.to.server===nid||c.to.device===nid);
      const swA = c.from && c.from.device===swId;
      const swB = c.to && c.to.device===swId;
      return (a&&swB) || (b&&swA);
    });
    if(!exists){
      // find a free port on the switch
      while(portIdx < sw.interfaces.length){
        const port = sw.interfaces[portIdx];
        const used = (App.config.connections||[]).some(c=>(c.from&&c.from.device===swId&&c.from.interface===port.id)||(c.to&&c.to.device===swId&&c.to.interface===port.id));
        if(!used) break;
        portIdx++;
      }
      if(portIdx >= sw.interfaces.length){
        // grow the switch
        for(let i=0;i<4;i++) sw.interfaces.push({id:"g"+(sw.interfaces.length),status:"up"});
      }
      const port = sw.interfaces[portIdx];
      const node = Cfg.byId("servers", nid);
      if(node){
        // ensure the node has eth0
        node.interfaces = node.interfaces||[];
        if(!node.interfaces.length) node.interfaces.push({id:"eth0", ip:_autoFreeIp(), mac:genUniqueMac(), status:"up"});
        App.config.connections.push({ id:uid("link"),
          from:{server:nid, interface:node.interfaces[0].id},
          to:{device:swId, interface:port.id}, type:"ethernet", status:"up" });
      }
      portIdx++;
    }
  }
  // 3) etcd peer mesh between master nodes (HA control-plane visualization)
  const masters = (cl.control_plane && cl.control_plane.masters) || [];
  if(masters.length >= 2){
    for(let i=0;i<masters.length;i++){
      for(let j=i+1;j<masters.length;j++){
        const a = masters[i], b = masters[j];
        const exists=(App.config.connections||[]).some(c=>{
          const fa=c.from&&(c.from.server===a||c.from.device===a);
          const ta=c.to&&(c.to.server===b||c.to.device===b);
          const fb=c.from&&(c.from.server===b||c.from.device===b);
          const tb=c.to&&(c.to.server===a||c.to.device===a);
          return (fa&&ta)||(fb&&tb);
        });
        if(!exists){
          App.config.connections.push({ id:uid("etcd"),
            from:{server:a, interface:"eth0"},
            to:{server:b, interface:"eth0"},
            type:"etcd-peer", status:"up", label:"etcd peer" });
        }
      }
    }
  }
}

function showK8sManager(focusCluster){
  App.config.k8s = App.config.k8s || { clusters:[] };
  openDialog("☸ Kubernetes クラスタ管理", (body)=>{
    const fStyle={padding:"4px 6px",fontSize:"11px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",fontFamily:"var(--mono)"};
    let activeIdx = 0;
    if(focusCluster){ const fi=(App.config.k8s.clusters||[]).findIndex(c=>c.name===focusCluster); if(fi>=0) activeIdx=fi; }
    function refresh(){
      body.innerHTML = "";
      helpBox(body, "Kubernetesクラスタの使い方", [
        "これは何: コンテナ(Pod)をクラスタ全体で自動配置・運用するオーケストレーション基盤。",
        "手順:",
        "1. 『+クラスタ』でクラスタを作成。",
        "2. 『+ノード追加』でWorkerノード(物理/仮想サーバ)をクラスタに追加(Podはノード上で動作)。",
        "3. 『+Pod追加』で各ノードにPodを配置。`selector`でServiceに紐付けます。",
        "4. 『+Service追加』でClusterIP/NodePort/LoadBalancerを公開。",
        "5. LoadBalancer Service + Ingressで外部公開、前段にALB/CDNを置くと本番構成。",
        "ポイント: ノードが無いとPodは作れません(エラー)。マイグレーションでPodを別ノードへ移せます。"
      ], false);
      const clusters = App.config.k8s.clusters;
      const top=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"8px"}},body);
      ch("span",{text:"クラスタ:",style:{fontSize:"11px"}},top);
      const cSel=ch("select",{style:fStyle},top);
      clusters.forEach((c,i)=>{ const o=ch("option",{value:String(i),text:c.name||("cluster"+i)},cSel); if(i===activeIdx)o.selected=true; });
      cSel.addEventListener("change",()=>{ activeIdx=+cSel.value; refresh(); });
      ch("button",{text:"+ クラスタ",style:{padding:"3px 8px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ clusters.push({name:"k8s-"+(clusters.length+1),pod_cidr:"10.244.0.0/16",service_cidr:"10.96.0.0/12",nodes:[],namespaces:["default"],pods:[],services:[],ingresses:[]}); activeIdx=clusters.length-1; renderAndSync(); refresh(); }}},top);
      if(!clusters.length){ ch("div",{text:"クラスタを追加してください。",style:{color:"var(--text-mute)",fontSize:"11px",padding:"10px"}},body); return; }
      const cl=clusters[activeIdx]; if(!cl){ activeIdx=0; return refresh(); }

      const cfg=ch("div",{class:"sub-section"},body);
      const cr=ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px"}},cfg);
      const f1=ch("div",{},cr); ch("label",{text:"クラスタ名",style:{fontSize:"9px",color:"var(--text-dim)"}},f1);
      const nm=ch("input",{type:"text",value:cl.name||"",style:Object.assign({width:"100%",boxSizing:"border-box"},fStyle)},f1); nm.addEventListener("change",()=>{cl.name=nm.value;renderAndSync();});
      const f2=ch("div",{},cr); ch("label",{text:"Pod CIDR",style:{fontSize:"9px",color:"var(--text-dim)"}},f2);
      const pc=ch("input",{type:"text",value:cl.pod_cidr||"",style:Object.assign({width:"100%",boxSizing:"border-box"},fStyle)},f2); pc.addEventListener("change",()=>{cl.pod_cidr=pc.value;renderAndSync();});
      const f3=ch("div",{},cr); ch("label",{text:"Service CIDR",style:{fontSize:"9px",color:"var(--text-dim)"}},f3);
      const sc=ch("input",{type:"text",value:cl.service_cidr||"",style:Object.assign({width:"100%",boxSizing:"border-box"},fStyle)},f3); sc.addEventListener("change",()=>{cl.service_cidr=sc.value;renderAndSync();});
      ch("label",{text:"ノード (Workerサーバ)",style:{fontSize:"9px",color:"var(--text-dim)",display:"block",marginTop:"4px",fontWeight:"700"}},cfg);
      const nodeBox = ch("div",{style:{border:"1px solid var(--border)",padding:"6px",borderRadius:"4px",background:"var(--bg)",marginBottom:"6px"}},cfg);
      (cl.nodes||[]).forEach((nid,ni)=>{
        const nr=ch("div",{style:{display:"flex",gap:"6px",alignItems:"center",marginBottom:"3px",fontSize:"10.5px"}},nodeBox);
        cl.control_plane = cl.control_plane || { masters:[] };
        cl.control_plane.masters = cl.control_plane.masters || [];
        const isMaster = cl.control_plane.masters.includes(nid);
        ch("span",{text:isMaster?"👑":"⚙",title:isMaster?"control-plane (master)":"worker"},nr);
        ch("span",{text:nid,style:{flex:"1",fontFamily:"var(--mono)"}},nr);
        const s=Cfg.byId("servers",nid);
        // role toggle
        const roleBtn=ch("button",{text:isMaster?"master":"worker",title:"クリックで役割切替",
          style:{padding:"2px 6px",fontSize:"9px",cursor:"pointer",borderRadius:"3px",fontWeight:"700",
            background:isMaster?"rgba(245,158,11,0.15)":"rgba(0,200,255,0.12)",border:"1px solid "+(isMaster?"var(--orange)":"var(--cyan)"),color:isMaster?"var(--orange)":"var(--cyan)"}},nr);
        roleBtn.addEventListener("click",()=>{
          if(isMaster) cl.control_plane.masters = cl.control_plane.masters.filter(x=>x!==nid);
          else cl.control_plane.masters.push(nid);
          cl.roles = cl.roles||{}; cl.roles[nid] = isMaster?"worker":"master";
          _ensureClusterFabric(cl);
          renderAndSync(); refresh();
        });
        ch("span",{text:s?(s.status==="running"?"running":s.status):"未存在",style:{fontSize:"9px",color:s&&s.status==="running"?"var(--green)":"var(--red)"}},nr);
        ch("button",{text:"×",style:{padding:"2px 6px",fontSize:"10px",cursor:"pointer",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"},
          on:{click:()=>{ cl.nodes=cl.nodes.filter(x=>x!==nid); if(cl.control_plane)cl.control_plane.masters=(cl.control_plane.masters||[]).filter(x=>x!==nid); renderAndSync(); refresh(); }}},nr);
      });
      if(!(cl.nodes||[]).length) ch("div",{text:"(まだノードがありません)",style:{fontSize:"10px",color:"var(--text-mute)",fontStyle:"italic"}},nodeBox);
      const naBtn=ch("div",{style:{display:"flex",gap:"6px",marginTop:"6px",flexWrap:"wrap"}},nodeBox);
      // Add existing server as a node
      const exSel=ch("select",{style:Object.assign({flex:"1",minWidth:"120px"},fStyle)},naBtn);
      ch("option",{value:"",text:"既存サーバを選択..."},exSel);
      for(const s of (App.config.servers||[])){ if(!(cl.nodes||[]).includes(s.id) && !s.vm) ch("option",{value:s.id,text:(s.label||s.id)+(s.type?" ("+s.type+")":"")},exSel); }
      ch("button",{text:"➕ このサーバをノード追加",style:{padding:"4px 8px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ if(!exSel.value){ toast("追加するサーバを選択してください","warn"); return; } cl.nodes=cl.nodes||[]; if(!cl.nodes.includes(exSel.value)) cl.nodes.push(exSel.value); _ensureClusterFabric(cl); renderAndSync(); refresh(); }}},naBtn);
      ch("button",{text:"🆕 新規Workerを作成して追加",style:{padding:"4px 8px",fontSize:"10px",cursor:"pointer",background:"var(--green)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{
          const nid = uid("worker");
          App.config.servers.push({ id:nid, label:nid, type:"server", os:"linux", status:"running",
            x:200+Math.random()*200, y:300+Math.random()*100, width:120, height:60,
            interfaces:[{ id:"eth0", ip:_autoFreeIp(), mac:genUniqueMac(), status:"up" }] });
          cl.nodes=cl.nodes||[]; cl.nodes.push(nid); _ensureClusterFabric(cl); renderAndSync(); refresh();
          toast("Workerノード追加: "+nid+" (クラスタスイッチに自動接続)","ok");
        }}},naBtn);

      const ps=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"Pods"},ps);
      (cl.pods||[]).forEach((pod,i)=>{
        const row=ch("div",{style:{display:"flex",gap:"5px",alignItems:"center",marginBottom:"3px",flexWrap:"wrap"}},ps);
        ch("span",{text:(pod.status||"Running")==="Running"?"🟢":"⚪"},row);
        const nmI=ch("input",{type:"text",value:pod.name||"",placeholder:"pod名",style:Object.assign({width:"90px"},fStyle)},row); nmI.addEventListener("change",()=>{pod.name=nmI.value;renderAndSync();});
        const lblI=ch("input",{type:"text",value:Object.entries(pod.labels||{}).map(([k,v])=>k+"="+v).join(","),placeholder:"app=web",style:Object.assign({width:"100px"},fStyle)},row);
        lblI.addEventListener("change",()=>{ const o={}; lblI.value.split(",").forEach(kv=>{const[a,b]=kv.split("=");if(a&&b)o[a.trim()]=b.trim();}); pod.labels=o; renderAndSync(); });
        const ipI=ch("input",{type:"text",value:pod.ip||"",placeholder:"10.244.0.5",style:Object.assign({width:"95px"},fStyle)},row); ipI.addEventListener("change",()=>{pod.ip=ipI.value;renderAndSync();});
        const ndSel=ch("select",{style:fStyle},row); ch("option",{value:"",text:"node"},ndSel);
        for(const n of (cl.nodes||[])) ch("option",{value:n,text:n},ndSel); ndSel.value=pod.node||"";
        ndSel.addEventListener("change",()=>{pod.node=ndSel.value;renderAndSync();});
        ch("button",{text:(pod.status||"Running")==="Running"?"停止":"起動",style:{padding:"1px 5px",cursor:"pointer",fontSize:"9px",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"},
          on:{click:()=>{ pod.status=(pod.status||"Running")==="Running"?"Stopped":"Running"; renderAndSync(); refresh(); }}},row);
        // Pod migration: move the pod to a different node (simulates kubectl drain → reschedule).
        ch("button",{text:"🔀 移動",title:"別ノードへマイグレーション(Pod再スケジュール)",style:{padding:"1px 5px",cursor:"pointer",fontSize:"9px",background:"var(--bg)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:"3px"},
          on:{click:()=>{
            const others=(cl.nodes||[]).filter(n=>n!==pod.node);
            if(!others.length){ toast("移動先となる別ノードがありません","warn"); return; }
            const target = others[0];
            pushUndo(); const orig=pod.node; pod.node=target;
            toast(`Pod ${pod.name} を ${orig||"(なし)"} → ${target} へマイグレーション`,"ok");
            renderAndSync(); refresh();
          }}},row);
        ch("button",{text:"✕",style:{padding:"1px 5px",cursor:"pointer",fontSize:"9px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ cl.pods.splice(i,1); renderAndSync(); refresh(); }}},row);
        // Pod containers (image + container ports) — the pod's "service/port"
        const cbox=ch("div",{style:{margin:"2px 0 6px 18px",padding:"4px 6px",borderLeft:"2px solid var(--cyan)",background:"var(--bg)"}},ps);
        pod.containers = pod.containers || [];
        ch("div",{text:"コンテナ / ポート:",style:{fontSize:"9px",color:"var(--text-dim)",fontWeight:"700"}},cbox);
        pod.containers.forEach((c,ci)=>{
          const cr=ch("div",{style:{display:"flex",gap:"3px",alignItems:"center",marginBottom:"2px"}},cbox);
          const imI=ch("input",{type:"text",value:c.image||"",placeholder:"nginx:latest",style:Object.assign({width:"110px"},fStyle)},cr);
          imI.addEventListener("change",()=>{c.image=imI.value;renderAndSync();});
          const ptI=ch("input",{type:"text",value:(c.ports||[]).join(","),placeholder:"80,443",style:Object.assign({width:"70px"},fStyle)},cr);
          ptI.addEventListener("change",()=>{c.ports=ptI.value.split(",").map(x=>+x.trim()).filter(Boolean);renderAndSync();});
          ch("button",{text:"✕",style:{padding:"0 5px",fontSize:"9px",cursor:"pointer",background:"var(--bg2)",border:"1px solid var(--red)",color:"var(--red)"},
            on:{click:()=>{pod.containers.splice(ci,1);renderAndSync();refresh();}}},cr);
        });
        ch("button",{text:"+ コンテナ",style:{padding:"1px 6px",fontSize:"9px",cursor:"pointer",background:"var(--bg2)",border:"1px solid var(--cyan)",color:"var(--cyan)",borderRadius:"3px"},
          on:{click:()=>{ pod.containers.push({name:"app",image:"nginx:latest",ports:[80]}); renderAndSync(); refresh(); }}},cbox);
      });
      ch("button",{text:"+ Pod追加",style:{padding:"3px 10px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ if(!(cl.nodes||[]).length){ toast("先にノードを追加してください(Podはノード上で動作します)","err"); return; } const n=(cl.pods=cl.pods||[]).length+1; cl.pods.push({name:"pod-"+n,namespace:"default",node:(cl.nodes||[])[0]||"",ip:"10.244.0."+(n+1),labels:{app:"web"},status:"Running",containers:[]}); renderAndSync(); refresh(); }}},ps);

      const ss=ch("div",{class:"sub-section"},body);
      ch("h4",{text:"Services"},ss);
      (cl.services||[]).forEach((svc,i)=>{
        const card=ch("div",{style:{border:"1px solid var(--border)",borderRadius:"5px",padding:"6px",marginBottom:"5px",background:"var(--bg2)"}},ss);
        const hd=ch("div",{style:{display:"flex",gap:"5px",alignItems:"center",flexWrap:"wrap"}},card);
        const nmI=ch("input",{type:"text",value:svc.name||"",placeholder:"svc名",style:Object.assign({width:"90px"},fStyle)},hd); nmI.addEventListener("change",()=>{svc.name=nmI.value;renderAndSync();});
        const tySel=ch("select",{style:fStyle},hd); ["ClusterIP","NodePort","LoadBalancer"].forEach(x=>ch("option",{value:x,text:x},tySel)); tySel.value=svc.type||"ClusterIP";
        tySel.addEventListener("change",()=>{svc.type=tySel.value;renderAndSync();refresh();});
        const selI=ch("input",{type:"text",value:Object.entries(svc.selector||{}).map(([k,v])=>k+"="+v).join(","),placeholder:"selector app=web",style:Object.assign({width:"110px"},fStyle)},hd);
        selI.addEventListener("change",()=>{ const o={}; selI.value.split(",").forEach(kv=>{const[a,b]=kv.split("=");if(a&&b)o[a.trim()]=b.trim();}); svc.selector=o; renderAndSync(); });
        ch("button",{text:"✕",style:{padding:"1px 5px",cursor:"pointer",fontSize:"9px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
          on:{click:()=>{ cl.services.splice(i,1); renderAndSync(); refresh(); }}},hd);
        const r2=ch("div",{style:{display:"flex",gap:"5px",alignItems:"center",marginTop:"4px",flexWrap:"wrap"}},card);
        ch("span",{text:"ClusterIP:",style:{fontSize:"9px",color:"var(--text-dim)"}},r2);
        const cipI=ch("input",{type:"text",value:svc.cluster_ip||"",placeholder:"10.96.0.10",style:Object.assign({width:"95px"},fStyle)},r2); cipI.addEventListener("change",()=>{svc.cluster_ip=cipI.value;renderAndSync();});
        if(svc.type==="LoadBalancer"){ ch("span",{text:"ExternalIP:",style:{fontSize:"9px",color:"var(--text-dim)"}},r2);
          const exI=ch("input",{type:"text",value:svc.external_ip||"",placeholder:"203.0.113.5",style:Object.assign({width:"95px"},fStyle)},r2); exI.addEventListener("change",()=>{svc.external_ip=exI.value;renderAndSync();}); }
        const pmHead=ch("div",{style:{fontSize:"9px",color:"var(--text-dim)",marginTop:"4px"}},card); pmHead.textContent="ポート (port → targetPort [: nodePort]):";
        (svc.ports||[]).forEach((pp,pi)=>{
          const pr=ch("div",{style:{display:"flex",gap:"4px",alignItems:"center",fontSize:"10px",fontFamily:"var(--mono)",marginTop:"2px"}},card);
          ch("span",{text:`${pp.port} → ${pp.target_port||pp.port}${pp.node_port?(" : NodePort "+pp.node_port):""} /${pp.proto||"tcp"}`,style:{flex:"1"}},pr);
          ch("button",{text:"✕",style:{padding:"0 5px",cursor:"pointer",fontSize:"9px",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"3px"},
            on:{click:()=>{ svc.ports.splice(pi,1); renderAndSync(); refresh(); }}},pr);
        });
        const addP=ch("div",{style:{display:"flex",gap:"4px",marginTop:"3px"}},card);
        const po=ch("input",{type:"number",placeholder:"port",style:Object.assign({width:"54px"},fStyle)},addP);
        const tp=ch("input",{type:"number",placeholder:"target",style:Object.assign({width:"54px"},fStyle)},addP);
        const npI=(svc.type==="NodePort"||svc.type==="LoadBalancer")?ch("input",{type:"number",placeholder:"nodePort",style:Object.assign({width:"64px"},fStyle)},addP):null;
        ch("button",{text:"+ポート",style:{padding:"1px 8px",cursor:"pointer",fontSize:"10px",background:"var(--green)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
          on:{click:()=>{ if(!po.value){toast("portを入力","err");return;} svc.ports=svc.ports||[]; svc.ports.push({port:+po.value,target_port:+(tp.value||po.value),node_port:npI&&npI.value?+npI.value:null,proto:"tcp"}); renderAndSync(); refresh(); }}},addP);
      });
      ch("button",{text:"+ Service追加",style:{width:"100%",padding:"6px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
        on:{click:()=>{ const n=(cl.services=cl.services||[]).length+1; cl.services.push({name:"svc-"+n,namespace:"default",type:"ClusterIP",cluster_ip:"10.96.0."+(n+9),selector:{app:"web"},ports:[{port:80,target_port:8080,node_port:null,proto:"tcp"}]}); renderAndSync(); refresh(); }}},ss);
      ch("div",{text:"💡 ClusterIP/LoadBalancer宛、またはノードIP:NodePort宛の通信は、kube-proxyがセレクタ一致の稼働Podへ振り分けます(通信テストで確認可)。",style:{fontSize:"10px",color:"var(--text-mute)",padding:"8px 2px",lineHeight:"1.4"}},body);
    }
    refresh();
    return { buttons:[{text:"閉じる",primary:true,action:closeDialog}] };
  });
}

function renderServiceProps(body, obj){
  const types = ["web_server","reverse_proxy","forward_proxy","app_server","database","cache","mq","dns","dhcp","monitoring","logging","vpn_server","custom"];
  addSelectField(body, "種別", types, obj.type||"app_server", v=>{ obj.type=v; renderAndSync(); });
  const srvs = (App.config.servers||[]).map(s=>s.id);
  addSelectField(body, "ホストサーバ", srvs, obj.server||"", v=>{ obj.server=v; renderAndSync(); });
  const row = ch("div", { class:"field-grid" }, body);
  addField(row, "ポート", "number", obj.port||80, v=>{ obj.port=+v; renderAndSync(); });
  addField(row, "プロトコル", "text", obj.protocol||"TCP", v=>{ obj.protocol=v; renderAndSync(); });
  // depends_on
  const sec = ch("div", { class:"sub-section" }, body);
  ch("h4", { text:"依存サービス (depends_on)" }, sec);
  const allSvc = (App.config.services||[]).filter(s=>s.id!==obj.id);
  const sel = new Set(obj.depends_on||[]);
  const list = ch("div", { style:{ maxHeight:"100px", overflowY:"auto" } }, sec);
  if(!allSvc.length) ch("div", { text:"(他のサービスなし)", style:{ color:"var(--text-mute)", fontSize:"11px" } }, list);
  for(const s of allSvc){
    const lab = ch("label", { style:{display:"flex",gap:"4px",alignItems:"center",fontSize:"11px",cursor:"pointer",padding:"2px 0"} }, list);
    const cb = ch("input", { type:"checkbox" }, lab);
    if(sel.has(s.id)) cb.checked = true;
    ch("span", { text: s.id + (s.label?" ("+s.label+")":"") }, lab);
    cb.addEventListener("change", ()=>{
      if(cb.checked) sel.add(s.id); else sel.delete(s.id);
      obj.depends_on = Array.from(sel);
      renderAndSync();
    });
  }
  // Proxy configuration (reverse_proxy / forward_proxy)
  if(obj.type === "reverse_proxy" || obj.type === "forward_proxy"){
    obj.proxy = obj.proxy || {};
    const pSec = ch("div", { class:"sub-section" }, body);
    ch("h4", { text: obj.type==="reverse_proxy" ? "リバースプロキシ設定" : "フォワードプロキシ設定" }, pSec);
    addField(pSec, "Listen ポート", "number", obj.proxy.listen_port!=null?obj.proxy.listen_port:(obj.port||(obj.type==="reverse_proxy"?443:3128)),
      v=>{ obj.proxy.listen_port = v?+v:null; obj.port = obj.proxy.listen_port; renderAndSync(); });
    if(obj.type === "reverse_proxy"){
      ch("div",{text:"upstream(バックエンド)へ振り分けます。1行=host:port",style:{fontSize:"10px",color:"var(--text-dim)",padding:"2px 0"}},pSec);
      const ups = (obj.proxy.upstreams||[]).map(u=>`${u.host}:${u.port}`).join("\n");
      addTextareaField(pSec, "upstreams (host:port 改行区切り)", ups, v=>{
        obj.proxy.upstreams = v.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{ const [h,p]=l.split(":"); return { host:h, port:+(p||80) }; });
        renderAndSync();
      });
      addSelectField(pSec, "振り分け方式", ["round-robin","first"], obj.proxy.mode||"round-robin", v=>{ obj.proxy.mode=v; renderAndSync(); });
    } else {
      ch("div",{text:"許可する送信元(空=全許可)。CIDR/セグメント名をカンマ区切り",style:{fontSize:"10px",color:"var(--text-dim)",padding:"2px 0"}},pSec);
      addField(pSec, "allow 送信元", "text", (obj.proxy.allow||[]).join(", "),
        v=>{ obj.proxy.allow = v.split(",").map(s=>s.trim()).filter(Boolean); renderAndSync(); });
    }
  }

  // config
  const cfgSec = ch("div", { class:"sub-section" }, body);
  ch("h4", { text:"設定 (config)" }, cfgSec);
  const cy = obj.config ? YAML.stringify(obj.config).trim() : "";
  addTextareaField(cfgSec, "YAML形式", cy, v=>{
    try{ obj.config = v.trim() ? YAML.parse(v) : {}; renderAndSync(); }
    catch(e){ Log.error("config parse error: "+e.message); }
  });
}

function renderConnectionProps(body, obj){
  const allEnds = [];
  for(const d of (App.config.devices||[])) allEnds.push({ kind:"device", id:d.id, label:`${d.label||d.id} (device)`, ifs:(d.interfaces||[]).map(i=>i.id) });
  for(const s of (App.config.servers||[])) allEnds.push({ kind:"server", id:s.id, label:`${s.label||s.id} (server)`, ifs:(s.interfaces||[]).map(i=>i.id) });

  function buildEndpointSelectors(label, ep, key){
    ch("div", { class:"field-section-title", text:label }, body);
    const curKind = ep && ep.device ? "device" : "server";
    const curId = ep ? (ep.device || ep.server || "") : "";
    const curIf = ep ? (ep.interface || "") : "";

    const f1 = ch("div", { class:"field" }, body);
    ch("label", { text:"要素" }, f1);
    const sel = ch("select", {}, f1);
    ch("option", { value:"", text:"-- 選択 --" }, sel);
    for(const e of allEnds){
      const o = ch("option", { value: e.kind+":"+e.id, text:e.label }, sel);
      if(e.kind===curKind && e.id===curId) o.selected = true;
    }
    const f2 = ch("div", { class:"field" }, body);
    ch("label", { text:"インターフェース" }, f2);
    const ifSel = ch("select", {}, f2);
    function refreshIfs(){
      ifSel.innerHTML = "";
      const v = sel.value;
      if(!v) return;
      const [k,id] = v.split(":");
      const e = allEnds.find(x=>x.kind===k&&x.id===id);
      if(!e) return;
      for(const i of e.ifs){
        const o = ch("option", { value:i, text:i }, ifSel);
        if(i === curIf) o.selected = true;
      }
    }
    refreshIfs();
    sel.addEventListener("change", ()=>{
      const v = sel.value;
      if(!v) return;
      const [k,id] = v.split(":");
      obj[key] = { [k]:id, interface:"" };
      refreshIfs();
      if(ifSel.options.length){ obj[key].interface = ifSel.value; }
      renderAndSync();
    });
    ifSel.addEventListener("change", ()=>{
      obj[key].interface = ifSel.value;
      renderAndSync();
    });
  }
  buildEndpointSelectors("From", obj.from, "from");
  buildEndpointSelectors("To", obj.to, "to");

  ch("div",{class:"field-section-title", text:"接続設定"}, body);
  addSelectField(body, "種別", ["ethernet","fiber","trunk","port-channel","vpn","vxlan"], obj.type||"ethernet",
    v=>{ obj.type=v; renderAndSync(); });
  addField(body, "Speed (Mbps)", "number", obj.speed||1000, v=>{ obj.speed=+v; renderAndSync(); });
  addSelectField(body, "ステータス", ["up","down","flapping"], obj.status||"up", v=>{ setConnStatus(obj.id, v); });

  ch("div",{class:"field-section-title", text:"通信表示"}, body);
  addSelectField(body, "通信量", ["idle","low","medium","high"], obj.traffic||"idle",
    v=>{ obj.traffic=v; renderAndSync(); toast(`通信量: ${v}`, "ok"); });
  addSelectField(body, "方向", ["forward","backward","bidirectional"], obj.direction||"forward",
    v=>{ obj.direction=v; renderAndSync(); });

  ch("div",{class:"field-section-title", text:"線の屈曲"}, body);
  addField(body, "Bend (湾曲量、±px)", "number", obj.bend||0,
    v=>{ obj.bend=+v; if(!obj.bend) delete obj.bend; renderAndSync(); });
  // Waypoints list
  const sec = ch("div", { class:"sub-section" }, body);
  ch("h4", { text:`Waypoint (直角折り曲げ): ${(obj.waypoints||[]).length}個`,
    style:{margin:"0 0 6px 0"} }, sec);
  ch("div", {
    text:"使い方: 接続を選択すると線上に小さい青い点が表示されます。クリックでwaypointを追加、ドラッグで移動、ダブルクリック/右クリックで削除。",
    style:{ fontSize:"10px", color:"var(--text-mute)", lineHeight:"1.4", marginBottom:"6px" }
  }, sec);
  if(Array.isArray(obj.waypoints) && obj.waypoints.length){
    for(let i=0;i<obj.waypoints.length;i++){
      const wp = obj.waypoints[i];
      const row = ch("div", { class:"field-grid", style:{ alignItems:"end" } }, sec);
      const fx = ch("div",{class:"field"},row);
      ch("label",{text:`#${i+1} X`},fx);
      const inpX = ch("input",{type:"number",value:String(wp.x)},fx);
      inpX.addEventListener("change",()=>{ wp.x=+inpX.value||0; renderAndSync(); });
      const fy = ch("div",{class:"field"},row);
      ch("label",{text:"Y"},fy);
      const inpY = ch("input",{type:"number",value:String(wp.y)},fy);
      inpY.addEventListener("change",()=>{ wp.y=+inpY.value||0; renderAndSync(); });
    }
    ch("button",{
      text:"全てのWaypointを削除",
      style:{ width:"100%",marginTop:"4px",padding:"4px",background:"var(--red-dim)",border:"1px solid var(--red)",color:"#fff",borderRadius:"3px",cursor:"pointer",fontSize:"11px" },
      on:{ click:()=>{ pushUndo(); delete obj.waypoints; renderAndSync(); openPropertyPanel(); toast("Waypoint をリセット","ok"); }}
    }, sec);
  }
  ch("button",{
    text:"+ 直角ルーティングを自動生成",
    style:{ width:"100%",marginTop:"4px",padding:"4px",background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",cursor:"pointer",fontSize:"11px" },
    on:{ click:()=>{ pushUndo(); autoOrthogonalWaypoints(obj); renderAndSync(); openPropertyPanel(); toast("直角ルーティング生成","ok"); }}
  }, sec);

  if(obj.type === "trunk"){
    const sec1 = ch("div", { class:"sub-section" }, body);
    ch("h4", { text:"Trunk設定" }, sec1);
    obj.trunk = obj.trunk || {};
    addField(sec1, "Allowed VLANs (カンマ)", "text", (obj.trunk.allowed_vlans||[]).join(","),
      v=>{ obj.trunk.allowed_vlans=v.split(",").map(x=>+x.trim()).filter(x=>!isNaN(x)); renderAndSync(); });
    addField(sec1, "Native VLAN", "number", obj.trunk.native_vlan||1,
      v=>{ obj.trunk.native_vlan=+v; renderAndSync(); });
  }
  if(obj.type === "port-channel"){
    const sec1 = ch("div", { class:"sub-section" }, body);
    ch("h4", { text:"Port-channel設定" }, sec1);
    obj.port_channel = obj.port_channel || {};
    addField(sec1, "ID", "number", obj.port_channel.id||1, v=>{ obj.port_channel.id=+v; renderAndSync(); });
    addField(sec1, "Members (カンマ)", "text", (obj.port_channel.members||[]).join(","),
      v=>{ obj.port_channel.members=v.split(",").map(s=>s.trim()).filter(Boolean); renderAndSync(); });
    addSelectField(sec1, "Protocol", ["lacp","static"], obj.port_channel.protocol||"lacp",
      v=>{ obj.port_channel.protocol=v; renderAndSync(); });
  }
}

function autoOrthogonalWaypoints(c){
  const a = resolveEndpoint(c.from), b = resolveEndpoint(c.to);
  if(!a||!b) return;
  const dx = b.x - a.x, dy = b.y - a.y;
  // Pick mid point on the longer axis
  if(Math.abs(dx) > Math.abs(dy)){
    // Horizontal-first L-shape
    c.waypoints = [
      { x: Math.round(a.x + dx/2), y: Math.round(a.y) },
      { x: Math.round(a.x + dx/2), y: Math.round(b.y) }
    ];
  } else {
    // Vertical-first L-shape
    c.waypoints = [
      { x: Math.round(a.x), y: Math.round(a.y + dy/2) },
      { x: Math.round(b.x), y: Math.round(a.y + dy/2) }
    ];
  }
}

// Collect IP/CIDR suggestions from the CURRENT configuration so input fields can suggest
// values already in use (and helpful candidates in the same subnet).
function ipSuggestions(){
  const v4=new Set(), v6=new Set(), cidr=new Set();
  for(const n of (App.config.networks||[])){ if(n.cidr) cidr.add(n.cidr); if(n.cidr_v6) cidr.add(n.cidr_v6); }
  const addIp=(s)=>{ if(!s) return; (String(s).indexOf(":")>=0?v6:v4).add(s); };
  for(const arr of [App.config.servers, App.config.devices]){
    for(const o of (arr||[])){
      for(const i of (o.interfaces||[])){ addIp(i.ip); addIp(i.ipv6); }
      if(o.bonding){ addIp(o.bonding.bond_ip); addIp(o.bonding.bond_ipv6); }
    }
  }
  // also offer the network CIDRs as v4/v6 suggestions (user picks subnet then edits host)
  for(const c of cidr){ (String(c).indexOf(":")>=0?v6:v4).add(c); }
  return { v4:[...v4], v6:[...v6], cidr:[...cidr] };
}
// Create (or refresh) a datalist of options and return its id
var _ipdlSeq = 0;
function makeSuggestDatalist(parent, values){
  const id = "ipsug-"+(++_ipdlSeq);
  const dl = ch("datalist",{id},parent);
  for(const v of values){ if(v) ch("option",{value:v},dl); }
  return id;
}
function renderInterfaceTable(body, obj, kind){
  const sec = ch("div", { class:"sub-section" }, body);
  const headerRow = ch("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"} }, sec);
  ch("h4", { text:"インターフェース", style:{margin:0} }, headerRow);
  ch("span", {
    text:`${(obj.interfaces||[]).length} 個`,
    style:{fontSize:"10px",color:"var(--text-mute)",fontFamily:"var(--mono)"}
  }, headerRow);

  ch("div", {
    text:"💡 ポートはオブジェクトのエッジに表示されます。SVG上のポートを直接ドラッグして位置を変更できます。",
    style:{ fontSize:"10px", color:"var(--text-mute)", lineHeight:"1.4",
      marginBottom:"8px", padding:"4px 6px", background:"var(--bg2)",
      borderLeft:"2px solid var(--accent)", borderRadius:"2px" }
  }, sec);

  obj.interfaces = obj.interfaces || [];
  const allNets = (App.config.networks||[]).map(n=>n.id);
  const portTypes = ["rj45","sfp","sfp+","qsfp","qsfp+","qsfp28","console","mgmt"];
  const sides = ["auto","top","bottom","left","right"];

  const fldStyle = { width:"100%", padding:"4px 6px", fontSize:"11px", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:"3px", fontFamily:"var(--mono)" };
  const lblStyle = { fontSize:"10px", color:"var(--text-dim)", display:"block", marginBottom:"1px" };

  for(let i=0; i<obj.interfaces.length; i++){
    const iface = obj.interfaces[i];
    const isBondVirtual = iface.virtual || iface.type === "bond";
    const isBondMember = obj.bonding && obj.bonding.enabled && (obj.bonding.members||[]).includes(iface.id);
    // CONSOLIDATE: don't render the bond0 virtual interface as a separate card here.
    // All bond configuration (including the bond IP) lives in the single "NICボンディング" section below.
    if(isBondVirtual) continue;
    // Bond members must not carry their own IP — clear any stale IP
    if(isBondMember){ if(iface.ip) iface.ip = ""; if(iface.ipv6) iface.ipv6 = ""; }
    const linked = (App.config.connections||[]).some(c=>
      ((c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===iface.id) ||
       (c.to && (c.to.device===obj.id||c.to.server===obj.id) && c.to.interface===iface.id))
    );
    // Card container — bond virtual gets cyan border, bond member gets dim cyan
    let leftBorder = "var(--border)";
    let cardBg = "var(--bg2)";
    if(isBondVirtual){ leftBorder = "var(--cyan,#06b6d4)"; cardBg = "rgba(6,182,212,0.06)"; }
    else if(linked){ leftBorder = "var(--green)"; }
    else if(isBondMember){ leftBorder = "rgba(6,182,212,0.6)"; cardBg = "rgba(6,182,212,0.03)"; }
    const card = ch("div", { class:"iface-card "+(linked?"linked":"")+(isBondVirtual?" bond-virtual":"")+(isBondMember?" bond-member":""), style:{
      border:"1px solid var(--border)", borderRadius:"6px",
      padding:"8px", marginBottom:"8px", background: cardBg,
      borderLeft:"3px solid "+leftBorder
    }}, sec);

    // Header: type swatch + label + delete
    const hd = ch("div", { style:{display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px"} }, card);
    if(isBondVirtual){
      // Bond banner instead of port swatch
      ch("span", { text:"🔗 BOND",
        style:{ fontSize:"10px", fontWeight:"800", color:"#fff",
          background:"var(--cyan,#06b6d4)", padding:"1px 6px", borderRadius:"3px",
          fontFamily:"var(--mono)" }
      }, hd);
      ch("span", { text: "(virtual: "+(iface.bond_members||[]).join("+")+")",
        style:{ fontSize:"9px", color:"var(--cyan,#06b6d4)", fontFamily:"var(--mono)" }
      }, hd);
    } else {
    const tk = portTypeKey(iface);
    const swatchColor = ({
      "rj45":"#5a6470","sfp":"#3b82f6","sfp-plus":"#f59e0b",
      "qsfp":"#a855f7","qsfp-plus":"#a855f7","qsfp28":"#ef4444",
      "console":"#06b6d4","mgmt":"#10b981"
    })[tk] || "#5a6470";
    ch("span", { style:{
      display:"inline-block", width:"14px", height:"10px",
      background: swatchColor, borderRadius:"2px",
      border:"1px solid rgba(0,0,0,0.3)"
    }}, hd);
    ch("span", { text: portTypeLabel(iface) + (isBondMember?" · BOND MEMBER":"") + (linked?" · 接続中":""),
      style:{ fontSize:"10px",
        color: isBondMember?"var(--cyan,#06b6d4)":(linked?"var(--green)":"var(--accent)"),
        fontFamily:"var(--mono)", fontWeight:"700" }
    }, hd);
    }
    ch("div", { style:{flex:"1"} }, hd);
    ch("button", {
      text:"× 削除",
      style:{ background:"transparent", border:"1px solid var(--red)",
        color:"var(--red)", padding:"2px 8px", fontSize:"10px",
        cursor:"pointer", borderRadius:"3px" },
      on:{ click:()=>{
        if(!confirm(`Interface "${iface.id}" を削除しますか? (接続も切れます)`)) return;
        pushUndo();
        // Remove any connections attached to this interface
        const before = (App.config.connections||[]).length;
        App.config.connections = (App.config.connections||[]).filter(c=>{
          const fromMatch = c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===iface.id;
          const toMatch   = c.to   && (c.to.device===obj.id||c.to.server===obj.id)   && c.to.interface===iface.id;
          return !(fromMatch || toMatch);
        });
        const removed = before - App.config.connections.length;
        obj.interfaces.splice(i,1);
        renderAndSync(); openPropertyPanel();
        toast(`Interface ${iface.id} を削除` + (removed?` (接続 ${removed} 本も削除)`:""), "ok");
      }}
    }, hd);

    // Row 1: ID + IP  (bond members show NO IP — they inherit from bond0)
    const r1 = ch("div", { style:{display:"grid",gridTemplateColumns: isBondMember?"1fr":"1fr 1.6fr",gap:"6px",marginBottom:"5px"} }, card);
    const r1a = ch("div",{},r1);
    ch("label",{text:"ID",style:lblStyle},r1a);
    const idIn = ch("input",{type:"text",value:iface.id||"",placeholder:"eth0, gi1/0/1...",style:fldStyle},r1a);
    idIn.addEventListener("change",()=>{ iface.id=idIn.value.trim(); renderAndSync(); });
    if(!isBondMember){
      const sug = ipSuggestions();
      const dl4 = makeSuggestDatalist(card, sug.v4);
      const dl6 = makeSuggestDatalist(card, sug.v6);
      const r1b = ch("div",{},r1);
      ch("label",{text:"IPv4 / CIDR",style:lblStyle},r1b);
      const ipIn = ch("input",{type:"text",value:iface.ip||"",placeholder:"10.0.0.1/24 (任意)",list:dl4,style:fldStyle},r1b);
      ipIn.addEventListener("change",()=>{ iface.ip=ipIn.value; renderAndSync(); });

      // Row 1.5: IPv6
      const r15 = ch("div", { style:{display:"grid",gridTemplateColumns:"1fr",gap:"6px",marginBottom:"5px"} }, card);
      const r15a = ch("div",{},r15);
      ch("label",{text:"IPv6 / CIDR",style:lblStyle},r15a);
      const ip6In = ch("input",{type:"text",value:iface.ipv6||"",placeholder:"2001:db8::1/64 (任意 — IPv4と併用可)",list:dl6,style:fldStyle},r15a);
      ip6In.addEventListener("change",()=>{ iface.ipv6=ip6In.value; renderAndSync(); });
    } else {
      // Bond member notice
      ch("div", {
        html:`🔗 <b>${escapeHtml(obj.bonding.bond_name||"bond0")}</b> のメンバーです。IPは bond0 (下のボンディング設定) に集約されるため、ここでは設定しません。`,
        style:{ fontSize:"10px", color:"var(--cyan,#06b6d4)", lineHeight:"1.4",
          padding:"6px 8px", background:"rgba(6,182,212,0.08)",
          border:"1px solid var(--cyan,#06b6d4)", borderRadius:"4px", marginBottom:"5px" }
      }, card);
    }

    // Row 2: Network + MAC
    const r2 = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"5px"}},card);
    const r2a = ch("div",{},r2);
    ch("label",{text:"Network",style:lblStyle},r2a);
    const nSel = ch("select",{style:fldStyle},r2a);
    ch("option",{value:"",text:"-- 未割当 --"},nSel);
    for(const n of allNets){
      const o = ch("option",{value:n,text:n},nSel);
      if(n===iface.network) o.selected = true;
    }
    nSel.addEventListener("change",()=>{ iface.network=nSel.value; renderAndSync(); });
    const r2b = ch("div",{},r2);
    ch("label",{text:"MAC",style:lblStyle},r2b);
    const macIn = ch("input",{type:"text",value:iface.mac||"",placeholder:"aa:bb:cc:dd:ee:ff",style:fldStyle},r2b);
    macIn.addEventListener("change",()=>{ iface.mac=macIn.value; renderAndSync(); });

    // Row 3: Port type + Speed + Status
    const r3 = ch("div",{style:{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr",gap:"6px",marginBottom:"5px"}},card);
    const r3a = ch("div",{},r3);
    ch("label",{text:"ポート種別",style:lblStyle},r3a);
    const pSel = ch("select",{style:fldStyle},r3a);
    const cur = iface.port_type || autoPortType(iface.speed||1000);
    for(const p of portTypes){
      const o = ch("option",{value:p,text:p.toUpperCase()},pSel);
      if(p===cur) o.selected = true;
    }
    pSel.addEventListener("change",()=>{ iface.port_type=pSel.value; renderAndSync(); });
    const r3b = ch("div",{},r3);
    ch("label",{text:"Speed (Mbps)",style:lblStyle},r3b);
    const spIn = ch("input",{type:"number",value:String(iface.speed||1000),style:fldStyle},r3b);
    spIn.addEventListener("change",()=>{ iface.speed=+spIn.value||1000; renderAndSync(); });
    const r3c = ch("div",{},r3);
    ch("label",{text:"状態",style:lblStyle},r3c);
    const stSel = ch("select",{style:fldStyle},r3c);
    for(const s of ["up","down","err-disabled"]){
      const o = ch("option",{value:s,text:s},stSel);
      if(s===(iface.status||"up")) o.selected = true;
    }
    stSel.addEventListener("change",()=>{ iface.status=stSel.value; renderAndSync(); });

    // Row 4: Port position (side + offset)
    const r4 = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 2fr",gap:"6px",marginTop:"4px",padding:"6px 6px 4px",background:"var(--bg3)",borderRadius:"3px",border:"1px dashed var(--border)"}},card);
    const r4a = ch("div",{},r4);
    ch("label",{text:"ポート配置",style:{ fontSize:"10px", color:"var(--accent)", display:"block", marginBottom:"1px", fontWeight:"700" }},r4a);
    const sideSel = ch("select",{style:fldStyle},r4a);
    const curSide = iface.port_position ? iface.port_position.side : "auto";
    for(const s of sides){
      const lbl2 = ({auto:"自動",top:"上",bottom:"下",left:"左",right:"右"})[s];
      const o = ch("option",{value:s,text:lbl2},sideSel);
      if(s===curSide) o.selected = true;
    }
    sideSel.addEventListener("change",()=>{
      pushUndo();
      if(sideSel.value === "auto"){
        delete iface.port_position;
      } else {
        iface.port_position = { side: sideSel.value, offset: (iface.port_position && iface.port_position.offset) || 0.5 };
      }
      renderAndSync(); openPropertyPanel();
    });
    const r4b = ch("div",{},r4);
    const offLblText = ()=>`位置オフセット: ${iface.port_position ? Math.round((iface.port_position.offset||0.5)*100) : 50}%`;
    const offLbl = ch("label",{text:offLblText(),style:lblStyle},r4b);
    const offIn = ch("input",{
      type:"range", min:"0", max:"1", step:"0.05",
      value: iface.port_position ? String(iface.port_position.offset||0.5) : "0.5",
      style:{ width:"100%", accentColor:"var(--accent)" }
    },r4b);
    offIn.disabled = !iface.port_position;
    offIn.addEventListener("input",()=>{
      if(!iface.port_position) return;
      iface.port_position.offset = +offIn.value;
      offLbl.textContent = offLblText();
      render();
    });
    offIn.addEventListener("change",()=>{
      if(iface.port_position){ pushUndo(); syncYamlFromConfig(); }
    });
  }

  ch("button", {
    text:"＋ インターフェース追加",
    style:{ width:"100%", marginTop:"6px", padding:"6px 8px",
      background:"var(--bg3)", border:"1px dashed var(--accent)",
      color:"var(--accent)", borderRadius:"4px", cursor:"pointer",
      fontSize:"11px", fontWeight:"600" },
    on:{ click:()=>{
      pushUndo();
      const num = obj.interfaces.length;
      let nextId = "eth"+num;
      const existing = new Set(obj.interfaces.map(i=>i.id));
      while(existing.has(nextId)){ nextId = "eth"+(parseInt(nextId.slice(3),10)+1); }
      obj.interfaces.push({
        id: nextId,
        ip:"", network:"", mac: genUniqueMac(), speed:1000, port_type:"rj45", status:"up"
      });
      renderAndSync(); openPropertyPanel();
      toast(`Interface ${nextId} を追加 (MAC自動生成)`, "ok");
    }}
  }, sec);

  // === Bonding section ===
  renderBondingSection(body, obj, kind);
  // === vPC section (switches only) ===
  if(kind === "device" && (obj.type === "l3switch" || obj.type === "l2switch")){
    renderVpcSection(body, obj);
  }
}

function renderBondingSection(parent, obj, kind){
  const sec = ch("div", { class:"sub-section", style:{ marginTop:"10px" } }, parent);
  obj.bonding = obj.bonding || {};
  const enabled = !!obj.bonding.enabled;
  if(enabled){
    helpBox(sec, "ボンディング/LACPとは？ 設定ガイド", [
      "これは何: 複数の物理NICを束ねて1本の論理リンク(bond0)にし、帯域増加と冗長化を行います。",
      "手順:",
      "1. モードを選ぶ: active-backup(冗長のみ) / 802.3ad LACP(動的集約・推奨) / balance-rr(負荷分散) など。",
      "2. 束ねるメンバーインターフェースにチェックを入れる(2本以上)。",
      "3. bond0にIP(Bond IP)を設定する。メンバー個別のIPは不要(bond0に集約)。",
      "4. 802.3adの場合はLACPレート(slow/fast)とシステム優先度を設定。相手側もLACPなら自動でバンドル形成。",
      "ポイント: 対向機器も同じ方式で設定する必要があります(LACP↔LACP)。",
      "例: スイッチとサーバを2本で接続しLACPにすると、1本切れても通信継続(冗長)＋合算帯域。"
    ], false);
  }
  const headerRow = ch("div",{
    style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px",
      padding:"6px 8px",background:enabled?"rgba(6,182,212,0.12)":"var(--bg2)",
      borderRadius:"5px",border:"1px solid "+(enabled?"var(--cyan)":"var(--border)")}
  },sec);
  const leftHd = ch("div",{style:{display:"flex",alignItems:"center",gap:"8px"}},headerRow);
  ch("span",{text:"🔗",style:{fontSize:"14px"}},leftHd);
  ch("h4",{text:"NIC ボンディング",style:{margin:0,fontSize:"12px",color:enabled?"var(--cyan)":"var(--text)"}},leftHd);
  const tgWrap = ch("label",{
    style:{display:"flex",alignItems:"center",gap:"4px",cursor:"pointer",fontSize:"11px"}
  },headerRow);
  const tg = ch("input",{type:"checkbox"},tgWrap);
  tg.checked = enabled;
  ch("span",{text: enabled ? "有効" : "無効",style:{color:enabled?"var(--cyan)":"var(--text-mute)",fontFamily:"var(--mono)"}},tgWrap);
  tg.addEventListener("change",()=>{
    pushUndo();
    obj.bonding.enabled = tg.checked;
    if(tg.checked){
      if(!obj.bonding.bond_name) obj.bonding.bond_name = "bond0";
      if(!obj.bonding.mode) obj.bonding.mode = "active-backup";
      if(!obj.bonding.members || !obj.bonding.members.length){
        obj.bonding.members = (obj.interfaces||[]).slice(0,Math.min(2,(obj.interfaces||[]).length)).map(i=>i.id);
      }
      if(!obj.bonding.primary && obj.bonding.members.length) obj.bonding.primary = obj.bonding.members[0];
    }
    renderAndSync(); openPropertyPanel();
    toast(`ボンディング ${tg.checked?"有効化":"無効化"}`, "ok");
  });

  if(!enabled){
    ch("div",{
      text:"チェックボックスを有効にすると、複数のインターフェースを束ねて可視化されます (LACP/active-backup/balance-rr 等)。",
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"6px 4px",lineHeight:"1.4"}
    },sec);
    return;
  }

  const ifs = obj.interfaces || [];
  const fldStyle = { width:"100%", padding:"4px 6px", fontSize:"11px", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:"3px", fontFamily:"var(--mono)" };
  const lblStyle = { fontSize:"10px", color:"var(--text-dim)", display:"block", marginBottom:"1px" };

  const row1 = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:"6px",marginBottom:"6px"}},sec);
  const r1a = ch("div",{},row1);
  ch("label",{text:"Bond名",style:lblStyle},r1a);
  const nameIn = ch("input",{type:"text",value:obj.bonding.bond_name||"bond0",style:fldStyle},r1a);
  nameIn.addEventListener("change",()=>{ obj.bonding.bond_name=nameIn.value||"bond0"; renderAndSync(); });
  const r1b = ch("div",{},row1);
  ch("label",{text:"モード",style:lblStyle},r1b);
  const modeSel = ch("select",{style:fldStyle},r1b);
  const modes = [
    { v:"active-backup", l:"active-backup (Mode 1)" },
    { v:"balance-rr",    l:"balance-rr (Mode 0)" },
    { v:"balance-xor",   l:"balance-xor (Mode 2)" },
    { v:"broadcast",     l:"broadcast (Mode 3)" },
    { v:"802.3ad",       l:"802.3ad LACP (Mode 4)" },
    { v:"balance-tlb",   l:"balance-tlb (Mode 5)" },
    { v:"balance-alb",   l:"balance-alb (Mode 6)" }
  ];
  for(const m of modes){
    const o = ch("option",{value:m.v,text:m.l},modeSel);
    if(m.v===(obj.bonding.mode||"active-backup")) o.selected = true;
  }
  modeSel.addEventListener("change",()=>{ obj.bonding.mode=modeSel.value; renderAndSync(); openPropertyPanel(); });

  // LACP-specific options (only for 802.3ad)
  if((obj.bonding.mode||"active-backup")==="802.3ad"){
    obj.bonding.lacp = obj.bonding.lacp || { rate:"slow", system_priority:32768 };
    const lacpBox = ch("div",{style:{border:"1px solid var(--cyan)",borderRadius:"4px",padding:"6px",margin:"6px 0",background:"rgba(0,200,255,0.04)"}},sec);
    ch("div",{text:"🔗 LACP (IEEE 802.3ad) 設定",style:{fontSize:"11px",fontWeight:"700",color:"var(--cyan)",marginBottom:"4px"}},lacpBox);
    const lrow = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}},lacpBox);
    const la = ch("div",{},lrow);
    ch("label",{text:"LACPレート",style:lblStyle},la);
    const rateSel = ch("select",{style:fldStyle},la);
    for(const r of [["slow","slow (30秒)"],["fast","fast (1秒)"]]){ const o=ch("option",{value:r[0],text:r[1]},rateSel); if(r[0]===obj.bonding.lacp.rate)o.selected=true; }
    rateSel.addEventListener("change",()=>{ obj.bonding.lacp.rate=rateSel.value; renderAndSync(); });
    const lb = ch("div",{},lrow);
    ch("label",{text:"システム優先度",style:lblStyle},lb);
    const spIn = ch("input",{type:"number",value:obj.bonding.lacp.system_priority||32768,style:fldStyle},lb);
    spIn.addEventListener("change",()=>{ obj.bonding.lacp.system_priority=+spIn.value||32768; renderAndSync(); });
    // negotiation status (LACP forms a bundle when the peer is also LACP)
    let negNote = "相手側がLACPなら自動ネゴシエーションでバンドル(LAG)を形成します。";
    ch("div",{text:negNote,style:{fontSize:"9.5px",color:"var(--text-mute)",marginTop:"4px",lineHeight:"1.4"}},lacpBox);
  }

  ch("label",{text:`メンバーインターフェース (${(obj.bonding.members||[]).length}個選択中)`,
    style:{ ...lblStyle, marginTop:"4px" }},sec);
  const memList = ch("div",{
    style:{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",
      padding:"4px",maxHeight:"110px",overflowY:"auto"}
  },sec);
  if(!ifs.length){
    ch("div",{text:"(インターフェースなし — 上で追加してください)",
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"4px"}},memList);
  } else {
    for(const iface of ifs){
      const row = ch("label",{
        style:{ display:"flex", alignItems:"center", gap:"6px", padding:"3px 4px", fontSize:"11px", cursor:"pointer", borderRadius:"2px" }
      },memList);
      const cb = ch("input",{type:"checkbox"},row);
      cb.checked = (obj.bonding.members||[]).includes(iface.id);
      ch("span",{text:iface.id,style:{fontFamily:"var(--mono)",fontWeight:"600",minWidth:"70px"}},row);
      ch("span",{text:iface.ip||"(no IP)",style:{color:"var(--text-mute)",fontSize:"10px",fontFamily:"var(--mono)"}},row);
      cb.addEventListener("change",()=>{
        obj.bonding.members = obj.bonding.members || [];
        if(cb.checked){
          if(!obj.bonding.members.includes(iface.id)) obj.bonding.members.push(iface.id);
          // Bonded members must not carry their own IP — clear it (moves to bond0)
          if(iface.ip) iface.ip = "";
          if(iface.ipv6) iface.ipv6 = "";
        } else {
          obj.bonding.members = obj.bonding.members.filter(x=>x!==iface.id);
          if(obj.bonding.primary === iface.id) obj.bonding.primary = obj.bonding.members[0]||"";
        }
        if(typeof ensureBond0Interface === "function") ensureBond0Interface(obj);
        renderAndSync(); openPropertyPanel();
      });
    }
  }

  const showPrimary = (obj.bonding.mode||"active-backup") === "active-backup";
  const row3 = ch("div",{style:{display:"grid",gridTemplateColumns: showPrimary?"1fr 1.5fr":"1fr",gap:"6px",marginTop:"6px"}},sec);
  if(showPrimary){
    const r3a = ch("div",{},row3);
    ch("label",{text:"Primary Member",style:lblStyle},r3a);
    const pSel = ch("select",{style:fldStyle},r3a);
    for(const m of (obj.bonding.members||[])){
      const o = ch("option",{value:m,text:m},pSel);
      if(m===obj.bonding.primary) o.selected = true;
    }
    pSel.addEventListener("change",()=>{
      obj.bonding.primary = pSel.value;
      if(typeof ensureBond0Interface === "function") ensureBond0Interface(obj);
      renderAndSync();
      openPropertyPanel();   // refresh the panel so the new primary is reflected
      toast("Primary を "+pSel.value+" に変更", "ok");
    });
  }
  const r3b = ch("div",{},row3);
  const bondIpEmpty = !obj.bonding.bond_ip;
  ch("label",{
    text: bondIpEmpty ? "⚠ Bond IPv4 (必須!)" : "✓ Bond IPv4 (例: 10.0.0.10/24)",
    style:{ ...lblStyle, color: bondIpEmpty ? "var(--red)" : "var(--green)", fontWeight:"700" }
  },r3b);
  const _bsug = ipSuggestions();
  const _bdl4 = makeSuggestDatalist(r3b, _bsug.v4);
  const bipIn = ch("input",{type:"text",value:obj.bonding.bond_ip||"",placeholder:"10.0.0.10/24 (必須)",list:_bdl4,
    style:{ ...fldStyle, border: bondIpEmpty ? "2px solid var(--red)" : "1px solid var(--green)" }},r3b);
  bipIn.addEventListener("change",()=>{
    obj.bonding.bond_ip=bipIn.value;
    // Sync to bond0 virtual interface
    if(typeof ensureBond0Interface === "function") ensureBond0Interface(obj);
    renderAndSync(); openPropertyPanel();
  });
  // Bond IPv6 row
  const r3c = ch("div",{style:{marginTop:"6px"}},sec);
  ch("label",{text:"Bond IPv6 (任意: 2001:db8::10/64)",style:lblStyle},r3c);
  const _bdl6 = makeSuggestDatalist(r3c, _bsug.v6);
  const b6In = ch("input",{type:"text",value:obj.bonding.bond_ipv6||"",placeholder:"2001:db8::10/64",list:_bdl6,style:fldStyle},r3c);
  b6In.addEventListener("change",()=>{
    obj.bonding.bond_ipv6=b6In.value;
    if(typeof ensureBond0Interface === "function") ensureBond0Interface(obj);
    renderAndSync();
  });
  // Mandatory IP warning banner
  if(bondIpEmpty){
    ch("div", {
      text:"⚠ ボンディング有効時は Bond IPv4 の設定が必須です。物理メンバーIFではなく、この論理 Bond IP に通信が集約されます。",
      style:{ marginTop:"6px", padding:"6px 8px", fontSize:"10px", lineHeight:"1.4",
        background:"rgba(248,81,73,0.12)", border:"1px solid var(--red)", borderRadius:"4px", color:"var(--red)" }
    }, sec);
  } else {
    // Show the bond0 logical interface summary
    ch("div", {
      html:`🔗 論理インターフェース <b style="font-family:var(--mono)">${escapeHtml(obj.bonding.bond_name||"bond0")}</b> = ${(obj.bonding.members||[]).map(escapeHtml).join(" + ")} → <b style="font-family:var(--mono);color:var(--cyan,#06b6d4)">${escapeHtml(obj.bonding.bond_ip)}</b>`,
      style:{ marginTop:"6px", padding:"6px 8px", fontSize:"10px", lineHeight:"1.5",
        background:"rgba(6,182,212,0.1)", border:"1px solid var(--cyan,#06b6d4)", borderRadius:"4px", color:"var(--text)" }
    }, sec);
  }
}

function renderVpcSection(parent, obj){
  const sec = ch("div", { class:"sub-section", style:{ marginTop:"10px" } }, parent);
  obj.vpc = obj.vpc || {};
  const enabled = !!obj.vpc.enabled;
  const headerRow = ch("div",{
    style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px",
      padding:"6px 8px",background:enabled?"rgba(163,113,247,0.12)":"var(--bg2)",
      borderRadius:"5px",border:"1px solid "+(enabled?"var(--purple)":"var(--border)")}
  },sec);
  const leftHd = ch("div",{style:{display:"flex",alignItems:"center",gap:"8px"}},headerRow);
  ch("span",{text:"🟣",style:{fontSize:"14px"}},leftHd);
  ch("h4",{text:"vPC (Virtual Port-Channel)",style:{margin:0,fontSize:"12px",color:enabled?"var(--purple)":"var(--text)"}},leftHd);
  const tgWrap = ch("label",{style:{ display:"flex", alignItems:"center", gap:"4px", cursor:"pointer", fontSize:"11px" }},headerRow);
  const tg = ch("input",{type:"checkbox"},tgWrap);
  tg.checked = enabled;
  ch("span",{text: enabled ? "有効" : "無効",style:{color:enabled?"var(--purple)":"var(--text-mute)",fontFamily:"var(--mono)"}},tgWrap);
  tg.addEventListener("change",()=>{
    pushUndo();
    obj.vpc.enabled = tg.checked;
    if(tg.checked){
      if(!obj.vpc.domain) obj.vpc.domain = 1;
    } else {
      // Disabling → clear the reciprocal config on the peer so no phantom domain remains
      const peerId = obj.vpc.peer;
      if(peerId){
        const peer = Cfg.byId("devices", peerId);
        if(peer && peer.vpc && peer.vpc.peer === obj.id){
          peer.vpc.enabled = false;
          peer.vpc.peer = "";
        }
      }
      obj.vpc.peer = "";
    }
    renderAndSync(); openPropertyPanel();
    toast(`vPC ${tg.checked?"有効化":"無効化"}`, "ok");
  });
  if(!enabled){
    ch("div",{
      text:"vPCを有効化すると2台のスイッチがピアとして表示され、紫色のpeer-linkが描画されます。",
      style:{fontSize:"10px",color:"var(--text-mute)",padding:"6px 4px",lineHeight:"1.4"}
    },sec);
    return;
  }
  const fldStyle = { width:"100%", padding:"4px 6px", fontSize:"11px", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:"3px", fontFamily:"var(--mono)" };
  const lblStyle = { fontSize:"10px", color:"var(--text-dim)", display:"block", marginBottom:"1px" };
  const allSwitches = (App.config.devices||[]).filter(d=>d.id !== obj.id && (d.type==="l3switch"||d.type==="l2switch"));
  const row = ch("div",{style:{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr",gap:"6px"}},sec);
  const r1 = ch("div",{},row);
  ch("label",{text:"Peer Device",style:lblStyle},r1);
  const pSel = ch("select",{style:fldStyle},r1);
  ch("option",{value:"",text:"-- 選択 --"},pSel);
  for(const sw of allSwitches){
    const o = ch("option",{value:sw.id,text:sw.id+(sw.label?" ("+sw.label+")":"")},pSel);
    if(sw.id===obj.vpc.peer) o.selected = true;
  }
  pSel.addEventListener("change",()=>{
    pushUndo();
    const oldPeerId = obj.vpc.peer;
    const newPeerId = pSel.value;
    // Clear the OLD peer's reciprocal vPC config if it pointed back to us
    if(oldPeerId && oldPeerId !== newPeerId){
      const oldPeer = Cfg.byId("devices", oldPeerId);
      if(oldPeer && oldPeer.vpc && oldPeer.vpc.peer === obj.id){
        oldPeer.vpc.enabled = false;
        oldPeer.vpc.peer = "";
      }
    }
    obj.vpc.peer = newPeerId;
    if(newPeerId){
      const peer = Cfg.byId("devices", newPeerId);
      if(peer){
        peer.vpc = peer.vpc || {};
        peer.vpc.enabled = true;
        peer.vpc.peer = obj.id;
        peer.vpc.domain = obj.vpc.domain || 1;
      }
    } else {
      // Peer cleared (-- 選択 --) → no domain for this device
      obj.vpc.enabled = false;
    }
    renderAndSync();
    openPropertyPanel();
  });
  const r2 = ch("div",{},row);
  ch("label",{text:"Domain ID",style:lblStyle},r2);
  const dIn = ch("input",{type:"number",value:String(obj.vpc.domain||1),style:fldStyle},r2);
  dIn.addEventListener("change",()=>{ obj.vpc.domain=+dIn.value||1; renderAndSync(); });
  const r3 = ch("div",{},row);
  ch("label",{text:"Keepalive IP",style:lblStyle},r3);
  const kIn = ch("input",{type:"text",value:obj.vpc.keepalive||"",placeholder:"10.255.0.1",style:fldStyle},r3);
  kIn.addEventListener("change",()=>{ obj.vpc.keepalive=kIn.value; renderAndSync(); });
}

function renameId(kind, oldId, newId){
  const col = kindToCol(kind);
  const arr = App.config[col] || [];
  if(arr.some(x => x.id === newId && x.id !== oldId)){
    Log.warn(`ID "${newId}" は既に使用されています`);
    return;
  }
  const obj = Cfg.byId(col, oldId);
  if(!obj) return;
  pushUndo();
  obj.id = newId;
  // update references
  if(kind === "server"){
    for(const sv of (App.config.services||[])) if(sv.server===oldId) sv.server = newId;
    for(const c of (App.config.connections||[])){
      if(c.from && c.from.server===oldId) c.from.server = newId;
      if(c.to && c.to.server===oldId) c.to.server = newId;
    }
  } else if(kind === "device"){
    for(const c of (App.config.connections||[])){
      if(c.from && c.from.device===oldId) c.from.device = newId;
      if(c.to && c.to.device===oldId) c.to.device = newId;
    }
    for(const rt of (App.config.routing_tables||[])) if(rt.device===oldId) rt.device = newId;
    for(const p of (App.config.policies||[])) if(p.device===oldId) p.device = newId;
    for(const v of (App.config.vpn_tunnels||[])){
      for(const ep of (v.endpoints||[])) if(ep.device===oldId) ep.device = newId;
    }
  } else if(kind === "service"){
    for(const sv of (App.config.services||[])){
      if(sv.depends_on) sv.depends_on = sv.depends_on.map(x=> x===oldId ? newId : x);
      if(sv.config && sv.config.upstream)
        sv.config.upstream = sv.config.upstream.map(x=> x===oldId ? newId : x);
      if(sv.config && sv.config.replication_to)
        sv.config.replication_to = sv.config.replication_to.map(x=> x===oldId ? newId : x);
    }
    for(const sc of (App.config.scenarios||[])){
      for(const st of (sc.steps||[])){
        if(st.from === oldId) st.from = newId;
        if(st.to === oldId) st.to = newId;
      }
    }
  } else if(kind === "network"){
    for(const d of [...(App.config.devices||[]), ...(App.config.servers||[])]){
      for(const i of (d.interfaces||[])) if(i.network===oldId) i.network = newId;
    }
  }
  App.selected = { kind, id:newId };
  renderAndSync();
  openPropertyPanel();
}

/* ====== DIALOGS ====== */
function openDialog(title, contentFn, opts){
  opts = opts || {};
  const floating = !!opts.floating;
  const overlay = $("#dialog-overlay");
  const d = $("#dialog");
  d.innerHTML = "";
  // Floating mode: transparent overlay that lets clicks reach the canvas behind it,
  // and the dialog opens near a corner instead of centered+dimmed.
  overlay.classList.toggle("floating", floating);
  d.style.position = "absolute";
  d.style.transform = "";
  d.style.margin = "";
  if(floating){
    // Open at a sensible default spot (top-right area) unless previously moved
    d.style.left = (window.innerWidth - 460) + "px";
    d.style.top  = "80px";
  } else {
    d.style.left = "";
    d.style.top = "";
  }
  const h3 = ch("h3", { text:title, style:{ cursor:"move", userSelect:"none" } }, d);
  // Drag-to-move handler on the title bar
  let dragData = null;
  h3.addEventListener("mousedown", (e)=>{
    if(e.button !== 0) return;
    const rect = d.getBoundingClientRect();
    if(!d.style.left || d.style.left === ""){
      d.style.left = rect.left + "px";
      d.style.top  = rect.top  + "px";
    }
    d.style.transform = "none";
    d.style.margin = "0";
    dragData = { startX: e.clientX, startY: e.clientY,
                 origLeft: parseFloat(d.style.left), origTop: parseFloat(d.style.top) };
    e.preventDefault();
  });
  function onMove(e){
    if(!dragData) return;
    const dx = e.clientX - dragData.startX;
    const dy = e.clientY - dragData.startY;
    const newL = Math.max(0, Math.min(window.innerWidth - 60, dragData.origLeft + dx));
    const newT = Math.max(0, Math.min(window.innerHeight - 60, dragData.origTop  + dy));
    d.style.left = newL + "px";
    d.style.top  = newT + "px";
  }
  function onUp(){ dragData = null; }
  if(!d._dragWired){
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    d._dragWired = true;
  }
  const body = ch("div", {}, d);
  const result = contentFn(body) || {};
  const actions = ch("div", { class:"actions" }, d);
  for(const b of (result.buttons || [{ text:"閉じる", action: closeDialog }])){
    const btn = ch("button", { text:b.text, class: b.primary?"primary":"" }, actions);
    btn.addEventListener("click", b.action);
  }
  overlay.classList.remove("hidden");
}
function closeDialog(){
  const overlay = $("#dialog-overlay");
  overlay.classList.add("hidden");
  overlay.classList.remove("floating");
}

function showRoutingTable(deviceId){
  const dev = Cfg.byId("devices", deviceId);
  openDialog(`ルーティングテーブル — ${deviceId}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      // Find or create the routing table entry
      let rt = (App.config.routing_tables||[]).find(r=>r.device===deviceId);
      ch("p", {
        text:"スタティックルートを追加・編集・削除できます。宛先ネットワーク (CIDR)、ネクストホップ、出力インターフェースを指定してください。",
        style:{margin:"0 0 10px 0",fontSize:"11px",color:"var(--text-dim)",lineHeight:"1.5"}
      }, body);

      if(rt && rt.routes && rt.routes.length){
        const tbl = ch("table", { style:{fontSize:"11px"} }, body);
        const tr = ch("tr", {}, ch("thead", {}, tbl));
        for(const h of ["宛先","Next Hop","IF","Metric","Type","状態",""]) ch("th", { text:h }, tr);
        const tb = ch("tbody", {}, tbl);
        for(let ri=0; ri<rt.routes.length; ri++){
          const r = rt.routes[ri];
          const row = ch("tr", {}, tb);
          ch("td", { text:r.destination||"" }, row);
          ch("td", { text:r.next_hop||"-" }, row);
          ch("td", { text:r.interface||"" }, row);
          ch("td", { text:String(r.metric==null?"":r.metric) }, row);
          ch("td", { text:r.type||"static" }, row);
          const td = ch("td", {}, row);
          ch("span", { class:"tag "+(r.status==="active"?"up":"down"), text:r.status||"active" }, td);
          const actTd = ch("td", {}, row);
          ch("button", { text:"×",
            style:{background:"transparent",border:"1px solid var(--red)",color:"var(--red)",padding:"1px 6px",fontSize:"10px",cursor:"pointer",borderRadius:"3px"},
            on:{ click:()=>{
              pushUndo();
              rt.routes.splice(ri,1);
              renderAndSync(); refresh();
              toast("ルートを削除", "ok");
            }}
          }, actTd);
        }
      } else {
        ch("div", { text:"(ルート未定義)", style:{padding:"10px",textAlign:"center",color:"var(--text-mute)"} }, body);
      }

      // Add-route form
      ch("h4", { text:"＋ ルート追加", style:{margin:"12px 0 6px",fontSize:"12px",color:"var(--accent)"} }, body);
      const form = ch("div", { style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"} }, body);
      let dest="", nh="", iface="", metric=1, rtype="static";
      const _rsug = ipSuggestions();
      const _rdlDest = makeSuggestDatalist(form, _rsug.cidr.concat(_rsug.v4));
      const _rdlNh = makeSuggestDatalist(form, _rsug.v4);
      const f1 = ch("div",{},form);
      ch("label",{text:"宛先 CIDR (例 10.5.0.0/24, 0.0.0.0/0)",style:{fontSize:"10px",color:"var(--text-dim)"}},f1);
      const destIn = ch("input",{type:"text",placeholder:"10.5.0.0/24",list:_rdlDest,style:{width:"100%",padding:"4px",fontSize:"11px",fontFamily:"var(--mono)"}},f1);
      const f2 = ch("div",{},form);
      ch("label",{text:"Next Hop (例 10.1.0.1)",style:{fontSize:"10px",color:"var(--text-dim)"}},f2);
      const nhIn = ch("input",{type:"text",placeholder:"10.1.0.1",list:_rdlNh,style:{width:"100%",padding:"4px",fontSize:"11px",fontFamily:"var(--mono)"}},f2);
      const f3 = ch("div",{},form);
      ch("label",{text:"出力インターフェース",style:{fontSize:"10px",color:"var(--text-dim)"}},f3);
      const ifSel = ch("select",{style:{width:"100%",padding:"4px",fontSize:"11px"}},f3);
      ch("option",{value:"",text:"-- 選択 --"},ifSel);
      for(const it of (dev&&dev.interfaces||[])) ch("option",{value:it.id,text:it.id},ifSel);
      const f4 = ch("div",{},form);
      ch("label",{text:"Metric",style:{fontSize:"10px",color:"var(--text-dim)"}},f4);
      const metricIn = ch("input",{type:"number",value:"1",style:{width:"100%",padding:"4px",fontSize:"11px"}},f4);

      return; // refresh ends; buttons added by outer
    }
    refresh();
    // store refresh on body for button access
    body._refresh = refresh;
    return {
      buttons:[
        { text:"閉じる", action: closeDialog },
        { text:"＋ ルート追加", primary:true, action:()=>{
          // Read the form inputs from the DOM
          const inputs = body.querySelectorAll("input, select");
          // inputs order: destIn, nhIn, ifSel, metricIn
          const destIn = inputs[0], nhIn = inputs[1], ifSel = inputs[2], metricIn = inputs[3];
          if(!destIn || !destIn.value.trim()){ toast("宛先CIDRは必須です","err"); return; }
          let rt = (App.config.routing_tables||[]).find(r=>r.device===deviceId);
          if(!rt){
            rt = { device: deviceId, routes: [] };
            App.config.routing_tables = App.config.routing_tables || [];
            App.config.routing_tables.push(rt);
          }
          pushUndo();
          rt.routes.push({
            destination: destIn.value.trim(),
            next_hop: (nhIn.value||"").trim() || "0.0.0.0",
            interface: ifSel.value || "",
            metric: +metricIn.value || 1,
            type: "static",
            status: "active"
          });
          renderAndSync();
          toast("ルートを追加", "ok");
          body._refresh();
        }}
      ]
    };
  });
}

function showArpTable(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  openDialog(`ARP テーブル — ${id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      if(!obj || !obj.interfaces){ ch("p", { text:"(no interfaces)" }, body); return; }
      ch("p", {
        text:"動的ARP (接続から自動学習) と静的ARP (手動追加) を表示します。",
        style:{margin:"0 0 8px 0",fontSize:"11px",color:"var(--text-dim)"}
      }, body);
      const tbl = ch("table", { style:{fontSize:"11px"} }, body);
      const head = ch("tr", {}, ch("thead", {}, tbl));
      for(const h of ["IP Address","MAC Address","Interface","Type",""]) ch("th", { text:h }, head);
      const tb = ch("tbody", {}, tbl);
      let count = 0;
      // Dynamic entries (learned from connections)
      for(const i of obj.interfaces){
        if(!i.ip && !i.ipv6) continue;
        for(const c of (App.config.connections||[])){
          if(c.status === "down") continue;
          let me, peer;
          if(c.from && (c.from.device===id||c.from.server===id) && c.from.interface===i.id){ me=c.from; peer=c.to; }
          else if(c.to && (c.to.device===id||c.to.server===id) && c.to.interface===i.id){ me=c.to; peer=c.from; }
          else continue;
          const pk = peer.device ? "device" : "server";
          const pObj = Cfg.byId(kindToCol(pk), peer.device||peer.server);
          if(!pObj) continue;
          const pIf = (pObj.interfaces||[]).find(x=>x.id===peer.interface);
          if(!pIf) continue;
          const row = ch("tr", {}, tb);
          ch("td", { text:(pIf.ip||pIf.ipv6||"").split("/")[0] }, row);
          ch("td", { text:pIf.mac||"-" }, row);
          ch("td", { text:i.id }, row);
          ch("td", { text:"dynamic", style:{color:"var(--text-mute)"} }, row);
          ch("td", {}, row);
          count++;
        }
      }
      // Static entries
      obj.arp_static = obj.arp_static || [];
      for(let ai=0; ai<obj.arp_static.length; ai++){
        const a = obj.arp_static[ai];
        const row = ch("tr", {}, tb);
        ch("td", { text:a.ip||"" }, row);
        ch("td", { text:a.mac||"" }, row);
        ch("td", { text:a.interface||"-" }, row);
        ch("td", { text:"static", style:{color:"var(--accent)",fontWeight:"700"} }, row);
        const actTd = ch("td", {}, row);
        ch("button", { text:"×",
          style:{background:"transparent",border:"1px solid var(--red)",color:"var(--red)",padding:"1px 6px",fontSize:"10px",cursor:"pointer",borderRadius:"3px"},
          on:{ click:()=>{ pushUndo(); obj.arp_static.splice(ai,1); renderAndSync(); refresh(); toast("静的ARP削除","ok"); }}
        }, actTd);
        count++;
      }
      if(count === 0) ch("p", { text:"(ARPエントリなし)", style:{color:"var(--text-mute)",padding:"8px"} }, body);

      // Add static ARP form
      ch("h4", { text:"＋ 静的ARP追加", style:{margin:"12px 0 6px",fontSize:"12px",color:"var(--accent)"} }, body);
      const form = ch("div", { style:{display:"grid",gridTemplateColumns:"1fr 1fr 0.8fr",gap:"6px"} }, body);
      const f1=ch("div",{},form); ch("label",{text:"IP",style:{fontSize:"10px",color:"var(--text-dim)"}},f1);
      const ipIn=ch("input",{type:"text",placeholder:"10.1.0.50",style:{width:"100%",padding:"4px",fontSize:"11px",fontFamily:"var(--mono)"}},f1);
      const f2=ch("div",{},form); ch("label",{text:"MAC",style:{fontSize:"10px",color:"var(--text-dim)"}},f2);
      const macIn=ch("input",{type:"text",placeholder:"52:54:00:..",style:{width:"100%",padding:"4px",fontSize:"11px",fontFamily:"var(--mono)"}},f2);
      const f3=ch("div",{},form); ch("label",{text:"IF",style:{fontSize:"10px",color:"var(--text-dim)"}},f3);
      const ifSel=ch("select",{style:{width:"100%",padding:"4px",fontSize:"11px"}},f3);
      ch("option",{value:"",text:"--"},ifSel);
      for(const it of (obj.interfaces||[])) ch("option",{value:it.id,text:it.id},ifSel);
    }
    refresh();
    body._refresh = refresh;
    return {
      buttons:[
        { text:"閉じる", action: closeDialog },
        { text:"＋ 静的ARP追加", primary:true, action:()=>{
          const inputs = body.querySelectorAll("input, select");
          const ipIn = inputs[0], macIn = inputs[1], ifSel = inputs[2];
          if(!ipIn || !ipIn.value.trim() || !macIn.value.trim()){ toast("IP と MAC は必須です","err"); return; }
          pushUndo();
          obj.arp_static = obj.arp_static || [];
          obj.arp_static.push({ ip:ipIn.value.trim(), mac:macIn.value.trim(), interface:ifSel.value||"" });
          renderAndSync();
          toast("静的ARPを追加","ok");
          body._refresh();
        }}
      ]
    };
  });
}

function showInterfaces(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  openDialog(`Interfaces — ${id}`, (body)=>{
    if(!obj || !obj.interfaces || !obj.interfaces.length){ ch("p", { text:"(none)" }, body); return; }
    const tbl = ch("table", {}, body);
    const head = ch("tr", {}, ch("thead", {}, tbl));
    for(const h of ["ID","IP","MAC","Speed","Status","Network"]) ch("th", { text:h }, head);
    const tb = ch("tbody", {}, tbl);
    for(const i of obj.interfaces){
      const row = ch("tr", {}, tb);
      ch("td", { text:i.id||"" }, row);
      ch("td", { text:i.ip||"" }, row);
      ch("td", { text:i.mac||"" }, row);
      ch("td", { text:i.speed?(i.speed>=1000?(i.speed/1000)+"G":i.speed+"M"):"" }, row);
      const td = ch("td", {}, row);
      ch("span", { class:"tag "+(i.status==="up"?"up":i.status==="down"?"down":"err"), text:i.status||"up" }, td);
      ch("td", { text:i.network||"" }, row);
    }
  });
}

/* ====== INTERFACE MANAGEMENT DIALOGS (from context menu) ====== */
function promptAddInterface(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  const allNets = (App.config.networks||[]).map(n=>n.id);
  obj.interfaces = obj.interfaces || [];
  const existingIds = new Set(obj.interfaces.map(i=>i.id));
  let nextId = "eth"+obj.interfaces.length;
  while(existingIds.has(nextId)){ nextId = "eth"+(parseInt(nextId.slice(3),10)+1); }

  openDialog(`➕ インターフェース追加 — ${obj.label||id}`, (body)=>{
    addField(body, "ID", "text", nextId, v=>nextId=v.trim());
    let ip = "", ipv6 = "", network = "", mac = genUniqueMac(), speed = 1000, port_type = "rj45";
    addField(body, "IPv4 / CIDR (任意)", "text", "", v=>ip=v);
    addField(body, "IPv6 / CIDR (任意)", "text", "", v=>ipv6=v);
    const nf = ch("div",{class:"field"},body);
    ch("label",{text:"Network"},nf);
    const nSel = ch("select",{},nf);
    ch("option",{value:"",text:"-- 未割当 --"},nSel);
    for(const n of allNets) ch("option",{value:n,text:n},nSel);
    nSel.addEventListener("change",()=>network=nSel.value);
    addField(body, "MAC (自動生成済 - 編集可)", "text", mac, v=>mac=v);
    const row = ch("div",{class:"field-grid"},body);
    addField(row, "Speed (Mbps)", "number", 1000, v=>speed=+v||1000);
    const pf = ch("div",{class:"field"},row);
    ch("label",{text:"ポート種別"},pf);
    const pSel = ch("select",{},pf);
    for(const t of ["rj45","sfp","sfp+","qsfp","qsfp+","qsfp28","console","mgmt"]){
      const o = ch("option",{value:t,text:t.toUpperCase()},pSel);
      if(t === "rj45") o.selected = true;
    }
    pSel.addEventListener("change",()=>port_type=pSel.value);
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"追加", primary:true, action:()=>{
          if(!nextId){ toast("IDは必須です","err"); return; }
          if(existingIds.has(nextId)){ toast(`ID "${nextId}" は既に存在します`,"err"); return; }
          pushUndo();
          const newIf = { id:nextId, mac, speed, port_type, status:"up" };
          if(ip) newIf.ip = ip;
          if(ipv6) newIf.ipv6 = ipv6;
          if(network) newIf.network = network;
          obj.interfaces.push(newIf);
          renderAndSync();
          if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
          closeDialog();
          toast(`Interface ${nextId} を追加`, "ok");
        }}
      ]
    };
  });
}

function openInterfaceManager(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  openDialog(`✏ インターフェース管理 — ${obj.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      ch("p", {
        text:`${(obj.interfaces||[]).length} 個のインターフェース。各行をクリックで詳細編集 (プロパティパネル)。`,
        style:{margin:"0 0 8px 0",fontSize:"11px",color:"var(--text-dim)"}
      }, body);
      const list = ch("div", { style:{maxHeight:"300px",overflowY:"auto",border:"1px solid var(--border)",borderRadius:"4px",padding:"4px"} }, body);
      if(!obj.interfaces || !obj.interfaces.length){
        ch("div",{ text:"(インターフェースなし)", style:{padding:"12px",textAlign:"center",color:"var(--text-mute)"} },list);
      }
      for(let i=0;i<(obj.interfaces||[]).length;i++){
        const iface = obj.interfaces[i];
        const linked = (App.config.connections||[]).some(c=>
          ((c.from && (c.from.device===obj.id||c.from.server===obj.id) && c.from.interface===iface.id) ||
           (c.to && (c.to.device===obj.id||c.to.server===obj.id) && c.to.interface===iface.id)));
        const row = ch("div",{
          style:{display:"flex",alignItems:"center",gap:"8px",padding:"6px 8px",
            background:"var(--bg2)",borderRadius:"3px",marginBottom:"3px",
            borderLeft:"3px solid "+(linked?"var(--green)":"var(--border)")}
        },list);
        const tk = portTypeKey(iface);
        const sw = ({"rj45":"#5a6470","sfp":"#3b82f6","sfp-plus":"#f59e0b","qsfp":"#a855f7","qsfp-plus":"#a855f7","qsfp28":"#ef4444","console":"#06b6d4","mgmt":"#10b981"})[tk] || "#5a6470";
        ch("span",{style:{width:"14px",height:"10px",background:sw,borderRadius:"2px",display:"inline-block"}},row);
        ch("span",{text:portTypeLabel(iface),style:{fontFamily:"var(--mono)",fontSize:"10px",fontWeight:"700",color:"var(--accent)",minWidth:"60px"}},row);
        ch("span",{text:iface.id,style:{fontFamily:"var(--mono)",fontWeight:"600",minWidth:"80px"}},row);
        ch("span",{text:iface.ip||"(no IP)",style:{fontFamily:"var(--mono)",fontSize:"11px",color:"var(--text-dim)",flex:"1"}},row);
        ch("span",{
          class:"tag "+(iface.status==="up"?"up":iface.status==="down"?"down":"err"),
          text:iface.status||"up",
          style:{fontSize:"9px",padding:"1px 6px",borderRadius:"2px"}
        },row);
        ch("button",{
          text:"編集",
          style:{background:"transparent",border:"1px solid var(--accent)",color:"var(--accent)",padding:"2px 8px",fontSize:"10px",cursor:"pointer",borderRadius:"3px"},
          on:{ click:()=>{
            closeDialog();
            selectElement(kind, id);
            openPropertyPanel();
          }}
        }, row);
        ch("button",{
          text:"×",
          style:{background:"transparent",border:"1px solid var(--red)",color:"var(--red)",padding:"2px 8px",fontSize:"10px",cursor:"pointer",borderRadius:"3px"},
          on:{ click:()=>{
            if(!confirm(`Interface "${iface.id}" を削除しますか? (接続も切れます)`)) return;
            pushUndo();
            obj.interfaces.splice(i,1);
            renderAndSync();
            if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
            refresh();
            toast(`Interface ${iface.id} を削除`, "ok");
          }}
        }, row);
      }
    }
    refresh();
    return {
      buttons:[
        { text:"+ インターフェース追加", action:()=>{ closeDialog(); promptAddInterface(kind, id); }},
        { text:"閉じる", primary:true, action: closeDialog }
      ]
    };
  });
}

function openBondingDialog(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  obj.bonding = obj.bonding || {};
  openDialog(`🔗 ボンディング設定 — ${obj.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      const enabled = !!obj.bonding.enabled;

      // Enable toggle
      const tgF = ch("div",{class:"field",style:{padding:"8px",background:enabled?"rgba(6,182,212,0.12)":"var(--bg2)",borderRadius:"4px",border:"1px solid "+(enabled?"var(--cyan)":"var(--border)")}},body);
      const tgL = ch("label",{style:{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",margin:0}},tgF);
      const tg = ch("input",{type:"checkbox"},tgL);
      tg.checked = enabled;
      ch("span",{text:"NICボンディングを有効化 (複数IFを束ねる)",style:{fontWeight:"700",color:enabled?"var(--cyan)":"var(--text)"}},tgL);
      tg.addEventListener("change",()=>{
        pushUndo();
        obj.bonding.enabled = tg.checked;
        if(tg.checked){
          if(!obj.bonding.bond_name) obj.bonding.bond_name = "bond0";
          if(!obj.bonding.mode) obj.bonding.mode = "active-backup";
          if(!obj.bonding.members || !obj.bonding.members.length){
            obj.bonding.members = (obj.interfaces||[]).slice(0,Math.min(2,(obj.interfaces||[]).length)).map(i=>i.id);
          }
          if(!obj.bonding.primary && obj.bonding.members.length) obj.bonding.primary = obj.bonding.members[0];
        }
        renderAndSync();
        if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
        refresh();
        toast(`ボンディング ${tg.checked?"有効化":"無効化"}`, "ok");
      });

      if(!enabled){
        ch("div",{
          text:"このオブジェクトのインターフェースを2つ以上選択して、active-backup, LACP, balance-rr など各種モードで束ねます。シアン色のリンクで集約点を表示します。",
          style:{fontSize:"11px",color:"var(--text-dim)",padding:"10px",lineHeight:"1.5"}
        },body);
        return;
      }

      // Bond name + mode
      addField(body, "Bond名", "text", obj.bonding.bond_name||"bond0",
        v=>{ obj.bonding.bond_name=v||"bond0"; renderAndSync(); });
      addSelectField(body, "モード",
        ["active-backup","balance-rr","balance-xor","broadcast","802.3ad","balance-tlb","balance-alb"],
        obj.bonding.mode||"active-backup",
        v=>{ obj.bonding.mode=v; renderAndSync(); refresh(); });

      // Members
      const ifs = obj.interfaces || [];
      ch("label",{text:`メンバー (${(obj.bonding.members||[]).length}個選択中)`,
        style:{fontSize:"11px",color:"var(--text-dim)",display:"block",marginTop:"8px",marginBottom:"4px"}},body);
      const memList = ch("div",{
        style:{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",padding:"6px",maxHeight:"160px",overflowY:"auto"}
      },body);
      if(!ifs.length){
        ch("div",{text:"(インターフェースなし)",style:{fontSize:"11px",color:"var(--text-mute)",padding:"4px"}},memList);
      } else {
        for(const iface of ifs){
          const r = ch("label",{
            style:{display:"flex",alignItems:"center",gap:"8px",padding:"4px 6px",fontSize:"12px",cursor:"pointer",borderRadius:"2px"}
          },memList);
          const cb = ch("input",{type:"checkbox"},r);
          cb.checked = (obj.bonding.members||[]).includes(iface.id);
          ch("span",{text:iface.id,style:{fontFamily:"var(--mono)",fontWeight:"600",minWidth:"80px"}},r);
          ch("span",{text:iface.ip||"(no IP)",style:{color:"var(--text-mute)",fontSize:"11px",fontFamily:"var(--mono)"}},r);
          cb.addEventListener("change",()=>{
            obj.bonding.members = obj.bonding.members || [];
            if(cb.checked){
              if(!obj.bonding.members.includes(iface.id)) obj.bonding.members.push(iface.id);
            } else {
              obj.bonding.members = obj.bonding.members.filter(x=>x!==iface.id);
              if(obj.bonding.primary === iface.id) obj.bonding.primary = obj.bonding.members[0]||"";
            }
            renderAndSync();
            if(App.selected && App.selected.kind===kind && App.selected.id===id) openPropertyPanel();
            refresh();
          });
        }
      }

      // Primary (active-backup only)
      if((obj.bonding.mode||"active-backup") === "active-backup"){
        addSelectField(body, "Primary Member", obj.bonding.members||[], obj.bonding.primary||"",
          v=>{ obj.bonding.primary=v; renderAndSync(); });
      }
      addField(body, "Bond IP (例: 10.0.0.10/24)", "text", obj.bonding.bond_ip||"",
        v=>{ obj.bonding.bond_ip=v; renderAndSync(); });
    }
    refresh();
    return {
      buttons:[{ text:"閉じる", primary:true, action: closeDialog }]
    };
  });
}

function openVpcDialog(id){
  const obj = Cfg.byId("devices", id);
  if(!obj) return;
  obj.vpc = obj.vpc || {};
  openDialog(`🟣 vPC設定 — ${obj.label||id}`, (body)=>{
    function refresh(){
      body.innerHTML = "";
      const enabled = !!obj.vpc.enabled;
      const tgF = ch("div",{class:"field",style:{padding:"8px",background:enabled?"rgba(163,113,247,0.12)":"var(--bg2)",borderRadius:"4px",border:"1px solid "+(enabled?"var(--purple)":"var(--border)")}},body);
      const tgL = ch("label",{style:{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",margin:0}},tgF);
      const tg = ch("input",{type:"checkbox"},tgL);
      tg.checked = enabled;
      ch("span",{text:"vPCを有効化 (2台のスイッチをペアにする)",style:{fontWeight:"700",color:enabled?"var(--purple)":"var(--text)"}},tgL);
      tg.addEventListener("change",()=>{
        pushUndo();
        obj.vpc.enabled = tg.checked;
        if(tg.checked && !obj.vpc.domain) obj.vpc.domain = 1;
        if(!tg.checked){
          const peerId = obj.vpc.peer;
          if(peerId){
            const peer = Cfg.byId("devices", peerId);
            if(peer && peer.vpc && peer.vpc.peer === obj.id){
              peer.vpc.enabled = false; peer.vpc.peer = "";
            }
          }
          obj.vpc.peer = "";
        }
        renderAndSync();
        if(App.selected && App.selected.kind==="device" && App.selected.id===id) openPropertyPanel();
        refresh();
        toast(`vPC ${tg.checked?"有効化":"無効化"}`,"ok");
      });
      if(!enabled){
        ch("div",{
          text:"vPCを有効化すると2台のスイッチが仮想ペアとして表示され、紫色のpeer-linkが描画されます。",
          style:{fontSize:"11px",color:"var(--text-dim)",padding:"10px",lineHeight:"1.5"}
        },body);
        return;
      }
      const allSwitches = (App.config.devices||[]).filter(d=>d.id !== obj.id && (d.type==="l3switch"||d.type==="l2switch"));
      addSelectField(body, "Peer Device",
        ["",...allSwitches.map(s=>s.id)], obj.vpc.peer||"",
        v=>{
          pushUndo();
          const oldPeerId = obj.vpc.peer;
          if(oldPeerId && oldPeerId !== v){
            const oldPeer = Cfg.byId("devices", oldPeerId);
            if(oldPeer && oldPeer.vpc && oldPeer.vpc.peer === obj.id){
              oldPeer.vpc.enabled = false; oldPeer.vpc.peer = "";
            }
          }
          obj.vpc.peer = v;
          if(v){
            const peer = Cfg.byId("devices", v);
            if(peer){
              peer.vpc = peer.vpc || {};
              peer.vpc.enabled = true;
              peer.vpc.peer = obj.id;
              peer.vpc.domain = obj.vpc.domain || 1;
            }
          } else {
            obj.vpc.enabled = false;
          }
          renderAndSync();
          refresh();
        });
      addField(body, "Domain ID", "number", obj.vpc.domain||1,
        v=>{ obj.vpc.domain=+v||1; renderAndSync(); });
      addField(body, "Keepalive IP", "text", obj.vpc.keepalive||"",
        v=>{ obj.vpc.keepalive=v; renderAndSync(); });
    }
    refresh();
    return { buttons:[{ text:"閉じる", primary:true, action: closeDialog }] };
  });
}

function showServiceConfig(id){
  const sv = Cfg.byId("services", id);
  if(!sv) return;
  openDialog(`Service Config — ${id}`, (body)=>{
    const pre = ch("pre", {
      style:{ background:"var(--bg)", padding:"10px", borderRadius:"4px", fontSize:"11px",
        margin:"0", overflow:"auto", maxHeight:"400px", color:"var(--text)" }
    }, body);
    pre.textContent = YAML.stringify(sv);
  });
}

function showDependencyTree(id){
  openDialog(`Dependency Tree — ${id}`, (body)=>{
    const root = ch("div", { style:{ fontFamily:"var(--mono)", fontSize:"11px" } }, body);
    const visited = new Set();
    function walk(svId, depth, prefix){
      if(visited.has(svId)){
        ch("div", { text: "  ".repeat(depth) + prefix + svId + "  (循環参照)",
          style:{ color:"var(--orange)" } }, root);
        return;
      }
      visited.add(svId);
      const sv = Cfg.byId("services", svId);
      if(!sv){
        ch("div", { text:"  ".repeat(depth) + prefix + svId + "  (NOT FOUND)",
          style:{ color:"var(--red)" } }, root);
        return;
      }
      const col = sv.status==="running"?"var(--green)":sv.status==="error"?"var(--red)":"var(--grey)";
      ch("div", {
        text:"  ".repeat(depth) + prefix + sv.id + " ("+(sv.label||"")+") - " + (sv.status||"running"),
        style:{ color:col }
      }, root);
      for(const d of (sv.depends_on||[])){
        walk(d, depth+1, "└─ ");
      }
    }
    walk(id, 0, "");
  });
}

/* ====== GNS3-LIKE: CLI CONSOLE ====== */
function openCliConsole(kind, id){
  const obj = Cfg.byId(kindToCol(kind), id);
  if(!obj) return;
  // CLI mode state: "user" (>), "priv" (#), "config" (config)#, "config-if" (config-if)#, "config-vlan" (config-vlan)#
  // 'configContext' holds the current iface/vlan being configured
  const state = { mode: kind==="device" ? "priv" : "user", configContext: null };
  function buildPrompt(){
    const base = (obj.label||id).toLowerCase().replace(/[^a-z0-9-]/g,"");
    if(state.mode === "user")        return `${base}> `;
    if(state.mode === "priv")        return `${base}# `;
    if(state.mode === "config")      return `${base}(config)# `;
    if(state.mode === "config-if")   return `${base}(config-if)# `;
    if(state.mode === "config-vlan") return `${base}(config-vlan)# `;
    return `${base}# `;
  }
  openDialog(`💻 Console — ${obj.label||id} (${obj.type||kind})`, (body)=>{
    const term = ch("div",{class:"cli-terminal"},body);
    const out = ch("div",{class:"cli-out"},term);
    const inrow = ch("div",{class:"cli-input-row"},term);
    const psSpan = ch("span",{class:"cli-ps",text:buildPrompt()},inrow);
    const input = ch("input",{type:"text",autocomplete:"off",spellcheck:"false",placeholder:"help, enable, configure terminal, ..."},inrow);
    function refreshPrompt(){ psSpan.textContent = buildPrompt(); }
    function println(text, cls){
      const line = ch("div",{text:text},out);
      if(cls) line.className = cls;
      out.scrollTop = out.scrollHeight;
    }
    // Banner
    println(`*** ${obj.label||id} Console ***`, "cli-info");
    println(`Type: ${obj.type||""}  Status: ${obj.status||"running"}`, "cli-info");
    if(obj.model) println(`Model: ${obj.model}`, "cli-info");
    println("Type 'help' for commands.  'enable' → privileged.  'configure terminal' → config mode.", "cli-info");
    println("");

    function exec(line){
      println(buildPrompt()+line, "cli-cmd");
      const cmd = line.trim();
      if(!cmd) return;
      const args = cmd.split(/\s+/);
      const head = args[0].toLowerCase();
      try {
        cliExec(obj, kind, head, args, println, state);
        refreshPrompt();
      } catch(e){
        println("Error: "+e.message, "cli-err");
      }
    }
    const history = [];
    let hIdx = -1;
    input.addEventListener("keydown",(e)=>{
      if(e.key === "Enter"){
        const v = input.value;
        if(v.trim()) history.push(v);
        hIdx = history.length;
        input.value = "";
        exec(v);
      } else if(e.key === "ArrowUp"){
        e.preventDefault();
        if(history.length){
          hIdx = Math.max(0, hIdx-1);
          input.value = history[hIdx]||"";
        }
      } else if(e.key === "ArrowDown"){
        e.preventDefault();
        if(hIdx < history.length-1){ hIdx++; input.value = history[hIdx]; }
        else { hIdx = history.length; input.value = ""; }
      }
    });
    setTimeout(()=>input.focus(), 50);
    return { buttons:[{ text:"閉じる", action: closeDialog }] };
  });
}

function cliExec(obj, kind, cmd, args, println, state){
  const id = obj.id;
  const helpText = [
    "Available commands:",
    "  help                            - show this help",
    "  enable / disable                - toggle privileged mode",
    "  configure terminal              - enter config mode",
    "  exit / end                      - leave current mode",
    "  show running-config             - show full configuration",
    "  show interfaces [brief]         - list interfaces",
    "  show ip route                   - routing table (devices)",
    "  show ip interface brief         - interface summary",
    "  show arp                        - ARP cache",
    "  show version                    - device info",
    "  show vlan                       - VLAN table",
    "  show spanning-tree              - STP roles/states",
    "  show mac address-table          - MAC table (switches)",
    "  show lldp neighbors             - LLDP neighbors",
    "  show cdp neighbors              - CDP neighbors",
    "  show etherchannel summary       - port-channels (bonding/vPC)",
    "  show standby / vrrp / glbp      - FHRP gateway redundancy state",
    "  show cluster                    - server clustering (Active/Standby)",
    "  show k8s                        - Kubernetes クラスタ/Service/Pod",
    "  show ports / netstat            - server listening ports + host FW",
    "  show lb                         - load-balancer VIP pools",
    "  show gslb                       - GSLB DNS records",
    "  show ip eigrp neighbors         - EIGRP neighbors",
    "  show ip eigrp topology          - EIGRP DUAL (Successor/FS)",
    "  show access-lists               - ACL entries",
    "  show policy-map                 - QoS policy-maps",
    "  show ip ospf neighbor           - OSPF neighbors (simulated)",
    "  show ip bgp summary             - BGP peers (simulated)",
    "  show service                    - services on server",
    "  show policy                     - FW policies",
    "",
    "  In (config)# mode:",
    "    interface <id>                - configure an interface",
    "    vlan <id>                     - create/edit VLAN",
    "    hostname <name>               - change hostname",
    "    ip route DEST MASK NH         - add static route",
    "",
    "  In (config-if)# mode:",
    "    ip address X.X.X.X /N         - set IPv4",
    "    ipv6 address X::Y/N           - set IPv6",
    "    shutdown / no shutdown        - admin down/up",
    "    description <text>            - port description",
    "    speed <mbps>                  - port speed",
    "    switchport access vlan <id>   - assign VLAN",
    "    mac-address <mac>             - set MAC",
    "",
    "  ping <ip|host>                  - ping a destination",
    "  traceroute <ip|host>            - trace route",
    "  enable/disable interface <id>   - bring iface up/down (priv)",
    "  shutdown / no shutdown          - stop/start this device (priv)",
    "  write memory                    - save config snapshot",
    "  reload                          - restore config snapshot",
    "  clear                           - clear screen",
    "  exit                            - close console"
  ];
  // === Configuration mode handling (state-aware) ===
  if(state){
    // Mode transitions: enable/disable/exit/end/configure
    if(cmd === "enable" && state.mode === "user"){ state.mode = "priv"; return; }
    if(cmd === "disable" && state.mode === "priv"){ state.mode = "user"; return; }
    if(cmd === "end"){ state.mode = "priv"; state.configContext = null; return; }
    if(cmd === "exit"){
      if(state.mode === "config-if" || state.mode === "config-vlan"){
        state.mode = "config"; state.configContext = null; return;
      }
      if(state.mode === "config"){ state.mode = "priv"; return; }
      if(state.mode === "priv"){ state.mode = "user"; return; }
      // user mode → close
      closeDialog(); return;
    }
    if((cmd === "configure" || cmd === "conf") && state.mode === "priv"){
      const sub = (args[1]||"").toLowerCase();
      if(sub === "terminal" || sub === "t" || sub === ""){
        state.mode = "config";
        println("Enter configuration commands, one per line.  End with CNTL/Z (or 'end').");
        return;
      }
    }
    // In (config)# mode
    if(state.mode === "config"){
      // interface <id> → enter (config-if)#
      if(cmd === "interface" || cmd === "int"){
        const ifId = args[1];
        if(!ifId){ println("% Incomplete command — interface <id>","cli-err"); return; }
        const iface = (obj.interfaces||[]).find(i=>i.id===ifId || i.id.toLowerCase()===ifId.toLowerCase());
        if(!iface){ println(`% Interface ${ifId} not found`,"cli-err"); return; }
        state.mode = "config-if";
        state.configContext = iface.id;
        return;
      }
      // vlan <id> → enter (config-vlan)#
      if(cmd === "vlan"){
        const vid = parseInt(args[1],10);
        if(isNaN(vid)){ println("% VLAN id required","cli-err"); return; }
        // Find or create a network entry with this VLAN
        let net = (App.config.networks||[]).find(n=>n.vlan_id===vid);
        if(!net){
          pushUndo();
          net = { id: "vlan"+vid, label:`VLAN${vid}`, type:"vlan", kind:"physical", vlan_id: vid, x:200, y:200, width:400, height:120 };
          App.config.networks.push(net);
          renderAndSync();
          println(`(VLAN ${vid} created)`,"cli-info");
        }
        state.mode = "config-vlan";
        state.configContext = net.id;
        return;
      }
      if(cmd === "hostname"){
        if(!args[1]){ println("% Hostname required","cli-err"); return; }
        pushUndo();
        obj.label = args[1];
        renderAndSync();
        println(`(hostname set to ${args[1]})`,"cli-info");
        return;
      }
      if(cmd === "ip" && args[1] === "route"){
        // ip route DEST MASK NEXTHOP [metric]
        const dest = args[2], mask = args[3], nh = args[4];
        if(!dest || !mask || !nh){ println("% Usage: ip route DEST MASK NEXTHOP [metric]","cli-err"); return; }
        // Convert mask to /N (simple cases)
        const maskBits = (m)=>{ if(m.startsWith("/"))return parseInt(m.slice(1),10);
          const oct=m.split(".").map(n=>parseInt(n,10));
          let b=0; for(const o of oct){ b += (o.toString(2).match(/1/g)||[]).length; } return b; };
        const cidr = dest + "/" + maskBits(mask);
        pushUndo();
        let rt = (App.config.routing_tables||[]).find(r=>r.device===obj.id);
        if(!rt){ rt = { device:obj.id, routes:[] }; App.config.routing_tables.push(rt); }
        rt.routes.push({ destination: cidr, next_hop: nh, interface: args[5]||"", metric: +args[6]||1, type:"static", status:"active" });
        renderAndSync();
        println(`(static route added: ${cidr} via ${nh})`,"cli-info");
        return;
      }
      // Fall through to other cmds
    }
    // In (config-if)# mode
    if(state.mode === "config-if"){
      const iface = (obj.interfaces||[]).find(i=>i.id===state.configContext);
      if(!iface){ state.mode = "config"; state.configContext = null; return; }
      if(cmd === "shutdown"){ pushUndo(); iface.status = "down"; renderAndSync(); return; }
      if(cmd === "no" && args[1] === "shutdown"){ pushUndo(); iface.status = "up"; renderAndSync(); return; }
      if(cmd === "ip" && args[1] === "address"){
        const ip = args[2], mask = args[3];
        if(!ip){ println("% Usage: ip address X.X.X.X /N  (or X.X.X.X 255.255.255.0)","cli-err"); return; }
        let val = ip;
        if(mask){
          const bits = mask.startsWith("/") ? parseInt(mask.slice(1),10)
            : mask.split(".").reduce((b,o)=>b+((+o).toString(2).match(/1/g)||[]).length, 0);
          val = ip + "/" + bits;
        }
        pushUndo();
        iface.ip = val; renderAndSync();
        println(`(ip address ${val} set on ${iface.id})`,"cli-info");
        return;
      }
      if(cmd === "ipv6" && args[1] === "address"){
        pushUndo();
        iface.ipv6 = args[2] || ""; renderAndSync();
        println(`(ipv6 address ${args[2]} set)`,"cli-info");
        return;
      }
      if(cmd === "description"){
        pushUndo();
        iface.description = args.slice(1).join(" ");
        renderAndSync();
        return;
      }
      if(cmd === "speed"){
        pushUndo();
        iface.speed = parseInt(args[1],10) || 1000;
        renderAndSync();
        return;
      }
      if(cmd === "switchport" && args[1] === "access" && args[2] === "vlan"){
        const vid = parseInt(args[3],10);
        if(!isNaN(vid)){
          const net = (App.config.networks||[]).find(n=>n.vlan_id===vid);
          if(net){
            pushUndo();
            iface.network = net.id; renderAndSync();
            println(`(${iface.id} assigned to VLAN ${vid})`,"cli-info");
          } else println(`% VLAN ${vid} does not exist (create it first with 'vlan ${vid}')`,"cli-err");
        }
        return;
      }
      if(cmd === "mac-address"){
        pushUndo();
        iface.mac = args[1] || genUniqueMac();
        renderAndSync();
        return;
      }
    }
    // In (config-vlan)# mode
    if(state.mode === "config-vlan"){
      const net = Cfg.byId("networks", state.configContext);
      if(!net){ state.mode = "config"; state.configContext = null; return; }
      if(cmd === "name"){
        pushUndo();
        net.label = args.slice(1).join(" ");
        renderAndSync();
        return;
      }
    }
    // write memory / copy running-config startup-config — snapshot
    if((cmd === "write" && (args[1]||"") === "memory") ||
       (cmd === "copy" && args[1] === "running-config" && args[2] === "startup-config")){
      pushUndo();
      obj._config_snapshot = JSON.parse(JSON.stringify({
        interfaces: obj.interfaces || [],
        gateway: obj.gateway, gateway_v6: obj.gateway_v6,
        bonding: obj.bonding, vpc: obj.vpc, label: obj.label
      }));
      obj._snapshot_time = new Date().toISOString();
      renderAndSync();
      println("Building configuration...","cli-info");
      println("[OK]","cli-info");
      return;
    }
    if(cmd === "reload" && state.mode === "priv"){
      if(!obj._config_snapshot){
        println("% No saved config to reload from. Use 'write memory' first.","cli-err");
        return;
      }
      pushUndo();
      Object.assign(obj, obj._config_snapshot);
      renderAndSync();
      println(`(configuration restored from snapshot ${obj._snapshot_time})`,"cli-info");
      return;
    }
  }

  switch(cmd){
    case "help":
    case "?":
      for(const l of helpText) println(l);
      return;
    case "clear": {
      const out = println.__out || document.querySelector(".cli-out");
      if(out) out.innerHTML = "";
      return;
    }
    case "exit":
      closeDialog(); return;
    case "show": {
      const sub = (args[1]||"").toLowerCase();
      if(sub === "running-config"){
        println(YAML.stringify(obj));
      } else if(sub === "interfaces" || (sub === "ip" && (args[2]||"").toLowerCase() === "interface")){
        const brief = (args[2]||"").toLowerCase() === "interface" && (args[3]||"").toLowerCase() === "brief";
        if(!obj.interfaces || !obj.interfaces.length){ println("(no interfaces)"); return; }
        if(brief){
          println("Interface          IPv4-Address          IPv6-Address                       Status   Speed");
          println("-----------------  --------------------  ---------------------------------  -------  -------");
          for(const i of obj.interfaces){
            println(
              (i.id||"").padEnd(19) +
              ((i.ip||"-").padEnd(22)) +
              ((i.ipv6||"-").padEnd(35)) +
              ((i.status||"up").padEnd(9)) +
              (i.speed?(i.speed>=1000?(i.speed/1000)+"G":i.speed+"M"):"-")
            );
          }
        } else {
          for(const i of obj.interfaces){
            println(`interface ${i.id}`);
            if(i.ip)   println(`  ip address ${i.ip}`);
            if(i.ipv6) println(`  ipv6 address ${i.ipv6}`);
            if(!i.ip && !i.ipv6) println(`  no ip address`);
            if(i.mac) println(`  mac address ${i.mac}`);
            if(i.network) println(`  network ${i.network}`);
            if(i.speed) println(`  speed ${i.speed}M`);
            println(`  status ${i.status||"up"}`);
          }
        }
      } else if(sub === "mac" || (sub === "mac-address-table") || (sub === "mac" && (args[2]||"") === "address-table")){
        if(kind !== "device"){ println("% MAC address-table is only available on switches/devices","cli-err"); return; }
        const entries = buildMacTable(obj);
        if(!entries.length){ println("(MAC address-table is empty)"); return; }
        println("          Mac Address Table");
        println("-------------------------------------------");
        println("VLAN    Mac Address          Type        Port");
        println("----    -----------------    --------    ------------");
        for(const e of entries){
          println(
            String(e.vlan||"--").padEnd(8) +
            (e.mac||"-").padEnd(21) +
            (e.type||"DYNAMIC").padEnd(12) +
            (e.port||"-")
          );
        }
        println("");
        println(`Total Mac Addresses for this criterion: ${entries.length}`);
      } else if(sub === "lldp" && (args[2]||"").toLowerCase() === "neighbors"){
        const entries = buildLldpNeighbors(obj);
        if(!entries.length){ println("(No LLDP neighbors)"); return; }
        println("Capability codes:");
        println("    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device");
        println("    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other");
        println("");
        println("Device ID                Local Intf      Hold-time   Capability   Port ID");
        println("---------------------    ------------    --------    ----------   ------------");
        for(const e of entries){
          println(
            (e.neighborLabel||e.neighbor||"-").padEnd(25) +
            (e.localPort||"-").padEnd(16) +
            "120         " +
            (e.cap||"BR").padEnd(13) +
            (e.remotePort||"-")
          );
        }
        println("");
        println(`Total entries displayed: ${entries.length}`);
      } else if(sub === "cdp" && (args[2]||"").toLowerCase() === "neighbors"){
        // Cisco's CDP — same data as LLDP for simulation
        const entries = buildLldpNeighbors(obj);
        if(!entries.length){ println("(No CDP neighbors)"); return; }
        println("Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge");
        println("                  S - Switch, H - Host, I - IGMP, r - Repeater");
        println("");
        println("Device ID        Local Intf     Holdtme    Capability   Platform   Port ID");
        for(const e of entries){
          println(
            (e.neighborLabel||e.neighbor||"-").padEnd(17) +
            (e.localPort||"-").padEnd(15) +
            "150        " +
            (e.cap||"S").padEnd(13) +
            "NetSim     " +
            (e.remotePort||"-")
          );
        }
      } else if(sub === "vlan"){
        // show vlan [brief]
        const vlans = {};
        for(const net of (App.config.networks||[])){
          if(net.vlan_id) vlans[net.vlan_id] = vlans[net.vlan_id] || { name: net.label||net.id, ports:[] };
        }
        // Collect ports per VLAN from switch's interfaces
        if(kind === "device"){
          for(const i of (obj.interfaces||[])){
            if(i.network){
              const net = Cfg.byId("networks", i.network);
              if(net && net.vlan_id){
                vlans[net.vlan_id].ports.push(i.id);
              }
            }
          }
        }
        // Always include VLAN 1
        if(!vlans[1]) vlans[1] = { name:"default", ports:[] };
        println("VLAN Name                             Status    Ports");
        println("---- -------------------------------- --------- ------------------------------");
        const sorted = Object.keys(vlans).map(Number).sort((a,b)=>a-b);
        for(const v of sorted){
          const d = vlans[v];
          println(
            String(v).padEnd(5) +
            (d.name||"").padEnd(33) +
            "active    " +
            (d.ports.length ? d.ports.join(", ") : "")
          );
        }
      } else if(sub === "spanning-tree" || sub === "stp"){
        if(kind !== "device"){ println("(spanning-tree only on devices/switches)","cli-err"); return; }
        const stpData = computeStpForSwitch(obj);
        for(const v of stpData.vlans){
          println(`VLAN${String(v.vlan).padStart(4,'0')}`);
          println(`  Spanning tree enabled protocol rstp`);
          println(`  Root ID    Priority    ${v.rootPriority}`);
          println(`             Address     ${v.rootMac}`);
          if(v.isRoot) println(`             This bridge is the root`);
          else        println(`             Cost        ${v.rootCost}`);
          println(`  Bridge ID  Priority    ${v.bridgePriority}`);
          println(`             Address     ${v.bridgeMac}`);
          println("");
          println("Interface           Role Sts Cost      Prio.Nbr  Type");
          println("------------------- ---- --- --------- --------- --------");
          for(const p of v.ports){
            println(
              (p.iface||"").padEnd(20) +
              (p.role||"").padEnd(5) +
              (p.state||"").padEnd(4) +
              (String(p.cost||"4")).padEnd(10) +
              (p.prio||"128.1").padEnd(10) +
              "P2p"
            );
          }
          println("");
        }
      } else if(sub === "etherchannel"){
        // show etherchannel summary
        println("Flags:  D - down        P - bundled in port-channel");
        println("        I - stand-alone s - suspended");
        println("        H - Hot-standby (LACP only)");
        println("        R - Layer3      S - Layer2");
        println("        U - in use      f - failed to allocate aggregator");
        println("");
        println("Group  Port-channel  Protocol    Ports");
        println("------+-------------+-----------+----------------------------------------------");
        let group = 1;
        // Show bonding on this device/server
        if(obj.bonding && obj.bonding.enabled){
          const flags = (obj.bonding.members||[]).map(mid=>{
            const m = (obj.interfaces||[]).find(i=>i.id===mid);
            return `${mid}(${m && m.status==="up"?"P":"D"})`;
          }).join(" ");
          println(
            String(group).padEnd(7) +
            (obj.bonding.bond_name||"Po1").padEnd(14) +
            (obj.bonding.mode==="802.3ad"?"LACP       ":"Manual     ") +
            flags
          );
          group++;
        }
        // Show vPC member port-channels (connections with vpc_id involving this device)
        const vpcGroups = {};
        for(const c of (App.config.connections||[])){
          if(!c.vpc_id) continue;
          let myIf = null;
          if(c.from.device === id) myIf = c.from.interface;
          else if(c.to.device === id) myIf = c.to.interface;
          if(myIf){
            vpcGroups[c.vpc_id] = vpcGroups[c.vpc_id] || [];
            vpcGroups[c.vpc_id].push(myIf);
          }
        }
        for(const vid in vpcGroups){
          println(
            String(group).padEnd(7) +
            `Po${vid}`.padEnd(14) +
            "LACP-vPC   " +
            vpcGroups[vid].map(p=>`${p}(P)`).join(" ")
          );
          group++;
        }
        if(group === 1) println("(no port-channels configured)");
      } else if(sub === "k8s" || sub === "kubernetes" || (sub==="get" && (args[2]||"")==="svc")){
        const rep = (typeof buildK8sReport==="function") ? buildK8sReport() : [];
        if(!rep.length){ println("(Kubernetesクラスタ未定義)"); return; }
        for(const c of rep){
          println(`Cluster ${c.name}  pod-cidr ${c.pod_cidr}  svc-cidr ${c.service_cidr}`);
          println(`  Nodes: ${c.nodes.join(", ")||"(none)"}   Pods: ${c.pods}   Services: ${c.services}`);
          for(const s of c.services_detail){
            println(`  SVC ${s.name}.${s.ns} [${s.type}] ClusterIP=${s.cluster_ip||"-"} ExternalIP=${s.external_ip}`);
            println(`      ports: ${s.ports}`);
            println(`      endpoints: ${s.endpoints.join(", ")||"(none — selector不一致/Pod停止)"}`);
          }
          println("");
        }
      } else if(sub === "cluster"){
        // show cluster — server clustering state
        const cls = (typeof buildClusters==="function") ? buildClusters() : {};
        const mine = Object.values(cls).filter(c=> c.members.some(m=>m.server===id));
        if(!mine.length){ println("(this server is not in a cluster)"); return; }
        for(const c of mine){
          println(`Cluster: ${c.name}   VIP: ${c.vip||"(none)"}   Disk: ${c.disk}`);
          println(`  Status: ${c.status}`);
          println(`  Active node:  ${c.active||"(none)"}`+(c.active===id?" (local)":""));
          println(`  Standby node: ${c.standby||"(none)"}`);
          println("  Members:");
          for(const m of c.members){
            println(`    ${m.server.padEnd(16)} prio ${String(m.priority).padEnd(4)} ${m.up?"UP":"DOWN"}`);
          }
          println("");
        }
      } else if(sub === "lb" || (sub==="load-balancing") || (sub==="server" && (args[2]||"")==="farm")){
        if(kind !== "device"){ println("(load balancing on LB devices)","cli-err"); return; }
        const st = (typeof buildLbState==="function") ? buildLbState(obj) : [];
        if(!st.length){ println("(no load-balancer VIPs configured)"); return; }
        for(const v of st){
          println(`VIP ${v.vip}:${v.port||"*"}  algorithm=${v.algorithm}  healthy=${v.healthy}/${v.total}`);
          for(const m of v.members){
            println(`    ${m.server.padEnd(16)} weight ${String(m.weight).padEnd(3)} port ${String(m.port||"-").padEnd(6)} ${m.up?"UP":"DOWN"}`);
          }
          println("");
        }
      } else if(sub === "gslb"){
        if(kind !== "device"){ println("(GSLB on devices)","cli-err"); return; }
        const st = (typeof buildGslbState==="function") ? buildGslbState(obj) : [];
        if(!st.length){ println("(no GSLB domains configured)"); return; }
        for(const d of st){
          println(`Domain ${d.fqdn}  (DNS ${d.algorithm})`);
          for(const r of d.records){
            println(`    ${r.site_ip.padEnd(18)} weight ${String(r.weight).padEnd(3)} ${r.up?"UP":"DOWN"}`);
          }
          println("");
        }
      } else if(sub === "ports" || sub === "netstat" || (sub==="listen")){
        // show ports / netstat — server listening sockets + host firewall
        if(kind !== "server"){ println("(ポート確認はサーバで実行)","cli-err"); return; }
        const socks = (typeof buildServerPorts==="function") ? buildServerPorts(obj) : [];
        println("Proto  Local Port   State    Service");
        if(!socks.length) println("(待ち受けポートなし)");
        for(const s of socks){
          println(`${(s.proto||"tcp").padEnd(6)} ${String(s.port).padEnd(12)} ${(s.state||"").padEnd(8)} ${s.source||""}`);
        }
        if(obj.firewall && obj.firewall.enabled){
          println("");
          println(`Host Firewall: ENABLED (default inbound: ${obj.firewall.default_inbound||"allow"})`);
          (obj.firewall.rules||[]).forEach((r,i)=>{
            println(`  ${i+1}. ${(r.proto||"any")}/${r.port!=null?r.port:"any"} → ${r.action}`);
          });
        } else {
          println("");
          println("Host Firewall: disabled");
        }
      } else if(sub === "standby" || (sub==="vrrp") || (sub==="glbp")){
        // show standby / show vrrp / show glbp — FHRP state
        if(kind !== "device"){ println("(FHRP only on devices)","cli-err"); return; }
        const want = sub === "standby" ? "hsrp" : sub;
        const states = buildFhrpState(obj).filter(s=> s.proto===want);
        if(!states.length){ println(`(no ${sub.toUpperCase()} groups configured)`); return; }
        for(const s of states){
          const grpLabel = s.proto==="vrrp" ? "VRRP" : s.proto==="glbp" ? "GLBP" : "HSRP";
          println(`${s.iface} - Group ${s.group} (${grpLabel})`);
          println(`  State is ${s.state}`);
          println(`  Virtual IP address is ${s.vip}`);
          println(`  Virtual MAC address is ${s.vmac}`);
          println(`  Priority ${s.priority}` + (s.preempt?" (preempt enabled)":""));
          println(`  Active router is ${s.activeDevice}` + (s.activeDevice===obj.id?" (local)":""));
          println(`  Standby router is ${s.standbyDevice}`);
          println("");
        }
      } else if(sub === "ip" && (args[2]||"").toLowerCase()==="eigrp" && (args[3]||"").toLowerCase()==="neighbors"){
        if(kind !== "device"){ println("(EIGRP only on devices)","cli-err"); return; }
        if(!obj.eigrp || !obj.eigrp.enabled){ println("(EIGRP not enabled)"); return; }
        println(`EIGRP-IPv4 Neighbors for AS(${obj.eigrp.as})`);
        println("H   Address                 Interface       Hold  Uptime    SRTT   RTO  Q  Seq");
        let h=0;
        const lldp = (typeof buildLldpNeighbors==="function")?buildLldpNeighbors(obj):[];
        let any=false;
        for(const l of lldp){
          const peer = Cfg.byId("devices", l.neighbor);
          if(!peer || !peer.eigrp || !peer.eigrp.enabled || peer.eigrp.as!==obj.eigrp.as) continue;
          const addr = elementPrimaryIp("device", peer.id, "v4") || "-";
          println(`${String(h++).padEnd(4)}${addr.padEnd(24)}${(l.localPort||"").padEnd(16)}14    00:12:34  10     200  0  12`);
          any=true;
        }
        if(!any) println("(no EIGRP neighbors)");
      } else if(sub === "ip" && (args[2]||"").toLowerCase()==="eigrp" && (args[3]||"").toLowerCase()==="topology"){
        if(kind !== "device"){ println("(EIGRP only on devices)","cli-err"); return; }
        const topo = buildEigrpTopology(obj);
        println(`EIGRP-IPv4 Topology Table for AS(${(obj.eigrp&&obj.eigrp.as)||"?"})`);
        println("Codes: P - Passive, A - Active, U - Update, ...");
        println("       (Successor = best Feasible Distance; FS = Feasible Successor)");
        println("");
        if(!topo.length){ println("(no EIGRP topology — enable EIGRP on neighbors)"); return; }
        for(const e of topo){
          println(`P ${e.dest}, ${1+e.feasibleSuccessors.length} successors, FD is ${e.successor.fd}`);
          println(`    via ${e.successor.nextHop} (${e.successor.fd}/${e.successor.rd}), ${e.successor.iface}  [Successor]`);
          for(const fs of e.feasibleSuccessors){
            println(`    via ${fs.nextHop} (${fs.fd}/${fs.rd}), ${fs.iface}  [FS]`);
          }
        }
      } else if(sub === "access-lists" || (sub==="access" && (args[2]||"")==="lists") || (sub==="ip" && (args[2]||"").toLowerCase()==="access-lists")){
        if(kind !== "device"){ println("(ACLs on devices)","cli-err"); return; }
        const acls = obj.acls||[];
        if(!acls.length){ println("(no access-lists configured)"); return; }
        for(const a of acls){
          println(`IP access list ${a.id}`);
          for(const e of (a.entries||[]).slice().sort((x,y)=>(x.seq||0)-(y.seq||0))){
            const portTxt = e.dst_port!=null?` eq ${e.dst_port}`:"";
            println(`    ${e.seq||10} ${e.action} ${e.proto||"ip"} ${e.src||"any"}${e.src_wild?(" "+e.src_wild):""} ${e.dst||"any"}${e.dst_wild?(" "+e.dst_wild):""}${portTxt}`);
          }
        }
      } else if(sub === "policy-map" || (sub==="qos")){
        if(kind !== "device"){ println("(QoS on devices)","cli-err"); return; }
        const rep = buildQosReport(obj);
        if(!rep.length){ println("(no QoS policy-maps configured)"); return; }
        for(const pm of rep){
          println(`Policy Map ${pm.name}`);
          for(const c of pm.classes){
            println(`  Class ${c.name}`);
            if(c.match!=="-")     println(`    match: ${c.match}`);
            if(c.dscp!=="-")      println(`    set dscp ${c.dscp}`);
            if(c.bandwidth!=="-") println(`    bandwidth ${c.bandwidth}`);
            if(c.priority)        println(`    priority`);
          }
        }
      } else if(sub === "ip" && (args[2]||"").toLowerCase() === "ospf" && (args[3]||"").toLowerCase() === "neighbor"){
        if(kind !== "device"){ println("(OSPF only on devices)","cli-err"); return; }
        // Simulate OSPF neighbors: any directly-connected device on same subnet
        println("Neighbor ID     Pri   State           Dead Time   Address         Interface");
        const seen = new Set();
        for(const c of (App.config.connections||[])){
          if(c.status==="down") continue;
          let me, peer;
          if(c.from && c.from.device===id){ me=c.from; peer=c.to; }
          else if(c.to && c.to.device===id){ me=c.to; peer=c.from; }
          else continue;
          if(!peer || !peer.device) continue;  // OSPF only between routers/switches
          const peerObj = Cfg.byId("devices", peer.device);
          if(!peerObj || (peerObj.status && peerObj.status !== "running")) continue;
          const peerIf = (peerObj.interfaces||[]).find(i=>i.id===peer.interface);
          if(!peerIf || peerIf.status !== "up") continue;
          const peerIp = peerIf.ip ? ipOnly(peerIf.ip) : "";
          if(!peerIp) continue;
          if(seen.has(peer.device)) continue;
          seen.add(peer.device);
          println(
            (peer.device).padEnd(16) +
            "1     " +
            "FULL/DR         " +
            "00:00:39    " +
            peerIp.padEnd(16) +
            (me.interface||"")
          );
        }
        if(!seen.size) println("(no OSPF neighbors)");
      } else if(sub === "ip" && (args[2]||"").toLowerCase() === "bgp" && (args[3]||"").toLowerCase() === "summary"){
        if(kind !== "device"){ println("(BGP only on devices)","cli-err"); return; }
        const ourIp = elementPrimaryIp("device", id) || "0.0.0.0";
        println(`BGP router identifier ${ourIp}, local AS number ${obj.bgp_asn||65000}`);
        println("BGP table version is 1");
        println("");
        println("Neighbor        V    AS MsgRcvd MsgSent  TblVer  InQ OutQ Up/Down  State/PfxRcd");
        // Simulate BGP peers: directly connected devices on different subnets (or as configured)
        const seen = new Set();
        for(const c of (App.config.connections||[])){
          if(c.status==="down") continue;
          let me, peer;
          if(c.from && c.from.device===id){ me=c.from; peer=c.to; }
          else if(c.to && c.to.device===id){ me=c.to; peer=c.from; }
          else continue;
          if(!peer || !peer.device) continue;
          const peerObj = Cfg.byId("devices", peer.device);
          if(!peerObj || (peerObj.status && peerObj.status !== "running")) continue;
          if(peerObj.type !== "router" && peerObj.type !== "firewall" && peerObj.type !== "l3switch") continue;
          const peerIf = (peerObj.interfaces||[]).find(i=>i.id===peer.interface);
          if(!peerIf || peerIf.status !== "up" || !peerIf.ip) continue;
          if(seen.has(peer.device)) continue;
          seen.add(peer.device);
          const pAsn = peerObj.bgp_asn || 65001;
          println(
            ipOnly(peerIf.ip).padEnd(16) +
            "4 ".padEnd(3) +
            String(pAsn).padStart(5) + " " +
            "    12      11       1    0    0 00:08:42        2"
          );
        }
        if(!seen.size) println("(no BGP peers)");
      } else if(sub === "ip" && (args[2]||"").toLowerCase() === "route"){
        if(kind !== "device"){ println("(routing only available on devices)","cli-err"); return; }
        const rt = (App.config.routing_tables||[]).find(r=>r.device===id);
        if(!rt || !rt.routes || !rt.routes.length){ println("(no routes)"); return; }
        println("Codes: C - connected, S - static, O - ospf, B - bgp");
        println("");
        for(const r of rt.routes){
          const code = (r.type||"static")[0].toUpperCase();
          const dest = r.destination||"?";
          const via = r.next_hop && r.next_hop !== "0.0.0.0" ? `via ${r.next_hop}` : "directly connected";
          println(`${code}  ${dest.padEnd(20)} ${via}, ${r.interface||""}  [${r.metric||0}]  ${r.status||"active"}`);
        }
      } else if(sub === "arp"){
        const out = println.__out || document.querySelector(".cli-out");
        showArpInline(obj, id, kind, println);
      } else if(sub === "version"){
        println(`${obj.label||id}`);
        if(obj.model) println(`Model: ${obj.model}`);
        if(obj.os) println(`OS: ${obj.os}`);
        if(obj.cpu) println(`CPU: ${obj.cpu} cores`);
        if(obj.memory) println(`Memory: ${obj.memory} MB`);
        println(`Status: ${obj.status||"running"}`);
      } else if(sub === "service" || sub === "services"){
        if(kind !== "server"){ println("(services only on servers)","cli-err"); return; }
        const svcs = (App.config.services||[]).filter(s=>s.server===id);
        if(!svcs.length){ println("(no services)"); return; }
        for(const s of svcs){
          println(`${s.id.padEnd(18)} ${(s.label||"").padEnd(16)} :${s.port||""}/${s.protocol||""}  ${s.status||"running"}`);
        }
      } else if(sub === "policy" || sub === "policies"){
        if(kind !== "device" || obj.type !== "firewall"){ println("(policy only on firewall)","cli-err"); return; }
        const pol = getFwPolicies(id);
        if(!pol || !pol.rules){ println("(no policies)"); return; }
        println("Rule              Action  Src                  Dst                  Proto  Port");
        for(const r of pol.rules){
          println(
            (r.id||"").padEnd(18) +
            (r.action||"").padEnd(8) +
            (r.src||"").padEnd(21) +
            (r.dst||"").padEnd(21) +
            (r.protocol||"any").padEnd(7) +
            (r.dst_port||"-")
          );
        }
      } else if(sub === "nat"){
        const nat = obj.nat;
        if(!nat || !nat.enabled){ println("(NAT 無効)"); return; }
        println("NAT: enabled"+(nat.masquerade?" (masquerade)":""));
        if((nat.snat||[]).length){ println("SNAT:"); for(const r of nat.snat) println(`  ${r.src||"any"} → ${r.translated_src}`); }
        if((nat.dnat||[]).length){ println("DNAT:"); for(const r of nat.dnat) println(`  ${r.orig_dst}:${r.orig_port||"*"}/${r.proto||"any"} → ${r.translated_dst}:${r.translated_port||"*"}`); }
      } else if(sub === "proxy"){
        const proxies = (App.config.services||[]).filter(s=>(s.type==="reverse_proxy"||s.type==="forward_proxy"));
        if(!proxies.length){ println("(プロキシサービスなし)"); return; }
        for(const s of proxies){
          if(s.type==="reverse_proxy"){
            println(`reverse-proxy ${s.label||s.id} @${s.server} listen:${(s.proxy&&s.proxy.listen_port)||s.port}`);
            for(const u of ((s.proxy&&s.proxy.upstreams)||[])) println(`  upstream → ${u.host}:${u.port}`);
          } else {
            println(`forward-proxy ${s.label||s.id} @${s.server} listen:${(s.proxy&&s.proxy.listen_port)||s.port} allow:${((s.proxy&&s.proxy.allow)||["any"]).join(",")}`);
          }
        }
      } else {
        println(`Unknown subcommand: ${args.slice(1).join(" ")}`, "cli-err");
      }
      return;
    }
    case "ping": {
      const target = args[1];
      if(!target){ println("Usage: ping <ip|host>", "cli-err"); return; }
      cliPing(obj, kind, target, println);
      return;
    }
    case "traceroute":
    case "trace": {
      const target = args[1];
      if(!target){ println("Usage: traceroute <ip|host>", "cli-err"); return; }
      cliTraceroute(obj, kind, target, println);
      return;
    }
    case "shutdown":
      setStatus(kind, id, "stopped");
      println(`${id} is now stopped`, "cli-info");
      return;
    case "no":
      if((args[1]||"").toLowerCase() === "shutdown"){
        setStatus(kind, id, "running");
        println(`${id} is now running`, "cli-ok");
      } else {
        println("Unknown command", "cli-err");
      }
      return;
    case "enable":
    case "disable": {
      const sub = (args[1]||"").toLowerCase();
      if(sub !== "interface" && sub !== "int"){
        println(`Usage: ${cmd} interface <id>`, "cli-err"); return;
      }
      const ifId = args[2];
      const iface = (obj.interfaces||[]).find(i=>i.id===ifId);
      if(!iface){ println(`Interface ${ifId} not found`, "cli-err"); return; }
      pushUndo();
      iface.status = cmd === "enable" ? "up" : "down";
      renderAndSync();
      println(`Interface ${ifId} is now ${iface.status}`, cmd==="enable"?"cli-ok":"cli-info");
      return;
    }
    default:
      println(`Unknown command: ${cmd}. Type 'help'.`, "cli-err");
  }
}

function cliPing(obj, kind, target, println){
  // Try to resolve target by id, then by IP
  let targetIp = null, targetObj = null;
  let r = Cfg.byId("servers", target) || Cfg.byId("devices", target);
  if(r){ targetObj = r; targetIp = elementPrimaryIp(Cfg.byId("servers",target)?"server":"device", target); }
  else {
    // Try as IP
    targetIp = target;
    for(const x of [...(App.config.servers||[]),...(App.config.devices||[])]){
      if((x.interfaces||[]).some(i=>ipOnly(i.ip)===target)){ targetObj = x; break; }
      if(x.bonding && ipOnly(x.bonding.bond_ip)===target){ targetObj = x; break; }
    }
  }
  if(!targetIp){ println(`Cannot resolve ${target}`, "cli-err"); return; }
  println(`PING ${target} (${targetIp}): 56 data bytes`);
  const path = computePath(kind, obj, targetIp, "icmp", null);
  if(path.ok){
    let i = 0;
    const send = ()=>{
      const t = 1 + Math.floor(Math.random()*4);
      println(`64 bytes from ${targetIp}: icmp_seq=${i} ttl=64 time=${t}.${Math.floor(Math.random()*900+100)} ms`,"cli-ok");
      i++;
      if(i < 4) setTimeout(send, 280);
      else {
        println("");
        println(`--- ${target} ping statistics ---`);
        println("4 packets transmitted, 4 received, 0% packet loss");
      }
    };
    send();
    animatePacket(path.path, false, ()=>{});
  } else {
    let i=0;
    const tryReq = ()=>{
      println(`Request timeout for icmp_seq ${i}`, "cli-err");
      i++;
      if(i<3) setTimeout(tryReq, 300);
      else {
        println("");
        println(`${path.reason}`, "cli-err");
        println(`--- ${target} ping statistics ---`);
        println("3 packets transmitted, 0 received, 100% packet loss");
      }
    };
    tryReq();
    animatePacket(path.path, true, ()=>{});
  }
}

function cliTraceroute(obj, kind, target, println){
  let targetIp = null;
  let r = Cfg.byId("servers", target) || Cfg.byId("devices", target);
  if(r){ targetIp = elementPrimaryIp(Cfg.byId("servers",target)?"server":"device", target); }
  else { targetIp = target; }
  if(!targetIp){ println(`Cannot resolve ${target}`, "cli-err"); return; }
  println(`traceroute to ${target} (${targetIp}), 30 hops max`);
  const path = computePath(kind, obj, targetIp, "icmp", null);
  if(!path.path || path.path.length === 0){ println("(no path)", "cli-err"); return; }
  for(let i=0;i<path.path.length;i++){
    const hop = path.path[i];
    const hopObj = Cfg.byId(kindToCol(hop.kind), hop.id);
    const ip = hopObj ? elementPrimaryIp(hop.kind, hop.id) : "?";
    const t1 = (Math.random()*5+1).toFixed(1);
    const t2 = (Math.random()*5+1).toFixed(1);
    const t3 = (Math.random()*5+1).toFixed(1);
    println(` ${(i+1).toString().padStart(2)} ${(hop.id+" ("+ip+")").padEnd(40)} ${t1} ms  ${t2} ms  ${t3} ms`);
  }
  if(!path.ok){
    println(`${path.reason}`, "cli-err");
  }
  animatePacket(path.path, !path.ok, ()=>{});
}

function showArpInline(obj, id, kind, println){
  if(!obj.interfaces){ println("(no interfaces)"); return; }
  println("Address          HWaddress           Iface");
  let count = 0;
  for(const i of obj.interfaces){
    if(!i.ip) continue;
    for(const c of (App.config.connections||[])){
      let me, peer;
      if(c.from && (c.from.device===id||c.from.server===id) && c.from.interface===i.id){ me=c.from; peer=c.to; }
      else if(c.to && (c.to.device===id||c.to.server===id) && c.to.interface===i.id){ me=c.to; peer=c.from; }
      else continue;
      const pk = peer.device ? "device" : "server";
      const pObj = Cfg.byId(kindToCol(pk), peer.device||peer.server);
      if(!pObj) continue;
      const pIf = (pObj.interfaces||[]).find(x=>x.id===peer.interface);
      if(!pIf) continue;
      println(`${(ipOnly(pIf.ip)||"-").padEnd(17)} ${(pIf.mac||"-").padEnd(19)} ${i.id}`);
      count++;
    }
  }
  if(!count) println("(no entries)");
}

function promptTraceroute(srcKind, srcId){
  const targets = [];
  for(const s of (App.config.servers||[])){
    if(s.id === srcId) continue;
    targets.push({ id:s.id, label:`${s.label||s.id} (${elementPrimaryIp("server",s.id)||"?"})` });
  }
  for(const d of (App.config.devices||[])){
    if(d.id === srcId) continue;
    targets.push({ id:d.id, label:`${d.label||d.id} (${elementPrimaryIp("device",d.id)||"?"})` });
  }
  openDialog("Tracerouteシミュレーション", (body)=>{
    ch("p", { text:`From: ${srcId}`, style:{margin:"0 0 8px 0",fontSize:"12px",color:"var(--text-dim)"} }, body);
    const f = ch("div", { class:"field" }, body);
    ch("label", { text:"Target" }, f);
    const sel = ch("select", {}, f);
    for(const t of targets) ch("option", { value:t.id, text:t.label }, sel);
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"Trace", primary:true, action:()=>{
          const tid = sel.value; closeDialog();
          if(tid){
            const src = Cfg.byId(kindToCol(srcKind), srcId);
            const dst = Cfg.byId("servers", tid) || Cfg.byId("devices", tid);
            if(!src || !dst){ toast("Source/Target not found","err"); return; }
            const dstKind = Cfg.byId("servers", tid) ? "server" : "device";
            const dstIp = elementPrimaryIp(dstKind, tid);
            const p = computePath(srcKind, src, dstIp, "icmp", null);
            Log.info(`Traceroute ${srcId} → ${tid} (${dstIp}):`);
            for(let i=0;i<p.path.length;i++){
              const h = p.path[i];
              const hipv = elementPrimaryIp(h.kind, h.id) || "?";
              Log.info(`  ${i+1}: ${h.id} (${hipv})`);
            }
            if(p.ok){ toast("Traceroute 完了","ok"); animatePacket(p.path, false, ()=>{}); }
            else { Log.error(p.reason); toast("Traceroute 失敗: "+p.reason, "err"); animatePacket(p.path, true, ()=>{}); }
          }
        }}
      ]
    };
  });
}

/* ====== GNS3-LIKE: PACKET CAPTURE ====== */
var PCAP = { sessions: {} };
function openPacketCapture(connId){
  const c = Cfg.byId("connections", connId); if(!c) return;
  // Session for this connection
  let session = PCAP.sessions[connId];
  if(!session){
    session = PCAP.sessions[connId] = { packets:[], running:true };
  }
  const fromObj = c.from.device ? Cfg.byId("devices", c.from.device) : Cfg.byId("servers", c.from.server);
  const toObj = c.to.device ? Cfg.byId("devices", c.to.device) : Cfg.byId("servers", c.to.server);
  openDialog(`📡 Packet Capture — ${connId}`, (body)=>{
    const status = ch("div",{class:"pcap-status"},body);
    ch("span",{class:"pcap-pulse"},status);
    ch("span",{text:"Live Capturing"},status);
    ch("span",{style:{marginLeft:"auto",fontFamily:"var(--mono)",fontSize:"11px"},
      text:`${fromObj?fromObj.id:"?"} ↔ ${toObj?toObj.id:"?"}`},status);

    const log = ch("div",{class:"pcap-log"},body);
    function renderPcap(){
      log.innerHTML = "";
      const head = ch("div",{class:"pcap-row head"},log);
      for(const c of ["Time","Length","Source","Destination","Proto","Port","Info"]){
        ch("div",{text:c},head);
      }
      for(const p of session.packets){
        const row = ch("div",{class:"pcap-row"+(p.dir==="rev"?" dir-rev":"")},log);
        ch("div",{text:p.t},row);
        ch("div",{text:String(p.len||"64")},row);
        ch("div",{text:p.src||"?"},row);
        ch("div",{text:p.dst||"?"},row);
        ch("div",{class:"col-proto",text:p.proto||"-"},row);
        ch("div",{text:String(p.port||"-")},row);
        ch("div",{text:p.info||""},row);
      }
      log.scrollTop = log.scrollHeight;
    }
    renderPcap();

    // Subscribe to packets emitted by simulation/animation
    session._listener = (pkt)=>{
      session.packets.push(pkt);
      if(session.packets.length > 200) session.packets.shift();
      renderPcap();
    };

    // If session has no packets yet, generate sample based on connection traffic level
    if(!session.packets.length && (c.traffic||"idle") !== "idle"){
      const protos = [
        { proto:"HTTP", port:80 }, { proto:"HTTPS", port:443 },
        { proto:"TCP", port:8080 }, { proto:"DNS", port:53 }
      ];
      const cnt = c.traffic==="high"?12 : c.traffic==="medium"?6 : 3;
      const fIp = fromObj && elementPrimaryIp(c.from.device?"device":"server", fromObj.id) || "?";
      const tIp = toObj && elementPrimaryIp(c.to.device?"device":"server", toObj.id) || "?";
      const now = Date.now();
      for(let i=0;i<cnt;i++){
        const pr = protos[Math.floor(Math.random()*protos.length)];
        const fwd = Math.random() > 0.4;
        session.packets.push({
          t: new Date(now - (cnt-i)*200).toTimeString().slice(0,8) + "." + (Math.floor(Math.random()*900+100)),
          len: 64 + Math.floor(Math.random()*1400),
          src: fwd?fIp:tIp,
          dst: fwd?tIp:fIp,
          proto: pr.proto,
          port: pr.port,
          info: fwd ? "→ "+(pr.proto==="DNS"?"Standard query":"data segment") : "← reply",
          dir: fwd?"fwd":"rev"
        });
      }
      renderPcap();
    }
    return {
      buttons:[
        { text:"クリア", action:()=>{ session.packets=[]; renderPcap(); }},
        { text:"閉じる", action:()=>{
          session._listener = null;
          closeDialog();
        }}
      ]
    };
  });
}
function emitPacket(connId, pkt){
  const s = PCAP.sessions[connId];
  if(s && s._listener) s._listener(pkt);
}

/* ====== SCENARIO MANAGER (add/edit/delete scenarios via UI) ====== */
function openScenarioManager(){
  Cfg.ensure();
  openDialog("📋 シナリオ管理", (body)=>{
    ch("p", {
      text:"シナリオはパケットフローのテストです。1つのシナリオは順番に実行される複数のステップ(from→to)で構成されます。",
      style:{margin:"0 0 10px 0",fontSize:"11px",color:"var(--text-dim)",lineHeight:"1.4"}
    }, body);

    const list = ch("div", { class:"scen-list" }, body);

    function refreshList(){
      list.innerHTML = "";
      const scs = App.config.scenarios || [];
      if(!scs.length){
        ch("div",{text:"(シナリオなし - 下のボタンで追加してください)",
          style:{color:"var(--text-mute)",padding:"10px",fontSize:"11px",textAlign:"center"}},list);
      }
      for(let i=0;i<scs.length;i++){
        const s = scs[i];
        const row = ch("div",{class:"scen-row"},list);
        ch("div",{class:"scen-id",
          html: `<strong>${escapeHtml(s.label||s.id)}</strong><br><span style="color:var(--text-mute);font-size:10px">id: ${escapeHtml(s.id)} · ${(s.steps||[]).length}ステップ</span>`
        }, row);
        ch("button",{text:"▶ 実行", class:"run", on:{ click:()=>{ closeDialog(); runScenario(s.id); }}}, row);
        ch("button",{text:"編集", on:{ click:()=>{ closeDialog(); openScenarioEditor(s.id); }}}, row);
        ch("button",{text:"複製", on:{ click:()=>{
          pushUndo();
          const copy = JSON.parse(JSON.stringify(s));
          copy.id = s.id+"-copy";
          let n = 1;
          while(App.config.scenarios.find(x=>x.id===copy.id)){ copy.id = s.id+"-copy"+(++n); }
          App.config.scenarios.push(copy);
          refreshScenarioSelect(); syncYamlFromConfig();
          toast(`複製: ${copy.id}`,"ok"); refreshList();
        }}}, row);
        ch("button",{text:"×", class:"del", on:{ click:()=>{
          if(confirm(`シナリオ "${s.id}" を削除しますか?`)){
            pushUndo();
            App.config.scenarios.splice(i,1);
            refreshScenarioSelect(); syncYamlFromConfig();
            toast(`削除: ${s.id}`,"ok"); refreshList();
          }
        }}}, row);
      }
    }
    refreshList();

    return {
      buttons:[
        { text:"+ 新規シナリオ", primary:true, action:()=>{ closeDialog(); openScenarioEditor(null); }},
        { text:"閉じる", action: closeDialog }
      ]
    };
  });
}

function openScenarioEditor(scenarioId){
  Cfg.ensure();
  const isNew = !scenarioId;
  let sc;
  if(isNew){
    sc = { id: uid("scenario"), label: "New Scenario", steps: [] };
  } else {
    sc = App.config.scenarios.find(s=>s.id===scenarioId);
    if(!sc){ toast("シナリオが見つかりません","err"); return; }
    sc = JSON.parse(JSON.stringify(sc)); // edit a copy
  }

  openDialog(isNew?"📋 新規シナリオ":"📋 シナリオ編集", (body)=>{
    const idF = ch("div",{class:"field"},body);
    ch("label",{text:"ID"},idF);
    const idIn = ch("input",{type:"text",value:sc.id},idF);
    const lblF = ch("div",{class:"field"},body);
    ch("label",{text:"ラベル"},lblF);
    const lblIn = ch("input",{type:"text",value:sc.label||""},lblF);

    ch("div",{class:"field-section-title",text:"ステップ (上から順に実行)"},body);
    const stepsContainer = ch("div",{class:"scen-list"},body);

    // Collect all possible endpoints
    const endpoints = [];
    for(const n of (App.config.networks||[])) endpoints.push({ id:n.id, label:`(network) ${n.label||n.id}` });
    for(const d of (App.config.devices||[])) endpoints.push({ id:d.id, label:`(device) ${d.label||d.id}` });
    for(const s of (App.config.servers||[])) endpoints.push({ id:s.id, label:`(server) ${s.label||s.id}` });
    for(const sv of (App.config.services||[])) endpoints.push({ id:sv.id, label:`(service) ${sv.label||sv.id} on ${sv.server}` });

    function refreshSteps(){
      stepsContainer.innerHTML = "";
      if(!sc.steps.length){
        ch("div",{text:"(ステップなし - 下のボタンで追加)",
          style:{color:"var(--text-mute)",padding:"10px",fontSize:"11px",textAlign:"center"}},stepsContainer);
      }
      for(let i=0;i<sc.steps.length;i++){
        const st = sc.steps[i];
        const g = ch("div",{class:"scen-step-grid"},stepsContainer);

        const fF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:`#${i+1} From`,style:{fontSize:"9px"}},fF);
        const fSel = ch("select",{},fF);
        ch("option",{value:"",text:"--"},fSel);
        for(const e of endpoints){
          const o = ch("option",{value:e.id,text:e.label},fSel);
          if(e.id === st.from) o.selected = true;
        }
        fSel.addEventListener("change",()=>{ st.from = fSel.value; });

        const tF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:"To",style:{fontSize:"9px"}},tF);
        const tSel = ch("select",{},tF);
        ch("option",{value:"",text:"--"},tSel);
        for(const e of endpoints){
          const o = ch("option",{value:e.id,text:e.label},tSel);
          if(e.id === st.to) o.selected = true;
        }
        tSel.addEventListener("change",()=>{ st.to = tSel.value; });

        const pF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:"Protocol",style:{fontSize:"9px"}},pF);
        const pIn = ch("input",{type:"text",value:st.protocol||"TCP"},pF);
        pIn.addEventListener("change",()=>{ st.protocol = pIn.value; });

        const portF = ch("div",{class:"field",style:{margin:0}},g);
        ch("label",{text:"Port",style:{fontSize:"9px"}},portF);
        const portIn = ch("input",{type:"number",value:st.port||80},portF);
        portIn.addEventListener("change",()=>{ st.port = +portIn.value; });

        const delBtn = ch("button",{text:"×",
          style:{height:"24px",padding:"0 6px",background:"var(--red-dim)",color:"#fff",border:"1px solid var(--red)",borderRadius:"3px",cursor:"pointer",alignSelf:"end"}},g);
        delBtn.addEventListener("click",()=>{ sc.steps.splice(i,1); refreshSteps(); });

        // Description on its own row underneath
        const descRow = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr",gap:"4px",padding:"0 4px 4px"}},stepsContainer);
        const descF = ch("div",{class:"field",style:{margin:0}},descRow);
        ch("label",{text:"説明",style:{fontSize:"9px"}},descF);
        const descIn = ch("input",{type:"text",value:st.description||"",placeholder:"このステップの説明"},descF);
        descIn.addEventListener("change",()=>{ st.description = descIn.value; });
      }
    }
    refreshSteps();

    ch("button",{
      text:"+ ステップ追加",
      style:{ width:"100%", marginTop:"6px",padding:"6px",background:"var(--bg3)",
        border:"1px dashed var(--accent)",color:"var(--accent)",borderRadius:"4px",cursor:"pointer",fontSize:"11px" },
      on:{ click:()=>{
        sc.steps.push({ from:"", to:"", protocol:"TCP", port:80, description:"" });
        refreshSteps();
      }}
    }, body);

    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"保存", primary:true, action:()=>{
          const newId = idIn.value.trim();
          if(!newId){ toast("IDは必須です","err"); return; }
          if(isNew){
            if(App.config.scenarios.find(s=>s.id===newId)){
              toast(`ID "${newId}" は既に存在します`,"err"); return;
            }
          } else if(newId !== scenarioId){
            // Renaming
            if(App.config.scenarios.find(s=>s.id===newId)){
              toast(`ID "${newId}" は既に存在します`,"err"); return;
            }
          }
          pushUndo();
          sc.id = newId;
          sc.label = lblIn.value.trim() || newId;
          // Filter out incomplete steps
          sc.steps = sc.steps.filter(s=>s.from && s.to);
          if(isNew){
            App.config.scenarios.push(sc);
          } else {
            const idx = App.config.scenarios.findIndex(s=>s.id===scenarioId);
            if(idx>=0) App.config.scenarios[idx] = sc;
          }
          refreshScenarioSelect();
          syncYamlFromConfig();
          closeDialog();
          toast(`シナリオ保存: ${sc.id} (${sc.steps.length}ステップ)`,"ok");
          // Select this scenario in dropdown
          const sel = $("#scenario-select");
          if(sel) sel.value = sc.id;
        }}
      ]
    };
  });
}
/* ====== COMMUNICATION SIMULATOR (interactive 2-point reachability test) ====== */
function openCommSimulator(){
  Cfg.ensure();
  openDialog("🎯 通信シミュレーション", (body)=>{
    ch("p", {
      text:"任意の送信元と宛先を選んで疎通性を確認します。ルーティング不備・ダウン・FW遮断・MAC重複などの原因を全て可視化します。",
      style:{margin:"0 0 10px 0", fontSize:"11px", color:"var(--text-dim)", lineHeight:"1.5"}
    }, body);

    const endpoints = [];
    for(const d of (App.config.devices||[])) endpoints.push({ id:d.id, label:`(device) ${d.label||d.id}`, ips: elementAllAddresses("device", d.id) });
    for(const s of (App.config.servers||[])) endpoints.push({ id:s.id, label:`(server) ${s.label||s.id}`, ips: elementAllAddresses("server", s.id) });
    for(const sv of (App.config.services||[])){
      const host = Cfg.byId("servers", sv.server);
      if(host) endpoints.push({ id:sv.id, label:`(service) ${sv.label||sv.id} on ${sv.server}`, ips: elementAllAddresses("server", sv.server), serviceFor: host.id });
    }

    function buildSelect(label, defaultKey){
      const f = ch("div",{class:"field"},body);
      ch("label",{text:label},f);
      const sel = ch("select",{},f);
      ch("option",{value:"",text:"-- 選択 --"},sel);
      for(const e of endpoints){
        const o = ch("option",{value:e.id,text:e.label},sel);
      }
      return sel;
    }
    const fromSel = buildSelect("送信元 (From)");
    const toSel = buildSelect("宛先 (To)");

    const row = ch("div",{class:"field-grid"},body);
    const protoF = ch("div",{class:"field"},row);
    ch("label",{text:"Protocol"},protoF);
    const protoSel = ch("select",{},protoF);
    for(const p of ["icmp","tcp","udp"]){
      const o = ch("option",{value:p,text:p.toUpperCase()},protoSel);
      if(p==="icmp") o.selected = true;
    }
    const portF = ch("div",{class:"field"},row);
    ch("label",{text:"Port (TCP/UDP)"},portF);
    const portIn = ch("input",{type:"number",value:"80"},portF);

    const famF = ch("div",{class:"field"},body);
    ch("label",{text:"アドレスファミリー"},famF);
    const famSel = ch("select",{},famF);
    for(const [v,l] of [["auto","自動 (送信元から)"],["v4","IPv4 強制"],["v6","IPv6 強制"]]){
      ch("option",{value:v,text:l},famSel);
    }

    const result = ch("div", { style:{ marginTop:"10px" } }, body);

    function showResult(p, srcRes, dstRes, dstIp){
      result.innerHTML = "";
      ch("h4", {text:`結果 — ${srcRes.obj.id} → ${dstRes.obj.id} (${dstIp})`, style:{margin:"0 0 6px 0",fontSize:"12px"}}, result);
      const res = ch("div", { class:"sim-result "+(p.ok?"ok":"fail") }, result);
      if(p.ok){
        ch("span", {text:"✓ 疎通成功 — "+(p.path.length)+"ホップで到達"}, res);
      } else {
        ch("span", {text:"✗ 疎通失敗 — "+(p.reason||"unknown")}, res);
      }
      // Hop list
      const list = ch("div", { class:"sim-hop-list" }, result);
      for(let i=0; i<p.path.length; i++){
        const hop = p.path[i];
        const isFail = !p.ok && i === p.path.length - 1;
        const row = ch("div", { class:"sim-hop "+(isFail?"hop-fail":"hop-ok") }, list);
        ch("div", { class:"hop-num", text:String(i+1) }, row);
        const obj = Cfg.byId(kindToCol(hop.kind), hop.id);
        const ip4 = elementPrimaryIp(hop.kind, hop.id, "v4");
        const ip6 = elementPrimaryIp(hop.kind, hop.id, "v6");
        const ips = [ip4,ip6].filter(Boolean).join(" / ") || "?";
        ch("span", { text:`${hop.kind}: ${hop.id}`, style:{fontWeight:"600",minWidth:"180px"} }, row);
        ch("span", { text:ips, style:{color:"var(--text-mute)"} }, row);
        if(obj && obj.status && obj.status !== "running"){
          ch("span", { text:`[${obj.status}]`, style:{color:"var(--red)",marginLeft:"auto",fontWeight:"700"} }, row);
        }
      }
      // Suggested fixes for common failures
      if(!p.ok){
        const reason = p.reason || "";
        const hints = ch("div", { style:{ marginTop:"6px",fontSize:"11px",color:"var(--orange)",padding:"6px",background:"rgba(245,158,11,0.1)",borderRadius:"3px",borderLeft:"3px solid var(--orange)" } }, result);
        if(reason.match(/No Route/i)){
          ch("div", {text:"💡 ヒント: 通過機器のルーティングテーブルに該当宛先のルートがありません。Static Routeを追加するかDefault Routeを設定してください。"}, hints);
        } else if(reason.match(/BLOCKED|firewall|deny/i)){
          ch("div", {text:"💡 ヒント: ファイアウォール ポリシーで遮断されました。該当機器のポリシーを確認 (右クリック → CLI → show policy)。"}, hints);
        } else if(reason.match(/no.*gateway/i)){
          ch("div", {text:"💡 ヒント: ゲートウェイが未設定です。送信元のプロパティで設定してください。"}, hints);
        } else if(reason.match(/stopped|down|error/i)){
          ch("div", {text:"💡 ヒント: 経路上の機器/インターフェースがダウン中です。状態を [running] / [up] にしてください。"}, hints);
        } else if(reason.match(/loop/i)){
          ch("div", {text:"💡 ヒント: ルーティングループが検出されました。ルーティングテーブルを確認してください。"}, hints);
        } else if(reason.match(/no egress/i)){
          ch("div", {text:"💡 ヒント: 出力リンクが見つかりません。接続が正しく構成されているか確認してください。"}, hints);
        }
      }
      // Animation: show packet flowing
      if(p.path && p.path.length >= 2){
        animatePacket(p.path, !p.ok, ()=>{});
      }
    }

    return {
      buttons:[
        { text:"閉じる", action: closeDialog },
        { text:"▶ シミュレーション実行", primary:true, action:()=>{
          const fromId = fromSel.value, toId = toSel.value;
          if(!fromId || !toId){ toast("送信元・宛先を選択してください","err"); return; }
          if(fromId === toId){ toast("送信元と宛先が同じです","warn"); return; }
          const srcRes = resolveScenarioEndpoint(fromId);
          const dstRes = resolveScenarioEndpoint(toId);
          if(!srcRes || !dstRes){ toast("オブジェクトが見つかりません","err"); return; }

          let srcKind = srcRes.kind, srcObj = srcRes.obj;
          if(srcKind === "service"){
            const host = Cfg.byId("servers", srcRes.obj.server);
            if(!host){ toast("サービスのホストが見つかりません","err"); return; }
            srcObj = host; srcKind = "server";
          } else if(srcKind === "network"){
            const dev = (App.config.devices||[]).find(d=>(d.interfaces||[]).some(i=>i.network===srcRes.obj.id));
            if(!dev){ toast(`ネットワーク ${srcRes.obj.id} に機器がありません`,"err"); return; }
            srcKind="device"; srcObj=dev;
          }

          let dstIp = null, dstKind = dstRes.kind;
          const fam = famSel.value;
          if(dstKind === "service"){
            dstIp = elementPrimaryIp("server", dstRes.obj.server, fam==="auto"?null:fam);
          } else {
            dstIp = elementPrimaryIp(dstKind, dstRes.obj.id, fam==="auto"?null:fam);
          }
          if(!dstIp){ toast(`宛先IP (${fam}) が取得できません`,"err"); return; }

          // === Suppress toasts so errors only show in this dialog ===
          App.suppressToast = true;
          const proto = protoSel.value;
          const port = +portIn.value || 80;
          const p = computePath(srcKind, srcObj, dstIp, proto, port);
          showResult(p, srcRes, dstRes, dstIp);
          logCommResult((srcRes&&srcRes.obj&&(srcRes.obj.label||srcRes.obj.id))||srcKind, dstIp, proto, port, p);
          setTimeout(()=>{ App.suppressToast = false; }, 100);
        }}
      ]
    };
  }, { floating:true });
}

/* ====== TOPOLOGY TEMPLATES (spine-leaf, etc) ====== */
var TOPOLOGY_TEMPLATES = [
  { id:"spine-leaf", icon:"🌳", title:"スパイン・リーフ",
    desc:"データセンタ向け2層トポロジー。ボーダー(任意)→スパイン→リーフ→ホスト の構成。",
    builder: buildSpineLeaf },
  { id:"3tier", icon:"🏛", title:"3層構造 (Core/Agg/Access)",
    desc:"伝統的なキャンパス向けアーキテクチャ。コア→集約→アクセス→ホスト。",
    builder: build3Tier },
  { id:"hub-spoke", icon:"☀", title:"ハブ&スポーク",
    desc:"中央ルータ1台に複数の支社/拠点が接続される構成。",
    builder: buildHubSpoke },
  { id:"k8s-single", icon:"☸", title:"Kubernetes — 単一クラスタ",
    desc:"1 master + N workers。ClusterIP/NodePortサービス付き。kube-proxyで通信検証可能。",
    builder: buildK8sSingle },
  { id:"k8s-ha", icon:"☸", title:"Kubernetes — HA(マルチマスター)",
    desc:"3 master + LB + N workers の高可用構成。control-plane冗長化。",
    builder: buildK8sHA },
  { id:"k8s-multi", icon:"☸", title:"Kubernetes — マルチクラスタ",
    desc:"複数の独立クラスタ(prod/staging等)を同時生成。",
    builder: buildK8sMulti },
  { id:"k8s-prod", icon:"🚀", title:"Kubernetes — 本番構成 (CDN + LB + Ingress)",
    desc:"Internet→CloudFront(CDN)→ALB(LoadBalancer)→K8s Service→Pod の本番想定フルスタック。LB/CDN/Ingress込み。",
    builder: buildK8sProd },
  { id:"vcenter-ha", icon:"🖥", title:"vCenter HA — 冗長ESXi (vMotion対応)",
    desc:"管理SW配下に複数ESXiホスト＋共有データストア。各ホスト内にVM。vMotionで相互移動可能な冗長構成。",
    builder: buildVcenterHA },
  { id:"openshift", icon:"🟥", title:"OpenShift — コンテナ+VM 統合",
    desc:"Master 3台 + Worker N + Ingress Router + コンテナPod + OpenShift Virtualization VM の本番構成。",
    builder: buildOpenShift }
];

function openTopologyTemplates(){
  openDialog("📐 トポロジーテンプレート", (body)=>{
    ch("p",{
      text:"テンプレートを選択すると、現在の構成にデバイス/サーバ/接続が追加されます。既存の要素は変更されません。",
      style:{margin:"0 0 12px 0",fontSize:"11px",color:"var(--text-dim)",lineHeight:"1.5"}
    },body);
    for(const tpl of TOPOLOGY_TEMPLATES){
      const card = ch("div",{class:"tpl-card"},body);
      ch("div",{class:"tpl-ico",text:tpl.icon},card);
      const info = ch("div",{class:"tpl-info"},card);
      ch("div",{class:"tpl-title",text:tpl.title},info);
      ch("div",{class:"tpl-desc",text:tpl.desc},info);
      card.addEventListener("click",()=>{
        closeDialog();
        openTemplateOptions(tpl);
      });
    }
    return { buttons:[{ text:"閉じる", action:closeDialog }] };
  });
}

function openTemplateOptions(tpl){
  openDialog(`📐 ${tpl.title} — オプション`, (body)=>{
    let opts = {};
    if(tpl.id === "spine-leaf"){
      opts = { borders: 1, spines: 2, leaves: 4, hosts_per_leaf: 2, prefix:"sl", base_x: 1100, base_y: 50 };
      addField(body, "Border (ボーダー) 台数", "number", opts.borders, v=>opts.borders=Math.max(0,+v));
      addField(body, "Spine 台数",   "number", opts.spines,  v=>opts.spines=Math.max(1,+v));
      addField(body, "Leaf 台数",    "number", opts.leaves,  v=>opts.leaves=Math.max(1,+v));
      addField(body, "Leaf あたりホスト数", "number", opts.hosts_per_leaf, v=>opts.hosts_per_leaf=Math.max(0,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"sl");
    } else if(tpl.id === "3tier"){
      opts = { cores: 2, agg: 2, access: 4, hosts_per_access: 2, prefix:"t3", base_x: 1100, base_y: 50 };
      addField(body, "Core 台数",   "number", opts.cores, v=>opts.cores=Math.max(1,+v));
      addField(body, "Aggregation 台数", "number", opts.agg, v=>opts.agg=Math.max(1,+v));
      addField(body, "Access 台数", "number", opts.access, v=>opts.access=Math.max(1,+v));
      addField(body, "Access あたりホスト数", "number", opts.hosts_per_access, v=>opts.hosts_per_access=Math.max(0,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"t3");
    } else if(tpl.id === "hub-spoke"){
      opts = { spokes: 4, hosts_per_spoke: 1, prefix:"hs", base_x: 1100, base_y: 50 };
      addField(body, "支社 (Spoke) 台数", "number", opts.spokes, v=>opts.spokes=Math.max(1,+v));
      addField(body, "支社あたりホスト数", "number", opts.hosts_per_spoke, v=>opts.hosts_per_spoke=Math.max(0,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"hs");
    } else if(tpl.id === "k8s-single"){
      opts = { masters:1, workers:3, app_replicas:3, svc_type:"NodePort", cluster_name:"prod", prefix:"k8s", base_x:1100, base_y:50 };
      addField(body, "Master 台数", "number", opts.masters, v=>opts.masters=Math.max(1,+v));
      addField(body, "Worker 台数", "number", opts.workers, v=>opts.workers=Math.max(1,+v));
      addField(body, "アプリPodレプリカ数", "number", opts.app_replicas, v=>opts.app_replicas=Math.max(1,+v));
      addSelectField(body, "公開Service種別", ["ClusterIP","NodePort","LoadBalancer"], opts.svc_type, v=>opts.svc_type=v);
      addField(body, "クラスタ名", "text", opts.cluster_name, v=>opts.cluster_name=v||"prod");
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"k8s");
    } else if(tpl.id === "k8s-ha"){
      opts = { masters:3, workers:3, app_replicas:4, cluster_name:"ha-prod", prefix:"k8sha", base_x:1100, base_y:50 };
      addField(body, "Master 台数 (control-plane)", "number", opts.masters, v=>opts.masters=Math.max(3,+v));
      addField(body, "Worker 台数", "number", opts.workers, v=>opts.workers=Math.max(1,+v));
      addField(body, "アプリPodレプリカ数", "number", opts.app_replicas, v=>opts.app_replicas=Math.max(1,+v));
      addField(body, "クラスタ名", "text", opts.cluster_name, v=>opts.cluster_name=v||"ha-prod");
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"k8sha");
    } else if(tpl.id === "k8s-multi"){
      opts = { clusters:2, workers_each:2, prefix:"mc", base_x:1100, base_y:50 };
      addField(body, "クラスタ数", "number", opts.clusters, v=>opts.clusters=Math.max(2,+v));
      addField(body, "クラスタあたりWorker数", "number", opts.workers_each, v=>opts.workers_each=Math.max(1,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"mc");
    } else if(tpl.id === "k8s-prod"){
      opts = { workers:3, app_replicas:3, cluster_name:"prod", prefix:"kp", base_x:1100, base_y:120 };
      addField(body, "Worker 台数", "number", opts.workers, v=>opts.workers=Math.max(1,+v));
      addField(body, "アプリPodレプリカ数", "number", opts.app_replicas, v=>opts.app_replicas=Math.max(1,+v));
      addField(body, "クラスタ名", "text", opts.cluster_name, v=>opts.cluster_name=v||"prod");
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"kp");
      ch("div",{text:"生成内容: K8sクラスタ + LoadBalancer Service + Ingress + 外部ALB + CloudFront CDN(Internet→CDN→ALB→Service→Pod)",
        style:{fontSize:"10px",color:"var(--text-mute)",margin:"4px 0",lineHeight:"1.4"}},body);
    } else if(tpl.id === "vcenter-ha"){
      opts = { hosts:2, vms_each:2, prefix:"vc", base_x:1100, base_y:100 };
      addField(body, "ESXiホスト数", "number", opts.hosts, v=>opts.hosts=Math.max(2,+v));
      addField(body, "ホストあたりVM数", "number", opts.vms_each, v=>opts.vms_each=Math.max(0,+v));
      addField(body, "ID Prefix", "text", opts.prefix, v=>opts.prefix=v||"vc");
      ch("div",{text:"生成内容: 管理SW + 複数のESXiホスト(内部にVM)。vMotionで相互移動可能。",
        style:{fontSize:"10px",color:"var(--text-mute)",margin:"4px 0",lineHeight:"1.4"}},body);
    } else if(tpl.id === "openshift"){
      opts = { workers:3, app_replicas:3, vms:1, cluster_name:"ocp", prefix:"ocp", base_x:1100, base_y:100 };
      addField(body, "Worker 台数", "number", opts.workers, v=>opts.workers=Math.max(1,+v));
      addField(body, "アプリPod数", "number", opts.app_replicas, v=>opts.app_replicas=Math.max(1,+v));
      addField(body, "OCP VM数 (OpenShift Virtualization)", "number", opts.vms, v=>opts.vms=Math.max(0,+v));
      addField(body, "クラスタ名", "text", opts.cluster_name, v=>opts.cluster_name=v||"ocp");
      ch("div",{text:"生成内容: Master3+WorkerN+Ingress Router+Pod+OCP VM。コンテナとVMが同一クラスタで動作。",
        style:{fontSize:"10px",color:"var(--text-mute)",margin:"4px 0",lineHeight:"1.4"}},body);
    }
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"生成", primary:true, action:()=>{
          pushUndo();
          const stats = tpl.builder(opts);
          closeDialog();
          renderAndSync();
          toast(`${tpl.title} 生成完了: 機器+${stats.devices}, サーバ+${stats.servers}, 接続+${stats.links}`, "ok");
          fitView && fitView();
        }}
      ]
    };
  });
}

function buildSpineLeaf(opts){
  const { borders, spines, leaves, hosts_per_leaf, prefix, base_x, base_y } = opts;
  const stats = { devices:0, servers:0, links:0 };
  const devW = 130, devH = 70, srvW = 110, srvH = 60;
  const xSpacing = 180, ySpacing = 130;

  // Layer Y coords
  const yBorder = base_y;
  const ySpine  = base_y + ySpacing;
  const yLeaf   = base_y + ySpacing * 2;
  const yHost   = base_y + ySpacing * 3 + 30;

  // Create borders
  const borderIds = [];
  for(let i=0; i<borders; i++){
    const id = `${prefix}-border${i+1}`;
    const cx = base_x + (i+0.5) * xSpacing - devW/2;
    App.config.devices.push({
      id, label:`Border ${i+1}`, type:"router", role:"border", status:"running",
      x: cx, y: yBorder, width: devW, height: devH,
      interfaces: Array.from({length: spines}, (_,j)=>({
        id:`eth${j+1}`, ip:"", network:"", mac: genUniqueMac(),
        speed: 40000, port_type:"qsfp-plus", status:"up"
      }))
    });
    borderIds.push(id);
    stats.devices++;
  }

  // Create spines
  const spineIds = [];
  for(let i=0; i<spines; i++){
    const id = `${prefix}-spine${i+1}`;
    const totalW = spines * xSpacing;
    const startX = base_x + (xSpacing*Math.max(borders,leaves) - totalW)/2;
    const cx = startX + i * xSpacing;
    App.config.devices.push({
      id, label:`Spine ${i+1}`, type:"l3switch", role:"spine", status:"running",
      x: cx, y: ySpine, width: devW, height: devH,
      interfaces: [
        ...borderIds.map((_,j)=>({ id:`bord${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" })),
        ...Array.from({length: leaves}, (_,j)=>({ id:`leaf${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" }))
      ]
    });
    spineIds.push(id);
    stats.devices++;
  }

  // Create leaves
  const leafIds = [];
  for(let i=0; i<leaves; i++){
    const id = `${prefix}-leaf${i+1}`;
    const totalW = leaves * xSpacing;
    const startX = base_x + (xSpacing*Math.max(borders,leaves) - totalW)/2;
    const cx = startX + i * xSpacing;
    App.config.devices.push({
      id, label:`Leaf ${i+1}`, type:"l3switch", role:"leaf", status:"running",
      x: cx, y: yLeaf, width: devW, height: devH,
      interfaces: [
        ...spineIds.map((_,j)=>({ id:`spine${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" })),
        ...Array.from({length: hosts_per_leaf}, (_,j)=>({ id:`gi1/0/${j+1}`, ip:"", network:"", mac: genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" }))
      ]
    });
    leafIds.push(id);
    stats.devices++;
  }

  // Create hosts
  for(let i=0; i<leaves; i++){
    for(let j=0; j<hosts_per_leaf; j++){
      const sid = `${prefix}-host${i+1}-${j+1}`;
      const totalW = leaves * hosts_per_leaf * (srvW + 20);
      const startX = base_x + (xSpacing*Math.max(borders,leaves) - totalW)/2;
      const cx = startX + (i*hosts_per_leaf + j) * (srvW + 20);
      App.config.servers.push({
        id: sid, label:`Host ${i+1}-${j+1}`, type:"virtual",
        os:"Linux", cpu:2, memory:2048, status:"running",
        x: cx, y: yHost, width: srvW, height: srvH,
        interfaces:[{ id:"eth0", ip:"", network:"", mac: genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" }]
      });
      stats.servers++;
    }
  }

  // Create connections: border ↔ each spine (full)
  for(const bid of borderIds){
    for(let si=0; si<spineIds.length; si++){
      const sid = spineIds[si];
      const linkId = `${bid}--${sid}`;
      App.config.connections.push({
        id: linkId,
        from: { device: bid, interface: `eth${si+1}` },
        to:   { device: sid, interface: `bord${borderIds.indexOf(bid)+1}` },
        type: "fiber", speed: 40000, status:"up",
        traffic:"medium", direction:"bidirectional"
      });
      stats.links++;
    }
  }
  // spine ↔ each leaf (full mesh — the spine-leaf signature)
  for(let si=0; si<spineIds.length; si++){
    const sid = spineIds[si];
    for(let li=0; li<leafIds.length; li++){
      const lid = leafIds[li];
      const linkId = `${sid}--${lid}`;
      App.config.connections.push({
        id: linkId,
        from: { device: sid, interface: `leaf${li+1}` },
        to:   { device: lid, interface: `spine${si+1}` },
        type: "fiber", speed: 40000, status:"up",
        traffic:"low", direction:"bidirectional"
      });
      stats.links++;
    }
  }
  // leaf ↔ hosts
  for(let li=0; li<leafIds.length; li++){
    for(let j=0; j<hosts_per_leaf; j++){
      const lid = leafIds[li];
      const sid = `${prefix}-host${li+1}-${j+1}`;
      App.config.connections.push({
        id: `${lid}--${sid}`,
        from: { device: lid, interface: `gi1/0/${j+1}` },
        to:   { server: sid, interface: "eth0" },
        type: "fiber", speed: 10000, status:"up",
        traffic:"idle", direction:"bidirectional"
      });
      stats.links++;
    }
  }
  return stats;
}

function build3Tier(opts){
  const { cores, agg, access, hosts_per_access, prefix, base_x, base_y } = opts;
  const stats = { devices:0, servers:0, links:0 };
  const devW = 130, devH = 70, srvW = 110, srvH = 60;
  const xSp = 180, ySp = 130;
  const coreIds = [], aggIds = [], accIds = [];
  // Cores
  for(let i=0;i<cores;i++){
    const id = `${prefix}-core${i+1}`;
    App.config.devices.push({
      id, label:`Core ${i+1}`, type:"l3switch", role:"core", status:"running",
      x: base_x + i*xSp, y: base_y, width: devW, height: devH,
      interfaces: Array.from({length: agg},(_,j)=>({ id:`agg${j+1}`, mac:genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" }))
    });
    coreIds.push(id); stats.devices++;
  }
  // Agg
  for(let i=0;i<agg;i++){
    const id = `${prefix}-agg${i+1}`;
    App.config.devices.push({
      id, label:`Agg ${i+1}`, type:"l3switch", role:"aggregation", status:"running",
      x: base_x + i*xSp, y: base_y+ySp, width: devW, height: devH,
      interfaces: [
        ...coreIds.map((_,j)=>({ id:`core${j+1}`, mac:genUniqueMac(), speed:40000, port_type:"qsfp-plus", status:"up" })),
        ...Array.from({length: access},(_,j)=>({ id:`acc${j+1}`, mac:genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" }))
      ]
    });
    aggIds.push(id); stats.devices++;
  }
  // Access
  for(let i=0;i<access;i++){
    const id = `${prefix}-acc${i+1}`;
    App.config.devices.push({
      id, label:`Access ${i+1}`, type:"l2switch", role:"access", status:"running",
      x: base_x + i*xSp, y: base_y+ySp*2, width: devW, height: devH,
      interfaces: [
        ...aggIds.map((_,j)=>({ id:`agg${j+1}`, mac:genUniqueMac(), speed:10000, port_type:"sfp-plus", status:"up" })),
        ...Array.from({length: hosts_per_access},(_,j)=>({ id:`gi1/0/${j+1}`, mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }))
      ]
    });
    accIds.push(id); stats.devices++;
  }
  // Hosts
  for(let i=0;i<access;i++){
    for(let j=0;j<hosts_per_access;j++){
      const sid = `${prefix}-h${i+1}-${j+1}`;
      App.config.servers.push({
        id: sid, label:`Host ${i+1}-${j+1}`, type:"virtual",
        os:"Linux", status:"running",
        x: base_x + (i*hosts_per_access+j)*(srvW+10), y: base_y+ySp*3+20,
        width: srvW, height: srvH,
        interfaces:[{ id:"eth0", mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }]
      });
      stats.servers++;
    }
  }
  // Links: core ↔ agg (full mesh)
  for(let ci=0;ci<coreIds.length;ci++) for(let ai=0;ai<aggIds.length;ai++){
    App.config.connections.push({ id:`${coreIds[ci]}--${aggIds[ai]}`,
      from:{device:coreIds[ci], interface:`agg${ai+1}`}, to:{device:aggIds[ai], interface:`core${ci+1}`},
      type:"fiber", speed:40000, status:"up", traffic:"low", direction:"bidirectional" });
    stats.links++;
  }
  // Agg ↔ Access (full mesh)
  for(let ai=0;ai<aggIds.length;ai++) for(let ki=0;ki<accIds.length;ki++){
    App.config.connections.push({ id:`${aggIds[ai]}--${accIds[ki]}`,
      from:{device:aggIds[ai], interface:`acc${ki+1}`}, to:{device:accIds[ki], interface:`agg${ai+1}`},
      type:"fiber", speed:10000, status:"up", traffic:"idle", direction:"bidirectional" });
    stats.links++;
  }
  // Access ↔ Hosts
  for(let ki=0;ki<accIds.length;ki++) for(let j=0;j<hosts_per_access;j++){
    App.config.connections.push({ id:`${accIds[ki]}--${prefix}-h${ki+1}-${j+1}`,
      from:{device:accIds[ki], interface:`gi1/0/${j+1}`}, to:{server:`${prefix}-h${ki+1}-${j+1}`, interface:"eth0"},
      type:"ethernet", speed:1000, status:"up", traffic:"idle", direction:"bidirectional" });
    stats.links++;
  }
  return stats;
}

// vCenter HA — 2 ESXi hosts behind a switch, each hosting VMs. vMotion ready.
function buildVcenterHA(opts){
  const { hosts=2, vms_each=2, prefix="vc", base_x=400, base_y=200 } = opts||{};
  const stats={devices:0,servers:0,links:0};
  const swId = `${prefix}-sw`;
  App.config.devices.push({ id:swId, label:`${prefix} mgmt sw`, type:"l2switch", status:"running",
    x:base_x, y:base_y, width:130, height:60, interfaces:Array.from({length:hosts+1},(_,i)=>({id:"g"+i,status:"up"})) });
  stats.devices++;
  for(let h=0;h<hosts;h++){
    const hid = `${prefix}-esxi${h+1}`;
    // size host to fit vms inside
    const vmW=70, vmH=38, gap=6, headerH=28, padX=10, cols=3;
    const totalRows = Math.ceil(vms_each/cols);
    const hostW = Math.max(200, padX*2 + cols*vmW + (cols-1)*gap);
    const hostH = Math.max(100, headerH + totalRows*(vmH+gap) + 8);
    const hx = base_x-100+h*(hostW+40), hy = base_y+150;
    App.config.servers.push({ id:hid, label:hid, type:"hypervisor", os:"VMware ESXi", status:"running",
      x:hx, y:hy, width:hostW, height:hostH, cpu:32, memory:131072,
      interfaces:[{id:"vmnic0",ip:`10.0.${100+h}.10/24`,mac:genUniqueMac(),status:"up"}],
      hypervisor:{ type:"esxi", vms:[], vswitches:[{name:"vSwitch0",portgroups:["VM Network","Management"]}], datastores:[{name:"shared-ds",capacity_gb:2000,backing:""}] } });
    App.config.connections.push({id:uid("link"),from:{server:hid,interface:"vmnic0"},to:{device:swId,interface:"g"+h},type:"ethernet",status:"up"});
    stats.servers++; stats.links++;
    for(let v=0; v<vms_each; v++){
      const vid = `${hid}-vm${v+1}`;
      const col=v%cols, row=Math.floor(v/cols);
      App.config.servers.push({ id:vid, label:vid, host:hid, vm:true, type:"virtual", os:"linux",
        status:"running", power:"on", vcpu:2, ram_gb:4, portgroup:"VM Network",
        x: hx + padX + col*(vmW+gap),
        y: hy + headerH + row*(vmH+gap),
        width:vmW, height:vmH,
        interfaces:[{id:"eth0", ip:_autoFreeIp(), mac:genUniqueMac(), status:"up"}] });
      stats.servers++;
    }
  }
  return stats;
}
// OpenShift: K8s + ingress router + integrated container/VM (OCP supports VMs via OpenShift Virtualization).
function buildOpenShift(opts){
  const { workers=3, app_replicas=3, vms=1, cluster_name="ocp", prefix="ocp", base_x=400, base_y=200 } = opts||{};
  App.config.k8s = App.config.k8s || { clusters:[] };
  const masters = 3, total = masters + workers;
  const fab = _k8sFabric(prefix, total, base_x, base_y, cluster_name);
  const stats = fab.stats;
  const masterIds = fab.nodeIds.slice(0, masters);
  const workerIds = fab.nodeIds.slice(masters);
  for(const id of masterIds){ const s=Cfg.byId("servers",id); s.label=id+" (control-plane)"; }
  // OpenShift Virtualization VMs (Kubernetes-managed VMs on worker nodes)
  for(let v=0; v<vms; v++){
    const wid = workerIds[v%workerIds.length]; if(!wid) break;
    const host = Cfg.byId("servers",wid);
    const vid = `${prefix}-vm${v+1}`;
    App.config.servers.push({ id:vid, label:vid+" (OCP VM)", host:wid, vm:true, type:"virtual", os:"linux",
      status:"running", power:"on", vcpu:2, ram_gb:4,
      x:(host.x||0)+8+(v%2)*80, y:(host.y||0)+(host.height||60)+10+Math.floor(v/2)*46,
      width:74, height:42,
      interfaces:[{id:"eth0", ip:_autoFreeIp(), mac:genUniqueMac(), status:"up"}] });
    stats.servers++;
  }
  const pods=[];
  for(let i=0;i<app_replicas;i++){
    pods.push({ name:`app-${i+1}`, namespace:"default", node:workerIds[i%workerIds.length],
      ip:`10.244.0.${11+i}`, labels:{app:"web"}, status:"Running" });
  }
  const svc = { name:"web-svc", namespace:"default", type:"ClusterIP", cluster_ip:"172.30.0.10",
    selector:{app:"web"}, ports:[{port:80,target_port:8080,proto:"tcp"}] };
  const route = { name:"web-route", namespace:"default", host:"web.apps.example.com",
    rules:[{path:"/", service:"web-svc", port:80}] };
  App.config.k8s.clusters.push({ name:cluster_name, pod_cidr:"10.128.0.0/14", service_cidr:"172.30.0.0/16",
    nodes:fab.nodeIds, namespaces:["default","openshift-ingress"], pods, services:[svc], ingresses:[route],
    openshift:true });
  // Ingress Router (HAProxy/OpenShift Router) as LB device
  const lbId = `${prefix}-router`;
  App.config.devices.push({ id:lbId, label:`${cluster_name} Ingress Router`, type:"loadbalancer", status:"running",
    x:base_x+200, y:base_y-110, width:140, height:60, interfaces:[{id:"eth0",ip:"203.0.113.90/24",status:"up"}],
    lb:{ vips:[{ vip:"203.0.113.90", port:443, algorithm:"round-robin",
      pool: workerIds.map(id=>({ server:id, port:8080 })) }] } });
  App.config.connections.push({ id:uid("link"), from:{device:lbId,interface:"eth0"}, to:{device:fab.swId,interface:"g"+(total)}, type:"ethernet", status:"up" });
  stats.devices++; stats.links++;
  return stats;
}

function buildHubSpoke(opts){
  const { spokes, hosts_per_spoke, prefix, base_x, base_y } = opts;
  const stats = { devices:0, servers:0, links:0 };
  const hubId = `${prefix}-hub`;
  App.config.devices.push({
    id: hubId, label:"Hub Router", type:"router", role:"hub", status:"running",
    x: base_x + (spokes*180)/2 - 65, y: base_y, width: 130, height: 70,
    interfaces: Array.from({length: spokes},(_,i)=>({ id:`spoke${i+1}`, mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }))
  });
  stats.devices++;
  for(let i=0;i<spokes;i++){
    const sid = `${prefix}-spoke${i+1}`;
    App.config.devices.push({
      id: sid, label:`Spoke ${i+1}`, type:"router", role:"spoke", status:"running",
      x: base_x + i*180, y: base_y + 150, width: 130, height: 70,
      interfaces: [
        { id:"wan", mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" },
        ...Array.from({length: hosts_per_spoke},(_,j)=>({ id:`lan${j+1}`, mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }))
      ]
    });
    stats.devices++;
    App.config.connections.push({ id:`${hubId}--${sid}`,
      from:{device:hubId, interface:`spoke${i+1}`}, to:{device:sid, interface:"wan"},
      type:"ethernet", speed:1000, status:"up", traffic:"low", direction:"bidirectional" });
    stats.links++;
    for(let j=0;j<hosts_per_spoke;j++){
      const hsid = `${prefix}-h${i+1}-${j+1}`;
      App.config.servers.push({
        id: hsid, label:`H${i+1}-${j+1}`, type:"virtual",
        os:"Linux", status:"running",
        x: base_x + i*180 + j*120, y: base_y + 280,
        width: 110, height: 60,
        interfaces:[{ id:"eth0", mac:genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }]
      });
      stats.servers++;
      App.config.connections.push({ id:`${sid}--${hsid}`,
        from:{device:sid, interface:`lan${j+1}`}, to:{server:hsid, interface:"eth0"},
        type:"ethernet", speed:1000, status:"up", traffic:"idle", direction:"bidirectional" });
      stats.links++;
    }
  }
  return stats;
}

/* ====== KUBERNETES TEMPLATES ====== */
// Helper: create a switch + N node servers wired to it, return {switchId, nodeIds}
function _k8sFabric(prefix, nNodes, base_x, base_y, label){
  const stats = { devices:0, servers:0, links:0 };
  const swId = `${prefix}-sw`;
  App.config.devices.push({ id:swId, label:`${label} sw`, type:"l2switch", status:"running",
    x:base_x, y:base_y, width:130, height:60, interfaces:Array.from({length:nNodes+2},(_,i)=>({id:"g"+i,status:"up"})) });
  stats.devices++;
  const nodeIds=[];
  for(let i=0;i<nNodes;i++){
    const id=`${prefix}-node${i+1}`;
    App.config.servers.push({ id, label:id, type:"server", os:"linux", status:"running",
      x:base_x - 60 + i*150, y:base_y+130, width:120, height:60,
      interfaces:[{ id:"eth0", ip:`10.${100+(base_y%50)}.0.${10+i}/24`, status:"up" }] });
    App.config.connections.push({ id:uid("link"), from:{server:id,interface:"eth0"}, to:{device:swId,interface:"g"+i}, type:"ethernet", status:"up" });
    stats.servers++; stats.links++;
    nodeIds.push(id);
  }
  return { swId, nodeIds, stats };
}
function buildK8sSingle(opts){
  const { masters, workers, app_replicas, svc_type, cluster_name, prefix, base_x, base_y } = opts;
  App.config.k8s = App.config.k8s || { clusters:[] };
  const total = masters + workers;
  const fab = _k8sFabric(prefix, total, base_x, base_y, cluster_name);
  const stats = fab.stats;
  const masterIds = fab.nodeIds.slice(0, masters);
  const workerIds = fab.nodeIds.slice(masters);
  // label master/worker
  for(const id of masterIds){ const s=Cfg.byId("servers",id); s.label=id+" (master)"; s.type="server"; }
  // pods spread across workers (fallback to all nodes if no workers)
  const podHosts = workerIds.length ? workerIds : fab.nodeIds;
  const pods=[];
  for(let i=0;i<app_replicas;i++){
    pods.push({ name:`web-${i+1}`, namespace:"default", node:podHosts[i%podHosts.length],
      ip:`10.244.0.${11+i}`, labels:{app:"web"}, status:"Running" });
  }
  const ports = svc_type==="NodePort" ? [{port:80,target_port:8080,node_port:30080,proto:"tcp"}]
              : svc_type==="LoadBalancer" ? [{port:80,target_port:8080,node_port:30080,proto:"tcp"}]
              : [{port:80,target_port:8080,proto:"tcp"}];
  const svc = { name:"web-svc", namespace:"default", type:svc_type, cluster_ip:"10.96.0.10",
    selector:{app:"web"}, ports };
  if(svc_type==="LoadBalancer") svc.external_ip="203.0.113.80";
  App.config.k8s.clusters.push({ name:cluster_name, pod_cidr:"10.244.0.0/16", service_cidr:"10.96.0.0/12",
    nodes:fab.nodeIds, control_plane:{ masters:masterIds, ha:masters>=3 }, roles:Object.fromEntries(fab.nodeIds.map(id=>[id, masterIds.includes(id)?"master":"worker"])),
    namespaces:["default","kube-system"], pods, services:[svc], ingresses:[] });
  return stats;
}
// Production-like cluster: workers + LoadBalancer Service + external Ingress LB + CloudFront CDN.
// Edge path: Internet → CDN(CloudFront) → ALB(LoadBalancer) → cluster Service → Pods.
function buildK8sProd(opts){
  const { workers=3, app_replicas=3, cluster_name="prod", prefix="kp", base_x=400, base_y=300 } = opts||{};
  App.config.k8s = App.config.k8s || { clusters:[] };
  const masters = 1, total = masters + workers;
  const fab = _k8sFabric(prefix, total, base_x, base_y, cluster_name);
  const stats = fab.stats;
  const masterIds = fab.nodeIds.slice(0, masters);
  const workerIds = fab.nodeIds.slice(masters);
  for(const id of masterIds){ const s=Cfg.byId("servers",id); s.label=id+" (master)"; }
  const podHosts = workerIds.length ? workerIds : fab.nodeIds;
  const pods=[];
  for(let i=0;i<app_replicas;i++){
    pods.push({ name:`web-${i+1}`, namespace:"default", node:podHosts[i%podHosts.length],
      ip:`10.244.0.${11+i}`, labels:{app:"web"}, status:"Running" });
  }
  const svc = { name:"web-svc", namespace:"default", type:"LoadBalancer", cluster_ip:"10.96.0.10",
    external_ip:"203.0.113.80", selector:{app:"web"}, ports:[{port:80,target_port:8080,node_port:30080,proto:"tcp"}] };
  const ingress = { name:"web-ingress", namespace:"default", host:"app.example.com",
    rules:[{path:"/", service:"web-svc", port:80}] };
  App.config.k8s.clusters.push({ name:cluster_name, pod_cidr:"10.244.0.0/16", service_cidr:"10.96.0.0/12",
    nodes:fab.nodeIds, control_plane:{ masters:masterIds, ha:masters>=3 }, roles:Object.fromEntries(fab.nodeIds.map(id=>[id, masterIds.includes(id)?"master":"worker"])),
    namespaces:["default","kube-system"], pods, services:[svc], ingresses:[ingress] });

  // External Ingress Load Balancer (ALB-like) in front of the cluster
  const lbId = `${prefix}-alb`;
  App.config.devices.push({ id:lbId, label:`${cluster_name} Ingress ALB`, type:"loadbalancer", status:"running",
    x:base_x+40, y:base_y-130, width:140, height:60, interfaces:[{id:"eth0",ip:"203.0.113.80/24",status:"up"}],
    lb:{ vips:[{ vip:"203.0.113.80", port:443, algorithm:"round-robin",
      pool: workerIds.map(id=>({ server:id, port:30080 })) }] } });
  App.config.connections.push({ id:uid("link"), from:{device:lbId,interface:"eth0"}, to:{device:fab.swId,interface:"g"+(total)}, type:"ethernet", status:"up" });
  stats.devices++; stats.links++;

  // CloudFront CDN edge in front of the ALB
  const cdnId = `${prefix}-cdn`;
  App.config.servers.push({ id:cdnId, label:`${cluster_name} CloudFront CDN`, type:"cloud", provider:"cloud",
    status:"running", x:base_x+40, y:base_y-240, width:150, height:55, external:true, fqdn:"d123.cloudfront.net",
    interfaces:[{id:"eth0", ip:"13.224.0.10/32", status:"up"}], listen_ports:[{port:443,proto:"tcp"},{port:80,proto:"tcp"}],
    cdn:{ origin:"203.0.113.80", origin_port:443 } });
  App.config.connections.push({ id:uid("link"), from:{server:cdnId,interface:"eth0"}, to:{device:lbId,interface:"eth0"}, type:"ethernet", status:"up" });
  stats.servers++; stats.links++;
  return stats;
}
function buildK8sHA(opts){
  const { masters, workers, app_replicas, cluster_name, prefix, base_x, base_y } = opts;
  App.config.k8s = App.config.k8s || { clusters:[] };
  const total = masters + workers;
  const fab = _k8sFabric(prefix, total, base_x, base_y, cluster_name);
  const stats = fab.stats;
  const masterIds = fab.nodeIds.slice(0, masters);
  const workerIds = fab.nodeIds.slice(masters);
  // API server load balancer in front of masters
  const lbId = `${prefix}-apilb`;
  App.config.devices.push({ id:lbId, label:`${cluster_name} API-LB`, type:"loadbalancer", status:"running",
    x:base_x+200, y:base_y-110, width:130, height:60, interfaces:[{id:"eth0",ip:"10.96.0.1/24",status:"up"}],
    lb:{ vips:[{ vip:"10.96.0.1", port:6443, algorithm:"round-robin",
      pool: masterIds.map(id=>({ server:id, port:6443 })) }] } });
  stats.devices++;
  for(const id of masterIds){ const s=Cfg.byId("servers",id); s.label=id+" (master/etcd)"; }
  const podHosts = workerIds.length ? workerIds : fab.nodeIds;
  const pods=[];
  for(let i=0;i<app_replicas;i++){
    pods.push({ name:`app-${i+1}`, namespace:"default", node:podHosts[i%podHosts.length],
      ip:`10.244.0.${11+i}`, labels:{app:"app"}, status:"Running" });
  }
  App.config.k8s.clusters.push({ name:cluster_name, pod_cidr:"10.244.0.0/16", service_cidr:"10.96.0.0/12",
    nodes:fab.nodeIds, namespaces:["default","kube-system"],
    control_plane:{ ha:true, api_vip:"10.96.0.1", masters:masterIds },
    pods, services:[
      { name:"app-svc", namespace:"default", type:"ClusterIP", cluster_ip:"10.96.0.20",
        selector:{app:"app"}, ports:[{port:80,target_port:8080,proto:"tcp"}] }
    ], ingresses:[] });
  return stats;
}
function buildK8sMulti(opts){
  const { clusters, workers_each, prefix, base_x, base_y } = opts;
  App.config.k8s = App.config.k8s || { clusters:[] };
  const names = ["prod","staging","dev","qa","dr"];
  let dev=0, srv=0, lnk=0;
  for(let c=0;c<clusters;c++){
    const cname = names[c] || ("cluster"+(c+1));
    const total = 1 + workers_each; // 1 master + workers
    const fab = _k8sFabric(`${prefix}-${cname}`, total, base_x, base_y + c*340, cname);
    dev+=fab.stats.devices; srv+=fab.stats.servers; lnk+=fab.stats.links;
    const masterId=fab.nodeIds[0]; const workerIds=fab.nodeIds.slice(1);
    Cfg.byId("servers",masterId).label=masterId+" (master)";
    const podHosts = workerIds.length?workerIds:fab.nodeIds;
    const pods=[{ name:`${cname}-web-1`, namespace:"default", node:podHosts[0], ip:`10.244.${c}.11`, labels:{app:"web"}, status:"Running" },
                { name:`${cname}-web-2`, namespace:"default", node:podHosts[podHosts.length>1?1:0], ip:`10.244.${c}.12`, labels:{app:"web"}, status:"Running" }];
    App.config.k8s.clusters.push({ name:cname, pod_cidr:`10.244.${c}.0/24`, service_cidr:`10.96.${c}.0/24`,
      nodes:fab.nodeIds, namespaces:["default"], pods,
      services:[{ name:"web-svc", namespace:"default", type:"NodePort", cluster_ip:`10.96.${c}.10`,
        selector:{app:"web"}, ports:[{port:80,target_port:8080,node_port:30080+c,proto:"tcp"}] }], ingresses:[] });
  }
  return { devices:dev, servers:srv, links:lnk };
}

/* ====== MAC AUDIT DIALOG ====== */
/* ====== ANIMATION TOGGLE ====== */
function toggleAnimations(){
  App.animationsEnabled = !App.animationsEnabled;
  if(typeof localStorage !== "undefined")
    localStorage.setItem("netsim-animations", App.animationsEnabled?"on":"off");
  document.body.classList.toggle("no-animations", !App.animationsEnabled);
  updateAnimToggleUI();
  render();
  toast(`アニメーション ${App.animationsEnabled?"有効":"無効"}`, "ok");
}
function updateAnimToggleUI(){
  const btn = $("#btn-anim-toggle");
  if(!btn) return;
  const ico = btn.querySelector(".ico"), lbl = btn.querySelector(".lbl");
  if(ico) ico.textContent = App.animationsEnabled ? "⏸" : "▶";
  if(lbl) lbl.textContent = App.animationsEnabled ? "アニメOFF" : "アニメON";
  btn.classList.toggle("primary", !App.animationsEnabled);
  btn.title = App.animationsEnabled
    ? "アニメーションを停止 (CPU軽量化)"
    : "アニメーションを再開";
}

function openMacAudit(){
  const cols = findMacCollisions();
  const missing = [];
  for(const d of (App.config.devices||[])) for(const i of (d.interfaces||[])){
    if(!i.mac) missing.push({ kind:"device", id:d.id, iface:i.id });
  }
  for(const s of (App.config.servers||[])) for(const i of (s.interfaces||[])){
    if(!i.mac) missing.push({ kind:"server", id:s.id, iface:i.id });
  }
  openDialog(`🔍 MAC アドレス監査`, (body)=>{
    // Summary
    const summary = ch("div", {
      style:{display:"flex",gap:"12px",marginBottom:"10px",fontSize:"12px"}
    }, body);
    ch("div",{ html:`<strong style="color:${cols.length?'var(--red)':'var(--green)'}">${cols.length}</strong> 件のMAC重複`, style:{padding:"4px 8px",background:"var(--bg2)",borderRadius:"3px"} },summary);
    ch("div",{ html:`<strong style="color:${missing.length?'var(--orange)':'var(--green)'}">${missing.length}</strong> 件の未割当`, style:{padding:"4px 8px",background:"var(--bg2)",borderRadius:"3px"} },summary);

    if(cols.length){
      ch("h4",{text:"⚠ MAC アドレス重複 (フレーム配送に問題が発生する可能性)",style:{margin:"10px 0 6px",fontSize:"12px",color:"var(--red)"}},body);
      for(const c of cols){
        const row = ch("div",{
          style:{background:"rgba(248,81,73,0.1)",border:"1px solid var(--red)",borderRadius:"4px",padding:"6px 8px",marginBottom:"4px"}
        },body);
        ch("div",{
          html:`<code style="color:var(--red);font-weight:700">${escapeHtml(c.mac)}</code> が ${c.locations.length} 個のIFで重複:`,
          style:{fontSize:"11px",marginBottom:"3px"}
        },row);
        for(const loc of c.locations){
          ch("div",{
            text: `  • ${loc.kind}/${loc.id}/${loc.iface}`,
            style:{fontSize:"10px",fontFamily:"var(--mono)",color:"var(--text-dim)",paddingLeft:"10px"}
          },row);
        }
      }
    }

    if(missing.length){
      ch("h4",{text:"未割当のMAC",style:{margin:"10px 0 6px",fontSize:"12px",color:"var(--orange)"}},body);
      const list = ch("div",{style:{maxHeight:"160px",overflowY:"auto",fontSize:"11px",fontFamily:"var(--mono)"}},body);
      for(const m of missing){
        const row = ch("div",{
          style:{display:"flex",alignItems:"center",gap:"6px",padding:"3px 6px",borderBottom:"1px dashed var(--border)"}
        },list);
        ch("span",{text:`${m.kind}/${m.id}/${m.iface}`,style:{flex:"1"}},row);
      }
    }

    if(!cols.length && !missing.length){
      ch("div",{
        text:"✓ 問題なし — すべてのインターフェースに固有のMACアドレスが割り当てられています。",
        style:{padding:"12px",textAlign:"center",color:"var(--green)",fontWeight:"600"}
      },body);
    }

    return {
      buttons:[
        ...(missing.length ? [{ text:"未割当を全て自動生成", primary:true, action:()=>{
          pushUndo();
          for(const m of missing){
            const obj = Cfg.byId(kindToCol(m.kind), m.id);
            if(!obj) continue;
            const iface = obj.interfaces.find(i=>i.id===m.iface);
            if(iface) iface.mac = genUniqueMac();
          }
          renderAndSync();
          toast(`${missing.length} 件のMACを自動生成`, "ok");
          closeDialog();
        }}] : []),
        ...(cols.length ? [{ text:"重複を解消 (再生成)", action:()=>{
          pushUndo();
          let n = 0;
          for(const c of cols){
            // Keep first, regen rest
            for(let i=1;i<c.locations.length;i++){
              const loc = c.locations[i];
              const obj = Cfg.byId(kindToCol(loc.kind), loc.id);
              if(!obj) continue;
              const iface = obj.interfaces.find(x=>x.id===loc.iface);
              if(iface){ iface.mac = genUniqueMac(); n++; }
            }
          }
          renderAndSync();
          toast(`${n} 件のMACを再生成`, "ok");
          closeDialog();
        }}] : []),
        { text:"閉じる", action: closeDialog }
      ]
    };
  });
}

function showShortcutHelp(){
  openDialog("⌨ キーボードショートカット", (body)=>{
    const tbl = ch("table",{style:{width:"100%",fontSize:"12px"}},body);
    const rows = [
      ["ファイル",""],
      ["Ctrl+S","YAML保存"],
      ["Ctrl+Enter","YAMLを反映"],
      ["操作",""],
      ["Ctrl+Z","元に戻す (Undo)"],
      ["Ctrl+Y","やり直す (Redo)"],
      ["Delete","選択要素を削除"],
      ["Escape","選択解除/ダイアログ閉じ"],
      ["シミュレーション",""],
      ["Space","シナリオ再生/一時停止"],
      ["F5","選択中シナリオを実行"],
      ["g c","CLIコンソール (要素選択中)"],
      ["g p","Pingプロンプト"],
      ["g t","Traceroute"],
      ["?","このヘルプ"],
      ["表示",""],
      ["F","全体表示 (Fit)"],
      ["+/-","ズームイン/アウト"]
    ];
    for(const [k,v] of rows){
      const tr = ch("tr",{},tbl);
      if(v === ""){
        ch("td",{colspan:"2",text:k,style:{padding:"8px 0 4px",fontSize:"10px",textTransform:"uppercase",color:"var(--accent)",fontWeight:"700",letterSpacing:"0.5px",borderBottom:"1px solid var(--border)"}},tr);
      } else {
        const td1 = ch("td",{style:{padding:"4px 12px",width:"100px"}},tr);
        ch("kbd",{text:k,style:{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"3px",padding:"2px 6px",fontFamily:"var(--mono)",fontSize:"10px",color:"var(--accent)"}},td1);
        ch("td",{text:v,style:{padding:"4px 0",color:"var(--text)"}},tr);
      }
    }
    return { buttons:[{ text:"閉じる", primary:true, action: closeDialog }] };
  });
}


// ============================================================================
// AWS ハンズオンラボ — Qiita「0から始めるAWS入門」5記事を対話型シミュレーションに移植
// 各ラボは複数のステップを持ち、各ステップは:
//   instructions: 実機での操作手順(参考)
//   sim_steps: シミュレータでの操作手順
//   verify(): 完了判定(true/false)
//   autoBuild(): 自動構築(学習補助)
//   hint: ヒント
// ============================================================================

var _HANDSON_VPC_NAME = "test-vpc";
var _HANDSON_EC2_ID   = "test-web-a";
var _HANDSON_ELB_ID   = "test-web-elb";
var _HANDSON_RDS_ID   = "test-rds-mysql";
var _HANDSON_RDS_RR   = "test-rds-mysql-rr";

function _findVpc(name){ return ((App.config.aws&&App.config.aws.vpcs)||[]).find(v=>v.name===name); }
function _vpcHasSubnet(vpc, cidr){ return vpc && (vpc.subnets||[]).some(s=>s.cidr===cidr); }
function _vpcHasSubnetAZ(vpc, az){ return vpc && (vpc.subnets||[]).some(s=>(s.az||"")===az); }
function _findDeviceByKind(kind){ return ((App.config.devices)||[]).find(d=>d.aws_kind===kind); }
function _findDevicesByKind(kind){ return ((App.config.devices)||[]).filter(d=>d.aws_kind===kind); }

var HANDS_ON_LABS = [
{
  id:"aws-handson-1-vpc",
  number:1,
  title:"0から始めるAWS入門① VPC編",
  overview:"AWS環境の囲い(VPC)を作成し、サブネット2つ(AZ-a/AZ-c)・Internet Gateway・ルートテーブルを設定する。Qiita @hiroshik1985 氏の記事に準拠。",
  next:"aws-handson-2-ec2",
  steps:[
    { id:"vpc-create", title:"VPCを作成 (10.0.0.0/16)",
      instructions:["AWSコンソール → [VPC] → [Create VPC]","Name: test-vpc / CIDR: 10.0.0.0/16 / Tenancy: Default"],
      sim_steps:["ツールバー『☁ AWS』ボタン → 『+ VPC』","Name: test-vpc, CIDR: 10.0.0.0/16, Region: ap-northeast-1"],
      hint:"VPCは『AWS上に論理的に分離されたプライベートネットワーク』を作る箱です。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); return !!(v && v.cidr==="10.0.0.0/16"); },
      autoBuild:()=>{ App.config.aws=App.config.aws||{vpcs:[]}; if(!_findVpc(_HANDSON_VPC_NAME)){ App.config.aws.vpcs.push({id:"vpc-"+uid("v"),name:_HANDSON_VPC_NAME,cidr:"10.0.0.0/16",region:"ap-northeast-1",tenancy:"default",subnets:[],security_groups:[],route_tables:[{name:"main",routes:[{dest:"10.0.0.0/16",target:"local"}]}],igw:false}); } } },
    { id:"vpc-subnet-a", title:"サブネット作成: AZ-a (10.0.0.0/24)",
      instructions:["[Subnets] → [Create Subnet]","VPC: test-vpc / AZ: ap-northeast-1a / CIDR: 10.0.0.0/24"],
      sim_steps:["VPC枠をクリック → 右パネルで『+サブネット』","Name: test-subnet-a, CIDR: 10.0.0.0/24, AZ: ap-northeast-1a"],
      hint:"AZ (Availability Zone) はデータセンター単位。冗長化のためAZを分けます。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); return _vpcHasSubnet(v,"10.0.0.0/24") && _vpcHasSubnetAZ(v,"ap-northeast-1a"); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v && !_vpcHasSubnet(v,"10.0.0.0/24")){ v.subnets=v.subnets||[]; v.subnets.push({name:"test-subnet-a",cidr:"10.0.0.0/24",az:"ap-northeast-1a",public:true}); } } },
    { id:"vpc-subnet-c", title:"サブネット追加: AZ-c (10.0.1.0/24)",
      instructions:["[Subnets] → [Create Subnet]","VPC: test-vpc / AZ: ap-northeast-1c / CIDR: 10.0.1.0/24"],
      sim_steps:["VPC枠→右パネル『+サブネット』をもう一度","Name: test-subnet-c, CIDR: 10.0.1.0/24, AZ: ap-northeast-1c"],
      hint:"2つのAZにまたがってサブネットを置くと、ELBやRDSのMulti-AZが使えます。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); return _vpcHasSubnet(v,"10.0.1.0/24") && _vpcHasSubnetAZ(v,"ap-northeast-1c"); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v && !_vpcHasSubnet(v,"10.0.1.0/24")){ v.subnets=v.subnets||[]; v.subnets.push({name:"test-subnet-c",cidr:"10.0.1.0/24",az:"ap-northeast-1c",public:true}); } } },
    { id:"vpc-igw", title:"Internet Gateway を作成・VPCにアタッチ",
      instructions:["[Internet Gateways] → [Create] → [Attach to VPC] で test-vpc を選択"],
      sim_steps:["ツールバー『🧩 AWSサービス』→ Internet Gateway を配置","配置されたIGWをクリック→右パネルで『アタッチVPC』に test-vpc を指定"],
      hint:"IGWが無いと、VPC内からインターネットへ出られません。",
      verify:()=>{ const igw=_findDeviceByKind("aws-igw"); const v=_findVpc(_HANDSON_VPC_NAME); return !!(v && v.igw) || !!(igw && igw.aws_config && igw.aws_config.attached_vpc===_HANDSON_VPC_NAME); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v){ v.igw=true; }
        if(!_findDeviceByKind("aws-igw")){ App.config.devices.push({id:uid("igw"),label:"test-igw",type:"cloud",status:"running",external:true,aws_kind:"aws-igw",aws_region:"ap-northeast-1",aws_vpc:_HANDSON_VPC_NAME,x:60,y:60,interfaces:[{id:"public0",ip:"0.0.0.0/32",status:"up"}],external_ports:[{port:80,proto:"tcp"},{port:443,proto:"tcp"}],aws_config:{attached_vpc:_HANDSON_VPC_NAME,route_table_assoc:["main"]}}); } } },
    { id:"vpc-route", title:"ルートテーブルに 0.0.0.0/0 → IGW を追加",
      instructions:["[Route Tables] → 該当VPC のメインRTを選択 → [Routes] → [Edit] → 0.0.0.0/0 → IGW"],
      sim_steps:["VPC枠をクリック → 右パネル『+ルート』 → 宛先 0.0.0.0/0 / ターゲット IGW (test-igw)"],
      hint:"このルートが無いと、サブネット内のEC2からインターネットに出られません。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(!v||!v.route_tables) return false; const rt=v.route_tables[0]; return !!(rt && (rt.routes||[]).some(r=>r.dest==="0.0.0.0/0" && /igw/i.test(r.target||""))); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v){ v.route_tables=v.route_tables||[{name:"main",routes:[{dest:"10.0.0.0/16",target:"local"}]}]; const rt=v.route_tables[0]; if(!(rt.routes||[]).some(r=>r.dest==="0.0.0.0/0")) rt.routes.push({dest:"0.0.0.0/0",target:"igw (test-igw)"}); } } }
  ]
},
{
  id:"aws-handson-2-ec2",
  number:2,
  title:"0から始めるAWS入門② EC2編",
  overview:"VPC内にEC2(t2.micro/Amazon Linux)を起動。ストレージ・タグ・セキュリティグループ・キーペアを設定し、nginxをインストール。",
  next:"aws-handson-3-elb",
  steps:[
    { id:"ec2-launch", title:"EC2インスタンス起動 (Amazon Linux, t2.micro)",
      instructions:["[EC2] → [Launch Instance] → Amazon Linux 2 → t2.micro","VPC: test-vpc / Subnet: AZ-a / Auto-assign Public IP: enable"],
      sim_steps:["VPCを選択した状態でツールバー『サーバ追加』→物理サーバ","OS: amazon-linux, Type: t2.micro, サブネット: test-subnet-a (10.0.0.0/24)"],
      hint:"EC2は仮想サーバです。t2.micro は無料枠で利用可能。",
      verify:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); return !!(s && s.aws && s.aws.vpc===_HANDSON_VPC_NAME); },
      autoBuild:()=>{ if(!Cfg.byId("servers",_HANDSON_EC2_ID)){ App.config.servers.push({id:_HANDSON_EC2_ID,label:"test-web-a",type:"server",os:"amazon-linux",instance_type:"t2.micro",status:"running",x:520,y:280,width:130,height:65,interfaces:[{id:"eth0",ip:"10.0.0.10/24",mac:genUniqueMac(),status:"up"}],aws:{vpc:_HANDSON_VPC_NAME,subnet:"test-subnet-a",security_groups:[],public_ip:"54.0.0.10"}}); } } },
    { id:"ec2-storage", title:"ストレージ: 10GB / General Purpose SSD",
      instructions:["[Add Storage] で Size:10, Volume Type:General Purpose (SSD)"],
      sim_steps:["EC2を選択 → 右パネル『ストレージ』に 10GB / gp2 を入力"],
      hint:"汎用SSD(gp2/gp3)はほとんどの用途で十分です。",
      verify:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); return !!(s && s.storage && s.storage.size_gb===10 && /SSD|gp2|gp3/i.test(s.storage.type||"")); },
      autoBuild:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); if(s) s.storage={size_gb:10,type:"gp2 (General Purpose SSD)"}; } },
    { id:"ec2-tag", title:"Name タグを設定: test-web-a",
      instructions:["[Add Tags] で Name=test-web-a"],
      sim_steps:["EC2を選択 → 右パネル『ラベル』を test-web-a に"],
      hint:"複数インスタンスを管理する際、タグ命名規則が重要です。",
      verify:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); return !!(s && /test-web/.test(s.label||"")); },
      autoBuild:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); if(s) s.label="test-web-a"; } },
    { id:"ec2-sg", title:"セキュリティグループ作成: SSH(22) MyIP, HTTP(80) 10.0.0.0/16",
      instructions:["[Security Group] → [Create] test-web-sg","Inbound: SSH 22 (MyIP), HTTP 80 (10.0.0.0/16)"],
      sim_steps:["VPC枠 → 右パネル『+ セキュリティグループ』","Name: test-web-sg, Inbound: tcp/22 MyIP, tcp/80 10.0.0.0/16"],
      hint:"HTTPはELB経由のためVPC内CIDRのみ。SSHは自分のIPのみが安全。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); const sg=v && (v.security_groups||[]).find(g=>g.name==="test-web-sg"); if(!sg) return false; const inb=sg.inbound||[]; return inb.some(r=>r.port===22) && inb.some(r=>r.port===80 && /10\.0\.0\.0\/16/.test(r.source||"")); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v){ v.security_groups=v.security_groups||[]; if(!v.security_groups.find(g=>g.name==="test-web-sg")) v.security_groups.push({name:"test-web-sg",inbound:[{proto:"tcp",port:22,source:"0.0.0.0/0"},{proto:"tcp",port:80,source:"10.0.0.0/16"}],outbound:[{proto:"all",port:0,dest:"0.0.0.0/0"}]}); const s=Cfg.byId("servers",_HANDSON_EC2_ID); if(s){ s.aws=s.aws||{}; s.aws.security_groups=["test-web-sg"]; } } } },
    { id:"ec2-keypair", title:"キーペアを作成 (pem ダウンロード)",
      instructions:["[Launch] 時に Create a new key pair → test-key.pem ダウンロード"],
      sim_steps:["EC2を選択 → 右パネル『キーペア』を test-key に設定 (本シミュレータでは記録のみ)"],
      hint:"pemは厳重保管。失くすとSSH不可。",
      verify:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); return !!(s && s.key_pair); },
      autoBuild:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); if(s) s.key_pair="test-key"; } },
    { id:"ec2-nginx", title:"nginxインストール・起動 (listen 80)",
      instructions:["SSH接続後: sudo yum install -y nginx && sudo systemctl start nginx"],
      sim_steps:["EC2を選択 → 右パネル『listen_ports』に 80/tcp を追加"],
      hint:"ELBのヘルスチェック対象になります。80番が listenしていることが重要。",
      verify:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); return !!(s && (s.listen_ports||[]).some(p=>p.port===80)); },
      autoBuild:()=>{ const s=Cfg.byId("servers",_HANDSON_EC2_ID); if(s){ s.listen_ports=s.listen_ports||[]; if(!s.listen_ports.some(p=>p.port===80)) s.listen_ports.push({port:80,proto:"tcp",service:"nginx"}); } } }
  ]
},
{
  id:"aws-handson-3-elb",
  number:3,
  title:"0から始めるAWS入門③ ELB編",
  overview:"インターネットからの玄関となるELB(ALB)を作成し、EC2にリクエストを振り分ける。リスナ・ヘルスチェック・SG・ターゲット紐付け。",
  next:"aws-handson-4-rds",
  steps:[
    { id:"elb-create", title:"ELB(ALB)を作成: test-web-elb",
      instructions:["[Load Balancers] → [Create] → Application LB","Name: test-web-elb, VPC: test-vpc"],
      sim_steps:["ツールバー『🧩 AWSサービス』→ ALB を配置","Label: test-web-elb (右パネルで設定)、所属VPC: test-vpc"],
      hint:"ALB(L7)/NLB(L4) が一般的。今回は HTTP なので ALB。",
      verify:()=>{ const a=_findDevicesByKind("aws-alb").find(d=>/test-web-elb/.test(d.label||d.id)); return !!a; },
      autoBuild:()=>{ if(!_findDevicesByKind("aws-alb").find(d=>/test-web-elb/.test(d.label||d.id))){ App.config.devices.push({id:_HANDSON_ELB_ID,label:"test-web-elb",type:"cloud",status:"running",external:true,aws_kind:"aws-alb",aws_region:"ap-northeast-1",aws_vpc:_HANDSON_VPC_NAME,x:380,y:160,interfaces:[{id:"public0",ip:"52.20.0.10/32",status:"up"}],external_ports:[{port:80,proto:"tcp"},{port:443,proto:"tcp"}],aws_config:{scheme:"internet-facing",listeners:[],target_group:{name:"tg-web",port:80,health_check:"/",targets:[]},subnets:[],security_groups:[]}}); } } },
    { id:"elb-listener", title:"リスナを HTTP:80 → HTTP:80 で設定",
      instructions:["[Listeners] → Add: Protocol HTTP, Port 80 → Target HTTP, Port 80"],
      sim_steps:["ALBを選択 → 右パネル『リスナ』+追加 → Port:80, Proto:HTTP, TG:tg-web"],
      hint:"HTTPSにする場合は別途SSL証明書(ACM)をアタッチします。",
      verify:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); return !!(a && a.aws_config && (a.aws_config.listeners||[]).some(l=>l.port===80 && /HTTP/i.test(l.proto||""))); },
      autoBuild:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); if(a){ a.aws_config.listeners=a.aws_config.listeners||[]; if(!a.aws_config.listeners.some(l=>l.port===80)) a.aws_config.listeners.push({port:80,proto:"HTTP",target_group:"tg-web"}); } } },
    { id:"elb-health", title:"ヘルスチェック設定: HTTP / 5s / 10s / 2 / 5",
      instructions:["Ping Protocol: HTTP / Port: 80 / Path: / / Timeout: 5 / Interval: 10 / Unhealthy: 2 / Healthy: 5"],
      sim_steps:["ALB → 右パネル『ヘルスチェック』に上記値を入力"],
      hint:"異常2回連続でターゲットから切り離し、正常5回連続で復帰。",
      verify:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); const hc=a && a.aws_config && a.aws_config.health_check; return !!(hc && hc.protocol==="HTTP" && hc.path==="/" && hc.interval===10 && hc.unhealthy===2 && hc.healthy===5); },
      autoBuild:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); if(a) a.aws_config.health_check={protocol:"HTTP",port:80,path:"/",timeout:5,interval:10,unhealthy:2,healthy:5}; } },
    { id:"elb-subnet", title:"サブネットを両AZに割当",
      instructions:["[Subnets] → AZ-a と AZ-c の両方を Add"],
      sim_steps:["ALB → 右パネル『所属サブネット』に test-subnet-a と test-subnet-c を追加"],
      hint:"ELBは複数AZにまたがって配置し可用性を確保。",
      verify:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); const sn=a && a.aws_config && a.aws_config.subnets; return !!(sn && sn.includes("test-subnet-a") && sn.includes("test-subnet-c")); },
      autoBuild:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); if(a) a.aws_config.subnets=["test-subnet-a","test-subnet-c"]; } },
    { id:"elb-sg", title:"ELB用セキュリティグループ: HTTP 0.0.0.0/0",
      instructions:["test-web-elb-sg を新規作成: Inbound HTTP 80 from 0.0.0.0/0"],
      sim_steps:["VPC → 右パネル『+ セキュリティグループ』 Name:test-web-elb-sg, Inbound:tcp/80 0.0.0.0/0"],
      hint:"ELBは外部公開なので 0.0.0.0/0。EC2は ELB 経由のみ許可。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); const sg=v && (v.security_groups||[]).find(g=>g.name==="test-web-elb-sg"); return !!(sg && (sg.inbound||[]).some(r=>r.port===80 && (r.source==="0.0.0.0/0"||/Anywhere/i.test(r.source||"")))); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v){ v.security_groups=v.security_groups||[]; if(!v.security_groups.find(g=>g.name==="test-web-elb-sg")) v.security_groups.push({name:"test-web-elb-sg",inbound:[{proto:"tcp",port:80,source:"0.0.0.0/0"}],outbound:[{proto:"all",port:0,dest:"0.0.0.0/0"}]}); const a=Cfg.byId("devices",_HANDSON_ELB_ID); if(a) a.aws_config.security_groups=["test-web-elb-sg"]; } } },
    { id:"elb-target", title:"ターゲットEC2を登録: test-web-a",
      instructions:["[Targets] → test-web-a を Register"],
      sim_steps:["ALB → 右パネル『ターゲットグループ』のターゲットに test-web-a を追加"],
      hint:"InService になるまで数十秒。OutOfService の場合はSGとヘルスチェックパスを確認。",
      verify:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); const tg=a && a.aws_config && a.aws_config.target_group; return !!(tg && (tg.targets||[]).includes(_HANDSON_EC2_ID)); },
      autoBuild:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); if(a){ a.aws_config.target_group=a.aws_config.target_group||{name:"tg-web",port:80,health_check:"/"}; a.aws_config.target_group.targets=[_HANDSON_EC2_ID]; }
        // 物理的にALB→EC2を接続(配線の見える化)
        const exists=(App.config.connections||[]).some(c=>(c.from&&(c.from.device===_HANDSON_ELB_ID||c.from.server===_HANDSON_ELB_ID))&&(c.to&&(c.to.server===_HANDSON_EC2_ID||c.to.device===_HANDSON_EC2_ID)));
        if(!exists) App.config.connections.push({id:uid("link"),from:{device:_HANDSON_ELB_ID,interface:"public0"},to:{server:_HANDSON_EC2_ID,interface:"eth0"},type:"ethernet",status:"up"}); } }
  ]
},
{
  id:"aws-handson-4-rds",
  number:4,
  title:"0から始めるAWS入門④ RDS編",
  overview:"AWSのDB(RDS, MySQL)を作成。DB Subnet Group, Parameter Group, SG を準備しMulti-AZ なしの最小構成 → Read Replica 追加。",
  next:"aws-handson-5-final",
  steps:[
    { id:"rds-subnet-group", title:"DB Subnet Group を登録 (両AZのサブネット)",
      instructions:["[RDS] → [Subnet Groups] → [Create] test-db-sng / VPC: test-vpc / Subnets: AZ-a + AZ-c"],
      sim_steps:["VPCを選択 → 右パネル『+ DB Subnet Group』 → test-db-sng, サブネット: test-subnet-a, test-subnet-c"],
      hint:"RDSはマルチAZ要件のため、最低2つのAZにまたがるサブネットが必要。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); const sng=v && (v.db_subnet_groups||[]).find(g=>g.name==="test-db-sng"); return !!(sng && (sng.subnets||[]).length>=2); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v){ v.db_subnet_groups=v.db_subnet_groups||[]; if(!v.db_subnet_groups.find(g=>g.name==="test-db-sng")) v.db_subnet_groups.push({name:"test-db-sng",subnets:["test-subnet-a","test-subnet-c"]}); } } },
    { id:"rds-param-group", title:"パラメータグループ作成 (utf8設定)",
      instructions:["[Parameter Groups] → [Create] mysql8.0 family / Name: japanese","Edit Parameters: character_set_* を utf8 に"],
      sim_steps:["VPCを選択 → 右パネル『+ DB Parameter Group』 Name:japanese, Family:mysql8.0, character_set:utf8"],
      hint:"日本語を扱うMySQLでは文字コード設定が必須。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); const pg=v && (v.db_parameter_groups||[]).find(g=>g.name==="japanese"); return !!(pg && /utf8/i.test(pg.character_set||"")); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v){ v.db_parameter_groups=v.db_parameter_groups||[]; if(!v.db_parameter_groups.find(g=>g.name==="japanese")) v.db_parameter_groups.push({name:"japanese",family:"mysql8.0",character_set:"utf8"}); } } },
    { id:"rds-sg", title:"DB用セキュリティグループ: MySQL 3306 from 10.0.0.0/16",
      instructions:["test-rds-sg を作成 → Inbound: TCP 3306 from 10.0.0.0/16"],
      sim_steps:["VPC → 右パネル『+ セキュリティグループ』 Name:test-rds-sg, Inbound:tcp/3306 10.0.0.0/16"],
      hint:"DBはVPC内からのみアクセスを許可。インターネット直接は厳禁。",
      verify:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); const sg=v && (v.security_groups||[]).find(g=>g.name==="test-rds-sg"); return !!(sg && (sg.inbound||[]).some(r=>r.port===3306 && /10\.0\.0\.0\/16/.test(r.source||""))); },
      autoBuild:()=>{ const v=_findVpc(_HANDSON_VPC_NAME); if(v){ v.security_groups=v.security_groups||[]; if(!v.security_groups.find(g=>g.name==="test-rds-sg")) v.security_groups.push({name:"test-rds-sg",inbound:[{proto:"tcp",port:3306,source:"10.0.0.0/16"}],outbound:[{proto:"all",port:0,dest:"0.0.0.0/0"}]}); } } },
    { id:"rds-create", title:"RDS本体作成 (MySQL, db.t1.micro)",
      instructions:["[RDS] → [Create] MySQL / db.t1.micro / 20GB / Multi-AZ: No","DB Subnet Group: test-db-sng / SG: test-rds-sg / Parameter: japanese"],
      sim_steps:["ツールバー『🧩 AWSサービス』→ RDS を配置","右パネル: engine=mysql, instance_class=db.t1.micro, 所属VPC=test-vpc, port=3306"],
      hint:"プロダクションでは Multi-AZ を Yes に。フェイルオーバが自動。",
      verify:()=>{ const r=_findDevicesByKind("aws-rds").find(d=>d.id===_HANDSON_RDS_ID); return !!(r && r.aws_config && r.aws_config.engine==="mysql"); },
      autoBuild:()=>{ if(!_findDevicesByKind("aws-rds").find(d=>d.id===_HANDSON_RDS_ID)){ App.config.devices.push({id:_HANDSON_RDS_ID,label:"test-rds-mysql",type:"cloud",status:"running",external:true,aws_kind:"aws-rds",aws_region:"ap-northeast-1",aws_vpc:_HANDSON_VPC_NAME,x:680,y:420,interfaces:[{id:"public0",ip:"10.0.0.200/32",status:"up"}],external_ports:[{port:3306,proto:"tcp"}],aws_config:{engine:"mysql",engine_version:"8.0.35",instance_class:"db.t1.micro",multi_az:false,port:3306,allocated_gb:20,db_subnet_group:"test-db-sng",parameter_group:"japanese",security_groups:["test-rds-sg"],master_username:"admin",database_name:"appdb",backup_retention_days:1,az:"ap-northeast-1a"}}); } } },
    { id:"rds-read-replica", title:"Read Replica を AZ-c に作成",
      instructions:["RDS インスタンス右クリック → [Create Read Replica] → AZ: ap-northeast-1c"],
      sim_steps:["RDSを選択 → 右パネル『+ Read Replica』 → AZ: ap-northeast-1c"],
      hint:"参照クエリをレプリカに逃がすことで、マスター負荷を軽減。",
      verify:()=>{ const rr=_findDevicesByKind("aws-rds").find(d=>d.aws_config && d.aws_config.source_db===_HANDSON_RDS_ID); return !!rr; },
      autoBuild:()=>{ if(!_findDevicesByKind("aws-rds").find(d=>d.aws_config && d.aws_config.source_db===_HANDSON_RDS_ID)){ App.config.devices.push({id:_HANDSON_RDS_RR,label:"test-rds-mysql-rr",type:"cloud",status:"running",external:true,aws_kind:"aws-rds",aws_region:"ap-northeast-1",aws_vpc:_HANDSON_VPC_NAME,x:820,y:420,interfaces:[{id:"public0",ip:"10.0.1.200/32",status:"up"}],external_ports:[{port:3306,proto:"tcp"}],aws_config:{engine:"mysql",engine_version:"8.0.35",instance_class:"db.t1.micro",port:3306,read_replica:true,source_db:_HANDSON_RDS_ID,az:"ap-northeast-1c",db_subnet_group:"test-db-sng",security_groups:["test-rds-sg"]}}); } } }
  ]
},
{
  id:"aws-handson-5-final",
  number:5,
  title:"0から始めるAWS入門⑤ 総合演習 (Lab1〜4の通信確認)",
  overview:"Lab1〜4で構築した [Internet → ALB → EC2(nginx) → RDS(MySQL)] の通信経路を確認し、本番想定でMulti-AZ化する。",
  next:null,
  steps:[
    { id:"final-verify-web", title:"Web経路確認: Internet → ALB → EC2",
      instructions:["ブラウザで ALBのDNS名にアクセス → nginxデフォルトが表示されればOK"],
      sim_steps:["ツールバー『通信テスト』 → ソース:Internet, 宛先:test-web-elb(ALB)/HTTP:80 を実行"],
      hint:"ALB→EC2のヘルスチェックが通っていれば、ALB経由でEC2のnginxに届きます。",
      verify:()=>{ const a=Cfg.byId("devices",_HANDSON_ELB_ID); const s=Cfg.byId("servers",_HANDSON_EC2_ID); return !!(a && s && (a.aws_config.target_group.targets||[]).includes(_HANDSON_EC2_ID) && (s.listen_ports||[]).some(p=>p.port===80)); },
      autoBuild:()=>{} },
    { id:"final-verify-db", title:"DB経路確認: EC2 → RDS (MySQL 3306)",
      instructions:["EC2 から RDS のエンドポイントへ mysql接続"],
      sim_steps:["通信テスト → ソース:test-web-a, 宛先:test-rds-mysql/TCP:3306"],
      hint:"SGで 10.0.0.0/16 → 3306 が許可されていれば疎通します。",
      verify:()=>{ const r=Cfg.byId("devices",_HANDSON_RDS_ID); const v=_findVpc(_HANDSON_VPC_NAME); const sg=v && (v.security_groups||[]).find(g=>g.name==="test-rds-sg"); return !!(r && sg && (sg.inbound||[]).some(x=>x.port===3306)); },
      autoBuild:()=>{} },
    { id:"final-multi-az", title:"本番化: Multi-AZにする",
      instructions:["RDSのMulti-AZ Deployment を Yes / EC2をAZ-cにも追加"],
      sim_steps:["RDSを選択 → 右パネル『Multi-AZ』を true に / EC2 を AZ-c にもう1台追加"],
      hint:"AZ障害が起きてもサービス継続できる構成になります。",
      verify:()=>{ const r=Cfg.byId("devices",_HANDSON_RDS_ID); const ec2c=(App.config.servers||[]).find(s=>s.aws&&s.aws.vpc===_HANDSON_VPC_NAME && s.aws.subnet==="test-subnet-c" && !s.vm); return !!(r && r.aws_config.multi_az===true && ec2c); },
      autoBuild:()=>{ const r=Cfg.byId("devices",_HANDSON_RDS_ID); if(r) r.aws_config.multi_az=true;
        if(!(App.config.servers||[]).some(s=>s.aws&&s.aws.subnet==="test-subnet-c"&&!s.vm)){ App.config.servers.push({id:"test-web-c",label:"test-web-c",type:"server",os:"amazon-linux",instance_type:"t2.micro",status:"running",x:520,y:480,width:130,height:65,interfaces:[{id:"eth0",ip:"10.0.1.10/24",mac:genUniqueMac(),status:"up"}],listen_ports:[{port:80,proto:"tcp",service:"nginx"}],storage:{size_gb:10,type:"gp2"},aws:{vpc:_HANDSON_VPC_NAME,subnet:"test-subnet-c",security_groups:["test-web-sg"],public_ip:"54.0.0.11"},key_pair:"test-key"}); const a=Cfg.byId("devices",_HANDSON_ELB_ID); if(a){ a.aws_config.target_group.targets=a.aws_config.target_group.targets||[]; if(!a.aws_config.target_group.targets.includes("test-web-c")) a.aws_config.target_group.targets.push("test-web-c"); App.config.connections.push({id:uid("link"),from:{device:_HANDSON_ELB_ID,interface:"public0"},to:{server:"test-web-c",interface:"eth0"},type:"ethernet",status:"up"}); } } } }
  ]
}
];

function _handsonLabProgress(lab){
  let done=0; for(const st of lab.steps){ try{ if(st.verify()) done++; }catch(e){} } return { done, total:lab.steps.length };
}
function _handsonResetAll(){
  // Lab で使う固定IDの要素を削除して、まっさらな状態でやり直せるようにする
  pushUndo();
  App.config.aws = App.config.aws || {vpcs:[]};
  App.config.aws.vpcs = (App.config.aws.vpcs||[]).filter(v=>v.name!==_HANDSON_VPC_NAME);
  App.config.servers = (App.config.servers||[]).filter(s=>!(s.aws&&s.aws.vpc===_HANDSON_VPC_NAME) && s.id!==_HANDSON_EC2_ID && s.id!=="test-web-c");
  App.config.devices = (App.config.devices||[]).filter(d=>!(d.aws_vpc===_HANDSON_VPC_NAME) && d.id!==_HANDSON_ELB_ID && d.id!==_HANDSON_RDS_ID && d.id!==_HANDSON_RDS_RR);
  App.config.connections = (App.config.connections||[]).filter(c=>{
    const ids=[c.from&&c.from.device,c.from&&c.from.server,c.to&&c.to.device,c.to&&c.to.server];
    return !ids.some(id=>id===_HANDSON_ELB_ID||id===_HANDSON_EC2_ID||id===_HANDSON_RDS_ID||id===_HANDSON_RDS_RR||id==="test-web-c");
  });
  renderAndSync(); updateStatusBar();
  toast("ハンズオン要素をリセットしました","ok");
}

function showHandsOnIndex(){
  openDialog("📘 AWSハンズオン (0から始めるAWS入門)", (body)=>{
    helpBox(body,"このハンズオンについて",[
      "Qiita @hiroshik1985 氏の『0から始めるAWS入門』シリーズ(5記事)を本シミュレータ用に移植したものです。",
      "各ラボはステップ毎に判定され、自分で操作してもよいし、『🤖 自動構築』で学習することもできます。",
      "Lab1から順に進めるのが推奨です。"
    ], false);
    for(const lab of HANDS_ON_LABS){
      const prog=_handsonLabProgress(lab);
      const card=ch("div",{style:{border:"1px solid var(--border)",borderRadius:"6px",padding:"10px",marginBottom:"8px",background:"var(--bg2)",cursor:"pointer"}},body);
      ch("div",{text:`Lab ${lab.number}. ${lab.title}`,style:{fontWeight:"700",fontSize:"13px",color:"var(--accent)"}},card);
      ch("div",{text:lab.overview,style:{fontSize:"11px",color:"var(--text-dim)",margin:"4px 0",lineHeight:"1.4"}},card);
      ch("div",{text:`進捗: ${prog.done}/${prog.total} ${prog.done===prog.total?"✅ 完了":""}`,style:{fontSize:"11px",color:prog.done===prog.total?"var(--green)":"var(--text)",fontWeight:"700"}},card);
      card.addEventListener("click",()=>{ closeDialog(); showHandsOnLab(lab.id); });
    }
    const btns=ch("div",{style:{display:"flex",gap:"6px",marginTop:"10px"}},body);
    ch("button",{text:"🔄 ハンズオン要素をリセット",style:{padding:"6px 12px",fontSize:"11px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:"4px"},
      on:{click:()=>{ if((typeof confirm==="function")?confirm("test-vpcとその配下要素を削除します。よろしいですか?"):true){ _handsonResetAll(); closeDialog(); showHandsOnIndex(); } }}},btns);
    return { buttons:[{ text:"閉じる", primary:true, action: closeDialog }] };
  });
}

function showHandsOnLab(labId){
  const lab = HANDS_ON_LABS.find(l=>l.id===labId);
  if(!lab) return;
  openDialog(`📘 ${lab.title}`, (body)=>{
    helpBox(body, lab.overview, [
      "ステップを上から順に実施してください。各ステップ右の『判定』で完了確認、『🤖 自動』で自動構築できます。"
    ], false);
    const list = ch("div",{},body);
    lab.steps.forEach((st,i)=>{
      let ok=false; try{ ok=!!st.verify(); }catch(e){}
      const row=ch("div",{style:{border:"1px solid "+(ok?"var(--green)":"var(--border)"),borderRadius:"6px",padding:"8px",marginBottom:"6px",background:ok?"rgba(34,197,94,0.05)":"var(--bg2)"}},list);
      const hd=ch("div",{style:{display:"flex",alignItems:"center",gap:"6px"}},row);
      ch("span",{text: ok?"✅":(""+(i+1)+"."),style:{fontWeight:"700",fontSize:"12px",color:ok?"var(--green)":"var(--accent)",minWidth:"24px"}},hd);
      ch("span",{text:st.title,style:{flex:"1",fontWeight:"700",fontSize:"12px"}},hd);
      const detail=ch("div",{style:{margin:"4px 0 4px 28px"}},row);
      ch("div",{text:"📋 実機操作:",style:{fontSize:"10px",color:"var(--text-mute)",fontWeight:"700",marginTop:"4px"}},detail);
      for(const s of st.instructions) ch("div",{text:" · "+s,style:{fontSize:"10px",color:"var(--text-dim)",lineHeight:"1.4"}},detail);
      ch("div",{text:"🖱 シミュレータ操作:",style:{fontSize:"10px",color:"var(--accent)",fontWeight:"700",marginTop:"4px"}},detail);
      for(const s of st.sim_steps) ch("div",{text:" · "+s,style:{fontSize:"10px",color:"var(--text)",lineHeight:"1.4"}},detail);
      if(st.hint) ch("div",{text:"💡 "+st.hint,style:{fontSize:"10px",color:"var(--cyan)",margin:"4px 0",lineHeight:"1.4"}},detail);
      const btns=ch("div",{style:{display:"flex",gap:"4px",marginTop:"4px"}},detail);
      ch("button",{text:"✓ 判定",style:{padding:"3px 10px",fontSize:"10px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px"},
        on:{click:()=>{ let r=false; try{r=!!st.verify();}catch(e){} toast(r?"✅ ステップ "+(i+1)+" クリア!":"❌ 未完了 — シミュレータ操作の手順を試してください","" +(r?"ok":"warn")); showHandsOnLab(labId); }}},btns);
      ch("button",{text:"🤖 自動",style:{padding:"3px 10px",fontSize:"10px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"3px",fontWeight:"700"},
        on:{click:()=>{ pushUndo(); try{st.autoBuild&&st.autoBuild();}catch(e){console.log(e);} renderAndSync(); updateStatusBar(); toast("ステップ "+(i+1)+" を自動構築","ok"); showHandsOnLab(labId); }}},btns);
    });
    const prog=_handsonLabProgress(lab);
    ch("div",{text:`進捗: ${prog.done}/${prog.total}${prog.done===prog.total?" 🎉 このラボ完了!":""}`,style:{margin:"8px 0",fontWeight:"700",color:prog.done===prog.total?"var(--green)":"var(--text)"}},body);
    const bottomBtns=ch("div",{style:{display:"flex",gap:"6px",flexWrap:"wrap"}},body);
    ch("button",{text:"🤖 全ステップ自動構築",style:{padding:"5px 12px",fontSize:"11px",cursor:"pointer",background:"var(--green)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
      on:{click:()=>{ pushUndo(); for(const st of lab.steps){ try{st.autoBuild&&st.autoBuild();}catch(e){console.log(e);} } renderAndSync(); updateStatusBar(); toast("全ステップを自動構築しました","ok"); showHandsOnLab(labId); }}},bottomBtns);
    if(lab.next){
      ch("button",{text:"→ 次のラボへ",style:{padding:"5px 12px",fontSize:"11px",cursor:"pointer",background:"var(--accent)",border:"none",color:"#fff",borderRadius:"4px",fontWeight:"700"},
        on:{click:()=>{ closeDialog(); showHandsOnLab(lab.next); }}},bottomBtns);
    }
    ch("button",{text:"← 一覧に戻る",style:{padding:"5px 12px",fontSize:"11px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"4px"},
      on:{click:()=>{ closeDialog(); showHandsOnIndex(); }}},bottomBtns);
    return { buttons:[{ text:"閉じる", primary:true, action: closeDialog }] };
  });
}
