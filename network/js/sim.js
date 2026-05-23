// NetSim — simulation engine, ping, MAC table, LLDP, addNew, init
/* ====== SIMULATION ENGINE ====== */
function getRoutingTable(deviceId){
  return (App.config.routing_tables||[]).find(r=>r.device===deviceId);
}

function ipToNum(ip){
  if(!ip) return 0;
  const p = ip.split("."); if(p.length!==4) return 0;
  return ((+p[0])<<24>>>0) + ((+p[1])<<16) + ((+p[2])<<8) + (+p[3]);
}

/* =========================================================================
 * FHRP — First Hop Redundancy Protocols (HSRP / VRRP / GLBP)
 * Routers in a group share a Virtual IP (and Virtual MAC). One router is
 * Active/Master (forwards for the VIP); others are Standby/Backup.
 * Election: highest priority wins; tie → highest real IP.
 * Config on a device interface: iface.fhrp = { proto, group, priority, vip, preempt }
 * ========================================================================= */
function fhrpVirtualMac(proto, group){
  const g = (group||0) & 0xff;
  if(proto === "vrrp")  return "00:00:5e:00:01:" + g.toString(16).padStart(2,"0");
  if(proto === "glbp")  return "00:07:b4:00:00:" + g.toString(16).padStart(2,"0");
  return "00:00:0c:07:ac:" + g.toString(16).padStart(2,"0"); // HSRPv1
}
function buildFhrpGroups(){
  const groups = {};
  for(const d of (App.config.devices||[])){
    for(const i of (d.interfaces||[])){
      const f = i.fhrp;
      if(!f || !f.proto || !f.vip) continue;
      const key = f.proto + ":" + (f.group||0) + ":" + f.vip;
      groups[key] = groups[key] || { proto:f.proto, group:f.group||0, vip:f.vip,
        vmac: fhrpVirtualMac(f.proto, f.group||0), members:[] };
      groups[key].members.push({
        device: d.id, iface: i.id,
        priority: (f.priority==null ? 100 : f.priority),
        preempt: !!f.preempt,
        realIp: (i.ip||"").split("/")[0],
        up: (d.status||"running")==="running" && (i.status||"up")==="up"
      });
    }
  }
  for(const k in groups){
    const g = groups[k];
    let act = null;
    for(const m of g.members.filter(m=>m.up)){
      if(!act){ act = m; continue; }
      if(m.priority > act.priority ||
         (m.priority === act.priority && ipToNum(m.realIp) > ipToNum(act.realIp))) act = m;
    }
    g.active = act;
    g.activeRole = g.proto === "vrrp" ? "Master" : "Active";
    g.standbyRole = g.proto === "vrrp" ? "Backup" : "Standby";
  }
  return groups;
}
function fhrpActiveForVip(vip){
  const groups = buildFhrpGroups();
  for(const k in groups){
    if(groups[k].vip === vip && groups[k].active) return groups[k].active.device;
  }
  return null;
}
function buildFhrpState(device){
  const groups = buildFhrpGroups();
  const out = [];
  for(const k in groups){
    const g = groups[k];
    const mine = g.members.find(m=>m.device===device.id);
    if(!mine) continue;
    const isActive = g.active && g.active.device===device.id;
    const standby = g.members.filter(m=>m.up && (!g.active||m.device!==g.active.device))
                     .sort((a,b)=> b.priority-a.priority || ipToNum(b.realIp)-ipToNum(a.realIp))[0];
    out.push({
      proto:g.proto, group:g.group, iface:mine.iface, vip:g.vip, vmac:g.vmac,
      priority:mine.priority, preempt:mine.preempt,
      state: !mine.up ? "Init" : (isActive ? g.activeRole : (g.active ? g.standbyRole : "Init")),
      activeDevice: g.active ? g.active.device : "(none)",
      standbyDevice: standby ? standby.device : "(none)"
    });
  }
  return out;
}

/* =========================================================================
 * EIGRP — DUAL. Successor = lowest Feasible Distance (FD).
 * Feasible Successor satisfies Feasibility Condition: neighbor RD < successor FD.
 * Metric (classic): 256 * (10^7/min_bw_kbps + cumulative_delay/10)
 * Config: device.eigrp = { enabled, as, router_id }
 * ========================================================================= */
function eigrpIfaceMetric(iface){
  const bwKbps = ((iface && iface.speed) || 100) * 1000;
  const delay = (iface && iface.delay) || 10;
  const bwTerm = Math.floor(1e7 / Math.max(1, bwKbps));
  return 256 * (bwTerm + delay);
}
function subnetOf(cidr){
  if(!cidr || !cidr.includes("/")) return null;
  try {
    const [ip, bitsStr] = cidr.split("/");
    const bits = +bitsStr;
    const n = ipToNum(ip);
    const mask = bits===0 ? 0 : (0xffffffff << (32-bits)) >>> 0;
    const net = (n & mask) >>> 0;
    return [(net>>>24)&0xff,(net>>>16)&0xff,(net>>>8)&0xff,net&0xff].join(".")+"/"+bits;
  } catch(e){ return null; }
}
function buildEigrpTopology(device){
  if(!device.eigrp || !device.eigrp.enabled) return [];
  const as = device.eigrp.as;
  const results = {};
  const lldp = (typeof buildLldpNeighbors==="function") ? buildLldpNeighbors(device) : [];
  for(const l of lldp){
    const peer = Cfg.byId("devices", l.neighbor);
    if(!peer || !peer.eigrp || !peer.eigrp.enabled || peer.eigrp.as !== as) continue;
    const localIf = (device.interfaces||[]).find(x=>x.id===l.localPort);
    if(!localIf || (localIf.status||"up")!=="up") continue;
    const linkMetric = eigrpIfaceMetric(localIf);
    for(const pif of (peer.interfaces||[])){
      const net = (pif.ip||"").includes("/") ? subnetOf(pif.ip) : null;
      if(!net) continue;
      const rd = eigrpIfaceMetric(pif);
      const fd = linkMetric + rd;
      results[net] = results[net] || { dest:net, paths:[] };
      results[net].paths.push({ via:peer.id, nextHop:(pif.ip||"").split("/")[0], iface:l.localPort, fd, rd });
    }
  }
  const out = [];
  for(const k in results){
    const r = results[k];
    r.paths.sort((a,b)=>a.fd-b.fd);
    const succ = r.paths[0];
    const fs = r.paths.slice(1).filter(p=>p.rd < succ.fd);
    out.push({ dest:r.dest, successor:succ, feasibleSuccessors:fs, allPaths:r.paths });
  }
  return out;
}

/* =========================================================================
 * RSTP / MSTP — port roles & states (extends existing STP)
 * RSTP roles: Root, Designated, Alternate (discarding), Backup (discarding).
 * MSTP: maps VLANs to instances (MSTI), each runs its own RSTP.
 * Config: switch.stp = { mode, priority, mst_instances:[{id,vlans,priority}] }
 * ========================================================================= */
function stpModeOf(sw){ return (sw.stp && sw.stp.mode) || "rstp"; }
function rstpPortRole(sw, ifaceId){
  if(typeof computeStpForSwitch !== "function") return null;
  try {
    const stp = computeStpForSwitch(sw);
    for(const v of (stp.vlans||[])){
      for(const p of (v.ports||[])){
        if(p.iface !== ifaceId) continue;
        const role = (p.role||"").toLowerCase();
        let rstpRole, state;
        if(role.startsWith("root")){ rstpRole="Root"; state="FWD"; }
        else if(role.startsWith("desig")){ rstpRole="Designated"; state="FWD"; }
        else if(role.startsWith("altn")||role.startsWith("block")||role.startsWith("disc")){ rstpRole="Alternate"; state="BLK"; }
        else if(role.startsWith("backup")){ rstpRole="Backup"; state="BLK"; }
        else { rstpRole = p.role||"-"; state = (p.state||"FWD"); }
        return { vlan:v.vlan, role:rstpRole, state, isRoot:v.isRoot };
      }
    }
  } catch(e){}
  return null;
}
function buildMstInstances(sw){
  if(stpModeOf(sw) !== "mstp") return null;
  const insts = (sw.stp && sw.stp.mst_instances) || [];
  const out = [{ id:0, vlans:"(remaining)", priority:(sw.stp&&sw.stp.priority)||32768 }];
  for(const m of insts) out.push({ id:m.id, vlans:m.vlans||"", priority:m.priority||32768 });
  return out;
}

/* =========================================================================
 * ACL — packet filter (first match wins; implicit deny at end)
 * Config: device.acls=[{id, entries:[{seq,action,proto,src,src_wild,dst,dst_wild,dst_port}]}]
 * Applied: iface.acl_in / iface.acl_out (acl id)
 * ========================================================================= */
function ipInWildcard(ip, base, wild){
  if(!ip || !base) return false;
  if(base.includes("/")) return inSubnet(ip, base);
  const ipn = ipToNum(ip), basen = ipToNum(base);
  const w = wild ? ipToNum(wild) : 0;
  return ((ipn ^ basen) & (~w >>> 0)) === 0;
}
function aclMatchEntry(e, pkt){
  if(e.proto && e.proto !== "ip" && e.proto !== pkt.proto) return false;
  if(e.src && e.src !== "any" && !ipInWildcard(pkt.src, e.src, e.src_wild)) return false;
  if(e.dst && e.dst !== "any" && !ipInWildcard(pkt.dst, e.dst, e.dst_wild)) return false;
  if(e.dst_port != null && pkt.dstPort != null && +e.dst_port !== +pkt.dstPort) return false;
  return true;
}
function evalAcl(device, aclId, pkt){
  const acl = (device.acls||[]).find(a=>a.id===aclId);
  if(!acl) return { permit:true, matched:null };
  const entries = (acl.entries||[]).slice().sort((a,b)=>(a.seq||0)-(b.seq||0));
  for(const e of entries){
    if(aclMatchEntry(e, pkt)) return { permit:e.action==="permit", matched:e };
  }
  return { permit:false, matched:{ action:"deny", implicit:true } };
}

/* ====== QoS — DiffServ classification (report/visualization) ====== */
function buildQosReport(device){
  const out = [];
  const q = device.qos;
  if(!q || !Array.isArray(q.policies)) return out;
  for(const p of q.policies){
    out.push({ name:p.name, classes:(p.classes||[]).map(c=>({
      name:c.name, match:c.match||"-", dscp:c.dscp||"-",
      bandwidth:c.bandwidth_pct!=null?(c.bandwidth_pct+"%"):"-", priority:!!c.priority
    }))});
  }
  return out;
}

/* =========================================================================
 * SERVER CLUSTERING (Active/Standby, shared-disk / mirror-disk)
 * Multiple servers form a cluster sharing a virtual service IP (cluster VIP).
 * Active node owns the VIP; on Active failure, a Standby takes over (failover).
 * Config on a server: server.cluster = { name, vip, priority, role_pref, disk:"shared"|"mirror" }
 * Servers with the same cluster.name form one cluster.
 * ========================================================================= */
function buildClusters(){
  const clusters = {};
  for(const s of (App.config.servers||[])){
    const c = s.cluster;
    if(!c || !c.name) continue;
    clusters[c.name] = clusters[c.name] || {
      name:c.name, vip:c.vip||"", disk:c.disk||"shared", members:[]
    };
    if(c.vip && !clusters[c.name].vip) clusters[c.name].vip = c.vip;
    clusters[c.name].members.push({
      server:s.id,
      priority:(c.priority==null?100:c.priority),
      up:(s.status||"running")==="running",
      heartbeatIf:c.heartbeat_if||null
    });
  }
  // Elect Active node per cluster: highest priority among up members (tie → id order)
  for(const k in clusters){
    const cl = clusters[k];
    let act=null;
    for(const m of cl.members.filter(m=>m.up)){
      if(!act){ act=m; continue; }
      if(m.priority>act.priority || (m.priority===act.priority && m.server<act.server)) act=m;
    }
    cl.active = act ? act.server : null;
    // Standby = next highest up member
    const standby = cl.members.filter(m=>m.up && (!act||m.server!==act.server))
                      .sort((a,b)=>b.priority-a.priority || (a.server<b.server?-1:1))[0];
    cl.standby = standby ? standby.server : null;
    cl.status = act ? (cl.members.every(m=>m.up) ? "healthy" : "degraded") : "down";
  }
  return clusters;
}
// Which server currently owns a cluster VIP (the active node)
function clusterActiveForVip(vip){
  const cs = buildClusters();
  for(const k in cs){ if(cs[k].vip===vip && cs[k].active) return cs[k].active; }
  return null;
}
function clusterOf(serverId){
  const s = Cfg.byId("servers", serverId);
  if(!s || !s.cluster || !s.cluster.name) return null;
  return buildClusters()[s.cluster.name] || null;
}

/* =========================================================================
 * SERVER LOAD BALANCING (L4/L7) + GSLB (DNS round-robin)
 * A loadbalancer device has VIP(s) each fronting a pool of real servers.
 * Algorithms: round-robin, least-connections, weighted, ip-hash.
 * Only "healthy" (running, optional health-check port up) members receive traffic.
 * Config on a loadbalancer device: device.lb = { vips:[{ vip, port, algorithm,
 *   pool:[{ server, weight, port }] }] }
 * GSLB: device.gslb = { domains:[{ fqdn, algorithm, records:[{ site_ip, weight }] }] }
 * ========================================================================= */
function lbHealthyMembers(vipCfg){
  const out = [];
  for(const m of (vipCfg.pool||[])){
    const s = Cfg.byId("servers", m.server);
    if(!s) continue;
    const up = (s.status||"running")==="running";
    out.push({ server:m.server, weight:(m.weight==null?1:m.weight),
      port:m.port||vipCfg.port, up });
  }
  return out;
}
// Pick a backend per the algorithm. `conns` optional map server→activeConns.
function lbSelectBackend(vipCfg, key, conns){
  const healthy = lbHealthyMembers(vipCfg).filter(m=>m.up);
  if(!healthy.length) return null;
  const algo = vipCfg.algorithm || "round-robin";
  if(algo === "least-connections" && conns){
    return healthy.slice().sort((a,b)=>(conns[a.server]||0)-(conns[b.server]||0))[0];
  }
  if(algo === "ip-hash" && key){
    let h=0; for(let i=0;i<key.length;i++) h=(h*31+key.charCodeAt(i))>>>0;
    return healthy[h % healthy.length];
  }
  if(algo === "weighted"){
    const total = healthy.reduce((s,m)=>s+m.weight,0);
    let r = (lbSelectBackend._rr = ((lbSelectBackend._rr||0)+1)) % total;
    for(const m of healthy){ if(r < m.weight) return m; r -= m.weight; }
    return healthy[0];
  }
  // round-robin (default)
  const idx = (lbSelectBackend._rr = ((lbSelectBackend._rr||0)+1)) % healthy.length;
  return healthy[idx];
}
function buildLbState(device){
  if(!device.lb || !Array.isArray(device.lb.vips)) return [];
  return device.lb.vips.map(v=>{
    const members = lbHealthyMembers(v);
    return {
      vip:v.vip, port:v.port, algorithm:v.algorithm||"round-robin",
      total:members.length, healthy:members.filter(m=>m.up).length,
      members
    };
  });
}
// GSLB: resolve a domain to a site IP via DNS round-robin / weighted, skipping down sites
function gslbResolve(device, fqdn){
  if(!device.gslb || !Array.isArray(device.gslb.domains)) return null;
  const dom = device.gslb.domains.find(d=>d.fqdn===fqdn);
  if(!dom) return null;
  const healthy = (dom.records||[]).filter(r=>{
    if(!r.health_server) return true;
    const s = Cfg.byId("servers", r.health_server);
    return !s || (s.status||"running")==="running";
  });
  if(!healthy.length) return null;
  const algo = dom.algorithm || "round-robin";
  if(algo === "weighted"){
    const total = healthy.reduce((s,r)=>s+(r.weight||1),0);
    let x = (gslbResolve._rr = ((gslbResolve._rr||0)+1)) % total;
    for(const r of healthy){ const w=r.weight||1; if(x<w) return r.site_ip; x-=w; }
  }
  const idx = (gslbResolve._rr = ((gslbResolve._rr||0)+1)) % healthy.length;
  return healthy[idx].site_ip;
}
function buildGslbState(device){
  if(!device.gslb || !Array.isArray(device.gslb.domains)) return [];
  return device.gslb.domains.map(d=>({
    fqdn:d.fqdn, algorithm:d.algorithm||"round-robin",
    records:(d.records||[]).map(r=>{
      let up = true;
      if(r.health_server){ const s=Cfg.byId("servers",r.health_server); up = !s || (s.status||"running")==="running"; }
      return { site_ip:r.site_ip, weight:r.weight||1, up };
    })
  }));
}


function findRouteFor(deviceId, destIp){
  const rt = getRoutingTable(deviceId);
  if(!rt) return null;
  const dev = Cfg.byId("devices", deviceId);
  let best=null, bestBits=-1, bestMetric=Infinity;
  for(const r of (rt.routes||[])){
    if(r.status!=="active") continue;
    if(!destIp || !r.destination) continue;
    if(!inSubnet(destIp, r.destination)) continue;
    // Real-network behavior: a route is withdrawn when its egress interface goes down.
    // Skip such routes so a higher-metric backup route (floating static) can take over.
    if(r.interface && dev){
      const eif = (dev.interfaces||[]).find(i=>i.id===r.interface);
      if(eif && (eif.status==="down" || eif.status==="err-disabled")) continue;
    }
    const bits = cidrBits(r.destination);
    const metric = (r.metric==null ? 1 : r.metric);
    // Longest-prefix-match first; among equal prefixes, lowest metric wins (admin distance / cost)
    if(bits > bestBits || (bits===bestBits && metric < bestMetric)){
      best=r; bestBits=bits; bestMetric=metric;
    }
  }
  return best;
}
function getFwPolicies(deviceId){
  return (App.config.policies||[]).find(p=>p.device===deviceId);
}

/* =========================================================================
 * SERVER PORT STATE — listening ports + host firewall (inbound port control)
 * A server "listens" on the ports of its RUNNING services (automatic), plus any
 * port explicitly opened. A host firewall can allow/deny inbound ports.
 * Config on a server:
 *   server.firewall = { enabled, default_inbound:"allow"|"deny",
 *                       rules:[{ port, proto, action:"allow"|"deny" }] }
 *   server.listen_ports = [{ port, proto }]   // manual extra listeners
 * ========================================================================= */
function transportProto(appProto){
  const p = (appProto||"tcp").toLowerCase();
  const udp = ["dns-udp","dhcp","snmp","syslog","ntp","tftp","udp"];
  // DNS uses both; treat as tcp by default but accept udp matches via "any"
  if(udp.includes(p)) return "udp";
  return "tcp"; // http/https/ftp/ssh/smtp/pop/imap/mysql/postgres/... → tcp
}
function buildServerPorts(server){
  // Effective listening sockets on this server
  const ports = [];
  const seen = new Set();
  function add(port, proto, src, state){
    const key = proto+"/"+port;
    if(seen.has(key)) return;
    seen.add(key);
    ports.push({ port:+port, proto:proto, source:src, state });
  }
  // 1) From running services hosted on this server (use TRANSPORT protocol)
  for(const sv of (App.config.services||[])){
    if(sv.server !== server.id) continue;
    if(!sv.port) continue;
    const running = (sv.status||"running") === "running";
    add(sv.port, transportProto(sv.protocol), "service:"+sv.id, running ? "LISTEN" : "DOWN");
  }
  // 2) Manually opened listener ports
  for(const lp of (server.listen_ports||[])){
    add(lp.port, (lp.proto||"tcp").toLowerCase(), "manual", "LISTEN");
  }
  // 3) Container published ports (host_port → container:container_port) on container hosts
  for(const c of (server.containers||[])){
    const running = (c.status||"running") === "running";
    for(const pm of (c.port_mappings||[])){
      if(pm.host_port == null) continue;
      add(pm.host_port, (pm.proto||"tcp").toLowerCase(), "container:"+(c.name||c.id||"?"), running ? "LISTEN" : "DOWN");
    }
  }
  // 4) Kubernetes NodePort services exposed on this node
  if(typeof k8sNodePortsForNode === "function"){
    for(const np of k8sNodePortsForNode(server.id)){
      add(np.node_port, (np.proto||"tcp").toLowerCase(), "k8s-NodePort:"+np.service, "LISTEN");
    }
  }
  return ports;
}

/* ====== CONTAINER NETWORKING ======
 * A container host (server.type==="container" or server.containers set) runs containers
 * attached to container networks (bridge/overlay). Containers can publish ports to the host.
 * Model:
 *   server.container_networks = [{ name, driver:"bridge"|"overlay"|"host"|"macvlan", subnet }]
 *   server.containers = [{ name, image, status, networks:[{net, ip}],
 *                          port_mappings:[{host_port, container_port, proto}] }]
 */
function buildContainerNetReport(server){
  const nets = (server.container_networks||[]).map(n=>({ name:n.name, driver:n.driver||"bridge", subnet:n.subnet||"-",
    members:(server.containers||[]).filter(c=>(c.networks||[]).some(x=>x.net===n.name)).map(c=>c.name) }));
  return nets;
}
function containerByName(server, name){ return (server.containers||[]).find(c=>(c.name||c.id)===name); }

/* =========================================================================
 * KUBERNETES NETWORKING
 * Model (App.config.k8s = { clusters:[...] }):
 *   cluster = { name, pod_cidr, service_cidr, nodes:[serverId...], namespaces:[...],
 *     pods:[{ name, namespace, node, ip, labels:{app}, status, containers:[{name,image,ports:[]}] }],
 *     services:[{ name, namespace, type:"ClusterIP"|"NodePort"|"LoadBalancer",
 *                 cluster_ip, external_ip, selector:{app}, ports:[{port,target_port,node_port,proto}] }],
 *     ingresses:[{ name, namespace, rules:[{host,path,service,port}] }] }
 * Behaviour modelled: label-selector → endpoints, ClusterIP/NodePort/LoadBalancer routing
 * (kube-proxy round-robin), pod reachability, NodePort exposed on every node.
 * ========================================================================= */
function k8sClusters(){ return (App.config.k8s && App.config.k8s.clusters) || []; }
function k8sFindClusterByNode(serverId){
  return k8sClusters().find(c=>(c.nodes||[]).includes(serverId)) || null;
}
function labelsMatch(podLabels, selector){
  if(!selector) return false;
  podLabels = podLabels||{};
  for(const k in selector){ if(podLabels[k] !== selector[k]) return false; }
  return Object.keys(selector).length>0;
}
// Endpoints (running pods) backing a service
function k8sServiceEndpoints(cluster, svc){
  return (cluster.pods||[]).filter(p=>(p.status||"Running")==="Running" && labelsMatch(p.labels, svc.selector));
}
// kube-proxy style round-robin selection of a backend pod for a service
function k8sSelectPod(cluster, svc){
  const eps = k8sServiceEndpoints(cluster, svc);
  if(!eps.length) return null;
  const idx = (k8sSelectPod._rr = ((k8sSelectPod._rr||0)+1)) % eps.length;
  return eps[idx];
}
// Find a service by its ClusterIP across all clusters
function k8sFindByClusterIP(ip){
  for(const c of k8sClusters()){
    for(const s of (c.services||[])){ if(ipOnly(s.cluster_ip)===ip) return { cluster:c, svc:s }; }
  }
  return null;
}
// Find a service by external/LoadBalancer IP
function k8sFindByExternalIp(ip){
  for(const c of k8sClusters()){
    for(const s of (c.services||[])){ if(s.external_ip && ipOnly(s.external_ip)===ip) return { cluster:c, svc:s }; }
  }
  return null;
}
// NodePort services exposed on a given node (server) → listening ports
function k8sNodePortsForNode(serverId){
  const out = [];
  const c = k8sFindClusterByNode(serverId);
  if(!c) return out;
  for(const s of (c.services||[])){
    if(s.type !== "NodePort" && s.type !== "LoadBalancer") continue;
    for(const p of (s.ports||[])){
      if(p.node_port) out.push({ node_port:p.node_port, proto:(p.proto||"tcp"), service:s.name, target_port:p.target_port||p.port });
    }
  }
  return out;
}
// Resolve a K8s destination (ClusterIP or NodePort on a node) to a backend pod + its node.
// Returns { pod, node, svc, cluster } or null.
function k8sResolveToPod(destIp, dstPort, arrivingNodeId){
  // ClusterIP service?
  const byCip = k8sFindByClusterIP(destIp);
  if(byCip){
    const pod = k8sSelectPod(byCip.cluster, byCip.svc);
    if(pod) return { pod, node:pod.node, svc:byCip.svc, cluster:byCip.cluster };
    return { pod:null, svc:byCip.svc, cluster:byCip.cluster };
  }
  // LoadBalancer external IP?
  const byExt = k8sFindByExternalIp(destIp);
  if(byExt){
    const pod = k8sSelectPod(byExt.cluster, byExt.svc);
    if(pod) return { pod, node:pod.node, svc:byExt.svc, cluster:byExt.cluster };
    return { pod:null, svc:byExt.svc, cluster:byExt.cluster };
  }
  // NodePort: arriving at a node IP on a node_port
  if(arrivingNodeId && dstPort!=null){
    const c = k8sFindClusterByNode(arrivingNodeId);
    if(c){
      for(const s of (c.services||[])){
        if(s.type!=="NodePort" && s.type!=="LoadBalancer") continue;
        if((s.ports||[]).some(p=>+p.node_port===+dstPort)){
          const pod = k8sSelectPod(c, s);
          if(pod) return { pod, node:pod.node, svc:s, cluster:c, viaNodePort:true };
          return { pod:null, svc:s, cluster:c, viaNodePort:true };
        }
      }
    }
  }
  // Direct pod IP?
  for(const c of k8sClusters()){
    const pod = (c.pods||[]).find(p=>ipOnly(p.ip)===destIp);
    if(pod) return { pod, node:pod.node, cluster:c, direct:true };
  }
  return null;
}
function buildK8sReport(){
  return k8sClusters().map(c=>({
    name:c.name, pod_cidr:c.pod_cidr, service_cidr:c.service_cidr,
    nodes:c.nodes||[], pods:(c.pods||[]).length, services:(c.services||[]).length,
    services_detail:(c.services||[]).map(s=>({
      name:s.name, ns:s.namespace||"default", type:s.type, cluster_ip:s.cluster_ip,
      external_ip:s.external_ip||"-",
      ports:(s.ports||[]).map(p=>`${p.port}${p.node_port?(":"+p.node_port+"(NodePort)"):""}→${p.target_port||p.port}`).join(", "),
      endpoints:k8sServiceEndpoints(c,s).map(p=>p.name)
    }))
  }));
}
// Host firewall verdict for an inbound connection to (proto, port)
function hostFirewallVerdict(server, proto, port){
  const fw = server.firewall;
  if(!fw || !fw.enabled) return { allowed:true, rule:null };
  const pl = (proto||"tcp").toLowerCase();
  for(const r of (fw.rules||[])){
    if(r.proto && r.proto.toLowerCase() !== "any" && r.proto.toLowerCase() !== pl) continue;
    if(r.port != null && +r.port !== +port) continue;
    return { allowed: (r.action==="allow"), rule:r };
  }
  const def = (fw.default_inbound||"allow");
  return { allowed: def==="allow", rule:{ id:"default-"+def, action:def } };
}
// Does the server accept an inbound connection to (proto, port)? Returns {ok, reason, state}
function serverAcceptsPort(server, proto, port){
  if(port == null) return { ok:true, reason:"(no port specified — ICMP/host reachability)" };
  // Host firewall first (a closed firewall blocks before reaching the socket)
  const fwv = hostFirewallVerdict(server, proto, port);
  if(!fwv.allowed){
    return { ok:false, reason:`ホストFWで遮断 (${(proto||"tcp")}/${port} ${fwv.rule?fwv.rule.id||fwv.rule.action:"deny"})`, state:"FW-BLOCK" };
  }
  // Is something listening on that port?
  const ports = buildServerPorts(server);
  const sock = ports.find(p=> p.port===+port && (p.proto===(proto||"tcp").toLowerCase() || p.proto==="any"));
  if(!sock){
    return { ok:false, reason:`接続拒否: ${(proto||"tcp")}/${port} で待ち受けているサービスなし (port closed)`, state:"REFUSED" };
  }
  if(sock.state !== "LISTEN"){
    return { ok:false, reason:`サービス停止中: ${(proto||"tcp")}/${port} (${sock.source})`, state:"DOWN" };
  }
  return { ok:true, reason:`${(proto||"tcp")}/${port} LISTEN (${sock.source})`, state:"LISTEN" };
}

function evaluatePolicy(pol, srcIp, dstIp, proto, dstPort){
  if(!pol || !pol.rules) return { action:"allow" };
  for(const r of pol.rules){
    if(r.status && r.status !== "enabled") continue;
    // src/dst may be a named segment OR a raw CIDR ("any"/0.0.0.0/0/::/0 = match all)
    if(r.src && srcIp && !matchRef(srcIp, r.src)) continue;
    if(r.dst && dstIp && !matchRef(dstIp, r.dst)) continue;
    if(r.protocol && r.protocol !== "any" && proto && r.protocol.toLowerCase() !== proto.toLowerCase()) continue;
    if(r.dst_port && dstPort && +r.dst_port !== +dstPort) continue;
    return { action: r.action, rule: r };
  }
  return { action:"deny", rule:{ id:"implicit-deny" } };
}

/* ====== POLICY-BASED ROUTING (PBR) ======
 * Route by source/criteria (not just destination). Configured on a device:
 *   device.pbr = [{ seq, src, dst, proto, dst_port, next_hop, egress_iface, status }]
 * First matching rule wins; sets an override next-hop IP for forwarding.
 */
function pbrLookup(device, srcIp, dstIp, proto, dstPort){
  const rules = (device.pbr||[]).slice().sort((a,b)=>(a.seq||0)-(b.seq||0));
  for(const r of rules){
    if(r.status && r.status !== "enabled") continue;
    if(r.src && srcIp && !matchRef(srcIp, r.src)) continue;
    if(r.dst && dstIp && !matchRef(dstIp, r.dst)) continue;
    if(r.proto && r.proto !== "any" && proto && r.proto.toLowerCase() !== proto.toLowerCase()) continue;
    if(r.dst_port != null && dstPort != null && +r.dst_port !== +dstPort) continue;
    return r;
  }
  return null;
}

/* ====== NAT (Network Address Translation) ======
 * device.nat = {
 *   enabled, 
 *   snat:[{ src, out_iface, translated_src }],   // source NAT / masquerade
 *   dnat:[{ orig_dst, orig_port, proto, translated_dst, translated_port }],  // port forwarding / DNAT
 *   masquerade: bool   // PAT on egress interface
 * }
 */
function natDnatLookup(device, dstIp, proto, dstPort){
  const nat = device.nat;
  if(!nat || !nat.enabled) return null;
  for(const r of (nat.dnat||[])){
    if(r.status && r.status!=="enabled") continue;
    if(r.orig_dst && !matchRef(dstIp, r.orig_dst)) continue;
    if(r.proto && r.proto!=="any" && proto && r.proto.toLowerCase()!==proto.toLowerCase()) continue;
    if(r.orig_port!=null && dstPort!=null && +r.orig_port!==+dstPort) continue;
    return { translated_dst: ipOnly(r.translated_dst||dstIp),
             translated_port: (r.translated_port!=null? +r.translated_port : dstPort), rule:r };
  }
  return null;
}
function natSnatLookup(device, srcIp, dstIp){
  const nat = device.nat;
  if(!nat || !nat.enabled) return null;
  for(const r of (nat.snat||[])){
    if(r.status && r.status!=="enabled") continue;
    if(r.src && srcIp && !matchRef(srcIp, r.src)) continue;
    if(r.dst && dstIp && !matchRef(dstIp, r.dst)) continue;
    return { translated_src: ipOnly(r.translated_src||srcIp), rule:r };
  }
  if(nat.masquerade) return { masquerade:true };
  return null;
}

/* ====== PROXY (forward / reverse) ======
 * A proxy is a service on a server. It terminates the client connection and opens a NEW
 * connection to the upstream/backend on the client's behalf.
 *   service.type = "reverse_proxy" → service.proxy = { upstreams:[{host,port}], mode:"round-robin", listen_port }
 *   service.type = "forward_proxy" → service.proxy = { allow:[cidr/seg], listen_port }  (any upstream allowed)
 * proxyForServer(serverId): returns the proxy services hosted there.
 */
function proxyServicesOn(serverId){
  return (App.config.services||[]).filter(s=>s.server===serverId &&
    (s.type==="reverse_proxy"||s.type==="forward_proxy") && (s.status||"running")==="running");
}
// If a server hosts a reverse proxy listening on dstPort, pick an upstream backend.
function reverseProxyUpstream(serverId, dstPort){
  for(const s of proxyServicesOn(serverId)){
    if(s.type!=="reverse_proxy") continue;
    const lp = (s.proxy && s.proxy.listen_port) || s.port || 443;
    if(dstPort!=null && +lp!==+dstPort) continue;
    const ups = (s.proxy && s.proxy.upstreams) || [];
    const healthy = ups.filter(u=>u.host);
    if(!healthy.length) return { proxy:s, upstream:null };
    // round-robin
    const idx = (reverseProxyUpstream._rr=((reverseProxyUpstream._rr||0)+1)) % healthy.length;
    return { proxy:s, upstream:healthy[idx] };
  }
  return null;
}
// Forward proxy: does this server act as a forward proxy on dstPort, and is src allowed?
function forwardProxyOn(serverId, dstPort, srcIp){
  for(const s of proxyServicesOn(serverId)){
    if(s.type!=="forward_proxy") continue;
    const lp = (s.proxy && s.proxy.listen_port) || s.port || 3128;
    if(dstPort!=null && +lp!==+dstPort) continue;
    const allow = (s.proxy && s.proxy.allow) || [];
    if(allow.length && srcIp && !allow.some(a=>matchRef(srcIp, a))) return { proxy:s, allowed:false };
    return { proxy:s, allowed:true };
  }
  return null;
}

function elementPrimaryIp(kind, id, family){
  // family is optional: "v4" | "v6". If unspecified, prefer v4, fall back to v6.
  if(kind === "service"){
    const sv = Cfg.byId("services", id);
    if(!sv) return null;
    return elementPrimaryIp("server", sv.server, family);
  }
  if(kind === "server" || kind === "device"){
    const obj = Cfg.byId(kindToCol(kind), id);
    if(!obj) return null;
    // Bonded
    if(obj.bonding && obj.bonding.enabled){
      const members = obj.bonding.members || [];
      const upMembers = members.filter(mid=>{
        const m = (obj.interfaces||[]).find(i=>i.id===mid);
        return m && m.status === "up";
      });
      if(upMembers.length > 0){
        if(family === "v6"){
          if(obj.bonding.bond_ipv6) return ipOnly(obj.bonding.bond_ipv6);
          // fall through to interface lookup
        } else if(family === "v4"){
          if(obj.bonding.bond_ip) return ipOnly(obj.bonding.bond_ip);
        } else {
          // No family preference: try v4 first, then v6
          if(obj.bonding.bond_ip) return ipOnly(obj.bonding.bond_ip);
          if(obj.bonding.bond_ipv6) return ipOnly(obj.bonding.bond_ipv6);
        }
      }
    }
    const ifs = (obj.interfaces||[]).filter(i=>i.status==="up");
    const pool = ifs.length ? ifs : (obj.interfaces||[]);
    for(const i of pool){
      if(family === "v6"){
        if(i.ipv6) return ipOnly(i.ipv6);
      } else if(family === "v4"){
        if(i.ip && ipFamily(i.ip) === "v4") return ipOnly(i.ip);
      } else {
        // Prefer v4 then v6
        if(i.ip && ipFamily(i.ip) === "v4") return ipOnly(i.ip);
        if(i.ipv6) return ipOnly(i.ipv6);
      }
    }
    return null;
  }
  if(kind === "network"){
    const n = Cfg.byId("networks", id);
    if(!n) return null;
    if(family === "v6") return n.gateway_v6 || (ipFamily(n.gateway)==="v6"?n.gateway:null);
    if(family === "v4") return ipFamily(n.gateway)==="v4" ? n.gateway : null;
    return n.gateway || n.gateway_v6 || null;
  }
  return null;
}

function resolveScenarioEndpoint(name){
  let o = Cfg.byId("services", name);
  if(o) return { kind:"service", obj:o };
  o = Cfg.byId("servers", name);
  if(o) return { kind:"server", obj:o };
  o = Cfg.byId("devices", name);
  if(o) return { kind:"device", obj:o };
  o = Cfg.byId("networks", name);
  if(o) return { kind:"network", obj:o };
  return null;
}

function findConnectionForIface(elId, ifaceId, visited){
  // CRITICAL: Check the LOCAL interface status first.
  // If the local iface (the one we're trying to use as egress) is down or err-disabled,
  // no traffic can flow through it regardless of peer state.
  const localObj = Cfg.byId("devices", elId) || Cfg.byId("servers", elId);
  if(localObj){
    const localIf = (localObj.interfaces||[]).find(i=>i.id===ifaceId);
    if(localIf && (localIf.status === "down" || localIf.status === "err-disabled")){
      return null;
    }
  }
  // Collect all matching connections
  const matches = [];
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    if(c.from && (c.from.device===elId||c.from.server===elId) && c.from.interface===ifaceId){
      const pk = c.to.device ? "device" : "server";
      matches.push({ conn:c, peerKind:pk, peerId: c.to.device||c.to.server, peerIf:c.to.interface, myIfId:ifaceId });
    } else if(c.to && (c.to.device===elId||c.to.server===elId) && c.to.interface===ifaceId){
      const pk = c.from.device ? "device" : "server";
      matches.push({ conn:c, peerKind:pk, peerId: c.from.device||c.from.server, peerIf:c.from.interface, myIfId:ifaceId });
    }
  }
  if(!matches.length) return null;
  // Filter: skip matches where peer iface is down (cable unusable) — but bond members may need fallback
  function isUsable(m){
    const peerObj = Cfg.byId(kindToCol(m.peerKind), m.peerId);
    if(!peerObj) return false;
    if(peerObj.status && peerObj.status !== "running") return false;
    const peerIf = (peerObj.interfaces||[]).find(i=>i.id===m.peerIf);
    return !peerIf || peerIf.status === "up";
  }
  const usable = matches.filter(isUsable);
  if(visited && visited.size){
    const fresh = (usable.length?usable:matches).find(m=>!visited.has(m.peerId));
    if(fresh && isUsable(fresh)) return fresh;
    if(fresh && !usable.length){
      // No fully-usable link on this iface, try bond fallback via peer
      const peerObj = Cfg.byId(kindToCol(fresh.peerKind), fresh.peerId);
      if(peerObj && peerObj.bonding && peerObj.bonding.enabled){
        // Find any UP bond member iface that has a connection to elId
        const alt = findBondAlternativeLinkImpl(elId, peerObj, visited);
        if(alt) return alt;
      }
    }
  }
  return usable[0] || null;
}

// === CML2/GNS3 parity: simulate Spanning-Tree per-VLAN STP state for a switch ===
// Determines root bridge by lowest MAC across switches in each VLAN,
// and assigns each port a role (Root / Desg / Altn) and state (FWD / BLK)
function computeStpForSwitch(switchDevice){
  // Collect all VLANs present on this switch (from interface.network → network.vlan_id)
  const vlanSet = new Set();
  vlanSet.add(1);  // default VLAN
  for(const i of (switchDevice.interfaces||[])){
    if(i.network){
      const net = Cfg.byId("networks", i.network);
      if(net && net.vlan_id) vlanSet.add(net.vlan_id);
    }
  }
  const vlans = [];
  for(const vid of [...vlanSet].sort((a,b)=>a-b)){
    // Get all switches participating in this VLAN
    const participantIds = new Set();
    for(const d of (App.config.devices||[])){
      if(d.type !== "l2switch" && d.type !== "l3switch") continue;
      for(const i of (d.interfaces||[])){
        if(i.network){
          const net = Cfg.byId("networks", i.network);
          if(net && net.vlan_id === vid){ participantIds.add(d.id); break; }
        }
      }
    }
    if(vid === 1){
      // All switches participate in VLAN 1 by default
      for(const d of (App.config.devices||[])){
        if(d.type === "l2switch" || d.type === "l3switch") participantIds.add(d.id);
      }
    }
    // Get bridge MAC for each (= MAC of first up interface)
    function bridgeMac(d){
      for(const i of (d.interfaces||[])){
        if(i.mac && i.status === "up") return normalizeMac(i.mac);
      }
      return "00:00:00:00:00:00";
    }
    const participants = [...participantIds].map(pid=>{
      const d = Cfg.byId("devices", pid);
      return d ? { id:pid, dev:d, priority:(d.stp_priority||32768)+vid, mac:bridgeMac(d) } : null;
    }).filter(Boolean);
    // Find root: lowest (priority, then mac)
    participants.sort((a,b)=>(a.priority-b.priority) || a.mac.localeCompare(b.mac));
    const root = participants[0];
    if(!root){ vlans.push({ vlan:vid, ports:[], isRoot:false, rootPriority:0, rootMac:"-", rootCost:0, bridgePriority:32768+vid, bridgeMac:bridgeMac(switchDevice) }); continue; }
    const isRoot = root.id === switchDevice.id;
    // For each interface on switchDevice that participates in this VLAN, determine STP role
    const ports = [];
    for(const i of (switchDevice.interfaces||[])){
      if(!i.network && vid !== 1) continue;
      const net = i.network ? Cfg.byId("networks", i.network) : null;
      if(vid !== 1 && (!net || net.vlan_id !== vid)) continue;
      if(vid === 1 && net && net.vlan_id && net.vlan_id !== 1) continue;
      // Find connection on this interface
      const conn = (App.config.connections||[]).find(c=>{
        if(c.status === "down") return false;
        return (c.from.device===switchDevice.id && c.from.interface===i.id) ||
               (c.to.device===switchDevice.id && c.to.interface===i.id);
      });
      let role, state;
      if(i.status !== "up"){
        role = "Disa"; state = "DIS";  // disabled
      } else if(!conn){
        role = "Desg"; state = "FWD";  // no neighbor → designated forwarding
      } else if(isRoot){
        role = "Desg"; state = "FWD";  // root bridge → all ports designated
      } else {
        // Determine if this is the root port (closest to root) or alternate
        // Simple heuristic: the port towards lowest-MAC neighbor is root
        // For more accurate STP we'd do BFS, but this approximation works
        const peerId = (conn.from.device===switchDevice.id ? conn.to.device : conn.from.device);
        if(peerId === root.id){
          role = "Root"; state = "FWD";
        } else {
          // Check if this neighbor is also a switch participating in same VLAN
          const peerSw = Cfg.byId("devices", peerId);
          if(peerSw && (peerSw.type === "l2switch" || peerSw.type === "l3switch")){
            // Block alternate paths to break loops — simplification: block if not root port
            // and there's already a root port designated for this switch
            const hasRootPort = ports.some(p=>p.role==="Root");
            if(hasRootPort){ role = "Altn"; state = "BLK"; }
            else { role = "Root"; state = "FWD"; }
          } else {
            // host/router neighbor → designated
            role = "Desg"; state = "FWD";
          }
        }
      }
      ports.push({
        iface: i.id,
        role, state,
        cost: i.speed >= 10000 ? 2 : (i.speed >= 1000 ? 4 : 19),
        prio: "128." + (ports.length+1)
      });
    }
    vlans.push({
      vlan: vid,
      isRoot,
      rootPriority: root.priority,
      rootMac: root.mac,
      rootCost: isRoot ? 0 : 4,
      bridgePriority: (switchDevice.stp_priority||32768) + vid,
      bridgeMac: bridgeMac(switchDevice),
      ports
    });
  }
  return { vlans };
}

// === CML2/GNS3 parity: build MAC address-table for a switch by inspecting connected peers ===
function buildMacTable(switchDevice){
  const entries = [];
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    let me = null, peer = null;
    if(c.from && (c.from.device === switchDevice.id)){ me = c.from; peer = c.to; }
    else if(c.to && (c.to.device === switchDevice.id)){ me = c.to; peer = c.from; }
    else continue;
    if(!peer) continue;
    // Get peer object & its iface
    const peerKindStr = peer.device ? "devices" : "servers";
    const peerObj = Cfg.byId(peerKindStr, peer.device||peer.server);
    if(!peerObj) continue;
    if(peerObj.status && peerObj.status !== "running") continue;
    const peerIf = (peerObj.interfaces||[]).find(i=>i.id===peer.interface);
    if(!peerIf) continue;
    // Get VLAN from my interface's network
    const myIf = (switchDevice.interfaces||[]).find(i=>i.id===me.interface);
    let vlan = 1;
    if(myIf && myIf.network){
      const net = Cfg.byId("networks", myIf.network);
      if(net && net.vlan_id) vlan = net.vlan_id;
    }
    if(peerIf.mac){
      entries.push({ vlan, mac: peerIf.mac.toLowerCase(), type:"DYNAMIC", port: me.interface });
    }
    // For bonded peers, also add bond member MACs
    if(peerObj.bonding && peerObj.bonding.enabled){
      for(const mid of (peerObj.bonding.members||[])){
        const m = (peerObj.interfaces||[]).find(i=>i.id===mid);
        if(m && m.mac && m.id !== peerIf.id){
          entries.push({ vlan, mac: m.mac.toLowerCase(), type:"DYNAMIC", port: me.interface });
        }
      }
    }
  }
  return entries;
}

/* ====== MAC FLAPPING SIMULATION ======
 * Real switches "flap" when the SAME MAC address is learned on multiple ports — caused by
 * an L2 loop (redundant links without STP/bonding) or a duplicate MAC. The control plane
 * thrashes its CAM table, a broadcast storm builds, CPU climbs, and the L2 domain gradually
 * degrades (intermittent loss → heavy loss → effectively down).
 *
 * App.macFlap = { [switchId]: { macs:{mac:[ports]}, loop:bool, severity:0..100, since } }
 */
function detectMacFlaps(){
  const report = [];
  for(const sw of (App.config.devices||[])){
    if(sw.type!=="l2switch" && sw.type!=="l3switch") continue;
    const entries = buildMacTable(sw);
    // group ports by MAC
    const byMac = {};
    for(const e of entries){ (byMac[e.mac]=byMac[e.mac]||new Set()).add(e.port); }
    const flapMacs = {};
    for(const mac in byMac){ if(byMac[mac].size >= 2) flapMacs[mac] = [...byMac[mac]]; }
    // L2 loop: two switches joined by >=2 active links not in a bond, with STP off
    const stpOff = !sw.stp || sw.stp.mode==="off" || sw.stp.enabled===false;
    let loop = false;
    const peerLinks = {};
    for(const c of (App.config.connections||[])){
      if(c.status==="down") continue;
      let me=null,peer=null;
      if(c.from&&c.from.device===sw.id){me=c.from;peer=c.to;}
      else if(c.to&&c.to.device===sw.id){me=c.to;peer=c.from;}
      else continue;
      const pid = peer&&(peer.device||peer.server); if(!pid) continue;
      // ignore bonded member links (intentional redundancy)
      const myIf=(sw.interfaces||[]).find(i=>i.id===me.interface);
      const bonded = sw.bonding&&sw.bonding.enabled&&(sw.bonding.members||[]).includes(me.interface);
      (peerLinks[pid]=peerLinks[pid]||[]).push({bonded});
    }
    for(const pid in peerLinks){
      const links=peerLinks[pid];
      const nonBond=links.filter(l=>!l.bonded).length;
      if(nonBond>=2 && stpOff) loop=true;
    }
    if(Object.keys(flapMacs).length || loop){
      report.push({ switchId:sw.id, label:sw.label||sw.id, macs:flapMacs, loop });
    }
  }
  return report;
}
// Recompute flap state + escalate severity over time. Called on each sim tick.
function updateMacFlapState(){
  App.macFlap = App.macFlap || {};
  const report = detectMacFlaps();
  const active = new Set(report.map(r=>r.switchId));
  // escalate active, decay inactive
  for(const r of report){
    const st = App.macFlap[r.switchId] || { severity:0, since:Date.now() };
    st.macs = r.macs; st.loop = r.loop;
    const inc = r.loop ? 14 : 6; // loops escalate faster than a single duplicate MAC
    st.severity = Math.min(100, st.severity + inc);
    App.macFlap[r.switchId] = st;
  }
  for(const id in App.macFlap){
    if(!active.has(id)){
      App.macFlap[id].severity = Math.max(0, App.macFlap[id].severity - 20);
      if(App.macFlap[id].severity<=0) delete App.macFlap[id];
    }
  }
  return report;
}
function macFlapSeverity(switchId){
  return (App.macFlap && App.macFlap[switchId]) ? App.macFlap[switchId].severity : 0;
}
// drop probability at a flapping switch (0..~0.9), grows with severity
function macFlapDropProb(switchId){
  const sev = macFlapSeverity(switchId);
  if(sev<=0) return 0;
  return Math.min(0.9, sev/120); // 50→0.42, 100→0.83
}
function macFlapStage(sev){
  if(sev<=0) return "正常";
  if(sev<25) return "学習ゆらぎ(軽微)";
  if(sev<50) return "CAMテーブル不安定・断続的パケットロス";
  if(sev<75) return "ブロードキャストストーム発生・CPU上昇";
  return "L2ドメイン崩壊寸前(ほぼ通信不可)";
}
// Emit escalating symptom logs (called on tick when flapping present)
function logMacFlapSymptoms(report){
  for(const r of report){
    const sev = macFlapSeverity(r.switchId);
    const macList = Object.keys(r.macs||{});
    let msg = `${r.label}: MACフラッピング`;
    if(r.loop) msg += "(L2ループ検出)";
    if(macList.length) msg += ` MAC ${macList[0]}${macList.length>1?(" 他"+(macList.length-1)):""} が複数ポートで学習`;
    CommLog.blocked(msg, `段階: ${macFlapStage(sev)} (severity ${sev})`);
  }
}

// === CML2/GNS3 parity: list direct LLDP neighbors ===
function buildLldpNeighbors(device){
  const entries = [];
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    let me = null, peer = null;
    if(c.from && (c.from.device===device.id || c.from.server===device.id)){ me = c.from; peer = c.to; }
    else if(c.to && (c.to.device===device.id || c.to.server===device.id)){ me = c.to; peer = c.from; }
    else continue;
    if(!peer) continue;
    const peerId = peer.device || peer.server;
    const peerKindStr = peer.device ? "devices" : "servers";
    const peerObj = Cfg.byId(peerKindStr, peerId);
    let cap = "BR"; // default Bridge
    if(peerObj){
      if(peerObj.type === "router" || peerObj.type === "firewall") cap = "R";
      else if(peerObj.type === "l3switch") cap = "R,BR";
      else if(peerObj.type === "l2switch") cap = "BR";
      else if(peerKindStr === "servers") cap = "S";
    }
    entries.push({
      localPort: me.interface,
      neighbor: peerId,
      neighborLabel: (peerObj && peerObj.label) || peerId,
      remotePort: peer.interface,
      cap
    });
  }
  return entries;
}

// When local route to dest is unusable but device has a vPC peer, route through peer-link.
// The peer switch's routing table will then forward through its own (up) link to the destination.
function findVpcPeerFallback(curObj, destIp, visited){
  if(!curObj.vpc || !curObj.vpc.enabled || !curObj.vpc.peer) return null;
  const peer = Cfg.byId("devices", curObj.vpc.peer);
  if(!peer || (peer.status && peer.status !== "running")) return null;
  if(visited && visited.has(peer.id)) return null;
  // Verify peer can reach destIp (has up link to dest's network)
  const peerCanReach = (peer.interfaces||[]).some(i=>{
    if(i.status !== "up") return false;
    for(const addr of ifaceAddresses(i)){
      if(inSubnet(destIp, addr)) return true;
    }
    return false;
  });
  if(!peerCanReach) return null;
  // Find the peer-link connection between us and peer
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    let me, peerEp;
    if(c.from && c.from.device === curObj.id && c.to.device === peer.id){ me = c.from; peerEp = c.to; }
    else if(c.to && c.to.device === curObj.id && c.from.device === peer.id){ me = c.to; peerEp = c.from; }
    else continue;
    const myIf = (curObj.interfaces||[]).find(i=>i.id===me.interface);
    const peerIf = (peer.interfaces||[]).find(i=>i.id===peerEp.interface);
    if(!myIf || myIf.status !== "up") continue;
    if(!peerIf || peerIf.status !== "up") continue;
    return { conn:c, peerKind:"device", peerId:peer.id, peerIf:peerEp.interface, myIfId:me.interface, peerObj:peer };
  }
  return null;
}

// When peer's targeted iface is down but is in a bond, find an alternative link to same peer via another up bond member
function findBondAlternativeLinkImpl(myElId, peerObj, visited){
  if(!peerObj.bonding || !peerObj.bonding.enabled) return null;
  const upMemberIds = (peerObj.bonding.members||[]).filter(mid=>{
    const m = (peerObj.interfaces||[]).find(i=>i.id===mid);
    return m && m.status === "up";
  });
  if(!upMemberIds.length) return null;
  // Find connection between myElId and peerObj on any of these up member ifaces
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    let me, peer;
    if(c.from && (c.from.device===myElId||c.from.server===myElId)){ me=c.from; peer=c.to; }
    else if(c.to && (c.to.device===myElId||c.to.server===myElId)){ me=c.to; peer=c.from; }
    else continue;
    const peerId = peer.device||peer.server;
    if(peerId !== peerObj.id) continue;
    if(!upMemberIds.includes(peer.interface)) continue;
    if(visited && visited.has(peerId)) continue;
    const pk = peer.device ? "device" : "server";
    return { conn:c, peerKind:pk, peerId, peerIf:peer.interface, myIfId:me.interface };
  }
  return null;
}

// Find any connection on element's interfaces that leads toward destination
function findEgressLink(elKind, elObj, destIp, visited){
  const destFam = ipFamily(destIp);
  const allLinks = [];
  for(const c of (App.config.connections||[])){
    if(c.status === "down") continue;
    let me, peer;
    if(c.from && (c.from.device===elObj.id||c.from.server===elObj.id)){ me=c.from; peer=c.to; }
    else if(c.to && (c.to.device===elObj.id||c.to.server===elObj.id)){ me=c.to; peer=c.from; }
    else continue;
    const myIf = (elObj.interfaces||[]).find(i=>i.id===me.interface);
    if(!myIf || myIf.status !== "up") continue;
    const pk = peer.device ? "device" : "server";
    const peerId = peer.device||peer.server;
    const pObj = Cfg.byId(kindToCol(pk), peerId);
    if(!pObj) continue;
    if(pObj.status && pObj.status !== "running") continue;
    // Skip if peer iface is down — unless bond compensates
    const peerIf = (pObj.interfaces||[]).find(i=>i.id===peer.interface);
    if(peerIf && peerIf.status !== "up"){
      // Bonded peer with up alternatives doesn't help THIS link — cable to down iface is unusable.
      // Skip; another candidate to an up member will be considered separately.
      continue;
    }
    if(visited && visited.has(peerId)) continue;
    allLinks.push({ conn:c, myIf, peerKind:pk, peerObj:pObj, peerIf:peer.interface, peerId });
  }
  // 1) Direct hit
  for(const l of allLinks){
    const pIf = (l.peerObj.interfaces||[]).find(i=>i.id===l.peerIf);
    if(pIf){
      for(const addr of ifaceAddresses(pIf)){
        if(ipOnly(addr) === destIp) return l;
      }
    }
    if(l.peerObj.bonding && l.peerObj.bonding.enabled){
      // For bonded hosts, accept this link if the link's peer iface is an UP bond member and dest is bond_ip
      const isBondMember = (l.peerObj.bonding.members||[]).includes(l.peerIf);
      if(isBondMember && (ipOnly(l.peerObj.bonding.bond_ip) === destIp ||
                          ipOnly(l.peerObj.bonding.bond_ipv6) === destIp)){
        return l;
      }
    }
    for(const i of (l.peerObj.interfaces||[])){
      for(const addr of ifaceAddresses(i)){
        if(ipOnly(addr) === destIp) return l;
      }
    }
  }
  // 2) Same subnet (matching family)
  for(const l of allLinks){
    for(const addr of ifaceAddresses(l.myIf)){
      if(ipFamily(addr) === destFam && inSubnet(destIp, addr)) return l;
    }
  }
  // 3) First link with at least one address in destination family
  for(const l of allLinks){
    for(const addr of ifaceAddresses(l.myIf)){
      if(ipFamily(addr) === destFam) return l;
    }
  }
  return allLinks[0] || null;
}

function computePath(srcKind, srcObj, destIp, proto, dstPort){
  const center = (o)=>({ x:(o.x||0)+(o.width||(o.interfaces?130:120))/2, y:(o.y||0)+(o.height||65)/2 });
  const path = [];

  // VM bridging: a VM (server.host) reaches the physical network THROUGH its host.
  // Source VM → record the VM as origin, then route from the host.
  let vmOrigin = null;
  if(srcKind === "server" && srcObj.host){
    const host = Cfg.byId("servers", srcObj.host);
    if(host){
      vmOrigin = srcObj;
      path.push({ kind:"server", id:srcObj.id, ...center(srcObj) });
      srcObj = host; // route from the host onward
    }
  }
  path.push({ kind:srcKind, id:srcObj.id, ...center(srcObj) });
  const visited = new Set([srcObj.id]);
  const maxHops = 30;
  let cur = { kind:srcKind, obj:srcObj };

  // Destination VM: if destIp belongs to a VM, retarget routing to the VM's host,
  // then deliver to the VM once the host is reached.
  let vmDestPick = null;
  for(const s of (App.config.servers||[])){
    if(!s.host) continue;
    const ips = (typeof elementAllAddresses==="function") ? elementAllAddresses("server", s.id).map(ipOnly) : [];
    if(ips.includes(destIp)){
      vmDestPick = s;
      const host = Cfg.byId("servers", s.host);
      if(host){
        const hip = elementPrimaryIp("server", host.id, ipFamily(destIp)) || elementPrimaryIp("server", host.id, "v4");
        if(hip) destIp = hip;
      }
      break;
    }
  }

  // Kubernetes: if destIp is a Service ClusterIP or LoadBalancer external IP, kube-proxy
  // selects a backend pod and the traffic is delivered to that pod's NODE.
  let k8sPick = null;
  if(typeof k8sFindByClusterIP === "function"){
    const cip = k8sFindByClusterIP(destIp) || k8sFindByExternalIp(destIp);
    if(cip){
      const pod = k8sSelectPod(cip.cluster, cip.svc);
      if(!pod){
        return { ok:false, path, reason:`K8s Service ${cip.svc.name}: 有効なPodエンドポイントなし (selector不一致 or 全Pod停止)` };
      }
      k8sPick = { svc:cip.svc, pod, cluster:cip.cluster };
      // target the pod's node so routing reaches it; map service port → target_port
      const node = Cfg.byId("servers", pod.node);
      if(node){
        const nodeIp = elementPrimaryIp("server", node.id, ipFamily(destIp)) || elementPrimaryIp("server", node.id, "v4");
        if(nodeIp) destIp = nodeIp;
      }
    }
  }

  // NAT collection: track translations applied along the path (for reporting)
  const natApplied = [];

  const destFam = ipFamily(destIp);
  const srcIp = (vmOrigin ? (elementPrimaryIp("server", vmOrigin.id, destFam) || elementPrimaryIp("server", vmOrigin.id, "v4")) : null)
                || elementPrimaryIp(srcKind, srcObj.id, destFam);

  // Helper: does iface have an address (in either family) matching destIp's subnet?
  function ifaceInDestSubnet(i){
    if(!i || i.status !== "up") return false;
    for(const addr of ifaceAddresses(i)){
      if(ipFamily(addr) === destFam && inSubnet(destIp, addr)) return true;
    }
    return false;
  }
  // Helper: does iface have exactly destIp as one of its addresses?
  function ifaceHasDestIp(i){
    if(!i) return false;
    for(const addr of ifaceAddresses(i)){
      if(ipOnly(addr) === destIp) return true;
    }
    return false;
  }

  for(let hop=0; hop<maxHops; hop++){
    const curObj = cur.obj;
    if(curObj.status && curObj.status !== "running"){
      return { ok:false, path, reason: `${cur.kind} ${curObj.id} is ${curObj.status}`, blockedAt:{kind:cur.kind,id:curObj.id} };
    }
    // MAC flapping / broadcast storm: a switch under flapping drops packets with a
    // probability that grows as the condition worsens (progressive degradation).
    if(cur.kind === "device" && typeof macFlapDropProb === "function"){
      const dp = macFlapDropProb(curObj.id);
      if(dp > 0 && Math.random() < dp){
        const sev = macFlapSeverity(curObj.id);
        return { ok:false, path, reason:`${curObj.id}: MACフラッピングによりパケット破棄 (${macFlapStage(sev)})`,
          blockedAt:{ kind:"device", id:curObj.id }, macFlap:true };
      }
    }
    // Arrived check — destIp matches any address on any interface (or the bond addr)
    const bondIp4 = curObj.bonding && curObj.bonding.enabled ? ipOnly(curObj.bonding.bond_ip) : null;
    const bondIp6 = curObj.bonding && curObj.bonding.enabled ? ipOnly(curObj.bonding.bond_ipv6) : null;
    const hasDest = (curObj.interfaces||[]).some(ifaceHasDestIp)
      || bondIp4 === destIp || bondIp6 === destIp;
    if(hasDest && hop > 0){
      // Destination VM: arrived at the VM's host → deliver to the VM (verify its ports)
      if(vmDestPick && cur.kind === "server" && cur.obj.id === vmDestPick.host){
        if((vmDestPick.status||"running") !== "running"){
          return { ok:false, path, reason:`VM ${vmDestPick.label||vmDestPick.id} is ${vmDestPick.status}`, blockedAt:{kind:"server",id:vmDestPick.id} };
        }
        // (host hop is already the last path entry) append the VM as the final endpoint
        path.push({ kind:"server", id:vmDestPick.id, ...center(cur.obj) });
        if(dstPort != null){
          const verdict = serverAcceptsPort(vmDestPick, proto, dstPort);
          if(!verdict.ok){
            return { ok:false, path, reason:`${vmDestPick.label||vmDestPick.id} (VM): ${verdict.reason}`,
              blockedAt:{ kind:"server", id:vmDestPick.id }, portState:verdict.state };
          }
          return { ok:true, path, portState:verdict.state, portInfo:`VM ${vmDestPick.label||vmDestPick.id}: ${verdict.reason}` };
        }
        return { ok:true, path, portInfo:`VM ${vmDestPick.label||vmDestPick.id} 到達` };
      }
      // Kubernetes: delivered to the selected pod's node → success with pod info
      if(k8sPick && cur.kind === "server" && cur.obj.id === k8sPick.pod.node){
        path.push({ kind:"pod", id:k8sPick.pod.name, ...center(cur.obj) });
        return { ok:true, path, k8s:{ service:k8sPick.svc.name, pod:k8sPick.pod.name,
          node:k8sPick.pod.node, podIp:k8sPick.pod.ip },
          portInfo:`Service ${k8sPick.svc.name} → Pod ${k8sPick.pod.name} (${k8sPick.pod.ip})` };
      }
      // Arrived at the destination. If it's a server and a port was specified,
      // verify a service is listening and the host firewall permits it.
      if(cur.kind === "server" && dstPort != null){
        const verdict = serverAcceptsPort(curObj, proto, dstPort);
        if(!verdict.ok){
          return { ok:false, path, reason:`${curObj.id}: ${verdict.reason}`,
            blockedAt:{ kind:"server", id:curObj.id }, portState:verdict.state };
        }
        // Reverse proxy: terminate here and open a NEW connection to an upstream backend
        if(typeof reverseProxyUpstream === "function"){
          const rp = reverseProxyUpstream(curObj.id, dstPort);
          if(rp && rp.proxy){
            if(!rp.upstream){
              return { ok:false, path, reason:`${curObj.id}: リバースプロキシ ${rp.proxy.label||rp.proxy.id} にupstream未設定`,
                blockedAt:{ kind:"server", id:curObj.id } };
            }
            path[path.length-1].proxy = "reverse-proxy → "+rp.upstream.host+":"+rp.upstream.port;
            // recurse: proxy → upstream (avoid infinite loops via visited)
            if(!visited.has("proxy:"+rp.upstream.host)){
              visited.add("proxy:"+rp.upstream.host);
              const sub = computePath("server", curObj, ipOnly(rp.upstream.host), proto, +rp.upstream.port);
              if(sub.ok){
                const merged = path.concat((sub.path||[]).slice(1));
                return { ok:true, path:merged, proxy:{ type:"reverse", at:curObj.id, upstream:rp.upstream.host+":"+rp.upstream.port },
                  natApplied, portInfo:`reverse-proxy ${curObj.id} → upstream ${rp.upstream.host}:${rp.upstream.port}` };
              }
              return { ok:false, path, reason:`リバースプロキシ upstream到達不可: ${sub.reason}`, blockedAt:sub.blockedAt };
            }
          }
        }
        return { ok:true, path, portState:verdict.state, portInfo:verdict.reason, natApplied };
      }
      // External cloud/SaaS endpoint with declared ports → verify the port is offered
      if(cur.kind === "device" && curObj.external && Array.isArray(curObj.external_ports) && dstPort != null){
        const ok = curObj.external_ports.some(p=>+p.port===+dstPort);
        if(!ok){
          return { ok:false, path,
            reason:`${curObj.id} (${curObj.fqdn||"external"}): ポート ${proto}/${dstPort} は提供されていません`,
            blockedAt:{ kind:"device", id:curObj.id } };
        }
        return { ok:true, path, portInfo:`${curObj.fqdn||curObj.id} ${proto}/${dstPort} OK` };
      }
      return { ok:true, path };
    }

    // Load balancer: if this device owns the destination VIP, select a healthy backend
    // and continue routing toward it (real LB behavior — VIP fronts a server pool).
    if(cur.kind === "device" && curObj.lb && Array.isArray(curObj.lb.vips)){
      const vipCfg = curObj.lb.vips.find(v=> ipOnly(v.vip) === destIp && (dstPort==null || v.port==null || +v.port===+dstPort));
      if(vipCfg){
        const backend = (typeof lbSelectBackend==="function") ? lbSelectBackend(vipCfg, srcIp) : null;
        if(!backend){
          return { ok:false, path,
            reason:`LB ${curObj.id} VIP ${destIp}: no healthy backend (全プールダウン)`,
            blockedAt:{ kind:"device", id:curObj.id } };
        }
        const bSrv = Cfg.byId("servers", backend.server);
        const bIp = bSrv ? elementPrimaryIp("server", bSrv.id, destFam) : null;
        if(bIp){
          // Re-target the flow to the selected real server
          path[path.length-1].lbPick = backend.server;
          destIp = bIp;  // continue resolving toward the chosen backend
        }
      }
    }

    // ACL inbound filter on the ingress device interface (standard first-match, implicit deny)
    if(cur.kind === "device" && hop > 0 && cur.ingressIface){
      const inIf = (curObj.interfaces||[]).find(i=>i.id===cur.ingressIface);
      if(inIf && inIf.acl_in){
        const res = evalAcl(curObj, inIf.acl_in, { proto, src:srcIp, dst:destIp, dstPort });
        if(!res.permit){
          return { ok:false, path,
            reason:`BLOCKED by ACL ${inIf.acl_in} (in) on ${curObj.id} ${inIf.id}`,
            blockedAt:{ kind:"device", id:curObj.id } };
        }
      }
    }

    // Firewall policy at this device
    if(cur.kind === "device" && curObj.type === "firewall" && hop > 0){
      const pol = getFwPolicies(curObj.id);
      if(pol){
        const res = evaluatePolicy(pol, srcIp, destIp, proto, dstPort);
        if(res.action !== "allow"){
          return { ok:false, path,
            reason:`BLOCKED by ${curObj.id} rule ${(res.rule&&res.rule.id)||"implicit-deny"} (${res.action})`,
            blockedAt:{ kind:"device", id:curObj.id } };
        }
      }
    }

    // NAT at this device (routers/firewalls): DNAT rewrites destination, SNAT/masquerade rewrites source
    if(cur.kind === "device" && curObj.nat && curObj.nat.enabled && hop >= 0){
      const dn = (typeof natDnatLookup==="function") ? natDnatLookup(curObj, destIp, proto, dstPort) : null;
      if(dn){
        natApplied.push({ at:curObj.id, type:"DNAT", from:destIp+(dstPort!=null?(":"+dstPort):""), to:dn.translated_dst+(dn.translated_port!=null?(":"+dn.translated_port):"") });
        destIp = dn.translated_dst;
        if(dn.translated_port!=null) dstPort = dn.translated_port;
        // re-resolve any VM/K8s targets for the new destination is out of scope; continue routing to translated_dst
        path[path.length-1].nat = "DNAT→"+destIp;
      }
      const sn = (typeof natSnatLookup==="function") ? natSnatLookup(curObj, srcIp, destIp) : null;
      if(sn){
        const newSrc = sn.masquerade ? (elementPrimaryIp("device",curObj.id,destFam)||srcIp) : sn.translated_src;
        if(newSrc && newSrc!==srcIp){
          natApplied.push({ at:curObj.id, type: sn.masquerade?"MASQUERADE":"SNAT", from:srcIp, to:newSrc });
          path[path.length-1].nat = (path[path.length-1].nat?path[path.length-1].nat+" / ":"")+"SNAT→"+newSrc;
        }
      }
    }

    // Find egress link
    let next = null;
    if(cur.kind === "device"){
      // Policy-Based Routing: if a PBR rule matches, forward toward its next-hop / egress iface
      const pbr = (typeof pbrLookup==="function") ? pbrLookup(curObj, srcIp, destIp, proto, dstPort) : null;
      if(pbr){
        if(pbr.egress_iface){
          next = findConnectionForIface(curObj.id, pbr.egress_iface, visited);
        }
        if(!next && pbr.next_hop){
          // route toward the PBR next-hop IP: find the egress link whose far end / subnet has it
          next = findEgressLink(cur.kind, curObj, ipOnly(pbr.next_hop), visited);
        }
        if(next){
          path[path.length-1].pbr = { seq:pbr.seq, next_hop:pbr.next_hop, egress:pbr.egress_iface, src:pbr.src, dst:pbr.dst };
        }
        // If PBR matched but no usable next-hop, fall through to normal routing.
      }
      const rt = next ? null : getRoutingTable(curObj.id);
      if(next){
        /* PBR already chose the egress */
      } else if(rt){
        const route = findRouteFor(curObj.id, destIp);
        if(route){
          next = findConnectionForIface(curObj.id, route.interface, visited);
          if(!next){
            // Direct link unusable. If this device has a vPC peer, try forwarding through peer-link.
            next = findVpcPeerFallback(curObj, destIp, visited);
            if(!next){
              next = findEgressLink(cur.kind, curObj, destIp, visited);
            }
          }
        } else {
          // No matching route in table (e.g. v6 dest with v4-only routes) — try direct connectivity
          next = findEgressLink(cur.kind, curObj, destIp, visited);
          if(!next){
            return { ok:false, path, reason:`No Route to ${destIp} on ${curObj.id}` };
          }
        }
      } else {
        next = findEgressLink(cur.kind, curObj, destIp, visited);
      }
    } else {
      // server: same subnet => direct, else gateway
      const directIf = (curObj.interfaces||[]).find(ifaceInDestSubnet);
      if(directIf){
        next = findConnectionForIface(curObj.id, directIf.id, visited);
        if(!next) next = findEgressLink(cur.kind, curObj, destIp, visited);
      } else {
        // Need a gateway in the matching family
        const gw = destFam === "v6"
          ? (curObj.gateway_v6 || (ipFamily(curObj.gateway)==="v6" ? curObj.gateway : null))
          : (ipFamily(curObj.gateway)==="v4" ? curObj.gateway : null);
        if(!gw){
          return { ok:false, path, reason:`${curObj.id}: no ${destFam==="v6"?"IPv6":"IPv4"} gateway for ${destIp}` };
        }
        const gwIf = (curObj.interfaces||[]).find(i=>{
          if(i.status !== "up") return false;
          for(const addr of ifaceAddresses(i)){
            if(ipFamily(addr) === destFam && inSubnet(gw, addr)) return true;
          }
          return false;
        });
        if(!gwIf){
          return { ok:false, path, reason:`${curObj.id}: no interface for gateway ${gw}` };
        }
        next = findConnectionForIface(curObj.id, gwIf.id, visited);
        if(!next) next = findEgressLink(cur.kind, curObj, destIp, visited);
      }
    }
    if(!next){
      return { ok:false, path, reason:`${curObj.id}: no egress link` };
    }
    if(visited.has(next.peerId)){
      return { ok:false, path, reason:`routing loop at ${next.peerId}` };
    }
    visited.add(next.peerId);
    const peerObj = (next.peerObj) || Cfg.byId(kindToCol(next.peerKind), next.peerId);
    if(!peerObj){
      return { ok:false, path, reason:`peer ${next.peerId} not found` };
    }
    // Check MAC collision at L2 — if the egress IF MAC collides with another IF in topology, simulate frame confusion
    if(next.myIf && ifaceHasMacCollision(curObj, next.myIf.id)){
      // 30% chance the frame is delivered to the wrong host with the same MAC
      if(Math.random() < 0.3){
        return { ok:false, path,
          reason:`MAC collision: フレームが誤配送されました (MAC ${next.myIf.mac} が複数のIFで重複)`,
          blockedAt:{ kind:cur.kind, id:curObj.id } };
      }
    }
    path.push({ kind:next.peerKind, id:peerObj.id, ...center(peerObj), via:next.conn.id });

    // Check destination reached at peer (both v4 and v6)
    const peerHasDest = (peerObj.interfaces||[]).some(i=>{
      if(i.status !== "up") return false;
      for(const addr of ifaceAddresses(i)){
        if(ipOnly(addr) === destIp) return true;
      }
      return false;
    }) || (peerObj.bonding && peerObj.bonding.enabled && (
      ipOnly(peerObj.bonding.bond_ip) === destIp ||
      ipOnly(peerObj.bonding.bond_ipv6) === destIp
    ));
    if(peerHasDest){
      if(peerObj.status && peerObj.status !== "running"){
        return { ok:false, path, reason:`${peerObj.id} is ${peerObj.status}`, blockedAt:{kind:next.peerKind,id:peerObj.id} };
      }
      // Destination VM reached via its host (peer shortcut)
      if(vmDestPick && next.peerKind === "server" && peerObj.id === vmDestPick.host){
        path.push({ kind:"server", id:peerObj.id, ...center(peerObj) });
        path.push({ kind:"server", id:vmDestPick.id, ...center(peerObj) });
        if(dstPort != null){
          const verdict = serverAcceptsPort(vmDestPick, proto, dstPort);
          if(!verdict.ok) return { ok:false, path, reason:`${vmDestPick.label||vmDestPick.id} (VM): ${verdict.reason}`, blockedAt:{kind:"server",id:vmDestPick.id}, portState:verdict.state };
          return { ok:true, path, portState:verdict.state, portInfo:`VM ${vmDestPick.label||vmDestPick.id}: ${verdict.reason}` };
        }
        return { ok:true, path, portInfo:`VM ${vmDestPick.label||vmDestPick.id} 到達` };
      }
      // Kubernetes pod delivery at the pod's node (reached as a peer)
      if(k8sPick && next.peerKind === "server" && peerObj.id === k8sPick.pod.node){
        path.push({ kind:"server", id:peerObj.id, ...center(peerObj) });
        path.push({ kind:"pod", id:k8sPick.pod.name, ...center(peerObj) });
        return { ok:true, path, k8s:{ service:k8sPick.svc.name, pod:k8sPick.pod.name,
          node:k8sPick.pod.node, podIp:k8sPick.pod.ip },
          portInfo:`Service ${k8sPick.svc.name} → Pod ${k8sPick.pod.name} (${k8sPick.pod.ip})` };
      }
      if(next.peerKind === "server" && dstPort != null){
        const verdict = serverAcceptsPort(peerObj, proto, dstPort);
        // include the arrival node in the path for clarity
        path.push({ kind:"server", id:peerObj.id, ...center(peerObj) });
        if(!verdict.ok){
          return { ok:false, path, reason:`${peerObj.id}: ${verdict.reason}`,
            blockedAt:{ kind:"server", id:peerObj.id }, portState:verdict.state };
        }
        // Reverse proxy: terminate and forward to an upstream backend
        if(typeof reverseProxyUpstream === "function"){
          const rp = reverseProxyUpstream(peerObj.id, dstPort);
          if(rp && rp.proxy){
            if(!rp.upstream){
              return { ok:false, path, reason:`${peerObj.id}: リバースプロキシ ${rp.proxy.label||rp.proxy.id} にupstream未設定`, blockedAt:{kind:"server",id:peerObj.id} };
            }
            path[path.length-1].proxy = "reverse-proxy → "+rp.upstream.host+":"+rp.upstream.port;
            if(!visited.has("proxy:"+rp.upstream.host)){
              visited.add("proxy:"+rp.upstream.host);
              const sub = computePath("server", peerObj, ipOnly(rp.upstream.host), proto, +rp.upstream.port);
              if(sub.ok){
                const merged = path.concat((sub.path||[]).slice(1));
                return { ok:true, path:merged, proxy:{ type:"reverse", at:peerObj.id, upstream:rp.upstream.host+":"+rp.upstream.port },
                  natApplied, portInfo:`reverse-proxy ${peerObj.id} → upstream ${rp.upstream.host}:${rp.upstream.port}` };
              }
              return { ok:false, path, reason:`リバースプロキシ upstream到達不可: ${sub.reason}`, blockedAt:sub.blockedAt };
            }
          }
        }
        return { ok:true, path, portState:verdict.state, portInfo:verdict.reason, natApplied };
      }
      return { ok:true, path };
    }

    cur = { kind:next.peerKind, obj:peerObj, ingressIface: next.peerIf && next.peerIf.id };
  }
  return { ok:false, path, reason:"max hops exceeded" };
}

function executeStep(step, onComplete){
  const srcRes = resolveScenarioEndpoint(step.from);
  const dstRes = resolveScenarioEndpoint(step.to);
  if(!srcRes){ Log.error(`Step: source "${step.from}" not found`); onComplete(false); return; }
  if(!dstRes){ Log.error(`Step: destination "${step.to}" not found`); onComplete(false); return; }

  let srcKind = srcRes.kind, srcObj = srcRes.obj;
  if(srcKind === "service"){
    const host = Cfg.byId("servers", srcRes.obj.server);
    if(!host){ Log.error(`Service ${srcRes.obj.id} has no host`); onComplete(false); return; }
    srcObj = host; srcKind = "server";
  } else if(srcKind === "network"){
    // pick a device that has interface in this network
    const dev = (App.config.devices||[]).find(d=>(d.interfaces||[]).some(i=>i.network===srcRes.obj.id));
    if(dev){ srcKind="device"; srcObj=dev; }
    else { Log.error(`Network ${srcRes.obj.id}: no device available as source`); onComplete(false); return; }
  }

  let dstIp = null, dstKind = dstRes.kind;
  if(dstKind === "service"){
    const host = Cfg.byId("servers", dstRes.obj.server);
    if(!host){ Log.error(`Service ${dstRes.obj.id} has no host`); onComplete(false); return; }
    dstIp = elementPrimaryIp("server", host.id);
  } else if(dstKind === "server" || dstKind === "device"){
    dstIp = elementPrimaryIp(dstKind, dstRes.obj.id);
  } else if(dstKind === "network"){
    dstIp = dstRes.obj.gateway;
  }
  if(!dstIp){ Log.error(`Step: cannot determine destination IP for ${step.to}`); onComplete(false); return; }

  Log.info(`▸ ${step.from} → ${step.to} (${step.protocol||"?"}:${step.port||"?"})${step.description?" — "+step.description:""}`);

  const path = computePath(srcKind, srcObj, dstIp, step.protocol, step.port);
  logCommResult(step.from, step.to, step.protocol, step.port, path);
  if(!path.ok){
    Log.error(`✗ ${path.reason}`);
    animatePacket(path.path, true, ()=>onComplete(false));
    return;
  }
  // service-level check
  if(dstRes.kind === "service" && dstRes.obj.status && dstRes.obj.status !== "running"){
    Log.error(`✗ Connection Refused: service ${dstRes.obj.id} is ${dstRes.obj.status}`);
    animatePacket(path.path, true, ()=>onComplete(false));
    return;
  }
  animatePacket(path.path, false, ()=>{
    Log.info(`✓ 完了: ${step.from} → ${step.to}`);
    onComplete(true);
  });
}

function animatePacket(path, blocked, done){
  if(!path || path.length < 2){ done && done(); return; }
  const speed = App.simulation.speed;
  const layer = $("#layer-packets");
  const color = blocked ? "var(--red)" : "var(--accent)";
  const dot = ce("circle", {
    "class":"packet" + (blocked?" blocked":""),
    cx: path[0].x, cy: path[0].y, r: 6
  }, layer);

  let segIdx = 0;
  let segStart = performance.now();
  const segMs = 600 / speed;
  // Emit a pcap event for the first hop
  if(path[0] && path[0].via) emitPacket(path[0].via, { t:new Date().toTimeString().slice(0,8), src:path[0].id, dst:path[1].id, proto:"sim", port:0, len:64, info:"simulated packet", dir:"fwd" });
  function step(now){
    if(App.simulation.abort){ dot.remove(); done&&done(); return; }
    if(App.simulation.paused){
      segStart = now - 0;
      App.simulation.rafId = requestAnimationFrame(step);
      return;
    }
    const a = path[segIdx], b = path[segIdx+1];
    if(!b){ dot.remove(); done&&done(); return; }
    const t = clamp((now - segStart)/segMs, 0, 1);
    dot.setAttribute("cx", a.x + (b.x - a.x)*t);
    dot.setAttribute("cy", a.y + (b.y - a.y)*t);
    if(t >= 1){
      highlightElement(b.kind, b.id);
      // Emit pcap for this hop's link
      if(b.via){
        emitPacket(b.via, {
          t:new Date().toTimeString().slice(0,8)+"."+(Math.floor(Math.random()*900+100)),
          src:a.id, dst:b.id, proto:"sim", port:0, len:64,
          info: blocked?"BLOCKED":"forwarded",
          dir:"fwd"
        });
      }
      segIdx++;
      segStart = now;
      if(blocked && segIdx === path.length - 1){
        dot.setAttribute("fill", "#f85149");
        const el = findElementGroup(b.kind, b.id);
        if(el){
          el.classList.add("blocked-anim");
          setTimeout(()=>el.classList.remove("blocked-anim"), 4500);
        }
        // === Persistent error mark: X + pulsing ring + label ===
        const xg = ce("g", {
          "class":"sim-error-mark",
          transform:`translate(${b.x},${b.y})`,
          "data-sim-error":"1"
        }, layer);
        // Pulsing red ring
        ce("circle", { "class":"sim-error-ring", cx:0, cy:0, r:20 }, xg);
        ce("circle", { "class":"sim-error-ring", cx:0, cy:0, r:20, style:"animation-delay:0.4s" }, xg);
        // Big X
        ce("line", { "class":"sim-error-x", x1:-13, y1:-13, x2:13, y2:13 }, xg);
        ce("line", { "class":"sim-error-x", x1:13, y1:-13, x2:-13, y2:13 }, xg);
        // BLOCKED HERE label
        const lblTxt = "× BLOCKED HERE";
        const lblW = lblTxt.length * 7 + 12;
        ce("rect", { "class":"sim-error-label-bg",
          x: -lblW/2, y: 22, width: lblW, height: 18, rx: 9, ry: 9 }, xg);
        ce("text", { "class":"sim-error-label",
          x: 0, y: 33, "dominant-baseline":"middle", text: lblTxt }, xg);
        // Remove the moving packet dot
        setTimeout(()=>{ dot.remove(); }, 500);
        // Keep error mark visible for 5 seconds (or until next render clears it)
        setTimeout(()=>{ xg.remove(); done&&done(); }, 5000);
        return;
      }
      if(segIdx >= path.length - 1){
        dot.remove();
        done&&done();
        return;
      }
    }
    App.simulation.rafId = requestAnimationFrame(step);
  }
  App.simulation.rafId = requestAnimationFrame(step);
}

function findElementGroup(kind, id){
  return $(`#layer-elements [data-kind="${kind}"][data-id="${id}"]`);
}
function highlightElement(kind, id){
  const el = findElementGroup(kind, id);
  if(!el) return;
  el.classList.add("passing");
  setTimeout(()=>el.classList.remove("passing"), 500);
}

function runScenario(id){
  const sc = (App.config.scenarios||[]).find(s=>s.id===id);
  if(!sc){ Log.warn("シナリオが見つかりません"); return; }
  if(App.simulation.running){ Log.warn("既に実行中"); return; }
  Log.info(`▶ シナリオ実行: ${sc.label||sc.id}`);
  App.simulation.running = true;
  App.simulation.paused = false;
  App.simulation.abort = false;
  pushUndo();
  let i = 0;
  const steps = sc.steps || [];
  function next(){
    if(App.simulation.abort){
      App.simulation.running = false;
      return;
    }
    if(i >= steps.length){
      Log.info(`■ シナリオ完了: ${sc.label||sc.id}`);
      App.simulation.running = false;
      return;
    }
    executeStep(steps[i++], (ok)=>{
      setTimeout(next, 250 / App.simulation.speed);
    });
  }
  next();
}

function stopSimulation(){
  App.simulation.abort = true;
  App.simulation.running = false;
  App.simulation.paused = false;
  if(App.simulation.rafId){ cancelAnimationFrame(App.simulation.rafId); App.simulation.rafId = null; }
  $("#layer-packets").innerHTML = "";
}

/* ====== PING ====== */
function promptPing(srcKind, srcId){
  const targets = [];
  for(const s of (App.config.servers||[])){
    if(s.id === srcId) continue;
    targets.push({ id:s.id, label:`${s.label||s.id} (${elementPrimaryIp("server",s.id)||"?"})` });
  }
  for(const d of (App.config.devices||[])){
    if(d.id === srcId) continue;
    targets.push({ id:d.id, label:`${d.label||d.id} (${elementPrimaryIp("device",d.id)||"?"})` });
  }
  openDialog("Pingシミュレーション", (body)=>{
    ch("p", { text:`Source: ${srcId}`, style:{margin:"0 0 8px 0", fontSize:"12px", color:"var(--text-dim)"} }, body);
    const f = ch("div", { class:"field" }, body);
    ch("label", { text:"Target" }, f);
    const sel = ch("select", {}, f);
    if(!targets.length) ch("option", { value:"", text:"(対象なし)" }, sel);
    for(const t of targets) ch("option", { value:t.id, text:t.label }, sel);
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"Ping", primary:true, action:()=>{
          const tid = sel.value;
          closeDialog();
          if(tid) doPing(srcKind, srcId, tid);
        }}
      ]
    };
  });
}

function doPing(srcKind, srcId, targetId){
  const srcObj = Cfg.byId(kindToCol(srcKind), srcId);
  if(!srcObj) return;
  let tKind, tObj;
  if((tObj = Cfg.byId("servers", targetId))){ tKind = "server"; }
  else if((tObj = Cfg.byId("devices", targetId))){ tKind = "device"; }
  if(!tObj){ Log.error("Ping: target not found"); return; }
  const dstIp = elementPrimaryIp(tKind, targetId);
  Log.info(`Pinging ${targetId} [${dstIp}] from ${srcId}...`);
  const res = computePath(srcKind, srcObj, dstIp, "icmp", null);
  logCommResult((srcObj.label||srcObj.id), dstIp, "icmp", null, res);
  if(res.ok){
    const t = 1 + Math.floor(Math.random()*4);
    Log.info(`Reply from ${dstIp}: time=${t}ms TTL=64`);
    animatePacket(res.path, false, ()=>{});
  } else {
    Log.error(`PING FAILED: ${res.reason}`);
    animatePacket(res.path, true, ()=>{});
  }
}

/* ====== ADD NEW ELEMENTS ====== */
function addNewNetwork(){
  pushUndo(); Cfg.ensure();
  const id = uid("net");
  App.config.networks.push({
    id, label:"New Network", type:"subnet", cidr:"10.0.0.0/24",
    color:"rgba(88,166,255,0.10)",
    x: App.view.x + 50, y: App.view.y + 50, width:400, height:300
  });
  selectElement("network", id);
  renderAndSync(); refreshScenarioSelect();
  toast("ネットワークを追加: "+id, "ok");
  Log.info("ネットワーク追加: "+id);
}

// Device type picker — floating menu
var DEVICE_TYPES = [
  { type:"router",       label:"ルータ",      icon:"🔵", desc:"L3ルーティング" },
  { type:"l3switch",     label:"L3スイッチ",  icon:"🟣", desc:"L3スイッチング" },
  { type:"l2switch",     label:"L2スイッチ",  icon:"🟦", desc:"L2スイッチング" },
  { type:"firewall",     label:"ファイアウォール", icon:"🛡", desc:"FW/IPS" },
  { type:"loadbalancer", label:"ロードバランサ", icon:"⚖", desc:"L4/L7 LB" },
  { type:"waf",          label:"WAF",         icon:"🟪", desc:"Web ApplicationFW" },
  { type:"internet",     label:"インターネット", icon:"🌐", desc:"インターネット境界" },
  { type:"cloud",        label:"クラウド (AWS等)", icon:"☁", desc:"外部クラウドサービス" },
  { type:"saas",         label:"外部SaaS",     icon:"🟪", desc:"外部SaaSエンドポイント" }
];

/* ====== EXTERNAL SERVICE CATALOG (AWS / SaaS presets) ======
 * Adding one creates an "external" cloud/saas device with a public endpoint
 * (FQDN + IP + listening ports), reachable in the communication simulator.
 */
var EXTERNAL_CATALOG = [
  { group:"AWS", provider:"cloud", items:[
    { key:"aws-s3",        label:"Amazon S3",        fqdn:"s3.amazonaws.com",            ip:"52.216.0.10",  ports:[443] },
    { key:"aws-rds",       label:"Amazon RDS",       fqdn:"rds.amazonaws.com",           ip:"52.94.0.20",   ports:[3306,5432] },
    { key:"aws-dynamodb",  label:"DynamoDB",         fqdn:"dynamodb.amazonaws.com",      ip:"52.94.0.40",   ports:[443] },
    { key:"aws-ec2",       label:"EC2 Endpoint",     fqdn:"ec2.amazonaws.com",           ip:"52.94.0.50",   ports:[443] },
    { key:"aws-cloudfront",label:"CloudFront (CDN)", fqdn:"cloudfront.net",              ip:"13.224.0.10",  ports:[443,80] },
    { key:"aws-sqs",       label:"SQS",              fqdn:"sqs.amazonaws.com",           ip:"52.94.0.60",   ports:[443] }
  ]},
  { group:"SaaS", provider:"saas", items:[
    { key:"salesforce", label:"Salesforce",   fqdn:"login.salesforce.com", ip:"104.16.0.10", ports:[443] },
    { key:"m365",       label:"Microsoft 365",fqdn:"office.com",           ip:"40.96.0.10",  ports:[443] },
    { key:"github",     label:"GitHub",       fqdn:"github.com",           ip:"140.82.0.10", ports:[443,22] },
    { key:"slack",      label:"Slack",        fqdn:"slack.com",            ip:"104.16.0.20", ports:[443] },
    { key:"google",     label:"Google APIs",  fqdn:"googleapis.com",       ip:"142.250.0.10",ports:[443] },
    { key:"stripe",     label:"Stripe API",   fqdn:"api.stripe.com",       ip:"54.187.0.10", ports:[443] }
  ]},
  { group:"汎用", provider:"internet", items:[
    { key:"internet",   label:"インターネット (任意)", fqdn:"*",            ip:"8.8.8.8",     ports:[53,80,443] }
  ]}
];
function openExternalServiceCatalog(){
  openDialog("☁ 外部サービス / クラウド連携を追加", (body)=>{
    ch("p",{text:"AWS・外部SaaS等の外部エンドポイントをトポロジに追加します。公開FQDN/IP・待受ポートを持ち、通信シミュレーションの宛先になります。追加後、FWやルータと接続してください。",
      style:{margin:"0 0 10px",fontSize:"11px",color:"var(--text-dim)",lineHeight:"1.5"}},body);
    for(const grp of EXTERNAL_CATALOG){
      ch("h4",{text:grp.group,style:{margin:"10px 0 4px",fontSize:"12px",color:"var(--accent)"}},body);
      const grid=ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}},body);
      for(const it of grp.items){
        const btn=ch("button",{style:{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:"2px",padding:"8px",fontSize:"12px",cursor:"pointer",
          background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"5px",color:"var(--text)",textAlign:"left"}},grid);
        ch("div",{text:(grp.provider==="saas"?"🟪 ":grp.provider==="internet"?"🌐 ":"☁ ")+it.label,style:{fontWeight:"700"}},btn);
        ch("div",{html:`<span style="font-size:10px;opacity:0.7;font-family:var(--mono)">${it.fqdn} · ${it.ip}<br>ports: ${it.ports.join(", ")}</span>`},btn);
        btn.addEventListener("click",()=>{ closeDialog(); addExternalEndpoint(grp.provider, it); });
      }
    }
    return { buttons:[{text:"閉じる",action:closeDialog}] };
  });
}
function addExternalEndpoint(provider, item){
  pushUndo(); Cfg.ensure();
  const id = uid(item.key||"ext");
  // public interface with the endpoint IP, and listening services for each port
  const dev = {
    id, label:item.label, type:provider, status:"running", external:true,
    x: 60 + Math.random()*60, y: 60 + Math.random()*60,
    fqdn:item.fqdn,
    interfaces:[{ id:"public0", ip:item.ip+"/32", status:"up" }],
    external_ports: (item.ports||[]).map(p=>({ port:p, proto:"tcp" }))
  };
  App.config.devices.push(dev);
  selectElement("device", id);
  renderAndSync(); updateStatusBar();
  toast(`外部サービス「${item.label}」を追加 (${item.fqdn})`, "ok");
  Log.info(`外部サービス追加: ${id} ${item.fqdn} ${item.ip}`);
}
function showDeviceTypeMenu(anchorBtn){
  const menu = $("#dev-menu"); menu.innerHTML = "";
  ch("div",{class:"fmenu-title",text:"NW機器を追加 — タイプを選択"},menu);
  for(const dt of DEVICE_TYPES){
    const it = ch("div",{class:"fmenu-item",title:dt.desc},menu);
    ch("span",{class:"fico",text:dt.icon},it);
    ch("div",{style:{display:"flex",flexDirection:"column"}, html:
      `<div style="font-weight:600">${escapeHtml(dt.label)}</div>
       <div style="font-size:10px;opacity:0.8">${escapeHtml(dt.desc)}</div>`},it);
    it.addEventListener("click",()=>{ hideFloatingMenus(); addNewDeviceOfType(dt.type); });
  }
  // Catalog shortcut for ready-made AWS/SaaS endpoints
  const cat = ch("div",{class:"fmenu-item",title:"AWS/SaaS等の外部サービスをプリセットから追加",style:{borderTop:"1px solid var(--border)",marginTop:"4px",paddingTop:"6px"}},menu);
  ch("span",{class:"fico",text:"☁"},cat);
  ch("div",{style:{display:"flex",flexDirection:"column"}, html:
    `<div style="font-weight:600">外部サービスカタログ...</div>
     <div style="font-size:10px;opacity:0.8">AWS / SaaS プリセット</div>`},cat);
  cat.addEventListener("click",()=>{ hideFloatingMenus(); openExternalServiceCatalog(); });
  positionFloating(menu, anchorBtn);
  menu.classList.remove("hidden");
}
function addNewDeviceOfType(type){
  pushUndo(); Cfg.ensure();
  const id = uid(type);
  const def = {
    router:       { label:"New Router",       w:120, h:70, speed:1000,  pt:"rj45",     ifs:[{id:"ge0/0"},{id:"ge0/1"}] },
    l3switch:     { label:"New L3 Switch",    w:140, h:70, speed:10000, pt:"sfp-plus", ifs:[{id:"gi1/0/1"},{id:"gi1/0/2"},{id:"gi1/0/3"},{id:"gi1/0/4"}] },
    l2switch:     { label:"New L2 Switch",    w:140, h:70, speed:1000,  pt:"rj45",     ifs:[{id:"gi1/0/1"},{id:"gi1/0/2"},{id:"gi1/0/3"},{id:"gi1/0/4"}] },
    firewall:     { label:"New Firewall",     w:130, h:70, speed:10000, pt:"sfp-plus", ifs:[{id:"eth1"},{id:"eth2"},{id:"eth3"}] },
    loadbalancer: { label:"New Load Balancer",w:130, h:70, speed:10000, pt:"sfp-plus", ifs:[{id:"ext"},{id:"int"}] },
    waf:          { label:"New WAF",          w:120, h:70, speed:1000,  pt:"rj45",     ifs:[{id:"eth0"}] }
  }[type] || { label:"New Device", w:120, h:70, speed:1000, pt:"rj45", ifs:[{id:"eth0"}] };
  App.config.devices.push({
    id, label:def.label, type, status:"running",
    x: App.view.x + 150, y: App.view.y + 150, width:def.w, height:def.h,
    interfaces: def.ifs.map(i=>({ id:i.id, ip:"", network:"", mac: genUniqueMac(), speed:def.speed, port_type:def.pt, status:"up" }))
  });
  selectElement("device", id);
  renderAndSync(); updateStatusBar();
  toast(`${def.label} を追加`, "ok");
  Log.info(`${type} 追加: ${id}`);
}
function addNewDevice(){
  showDeviceTypeMenu($("#btn-add-device"));
}

function addNewServer(){
  pushUndo(); Cfg.ensure();
  const id = uid("srv");
  App.config.servers.push({
    id, label:"New Server", type:"virtual", os:"Linux",
    cpu:2, memory:4096, status:"running",
    x: App.view.x + 200, y: App.view.y + 200, width:130, height:65,
    interfaces:[
      { id:"eth0", ip:"10.0.0.10/24", network:"", mac: genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }
    ]
  });
  selectElement("server", id);
  renderAndSync(); updateStatusBar();
  toast("サーバを追加: "+id, "ok");
  Log.info("サーバ追加: "+id);
}

// Service type picker — floating menu with server selector
var SERVICE_TYPES = [
  { type:"web_server",    label:"Web Server",     icon:"🌐", port:80 },
  { type:"reverse_proxy", label:"Reverse Proxy",  icon:"🔁", port:443 },
  { type:"forward_proxy", label:"Forward Proxy",  icon:"🔀", port:3128 },
  { type:"app_server",    label:"App Server",     icon:"⚙",  port:8080 },
  { type:"database",      label:"Database",       icon:"🗄", port:5432 },
  { type:"cache",         label:"Cache",          icon:"⚡", port:6379 },
  { type:"mq",            label:"Message Queue",  icon:"📨", port:5672 },
  { type:"dns",           label:"DNS",            icon:"🔍", port:53 },
  { type:"dhcp",          label:"DHCP",           icon:"📡", port:67 },
  { type:"monitoring",    label:"Monitoring",     icon:"📊", port:9090 },
  { type:"logging",       label:"Logging",        icon:"📋", port:5601 },
  { type:"vpn_server",    label:"VPN Server",     icon:"🔒", port:1194 },
  { type:"custom",        label:"Custom (新規作成)", icon:"⚪", port:0 }
];
// Effective service types = built-ins + user-defined custom types saved in the config
function effectiveServiceTypes(){
  const custom = (App.config && App.config.custom_service_types) || [];
  // custom types appear before the "Custom (新規作成)" entry
  const builtins = SERVICE_TYPES.filter(s=>s.type!=="custom");
  const customEntry = SERVICE_TYPES.find(s=>s.type==="custom");
  return [...builtins, ...custom, customEntry];
}
function showServiceTypeMenu(anchorBtn, targetServerId){
  const srvs = App.config.servers || [];
  if(!srvs.length){
    toast("先にサーバを追加してください", "warn");
    return;
  }
  const menu = $("#svc-menu"); menu.innerHTML = "";
  ch("div",{class:"fmenu-title",text:"サービスを追加 — タイプを選択"},menu);
  for(const st of effectiveServiceTypes()){
    const it = ch("div",{class:"fmenu-item",title:st.label+" (Port "+st.port+")"},menu);
    ch("span",{class:"fico",text:st.icon||"⚪"},it);
    ch("div",{style:{display:"flex",flexDirection:"column"}, html:
      `<div style="font-weight:600">${escapeHtml(st.label)}</div>
       <div style="font-size:10px;opacity:0.8">${st.type==="custom"?"カスタム定義":("Port "+st.port)}</div>`},it);
    it.addEventListener("click",()=>{
      hideFloatingMenus();
      if(st.type === "custom"){ promptCustomServiceType(targetServerId); }
      else if(targetServerId){ addNewServiceOnServer(st, targetServerId); }
      else { promptServiceServer(st); }
    });
  }
  positionFloating(menu, anchorBtn);
  menu.classList.remove("hidden");
}
// Create a new custom service type, save it so it appears in the menu next time
function promptCustomServiceType(targetServerId){
  openDialog("⚪ カスタムサービスを定義", (body)=>{
    const f1=ch("div",{class:"field"},body);
    ch("label",{text:"サービス名"},f1);
    const nameIn=ch("input",{type:"text",value:"",placeholder:"例: Elasticsearch"},f1);
    const f2=ch("div",{class:"field"},body);
    ch("label",{text:"ポート番号"},f2);
    const portIn=ch("input",{type:"number",value:"",placeholder:"例: 9200"},f2);
    const f3=ch("div",{class:"field"},body);
    ch("label",{text:"プロトコル"},f3);
    const prSel=ch("select",{},f3);
    ["TCP","UDP","HTTP","HTTPS"].forEach(p=>ch("option",{value:p,text:p},prSel));
    const f4=ch("div",{class:"field"},body);
    ch("label",{text:"アイコン (絵文字, 任意)"},f4);
    const icoIn=ch("input",{type:"text",value:"⚪",style:{width:"60px"}},f4);
    return { buttons:[
      { text:"キャンセル", action:closeDialog },
      { text:"定義して追加", primary:true, action:()=>{
        const name=(nameIn.value||"").trim();
        const port=+portIn.value;
        if(!name||!port){ toast("名前とポートを入力してください","err"); return; }
        App.config.custom_service_types = App.config.custom_service_types || [];
        // dedup by name
        let st = App.config.custom_service_types.find(s=>s.label===name);
        if(!st){
          st = { type:"custom:"+name.toLowerCase().replace(/\s+/g,"-"), label:name,
                 icon:icoIn.value||"⚪", port, protocol:prSel.value };
          App.config.custom_service_types.push(st);
          toast(`カスタムサービス「${name}」をメニューに追加`, "ok");
        } else { st.port=port; st.protocol=prSel.value; st.icon=icoIn.value||"⚪"; }
        closeDialog();
        if(targetServerId) addNewServiceOnServer(st, targetServerId);
        else promptServiceServer(st);
        renderAndSync();
      }}
    ]};
  });
}
function promptServiceServer(svcType){
  const srvs = App.config.servers || [];
  if(srvs.length === 1){
    addNewServiceOnServer(svcType, srvs[0].id);
    return;
  }
  openDialog(`${svcType.label} — ホストサーバを選択`, (body)=>{
    ch("p",{text:`どのサーバにこのサービスを配置しますか?`, style:{margin:"0 0 10px 0",fontSize:"12px",color:"var(--text-dim)"}}, body);
    const f = ch("div",{class:"field"},body);
    ch("label",{text:"ホストサーバ"},f);
    const sel = ch("select",{},f);
    let defaultId = srvs[0].id;
    if(App.selected && App.selected.kind === "server") defaultId = App.selected.id;
    for(const s of srvs){
      const o = ch("option",{value:s.id, text:`${s.label||s.id} (${s.os||""})`}, sel);
      if(s.id === defaultId) o.selected = true;
    }
    return {
      buttons:[
        { text:"キャンセル", action: closeDialog },
        { text:"追加", primary:true, action:()=>{ const sid = sel.value; closeDialog(); addNewServiceOnServer(svcType, sid); }}
      ]
    };
  });
}
function addNewServiceOnServer(svcType, serverId){
  pushUndo(); Cfg.ensure();
  const id = uid((svcType.type||"svc").split(/[_:]/)[0]||"svc");
  const proto = svcType.protocol || (svcType.port===443?"HTTPS":(svcType.port===80?"HTTP":"TCP"));
  App.config.services.push({
    id, label: svcType.label, type: svcType.type,
    server: serverId, status:"running",
    port: svcType.port, protocol: proto,
    config:{}, depends_on:[]
  });
  selectElement("service", id);
  renderAndSync(); updateStatusBar();
  toast(`${svcType.label} を ${serverId} に追加`, "ok");
  Log.info(`サービス追加: ${id} on ${serverId}`);
}
function addNewService(){ showServiceTypeMenu($("#btn-add-service")); }
// Add a service to a SPECIFIC server. Uses a robust dialog picker (not the floating
// menu) to avoid the document click-to-close race that made it intermittently unresponsive.
function addServiceToServer(serverId){
  const srv = Cfg.byId("servers", serverId);
  if(!srv){ toast("サーバが見つかりません","err"); return; }
  openDialog(`サービス追加 — ${srv.label||serverId}`, (body)=>{
    ch("p",{text:"追加するサービスタイプを選択してください。",style:{margin:"0 0 10px",fontSize:"12px",color:"var(--text-dim)"}},body);
    const grid = ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}},body);
    for(const st of effectiveServiceTypes()){
      const it = ch("button",{style:{display:"flex",alignItems:"center",gap:"8px",padding:"8px",fontSize:"12px",cursor:"pointer",
        background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"5px",color:"var(--text)",textAlign:"left"}},grid);
      ch("span",{text:st.icon||"⚪",style:{fontSize:"16px"}},it);
      ch("div",{html:`<div style="font-weight:600">${escapeHtml(st.label)}</div><div style="font-size:10px;opacity:0.7">${st.type==="custom"?"カスタム定義":("Port "+st.port)}</div>`},it);
      it.addEventListener("click",()=>{
        closeDialog();
        if(st.type === "custom") promptCustomServiceType(serverId);
        else addNewServiceOnServer(st, serverId);
      });
    }
    return { buttons:[{text:"キャンセル",action:closeDialog}] };
  });
}

function addNewAnnotation(){
  pushUndo(); Cfg.ensure();
  if(!Array.isArray(App.config.annotations)) App.config.annotations = [];
  const id = uid("ann");
  App.config.annotations.push({
    id,
    text: "ここに説明を入力 (ダブルクリックで編集)",
    x: App.view.x + 100,
    y: App.view.y + 80,
    width: 220,
    height: 50,
    color: "rgba(255,235,100,0.85)",
    fontSize: 12
  });
  selectElement("annotation", id);
  renderAndSync();
  toast("メモを追加: ダブルクリックで文言を編集", "ok");
}

function startConnectMode(){
  App.connectMode = { step:1, from:null };
  $("#svg").classList.add("connecting");
  $("#status-msg").textContent = "接続元のインターフェース (ポート) をクリック (ESCでキャンセル)";
  toast("インターフェース (ポート) をクリックして接続元を選択", "ok");
  Log.info("接続モード開始");
}

/* ====== FLOATING MENU UTILS ====== */
function positionFloating(menu, anchor){
  const r = anchor.getBoundingClientRect();
  menu.style.left = (r.left) + "px";
  menu.style.top = (r.bottom + 4) + "px";
  // Adjust if overflows viewport
  setTimeout(()=>{
    const m = menu.getBoundingClientRect();
    if(m.right > window.innerWidth) menu.style.left = (window.innerWidth - m.width - 8) + "px";
    if(m.bottom > window.innerHeight) menu.style.top = (r.top - m.height - 4) + "px";
  }, 0);
}
function hideFloatingMenus(){
  $("#dev-menu").classList.add("hidden");
  $("#svc-menu").classList.add("hidden");
}

/* ====== INIT / EVENT WIRING ====== */
function init(){
  $("#yaml-editor").value = DEFAULT_YAML;
  syncConfigFromYaml();
  // baseline undo state
  App.undoStack = [];
  App.redoStack = [];

  refreshScenarioSelect();
  updateStatusBar();
  render();
  setTimeout(()=>{ fitView(); }, 60);
  attachEventHandlers();
  startMacFlapMonitor();
  Log.info("NetSim 起動完了");
}

// Periodically scan for MAC flapping and escalate the simulated degradation.
// While a flap/loop persists the L2 domain gradually worsens; warnings stream to the comm log.
var _macFlapTimer = null;
function startMacFlapMonitor(){
  if(_macFlapTimer) clearInterval(_macFlapTimer);
  let prevActive = false;
  _macFlapTimer = setInterval(()=>{
    const report = updateMacFlapState();
    const active = report.length > 0;
    if(active){
      logMacFlapSymptoms(report);
      render(); // redraw to update flap badges/animation
    } else if(prevActive){
      // condition cleared → recovered
      CommLog.info("MACフラッピング解消: L2ドメインが安定しました");
      render();
    }
    prevActive = active;
    // keep status bar fresh
    if(typeof updateStatusBar==="function") updateStatusBar();
  }, 2500);
}

function attachEventHandlers(){
  // Null-safe binder: a single missing element must NOT abort wiring of the rest.
  function bind(id, ev, fn){
    const el = (id[0]==="#") ? $(id) : document.getElementById(id);
    if(!el){ console.warn("[attachEventHandlers] element not found:", id); return null; }
    el.addEventListener(ev, fn);
    return el;
  }
  // Toolbar
  bind("#btn-load","click", ()=>$("#file-input").click());
  bind("#file-input","change", (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      pushUndo();
      $("#yaml-editor").value = r.result;
      if(syncConfigFromYaml()){
        render(); updateStatusBar(); refreshScenarioSelect(); fitView();
        Log.info("YAML読込: "+f.name);
      }
    };
    r.readAsText(f);
    e.target.value = "";
  });

  bind("#btn-apply","click", ()=>{
    pushUndo();
    if(syncConfigFromYaml()){
      render(); updateStatusBar(); refreshScenarioSelect();
      Log.info("YAML反映");
    }
  });

  bind("#btn-save","click", ()=>{
    const fname = prompt("ファイル名:", "netsim-config.yaml");
    if(!fname) return;
    const txt = $("#yaml-editor").value;
    const blob = new Blob([txt], { type:"text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
    Log.info("保存: "+fname);
  });

  bind("#btn-add-network","click", addNewNetwork);
  bind("#btn-add-device","click", addNewDevice);
  bind("#btn-add-server","click", addNewServer);
  bind("#btn-add-service","click", addNewService);
  bind("#btn-add-connection","click", startConnectMode);

  bind("#btn-sim-play","click", ()=>{
    if(App.simulation.paused){
      App.simulation.paused = false;
      Log.info("シミュレーション再開");
    } else if(!App.simulation.running){
      const sel = $("#scenario-select").value;
      if(sel) runScenario(sel);
    }
  });
  bind("#btn-sim-pause","click", ()=>{
    if(App.simulation.running){
      App.simulation.paused = !App.simulation.paused;
      Log.info(App.simulation.paused ? "一時停止" : "再開");
    }
  });
  bind("#btn-sim-stop","click", ()=>{
    stopSimulation();
    Log.info("シミュレーション停止");
  });
  bind("#sim-speed","change", (e)=>{
    App.simulation.speed = parseFloat(e.target.value);
    Log.info(`シミュレーション速度: x${App.simulation.speed}`);
  });
  bind("#btn-run-scenario","click", ()=>{
    const sel = $("#scenario-select").value;
    if(sel) runScenario(sel);
    else toast("シナリオが選択されていません。「管理」から作成してください", "warn");
  });
  bind("#btn-manage-scenario","click", openScenarioManager);
  bind("#btn-comm-sim","click", openCommSimulator);
  bind("#btn-tpl","click", openTopologyTemplates);
  bind("#btn-segments","click", showSegmentManager);
  bind("#btn-k8s","click", showK8sManager);
  bind("#btn-mac-audit","click", openMacAudit);
  const btnAnim = $("#btn-anim-toggle");
  if(btnAnim){
    btnAnim.addEventListener("click", toggleAnimations);
    updateAnimToggleUI();
  }
  // STP visualization toggle
  if(typeof App.stpVisible === "undefined"){
    App.stpVisible = (typeof localStorage !== "undefined" && localStorage.getItem("netsim-stp-visible") === "on");
  }
  const btnStp = $("#btn-stp-toggle");
  if(btnStp){
    btnStp.addEventListener("click", function(){
      App.stpVisible = !App.stpVisible;
      if(typeof localStorage !== "undefined") localStorage.setItem("netsim-stp-visible", App.stpVisible ? "on" : "off");
      btnStp.classList.toggle("primary", App.stpVisible);
      btnStp.querySelector(".lbl").textContent = App.stpVisible ? "STP非表示" : "STP表示";
      render();
      toast("STP状態 "+(App.stpVisible?"表示":"非表示"), "ok");
    });
    btnStp.classList.toggle("primary", App.stpVisible);
    if(App.stpVisible) btnStp.querySelector(".lbl").textContent = "STP非表示";
  }
  const btnAnn = $("#btn-add-annotation");
  if(btnAnn) btnAnn.addEventListener("click", addNewAnnotation);
  // Apply persisted animation state to body class
  if(!App.animationsEnabled) document.body.classList.add("no-animations");

  $("#btn-undo").addEventListener("click", undo);
  $("#btn-redo").addEventListener("click", redo);
  $("#btn-fit").addEventListener("click", fitView);
  $("#btn-theme").addEventListener("click", ()=>{
    document.documentElement.classList.toggle("light");
  });

  // YAML editor: Ctrl+Enter to apply, autoparse on change (delayed)
  let yamlTimer = null;
  $("#yaml-editor").addEventListener("input", ()=>{
    clearTimeout(yamlTimer);
    yamlTimer = setTimeout(()=>{
      // syntax-check without committing if invalid, but auto-apply on success
      const txt = $("#yaml-editor").value;
      try {
        YAML.parse(txt);
        $("#yaml-status").style.color = "var(--orange)";
        $("#yaml-status").textContent = "● 未反映";
      } catch(e){
        $("#yaml-status").style.color = "var(--red)";
        $("#yaml-status").textContent = "✗ "+e.message.slice(0,40);
      }
    }, 300);
  });

  // Zoom
  $("#zoom-slider").addEventListener("input", (e)=>{
    const v = parseFloat(e.target.value);
    App.view.scale = v / 100;
    $("#zoom-val").textContent = Math.round(v) + "%";
    applyViewBox();
  });
  $("#zoom-in").addEventListener("click", ()=>{
    App.view.scale = clamp(App.view.scale * 1.2, 0.1, 5);
    $("#zoom-slider").value = Math.round(App.view.scale * 100);
    $("#zoom-val").textContent = Math.round(App.view.scale * 100) + "%";
    applyViewBox();
  });
  $("#zoom-out").addEventListener("click", ()=>{
    App.view.scale = clamp(App.view.scale / 1.2, 0.1, 5);
    $("#zoom-slider").value = Math.round(App.view.scale * 100);
    $("#zoom-val").textContent = Math.round(App.view.scale * 100) + "%";
    applyViewBox();
  });

  // SVG events
  const svg = $("#svg");
  svg.addEventListener("mousedown", onSvgMouseDown);
  svg.addEventListener("wheel", onSvgWheel, { passive:false });
  svg.addEventListener("contextmenu", (e)=>{
    if(e.target === svg){ e.preventDefault(); hideContextMenu(); }
  });
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  window.addEventListener("resize", applyViewBox);

  // Click outside ctxmenu to close
  document.addEventListener("click", (e)=>{
    if(!$("#ctx-menu").contains(e.target)) hideContextMenu();
    if(!$("#dev-menu").contains(e.target) && e.target.id !== "btn-add-device") $("#dev-menu").classList.add("hidden");
    if(!$("#svc-menu").contains(e.target) && e.target.id !== "btn-add-service") $("#svc-menu").classList.add("hidden");
  });

  // Property panel close
  $("#ph-close").addEventListener("click", closePropertyPanel);

  // YAML pane resizer
  let yamlResize = null;
  $("#yaml-resize").addEventListener("mousedown", (e)=>{
    yamlResize = { startX: e.clientX, startW: $("#yaml-pane").offsetWidth };
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e)=>{
    if(!yamlResize) return;
    const w = clamp(yamlResize.startW + (e.clientX - yamlResize.startX), 200, window.innerWidth*0.6);
    $("#yaml-pane").style.width = w + "px";
    applyViewBox();
  });
  document.addEventListener("mouseup", ()=>{ if(yamlResize) yamlResize = null; });

  // Log pane
  bind("#log-toggle","click", ()=>{
    $("#log-wrap").classList.toggle("collapsed");
    $("#log-toggle").textContent = $("#log-wrap").classList.contains("collapsed") ? "▲" : "▼";
  });
  function switchLogTab(tab){
    App.activeLogTab = tab;
    const comm = tab === "comm";
    $("#comm-log-body").classList.toggle("hidden", !comm);
    $("#log-body").classList.toggle("hidden", comm);
    $("#sys-filters").classList.toggle("hidden", comm);
    const tc=$("#logtab-comm"), ts=$("#logtab-sys");
    if(tc) tc.classList.toggle("active", comm);
    if(ts) ts.classList.toggle("active", !comm);
  }
  bind("#logtab-comm","click", ()=>switchLogTab("comm"));
  bind("#logtab-sys","click", ()=>switchLogTab("sys"));
  bind("#log-clear","click", ()=>{ if(App.activeLogTab==="comm") CommLog.clear(); else Log.clear(); });
  for(const lvl of ["info","warn","error"]){
    bind(`#log-filter-${lvl}`,"click", (e)=>{
      App.logFilters[lvl] = !App.logFilters[lvl];
      e.target.classList.toggle("active", App.logFilters[lvl]);
      Log.refresh();
    });
  }
  switchLogTab("comm");
  // Log resize
  let logResize = null;
  $("#log-resize").addEventListener("mousedown", (e)=>{
    logResize = { startY: e.clientY, startH: $("#log-wrap").offsetHeight };
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e)=>{
    if(!logResize) return;
    const h = clamp(logResize.startH - (e.clientY - logResize.startY), 28, window.innerHeight*0.6);
    $("#log-wrap").style.height = h + "px";
  });
  document.addEventListener("mouseup", ()=>{ if(logResize) logResize = null; });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e)=>{
    // skip when typing in input/textarea (except Ctrl shortcuts)
    const isTyping = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT";

    if(e.ctrlKey || e.metaKey){
      if(e.key === "s" || e.key === "S"){
        e.preventDefault();
        $("#btn-save").click();
      } else if(e.key === "Enter"){
        e.preventDefault();
        $("#btn-apply").click();
      } else if(e.key === "z" || e.key === "Z"){
        if(!isTyping || e.target.id !== "yaml-editor"){
          e.preventDefault(); undo();
        }
      } else if(e.key === "y" || e.key === "Y"){
        if(!isTyping || e.target.id !== "yaml-editor"){
          e.preventDefault(); redo();
        }
      }
      return;
    }
    if(isTyping) return;
    if(e.key === "?" || (e.shiftKey && e.key === "/")){
      e.preventDefault(); showShortcutHelp(); return;
    }
    if(e.key === "f" || e.key === "F"){
      e.preventDefault(); fitView(); return;
    }
    if(e.key === "+" || e.key === "="){
      e.preventDefault(); $("#zoom-in").click(); return;
    }
    if(e.key === "-" || e.key === "_"){
      e.preventDefault(); $("#zoom-out").click(); return;
    }
    if(e.key === "Delete" || e.key === "Backspace"){
      if(App.selected){
        deleteElement(App.selected.kind, App.selected.id);
      }
    } else if(e.key === "Escape"){
      if(!$("#dialog-overlay").classList.contains("hidden")) closeDialog();
      else if(App.connectMode) cancelConnectMode();
      else if(!$("#ctx-menu").classList.contains("hidden")) hideContextMenu();
      else selectElement(null, null);
    } else if(e.key === " "){
      e.preventDefault();
      if(App.simulation.running){
        App.simulation.paused = !App.simulation.paused;
        Log.info(App.simulation.paused ? "一時停止" : "再開");
      } else {
        const sel = $("#scenario-select").value;
        if(sel) runScenario(sel);
      }
    } else if(e.key === "F5"){
      e.preventDefault();
      const sel = $("#scenario-select").value;
      if(sel) runScenario(sel);
    }
  });
}

// Boot
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

