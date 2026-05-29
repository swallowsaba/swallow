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

/* ====== AWS SECURITY GROUPS ======
 * server.aws = { vpc, subnet, security_groups:["sg-1",...] }
 * A security group is stateful allow-list of inbound rules. If a server is assigned SGs,
 * inbound traffic must match at least one rule (proto/port/source) or it is denied.
 */
function awsFindSecurityGroup(name){
  for(const v of ((App.config.aws&&App.config.aws.vpcs)||[])){
    const sg=(v.security_groups||[]).find(g=>g.name===name);
    if(sg) return sg;
  }
  return null;
}
function awsSecurityGroupVerdict(server, proto, port, srcIp){
  // server can be either a server object (server.aws.security_groups) or a device (device.aws_config.security_groups)
  let sgNames = null;
  if(server && server.aws && server.aws.security_groups && server.aws.security_groups.length){
    sgNames = server.aws.security_groups;
  } else if(server && server.aws_config && server.aws_config.security_groups && server.aws_config.security_groups.length){
    sgNames = server.aws_config.security_groups;
  }
  if(!sgNames) return { ok:true };
  for(const sgName of sgNames){
    const sg=awsFindSecurityGroup(sgName);
    if(!sg) continue;
    for(const r of (sg.inbound||[])){
      if(r.proto && r.proto!=="any" && proto && r.proto.toLowerCase()!==proto.toLowerCase()) continue;
      if(r.port!=null && port!=null && +r.port!==+port) continue;
      if(r.source && srcIp && !matchRef(srcIp, r.source)) continue;
      return { ok:true, sg:sgName, rule:r };
    }
  }
  return { ok:false, reason:`AWS Security Group により遮断 (${sgNames.join(",")}: ${proto}/${port} 未許可)` };
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
    // Bridge MAC = the LOWEST MAC among the switch's interfaces (the chassis "bridge base
    // address"), matching real STP. This is stable regardless of port up/down order.
    function bridgeMac(d){
      let best = null;
      for(const i of (d.interfaces||[])){
        if(!i.mac) continue;
        const m = normalizeMac(i.mac);
        if(best===null || m < best) best = m;
      }
      return best || "ff:ff:ff:ff:ff:ff"; // no MAC → treat as highest (least likely root)
    }
    const participants = [...participantIds].map(pid=>{
      const d = Cfg.byId("devices", pid);
      return d ? { id:pid, dev:d, priority:(d.stp_priority==null?32768:d.stp_priority)+vid, mac:bridgeMac(d) } : null;
    }).filter(Boolean);
    // Root bridge election (real STP): lowest Bridge ID = (priority, then lowest MAC).
    // - If the user sets stp_priority, it takes precedence.
    // - Otherwise all share the default (32768) and the LOWEST MAC wins (sequential MAC
    //   allocation means the "oldest"/lowest-addressed switch becomes root).
    participants.sort((a,b)=>(a.priority-b.priority) || (a.mac < b.mac ? -1 : a.mac > b.mac ? 1 : 0));
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

/* ====== MAC ADDRESS FLAPPING SIMULATION (実機挙動準拠) ======
 * 定義: 同一MACアドレスが「同一VLAN内」で「複数ポート」にて短時間に繰り返し学習される現象。
 *   検知基準(Meraki準拠): 10秒以内に2ポート以上で3回以上学習。
 * 主因(重大度順):
 *   - L2ループ (loop)      : STP無効の冗長リンク等。最も重大。ブロードキャストストーム+CPU高騰。
 *   - MACアドレス重複 (duplicate): 仮想NICのMAC競合等。フラップlog多発だがストームは限定的。
 *   - 無線ローミング (roaming) : 端末がAP間を高速移動。多くは無害で無視可。
 * 実機ログ(severity 4):
 *   %SW_MATM-4-MACFLAP_NOTIF: Host xxxx.xxxx.xxxx in vlan X is flapping between port P1 and port P2
 * 影響の進行: ログ大量出力 → CPU負荷高騰 → IP電話の音声途切れ/断続ロス → ブロードキャストストーム
 *           → (BPDUガード設定時) 約一定時間後にポートが err-disable となり収束。
 * STPでブロック済みのポートは検知対象外。
 *
 * App.macFlap[switchId] = {
 *   macs:{ mac:{ports:[p1,p2], vlan, flaps} }, cause, loop, severity:0..100, cpu:0..100,
 *   logToggle, errDisabledPorts:[], since }
 */
function macToCisco(mac){
  // aa:bb:cc:dd:ee:ff → aabb.ccdd.eeff
  const h = String(mac||"").replace(/[^0-9a-fA-F]/g,"").toLowerCase().padStart(12,"0").slice(0,12);
  return h.slice(0,4)+"."+h.slice(4,8)+"."+h.slice(8,12);
}
function vlanOfIface(sw, ifaceId){
  const i = (sw.interfaces||[]).find(x=>x.id===ifaceId);
  if(i && i.network){ const net = Cfg.byId("networks", i.network); if(net && net.vlan_id) return net.vlan_id; }
  return 1; // default VLAN
}
// Ports currently BLOCKED by STP on this switch (excluded from flap detection)
function stpBlockedPorts(sw){
  const blocked = new Set();
  try{
    if(typeof computeStpForSwitch === "function"){
      const sd = computeStpForSwitch(sw);
      for(const v of (sd.vlans||[])){
        for(const p of (v.ports||[])){
          const st=(p.state||"").toUpperCase(); const role=(p.role||"").toLowerCase();
          if(st==="BLK"||st==="BLOCK"||role.startsWith("altn")||role.startsWith("bloc")||role.startsWith("disc")) blocked.add(p.iface);
        }
      }
    }
  }catch(e){}
  return blocked;
}
function detectMacFlaps(){
  const report = [];
  for(const sw of (App.config.devices||[])){
    if(sw.type!=="l2switch" && sw.type!=="l3switch") continue;
    const entries = buildMacTable(sw);
    const blocked = stpBlockedPorts(sw);
    // group ports by (mac, vlan), excluding STP-blocked ports
    const byKey = {};
    const addPort = (mac, vid, port)=>{ if(!mac) return; const key=mac+"@"+vid; (byKey[key]=byKey[key]||{mac,vlan:vid,ports:new Set()}).ports.add(port); };
    for(const e of entries){
      if(blocked.has(e.port)) continue;            // STPブロック済みポートは対象外
      const vid = e.vlan!=null ? e.vlan : vlanOfIface(sw, e.port);
      addPort(e.mac, vid, e.port);
    }
    // Direct scan of connections so DUPLICATE MACs (same MAC on two different ports of THIS
    // switch) are detected even though buildMacTable dedups by MAC. This makes "two NICs with
    // the same MAC on one switch" correctly trigger flapping.
    for(const c of (App.config.connections||[])){
      if(c.status==="down") continue;
      let myPort=null, peer=null;
      if(c.from && c.from.device===sw.id){ myPort=c.from.interface; peer=c.to; }
      else if(c.to && c.to.device===sw.id){ myPort=c.to.interface; peer=c.from; }
      else continue;
      if(blocked.has(myPort)) continue;
      const peerObj = Cfg.byId(peer.device?"devices":"servers", peer.device||peer.server);
      if(!peerObj) continue;
      const peerIf = (peerObj.interfaces||[]).find(i=>i.id===peer.interface);
      const vid = vlanOfIface(sw, myPort);
      if(peerIf && peerIf.mac) addPort(normalizeMac(peerIf.mac), vid, myPort);
      // bonded peer: also its bond members' MACs
      if(peerObj.bonding && peerObj.bonding.enabled){
        for(const m of (peerObj.bonding.members||[])){ const mi=(peerObj.interfaces||[]).find(i=>i.id===m); if(mi&&mi.mac) addPort(normalizeMac(mi.mac), vid, myPort); }
      }
    }
    const flapMacs = {};
    for(const k in byKey){
      const g = byKey[k];
      if(g.ports.size >= 2){ flapMacs[g.mac] = { ports:[...g.ports], vlan:g.vlan }; }  // 同一VLANで複数ポート
    }
    // L2ループ判定: STP無効の冗長リンク(同一ピアへ非bondで2本以上)
    const stpOff = !sw.stp || sw.stp.mode==="off" || sw.stp.enabled===false;
    let loop = false;
    let loopPorts = null;
    const peerLinks = {};
    for(const c of (App.config.connections||[])){
      if(c.status==="down") continue;
      let me=null,peer=null;
      if(c.from&&c.from.device===sw.id){me=c.from;peer=c.to;}
      else if(c.to&&c.to.device===sw.id){me=c.to;peer=c.from;}
      else continue;
      if(blocked.has(me.interface)) continue;       // ブロックポートはループ形成しない
      const pid = peer&&(peer.device||peer.server); if(!pid) continue;
      const bonded = sw.bonding&&sw.bonding.enabled&&(sw.bonding.members||[]).includes(me.interface);
      // vPC peer link: if this switch and the peer are vPC peers (same domain / configured peer),
      // their redundant links are managed (MLAG) and must NOT be treated as a loop — this is how
      // switch-to-switch heartbeat/peer-link redundancy works without flapping.
      let vpcPeerLink = false;
      if(peer && peer.device){
        const peerDev = Cfg.byId("devices", peer.device);
        const myV = sw.vpc, pV = peerDev && peerDev.vpc;
        if(myV && myV.enabled && pV && pV.enabled){
          if((myV.peer && myV.peer===peer.device) || (pV.peer && pV.peer===sw.id) ||
             (myV.domain!=null && myV.domain===pV.domain)) vpcPeerLink = true;
        }
      }
      (peerLinks[pid]=peerLinks[pid]||[]).push({bonded: bonded||vpcPeerLink, port:me.interface});
    }
    for(const pid in peerLinks){
      const nonBond=peerLinks[pid].filter(l=>!l.bonded);
      if(nonBond.length>=2 && stpOff){ loop=true; loopPorts=[nonBond[0].port, nonBond[1].port]; }
    }
    // 実機同様、ループ時はブロードキャストドメイン内の端末MACがループポート間で揺れる。
    // buildMacTableは重複を出さないため、ループ時はフラップMACを合成する。
    if(loop && loopPorts){
      const vid = vlanOfIface(sw, loopPorts[0]);
      // この L2 ドメインに居る端末(サーバ)のMACを収集
      for(const c of (App.config.connections||[])){
        if(c.status==="down") continue;
        const ep = (c.from&&c.from.server) ? c.from : (c.to&&c.to.server) ? c.to : null;
        if(!ep) continue;
        const srv = Cfg.byId("servers", ep.server);
        const iface = srv && (srv.interfaces||[]).find(i=>i.id===ep.interface);
        const mac = iface && iface.mac;
        if(mac && !flapMacs[mac]) flapMacs[mac] = { ports:[loopPorts[0], loopPorts[1]], vlan:vid };
      }
      // 端末が無くてもループ自体は計上(汎用ホスト表記)
      if(!Object.keys(flapMacs).length){
        flapMacs["02:00:00:00:00:01"] = { ports:[loopPorts[0], loopPorts[1]], vlan:vid };
      }
    }
    if(Object.keys(flapMacs).length || loop){
      // 原因分類: ループあり→loop / フラップMACがサーバ等の重複→duplicate / 端末移動→roaming
      let cause = "duplicate";
      if(loop) cause = "loop";
      else {
        // endpoint(サーバ/VM)が2スイッチポートに見える場合は重複の可能性が高い
        cause = "duplicate";
      }
      report.push({ switchId:sw.id, label:sw.label||sw.id, macs:flapMacs, loop, cause });
    }
  }
  return report;
}
function updateMacFlapState(){
  App.macFlap = App.macFlap || {};
  const report = detectMacFlaps();
  const active = new Set(report.map(r=>r.switchId));
  for(const r of report){
    const st = App.macFlap[r.switchId] || { severity:0, cpu:5, logToggle:false, errDisabledPorts:[], since:Date.now() };
    st.macs = r.macs; st.loop = r.loop; st.cause = r.cause;
    st.origin = true;  // this switch is the flap ORIGIN (vs. a victim of storm spillover)
    // escalation rate by cause (loop worst, roaming benign)
    const inc = r.cause==="loop" ? 18 : (r.cause==="roaming" ? 3 : 8);
    st.severity = Math.min(100, st.severity + inc);
    // flap counter (回数) — accumulates re-learning events
    st.flaps = (st.flaps||0) + (r.loop ? 4 : 2);
    // CPU load climbs with severity for loop/broadcast storm; duplicate keeps CPU lower
    const cpuTarget = r.cause==="loop" ? Math.min(99, 20 + st.severity*0.8)
                    : r.cause==="duplicate" ? Math.min(60, 10 + st.severity*0.4)
                    : Math.min(25, 8 + st.severity*0.15);
    st.cpu = Math.round(st.cpu + (cpuTarget - st.cpu)*0.5);
    st.logToggle = !st.logToggle; // alternate port order in syslog like real devices
    // BPDU guard: when a loop is severe and the switch has bpdu_guard enabled, a port goes
    // err-disabled (実機の「約40分後にBPDUガード作動」を凝縮). This breaks the loop → recovery.
    if(r.loop && st.severity>=100 && sw_bpduGuard(r.switchId) && !(st.errDisabledPorts||[]).length){
      const sw = Cfg.byId("devices", r.switchId);
      const port = _firstLoopPort(sw);
      if(port){
        const iface = (sw.interfaces||[]).find(i=>i.id===port);
        if(iface){ iface.status = "err-disabled"; st.errDisabledPorts = [port]; st.bpduGuardTripped = true; }
      }
    }
    App.macFlap[r.switchId] = st;
  }

  // === ブロードキャストストームの波及 (実機挙動) ===
  // ループ起因のフラッピングは「ブロードキャストストーム」を生み、同一ブロードキャスト
  // ドメイン(L2で相互到達できるスイッチ群=同一VLAN)に氾濫する。隣接スイッチも徐々に
  // CPU高騰・通信劣化に陥り、ネットワーク全体が異常をきたす。距離(ホップ)が遠いほど
  // 影響は減衰するが、ストームが強いほど遠方まで波及する。
  const stormVictims = {};  // switchId -> max spillover severity
  for(const r of report){
    if(r.cause !== "loop") continue;  // ストームを生むのはループのみ(重複/ローミングは局所)
    const origin = App.macFlap[r.switchId];
    if(!origin || origin.severity < 25) continue;  // ある程度育つと氾濫し始める
    const vlans = new Set(Object.values(r.macs||{}).map(m=>m.vlan));
    const dist = l2DomainDistances(r.switchId, vlans);  // {switchId: hops}
    for(const vid in dist){}
    for(const otherId in dist){
      if(otherId === r.switchId) continue;
      const hops = dist[otherId];
      // 減衰: 1ホップごとに約25%減。ストーム強度(origin severity)に比例して波及
      const spill = Math.max(0, Math.round(origin.severity * Math.pow(0.6, hops)) - 10);
      if(spill > 0) stormVictims[otherId] = Math.max(stormVictims[otherId]||0, spill);
    }
  }
  for(const vid in stormVictims){
    const sev = stormVictims[vid];
    if(active.has(vid)) continue;  // 自身が発生源なら上書きしない
    const st = App.macFlap[vid] || { severity:0, cpu:5, logToggle:false, errDisabledPorts:[], since:Date.now() };
    st.cause = "storm";       // ストーム波及による被害(victim)
    st.origin = false;
    st.loop = false;
    st.victim = true;
    st.severity = Math.min(95, Math.max(st.severity, sev));  // 波及先は発生源を超えない
    st.cpu = Math.round(Math.min(90, 15 + st.severity*0.7));
    st.logToggle = !st.logToggle;
    App.macFlap[vid] = st;
    active.add(vid);  // 維持対象に含める(減衰ループで消さない)
  }

  // 減衰: 発生源でもストーム被害でもないものは回復へ
  for(const id in App.macFlap){
    if(!active.has(id)){
      const st = App.macFlap[id];
      st.severity = Math.max(0, st.severity - 20);
      st.cpu = Math.max(5, Math.round(st.cpu*0.6));
      if(st.severity<=0) delete App.macFlap[id];
    }
  }
  return report;
}
// BFS over the L2 broadcast domain (switch↔switch links in the same VLAN, excluding STP-blocked
// and err-disabled ports) returning hop distance from the origin switch to every reachable switch.
function l2DomainDistances(originId, vlanSet){
  const dist = { [originId]: 0 };
  const queue = [originId];
  while(queue.length){
    const cur = queue.shift();
    const sw = Cfg.byId("devices", cur);
    if(!sw) continue;
    for(const c of (App.config.connections||[])){
      if(c.status==="down") continue;
      let me=null, peer=null;
      if(c.from && c.from.device===cur){ me=c.from; peer=c.to; }
      else if(c.to && c.to.device===cur){ me=c.to; peer=c.from; }
      else continue;
      const myIf = (sw.interfaces||[]).find(i=>i.id===me.interface);
      // ブロードキャストストームは転送中の全L2リンクへ氾濫する。実際に遮断されるのは
      // リンクダウン/err-disable のみ(STPが正しく動作していればループ自体が起きない)。
      if(myIf && myIf.status && myIf.status!=="up") continue;
      const peerId = peer && peer.device;
      if(!peerId) continue;
      const peerDev = Cfg.byId("devices", peerId);
      if(!peerDev || (peerDev.type!=="l2switch" && peerDev.type!=="l3switch")) continue;
      // ピア側ポートが err-disable/down なら越えない
      const peerIf = (peerDev.interfaces||[]).find(i=>i.id===peer.interface);
      if(peerIf && peerIf.status && peerIf.status!=="up") continue;
      if(dist[peerId] == null){ dist[peerId] = dist[cur] + 1; queue.push(peerId); }
    }
  }
  return dist;
}
function sw_bpduGuard(switchId){
  const sw = Cfg.byId("devices", switchId);
  return !!(sw && (sw.bpdu_guard || (sw.stp && sw.stp.bpdu_guard)));
}
function _firstLoopPort(sw){
  for(const c of (App.config.connections||[])){
    if(c.status==="down") continue;
    if(c.from&&c.from.device===sw.id) return c.from.interface;
    if(c.to&&c.to.device===sw.id) return c.to.interface;
  }
  return null;
}
function macFlapSeverity(switchId){
  return (App.macFlap && App.macFlap[switchId]) ? App.macFlap[switchId].severity : 0;
}
function macFlapCpu(switchId){
  return (App.macFlap && App.macFlap[switchId]) ? (App.macFlap[switchId].cpu||0) : 0;
}
// drop probability at a flapping switch. Loops cause heavy loss; duplicate moderate; roaming light.
function macFlapDropProb(switchId){
  const st = App.macFlap && App.macFlap[switchId];
  if(!st || st.severity<=0) return 0;
  const base = st.cause==="loop" ? st.severity/110
             : st.cause==="storm" ? st.severity/140      // ストーム波及先も大きく劣化
             : st.cause==="duplicate" ? st.severity/200
             : st.severity/600;
  return Math.min(0.95, base);
}
function macFlapStage(sev, cause){
  if(sev<=0) return "正常";
  if(cause==="roaming") return sev<50 ? "無線ローミングによる学習移動(通常は無害)" : "頻繁なローミング(要確認)";
  if(cause==="storm"){
    if(sev<30) return "近隣からのブロードキャストストーム波及(軽微)";
    if(sev<60) return "ストーム氾濫によりCPU上昇・断続ロス";
    return "ストーム氾濫により通信不安定(発生源の影響を受けて劣化)";
  }
  if(sev<25) return "MAC学習がポート間で揺れ始め (MACFLAP_NOTIFログ発生)";
  if(sev<50) return "ログ多発・CAM不安定／L2機器のCPU負荷上昇";
  if(sev<75) return "断続的パケットロス・IP電話の音声途切れ";
  if(sev<100) return "ブロードキャストストーム発生・CPU高騰";
  return "L2ドメイン崩壊寸前 (BPDUガード設定時はerr-disableで収束)";
}
// Emit Cisco-style syslog (%SW_MATM-4-MACFLAP_NOTIF) + escalating symptom lines.
// Also logs broadcast-storm spillover at victim switches in the same L2 domain.
function logMacFlapSymptoms(report){
  for(const r of report){
    const st = App.macFlap[r.switchId] || {};
    const sev = st.severity||0;
    for(const mac in (r.macs||{})){
      const info = r.macs[mac];
      let p1 = info.ports[0], p2 = info.ports[1]||info.ports[0];
      if(st.logToggle){ const t=p1; p1=p2; p2=t; }
      CommLog.blocked(
        `%SW_MATM-4-MACFLAP_NOTIF: Host ${macToCisco(mac)} in vlan ${info.vlan} is flapping between port ${p1} and port ${p2}`,
        `${r.label} — ${r.cause==="loop"?"L2ループ":r.cause==="duplicate"?"MAC重複":"ローミング"} / CPU ${st.cpu||0}% / 段階: ${macFlapStage(sev, r.cause)}`
      );
    }
    if(st.bpduGuardTripped && st.errDisabledPorts && st.errDisabledPorts.length){
      CommLog.blocked(
        `%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${st.errDisabledPorts[0]} with BPDU Guard enabled, putting ${st.errDisabledPorts[0]} in err-disable state`,
        `${r.label} — BPDUガード作動によりループ収束`
      );
      st.bpduGuardTripped = false;
    }
  }
  // storm spillover victims (other switches in the same L2 domain degrading)
  for(const id in (App.macFlap||{})){
    const st = App.macFlap[id];
    if(st && st.cause==="storm" && st.victim && (st.severity||0) >= 20){
      const sw = Cfg.byId("devices", id);
      CommLog.blocked(
        `${(sw&&sw.label)||id}: ブロードキャストストーム波及を検知 (隣接ループの氾濫)`,
        `CPU ${st.cpu||0}% / 段階: ${macFlapStage(st.severity, "storm")}`
      );
    }
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

/* ====== ARP / GARP (Address Resolution Protocol) ======
 * 通信前にL2宛先MACを解決する。同一サブネットなら宛先IP、異サブネットならGW IPをARP解決。
 * ブロードキャストであるARPは、同一ブロードキャストドメインでストームが起きていると
 * 損失し、ARP解決失敗→通信不能となる(間接接続機器も影響を受ける)。
 * GARP(Gratuitous ARP): 自身のIP→MACを一斉通知。ARPキャッシュ更新・IP重複検知・
 * 冗長切替(VRRP/HA)時のMAC再学習に使われる。
 *
 * 動的ARPキャッシュ: App.arpCache[ownerId] = { ip: {mac, iface, ts} }
 */
/* ====== IP ADDRESS CONFLICT DETECTION ======
 * 同一サブネット(同一ブロードキャストドメイン)内に同一IPv4/IPv6が複数存在する場合は
 * アドレス競合(IP conflict)であり、宛先が一意に定まらず通信が破綻する。
 * FHRP/VRRP/HSRP の仮想IP(意図的に共有)とボンド/エイリアスは除外する。
 * 戻り値: { "ip": [ {kind,id,iface,label}, ... ], ... } 競合しているIPのみ
 */
function _fhrpVirtualIps(){
  const set = new Set();
  for(const d of (App.config.devices||[])){
    for(const i of (d.interfaces||[])){
      if(i.fhrp && i.fhrp.virtual_ip) set.add(ipOnly(i.fhrp.virtual_ip));
      if(i.vrrp && i.vrrp.virtual_ip) set.add(ipOnly(i.vrrp.virtual_ip));
    }
  }
  return set;
}
function detectIpConflicts(){
  const virt = _fhrpVirtualIps();
  // collect (ip -> owners) for physical interface IPs
  const map = {};
  const add = (ip, owner)=>{
    const t = ipOnly(ip); if(!t || virt.has(t)) return;
    (map[t] = map[t] || []).push(owner);
  };
  for(const s of (App.config.servers||[])){
    for(const i of (s.interfaces||[])){
      add(i.ip,   { kind:"server", id:s.id, iface:i.id, label:s.label||s.id, cidr:i.ip });
      add(i.ipv6, { kind:"server", id:s.id, iface:i.id, label:s.label||s.id, cidr:i.ipv6 });
    }
  }
  for(const d of (App.config.devices||[])){
    for(const i of (d.interfaces||[])){
      add(i.ip,   { kind:"device", id:d.id, iface:i.id, label:d.label||d.id, cidr:i.ip });
      add(i.ipv6, { kind:"device", id:d.id, iface:i.id, label:d.label||d.id, cidr:i.ipv6 });
    }
  }
  // a conflict requires the SAME subnet (same prefix). Group owners by subnet and only flag
  // groups with >=2 distinct owners in the same subnet.
  const conflicts = {};
  for(const ip in map){
    const owners = map[ip];
    if(owners.length < 2) continue;
    // distinct owners (same element/iface counted once)
    const seen = new Set(); const uniq = [];
    for(const o of owners){ const k=o.kind+":"+o.id+":"+o.iface; if(!seen.has(k)){ seen.add(k); uniq.push(o); } }
    // require >=2 distinct ELEMENTS (not just same element)
    const elems = new Set(uniq.map(o=>o.kind+":"+o.id));
    if(elems.size >= 2) conflicts[ip] = uniq;
  }
  return conflicts;
}
// Is this specific IP in conflict? returns the owners array or null
function ipConflictOwners(ip){
  const c = detectIpConflicts();
  return c[ipOnly(ip)] || null;
}
// ====== MAC ADDRESS CHECK ======
// Detect duplicate MAC addresses across interfaces (same MAC on 2+ distinct elements).
// Duplicate MACs in the same L2 domain cause MAC flapping and unreliable switching.
function detectMacConflicts(){
  const map = {};
  const add=(mac,owner)=>{ if(!mac) return; const m=normalizeMac(mac); (map[m]=map[m]||[]).push(owner); };
  for(const s of (App.config.servers||[])) for(const i of (s.interfaces||[])) add(i.mac,{kind:"server",id:s.id,iface:i.id,label:s.label||s.id});
  for(const d of (App.config.devices||[])) for(const i of (d.interfaces||[])) add(i.mac,{kind:"device",id:d.id,iface:i.id,label:d.label||d.id});
  const conflicts={};
  for(const m in map){
    const owners=map[m];
    const elems=new Set(owners.map(o=>o.kind+":"+o.id));
    if(owners.length>=2 && (elems.size>=2 || owners.length>=2)){
      // duplicate if same MAC appears on 2+ interfaces (even within one device it's invalid)
      if(owners.length>=2) conflicts[m]=owners;
    }
  }
  return conflicts;
}

function _arpOwnerId(kind,id){ return kind+":"+id; }
function arpLookup(kind, id, ip){
  const obj = Cfg.byId(kind==="device"?"devices":"servers", id);
  if(obj){
    for(const a of (obj.arp_static||[])){ if(ipOnly(a.ip)===ipOnly(ip)) return { mac:a.mac, static:true }; }
  }
  const c = (App.arpCache && App.arpCache[_arpOwnerId(kind,id)]) || {};
  if(c[ipOnly(ip)]) return c[ipOnly(ip)];
  return null;
}
function arpLearn(kind, id, ip, mac, iface){
  App.arpCache = App.arpCache || {};
  const k = _arpOwnerId(kind,id);
  App.arpCache[k] = App.arpCache[k] || {};
  App.arpCache[k][ipOnly(ip)] = { mac, iface, ts:Date.now() };
}
// Find which element owns a given IP (the ARP target), returning {kind,id,mac,iface}
function findIpOwner(ip){
  const t = ipOnly(ip);
  for(const s of (App.config.servers||[])){
    for(const i of (s.interfaces||[])){
      if(ipOnly(i.ip)===t || ipOnly(i.ipv6)===t) return { kind:"server", id:s.id, mac:i.mac, iface:i.id, obj:s };
    }
    if(s.bonding && (ipOnly(s.bonding.bond_ip)===t)) return { kind:"server", id:s.id, mac:(s.bonding.bond_mac||null), iface:s.bonding.bond_name||"bond0", obj:s };
  }
  for(const d of (App.config.devices||[])){
    for(const i of (d.interfaces||[])){
      if(ipOnly(i.ip)===t || ipOnly(i.ipv6)===t) return { kind:"device", id:d.id, mac:i.mac, iface:i.id, obj:d };
    }
  }
  return null;
}
// Highest storm/flap severity among switches in the L2 broadcast domain reachable from a host.
// Broadcast (ARP) is most sensitive to storms — this is how indirectly-connected hosts get hit.
function l2StormSeverityForHost(kind, id){
  // find the access switch the host attaches to
  let accessSw = null, accessVlanSet = new Set([1]);
  for(const c of (App.config.connections||[])){
    if(c.status==="down") continue;
    let me=null, peer=null;
    if(c.from && c.from[kind]===id){ me=c.from; peer=c.to; }
    else if(c.to && c.to[kind]===id){ me=c.to; peer=c.from; }
    else continue;
    if(peer && peer.device){
      const d = Cfg.byId("devices", peer.device);
      if(d && (d.type==="l2switch"||d.type==="l3switch")){ accessSw = d.id; break; }
    }
  }
  if(!accessSw){
    // host might itself be reached via a switch differently; fall back to global worst
    let worst=0; for(const sid in (App.macFlap||{})) worst=Math.max(worst, App.macFlap[sid].severity||0);
    return worst*0; // no L2 attachment found → not on a flapping domain
  }
  // BFS the broadcast domain from the access switch, take the worst severity present
  const dist = (typeof l2DomainDistances==="function") ? l2DomainDistances(accessSw, accessVlanSet) : {[accessSw]:0};
  let worst=0;
  for(const sid in dist){ const sev=(App.macFlap && App.macFlap[sid] && App.macFlap[sid].severity)||0; if(sev>worst) worst=sev; }
  return worst;
}
// Perform ARP resolution for targetIp from a source host. Returns {ok, mac, viaGw, log:[...]}.
// During an L2 broadcast storm, ARP (broadcast) is lost with probability ∝ severity.
function arpResolve(srcKind, srcObj, targetIp, logFn){
  const log = (m)=>{ if(logFn) logFn(m); };
  const owner = findIpOwner(targetIp);
  // cache hit?
  const cached = arpLookup(srcKind, srcObj.id, targetIp);
  const tgtMac = (owner && owner.mac) || (cached && cached.mac) || null;
  // broadcast storm impact on ARP (who-has is broadcast)
  const sev = l2StormSeverityForHost(srcKind, srcObj.id);
  // During an active broadcast storm the segment is flooded, so even cached/established L2
  // comms are disrupted — ARP (and its refresh) is lost with probability ∝ severity.
  if(sev > 0){
    const lossP = Math.min(0.95, sev/110);
    if(Math.random() < lossP){
      log(`ARP: who-has ${ipOnly(targetIp)}? (no reply — broadcast storm)`);
      return { ok:false, reason:`ARP解決失敗: ${ipOnly(targetIp)} (ブロードキャストストームによりARP応答消失 / 重大度${Math.round(sev)}%)`, log, stormSeverity:sev };
    }
  }
  if(!cached){
    log(`ARP: who-has ${ipOnly(targetIp)}? tell ${elementPrimaryIp(srcKind, srcObj.id,"v4")||srcObj.id}`);
    if(!owner && !tgtMac){
      log(`ARP: (宛先はGW/次ホップ経由で解決)`);
    } else {
      log(`ARP: ${ipOnly(targetIp)} is-at ${tgtMac||"(learned)"}`);
      if(owner && owner.mac) arpLearn(srcKind, srcObj.id, targetIp, owner.mac, owner.iface);
    }
  }
  return { ok:true, mac:tgtMac, stormSeverity:sev };
}
// Gratuitous ARP: host announces its own IP→MAC. Updates neighbors' ARP caches and detects
// IP duplication. Returns { conflict, conflictWith }.
function sendGarp(kind, id, ifaceId){
  const obj = Cfg.byId(kind==="device"?"devices":"servers", id);
  if(!obj) return { ok:false };
  const iface = (obj.interfaces||[]).find(i=>i.id===ifaceId) || (obj.interfaces||[])[0];
  if(!iface || !iface.ip){ toast("GARP送信不可: IP未設定", "warn"); return { ok:false }; }
  const ip = ipOnly(iface.ip), mac = iface.mac || "(unknown)";
  // IP duplication detection: any OTHER element with the same IP?
  let conflict = null;
  for(const s of (App.config.servers||[])){
    if(s.id===id && kind==="server") continue;
    for(const i of (s.interfaces||[])) if(ipOnly(i.ip)===ip){ conflict={kind:"server",id:s.id,mac:i.mac}; }
  }
  for(const d of (App.config.devices||[])){
    if(d.id===id && kind==="device") continue;
    for(const i of (d.interfaces||[])) if(ipOnly(i.ip)===ip){ conflict={kind:"device",id:d.id,mac:i.mac}; }
  }
  // update all other hosts' ARP caches with this IP→MAC (gratuitous announcement)
  let updated=0;
  for(const s of (App.config.servers||[])){ if(!(s.id===id&&kind==="server")){ arpLearn("server", s.id, ip, mac, null); updated++; } }
  for(const d of (App.config.devices||[])){ if(!(d.id===id&&kind==="device")){ arpLearn("device", d.id, ip, mac, null); updated++; } }
  if(typeof CommLog!=="undefined"){
    CommLog.info(`GARP送信: ${obj.label||id} が ${ip} is-at ${mac} を一斉通知 (近隣ARPキャッシュ ${updated}台更新)`);
    if(conflict){
      const co = Cfg.byId(conflict.kind==="device"?"devices":"servers", conflict.id);
      CommLog.blocked(`%IP-DUP: IPアドレス重複検知 ${ip} — ${obj.label||id}(${mac}) と ${(co&&co.label)||conflict.id}(${conflict.mac})`,
        "GARPにより重複を検出。両者の通信が不安定になります。");
    }
  }
  if(conflict) toast(`⚠ GARP: IP重複検知 ${ip}`, "warn");
  else toast(`GARP送信: ${ip} is-at ${mac}`, "ok");
  return { ok:true, conflict };
}

function computePath(srcKind, srcObj, destIp, proto, dstPort){
  const center = (o)=>({ x:(o.x||0)+(o.width||(o.interfaces?130:120))/2, y:(o.y||0)+(o.height||65)/2 });
  const path = [];
  const arpLog = [];
  App._lastArpLog = arpLog;

  // Refresh MAC-flapping / broadcast-storm state so the CURRENT condition (incl. storm
  // spillover to neighbor switches) is applied to THIS communication immediately — this is
  // how indirectly-connected hosts in the same L2 domain are affected, not just the looped switch.
  if(typeof updateMacFlapState === "function"){ try{ updateMacFlapState(); }catch(e){} }

  // ARP resolution (L2): before forwarding, the source resolves the destination's (or its
  // gateway's) MAC via ARP. ARP is broadcast → during a storm it is lost and resolution fails,
  // so even a host whose own switch isn't the loop origin loses connectivity.
  if(srcKind === "server" || srcKind === "device"){
    const ar = arpResolve(srcKind, srcObj, destIp, (m)=>arpLog.push(m));
    if(!ar.ok){
      return { ok:false, path, reason: ar.reason, blockedAt:{ kind:srcKind, id:srcObj.id }, arpLog, macFlap:true };
    }
  }

  // IP address conflict: if the destination IP is duplicated within the same subnet, the
  // destination is ambiguous (ARP replies from multiple hosts) and communication breaks.
  if(typeof ipConflictOwners === "function"){
    const dstConf = ipConflictOwners(destIp);
    if(dstConf && dstConf.length >= 2){
      const who = dstConf.map(o=>o.label).join(" / ");
      return { ok:false, path, reason:`IPアドレス競合: 宛先 ${ipOnly(destIp)} が複数ホストに重複 (${who})。宛先が一意に定まらず通信不能。`,
        blockedAt:{ kind:srcKind, id:srcObj.id }, ipConflict:true };
    }
    // also fail if the SOURCE's own primary IP is duplicated
    const srcIp0 = elementPrimaryIp(srcKind, srcObj.id, "v4") || elementPrimaryIp(srcKind, srcObj.id, "v6");
    const srcConf = srcIp0 && ipConflictOwners(srcIp0);
    if(srcConf && srcConf.length >= 2){
      const who = srcConf.map(o=>o.label).join(" / ");
      return { ok:false, path, reason:`IPアドレス競合: 送信元 ${ipOnly(srcIp0)} が重複 (${who})。応答が正しく返らず通信不安定。`,
        blockedAt:{ kind:srcKind, id:srcObj.id }, ipConflict:true };
    }
  }

  // AWS Direct Connect: if the DX link is down, on-prem ↔ AWS(EC2) connectivity is lost.
  if(App.config.aws && App.config.aws.direct_connect && App.config.aws.direct_connect.status === "down"){
    const dstOwner = (typeof findIpOwner==="function") ? findIpOwner(destIp) : null;
    const dstIsAws = dstOwner && dstOwner.obj && dstOwner.obj.aws;
    const srcIsAws = srcObj.aws;
    if(dstIsAws && !srcIsAws){
      return { ok:false, path, reason:"AWS Direct Connect 障害: オンプレミス↔AWS間の専用線がダウンしており、VPC内リソースに到達できません。",
        blockedAt:{ kind:srcKind, id:srcObj.id }, directConnect:true };
    }
  }

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
        const cause = (App.macFlap && App.macFlap[curObj.id] && App.macFlap[curObj.id].cause) || "loop";
        return { ok:false, path, reason:`${curObj.id}: MACフラッピングによりパケット破棄 (${macFlapStage(sev, cause)})`,
          blockedAt:{ kind:"device", id:curObj.id }, macFlap:true };
      }
    }
    // SFP/optics partial failure: a degraded transceiver causes CRC errors and intermittent
    // packet loss (a "half-broken" link that is up but flaky — common real-world fault).
    const degIf = (curObj.interfaces||[]).find(i=>i.sfp_degraded);
    if(degIf && Math.random() < 0.45){
      return { ok:false, path, reason:`${curObj.id}: SFP/光モジュール劣化により入力エラー(CRC)でフレーム破棄 — ${degIf.id} (リンクUPだが不安定)`,
        blockedAt:{ kind:cur.kind, id:curObj.id }, sfp:true };
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
        // AWS Security Group inbound check (if the server is assigned SGs)
        if(typeof awsSecurityGroupVerdict === "function"){
          const sgv = awsSecurityGroupVerdict(curObj, proto, dstPort, srcIp);
          if(!sgv.ok){
            return { ok:false, path, reason:`${curObj.id}: ${sgv.reason}`, blockedAt:{ kind:"server", id:curObj.id } };
          }
        }
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
        // AWS Security Group inbound check for AWS service devices (RDS/ALB/etc.)
        if(curObj.aws_kind && typeof awsSecurityGroupVerdict === "function"){
          const sgv = awsSecurityGroupVerdict(curObj, proto, dstPort, srcIp);
          if(!sgv.ok){
            return { ok:false, path, reason:`${curObj.id}: ${sgv.reason}`, blockedAt:{ kind:"device", id:curObj.id } };
          }
        }
        // AWS-specific engine effects
        if(curObj.aws_kind === "aws-s3" && curObj.aws_config){
          const cfg = curObj.aws_config;
          // bucket policy: if not public and source IP is not in allowed_cidrs → deny
          if(!cfg.public){
            const srcIp = (typeof elementPrimaryIp==="function")? elementPrimaryIp(srcKind, srcObj.id, "v4") : null;
            const allowed = (cfg.allowed_cidrs||[]).some(c=>srcIp && inSubnet(srcIp, c));
            if(!allowed){
              return { ok:false, path,
                reason:`S3バケット「${cfg.bucket_name||curObj.id}」: バケットポリシーで送信元 ${srcIp||"(不明)"} が許可されていません`,
                blockedAt:{ kind:"device", id:curObj.id }, s3Deny:true };
            }
          }
        }
        if(curObj.aws_kind === "aws-dx" && curObj.aws_config && curObj.aws_config.status === "down"){
          return { ok:false, path,
            reason:"Direct Connectがダウンしています",
            blockedAt:{ kind:"device", id:curObj.id }, directConnect:true };
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
        if(typeof awsSecurityGroupVerdict === "function"){
          const sgv = awsSecurityGroupVerdict(peerObj, proto, dstPort, srcIp);
          if(!sgv.ok){
            path.push({ kind:"server", id:peerObj.id, ...center(peerObj) });
            return { ok:false, path, reason:`${peerObj.id}: ${sgv.reason}`, blockedAt:{ kind:"server", id:peerObj.id } };
          }
        }
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
      // Peer is an AWS service device (RDS/ALB/etc.) — evaluate external_ports and SG
      if(next.peerKind === "device" && peerObj.external && Array.isArray(peerObj.external_ports) && dstPort != null){
        const portOk = peerObj.external_ports.some(p=>+p.port===+dstPort);
        path.push({ kind:"device", id:peerObj.id, ...center(peerObj) });
        if(!portOk){
          return { ok:false, path, reason:`${peerObj.id}: ポート ${proto}/${dstPort} は提供されていません`, blockedAt:{ kind:"device", id:peerObj.id } };
        }
        if(peerObj.aws_kind && typeof awsSecurityGroupVerdict === "function"){
          const sgv = awsSecurityGroupVerdict(peerObj, proto, dstPort, srcIp);
          if(!sgv.ok){
            return { ok:false, path, reason:`${peerObj.id}: ${sgv.reason}`, blockedAt:{ kind:"device", id:peerObj.id } };
          }
        }
        return { ok:true, path, portInfo:`${peerObj.fqdn||peerObj.id} ${proto}/${dstPort} OK` };
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
  { group:"AWS マネージドサービス", provider:"cloud", items:[
    { key:"aws-s3",        label:"Amazon S3",        fqdn:"s3.amazonaws.com",            ip:"52.216.0.10",  ports:[443] },
    { key:"aws-rds",       label:"Amazon RDS",       fqdn:"rds.amazonaws.com",           ip:"52.94.0.20",   ports:[3306,5432] },
    { key:"aws-dynamodb",  label:"DynamoDB",         fqdn:"dynamodb.amazonaws.com",      ip:"52.94.0.40",   ports:[443] },
    { key:"aws-cloudfront",label:"CloudFront (CDN)", fqdn:"cloudfront.net",              ip:"13.224.0.10",  ports:[443,80] },
    { key:"aws-sqs",       label:"SQS",              fqdn:"sqs.amazonaws.com",           ip:"52.94.0.60",   ports:[443] },
    { key:"aws-lambda",    label:"Lambda",           fqdn:"lambda.amazonaws.com",        ip:"52.94.0.70",   ports:[443] },
    { key:"aws-apigw",     label:"API Gateway",      fqdn:"execute-api.amazonaws.com",   ip:"52.94.0.80",   ports:[443] }
  ]},
  { group:"AWS ロードバランサ / コンテナ", provider:"cloud", items:[
    { key:"aws-alb",  label:"ALB (Application LB)", fqdn:"alb.elb.amazonaws.com",  ip:"52.20.0.10", ports:[80,443] },
    { key:"aws-nlb",  label:"NLB (Network LB)",     fqdn:"nlb.elb.amazonaws.com",  ip:"52.20.0.20", ports:[80,443,3306] },
    { key:"aws-ecs",  label:"ECS (コンテナ)",       fqdn:"ecs.amazonaws.com",      ip:"52.20.0.30", ports:[80,443,8080] },
    { key:"aws-eks",  label:"EKS (Kubernetes)",     fqdn:"eks.amazonaws.com",      ip:"52.20.0.40", ports:[443,6443] },
    { key:"aws-fargate", label:"Fargate",           fqdn:"fargate.amazonaws.com",  ip:"52.20.0.50", ports:[80,443] }
  ]},
  { group:"AWS ネットワーク / ゲートウェイ", provider:"cloud", items:[
    { key:"aws-igw",  label:"Internet Gateway (IGW)", fqdn:"igw.amazonaws.com",     ip:"0.0.0.0",   ports:[80,443] },
    { key:"aws-natgw",label:"NAT Gateway",            fqdn:"natgw.amazonaws.com",   ip:"52.30.0.10",ports:[80,443] },
    { key:"aws-vpce", label:"VPC Endpoint",           fqdn:"vpce.amazonaws.com",    ip:"10.0.0.250",ports:[443] },
    { key:"aws-dx",   label:"Direct Connect",         fqdn:"dx.amazonaws.com",      ip:"169.254.0.1",ports:[179] },
    { key:"aws-tgw",  label:"Transit Gateway",        fqdn:"tgw.amazonaws.com",     ip:"52.30.0.20",ports:[443] },
    { key:"aws-route53", label:"Route 53 (DNS)",      fqdn:"route53.amazonaws.com", ip:"52.94.0.90",ports:[53] }
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
    interfaces:[{ id:"public0", ip:item.ip+"/32", mac:genUniqueMac(), status:"up" }],
    external_ports: (item.ports||[]).map(p=>({ port:p, proto:"tcp" }))
  };
  // Tag AWS-specific kind so the property panel can show service-specific config
  if(item.key && item.key.indexOf("aws-")===0){
    dev.aws_kind = item.key;
    // Auto-create a default VPC if none exists, so any AWS service is shown in context
    App.config.aws = App.config.aws || {vpcs:[]};
    if(!App.config.aws.vpcs.length){
      App.config.aws.vpcs.push({
        id:"vpc-"+uid("v"), name:"default-vpc", cidr:"10.0.0.0/16",
        region:"ap-northeast-1", tenancy:"default",
        subnets:[{name:"default-subnet-a",cidr:"10.0.0.0/24",az:"ap-northeast-1a",public:true}],
        security_groups:[],
        route_tables:[{name:"main",routes:[{dest:"10.0.0.0/16",target:"local"}]}],
        igw:false
      });
      toast("VPC『default-vpc』を自動作成してそこに配置します","ok");
    }
    const firstVpc = App.config.aws.vpcs[0];
    dev.aws_region = (firstVpc && firstVpc.region) || "ap-northeast-1";
    // 全AWSサービスをVPCに紐付ける(可視性向上 — グローバル/リージョンサービスもVPC枠内に表示)
    dev.aws_vpc = firstVpc.name;
    // place inside the VPC frame
    const vpcMembers = (App.config.servers||[]).filter(s=>s.aws&&s.aws.vpc===dev.aws_vpc)
      .concat((App.config.devices||[]).filter(d=>d.aws_kind && d.aws_vpc===dev.aws_vpc && d.id!==dev.id));
    if(vpcMembers.length){
      const minX = Math.min(...vpcMembers.map(m=>m.x||0));
      const minY = Math.min(...vpcMembers.map(m=>m.y||0));
      const maxX = Math.max(...vpcMembers.map(m=>(m.x||0)+(m.width||130)));
      const maxY = Math.max(...vpcMembers.map(m=>(m.y||0)+(m.height||65)));
      dev.x = maxX + 30;
      dev.y = minY + (vpcMembers.length % 3) * 90;
      if(dev.x > minX + 600){ dev.x = minX + 40; dev.y = maxY + 30; }
    } else {
      dev.x = 220; dev.y = 220;
    }
    // Sensible defaults per AWS service type (honored by engine where applicable)
    if(item.key==="aws-s3")       dev.aws_config = { bucket_name:"my-bucket", region:"ap-northeast-1", public:false, allowed_cidrs:["10.0.0.0/8"], versioning:false, encryption:"SSE-S3" };
    if(item.key==="aws-igw")      dev.aws_config = { attached_vpc:"", route_table_assoc:[] };
    if(item.key==="aws-natgw")    dev.aws_config = { subnet:"", elastic_ip:"52.30.100.10", connectivity:"public" };
    if(item.key==="aws-vpce")     dev.aws_config = { endpoint_type:"interface", service:"com.amazonaws.s3", allowed_subnets:[] };
    if(item.key==="aws-dx")       dev.aws_config = { bandwidth_gbps:1, bgp_asn:65000, vlan:100, status:"up" };
    if(item.key==="aws-alb"||item.key==="aws-nlb"){
      dev.aws_config = { scheme:"internet-facing", listeners:[{port:443,proto:"HTTPS",target_group:"tg-web"}], target_group:{ name:"tg-web", port:8080, health_check:"/health", targets:[] } };
    }
    if(item.key==="aws-ecs")      dev.aws_config = { cluster_name:"ecs-cluster", task_definition:{ family:"web", containers:[{ name:"web", image:"nginx:latest", ports:[{ container:80, host:8080 }] }] }, launch_type:"FARGATE", desired_count:2 };
    if(item.key==="aws-eks")      dev.aws_config = { cluster_name:"eks-cluster", k8s_version:"1.29", node_group:{ name:"ng1", instance_type:"t3.medium", desired:3 }, fargate:false };
    if(item.key==="aws-route53")  dev.aws_config = { hosted_zones:[{ name:"example.com", records:[{ name:"app", type:"A", value:"203.0.113.10", ttl:300 }] }] };
    if(item.key==="aws-tgw")      dev.aws_config = { asn:64512, attachments:[], propagation:true };
    if(item.key==="aws-apigw")    dev.aws_config = { api_name:"my-api", stage:"prod", endpoints:[{ path:"/users", method:"GET", integration:"lambda" }] };
    if(item.key==="aws-lambda")   dev.aws_config = { function_name:"my-func", runtime:"nodejs20.x", memory_mb:128, timeout_sec:30, trigger:"apigw" };
    if(item.key==="aws-cloudfront") dev.aws_config = { distribution_id:"E123", origin_domain:"alb.elb.amazonaws.com", default_ttl:86400, ssl_cert:"acm-default" };
    if(item.key==="aws-rds")      dev.aws_config = { engine:"mysql", engine_version:"8.0", instance_class:"db.t3.micro", multi_az:false, port:3306, allocated_gb:20 };
    if(item.key==="aws-dynamodb") dev.aws_config = { table_name:"my-table", partition_key:"id", read_capacity:5, write_capacity:5, billing_mode:"PAY_PER_REQUEST" };
    if(item.key==="aws-sqs")      dev.aws_config = { queue_name:"my-queue", type:"standard", visibility_timeout:30, retention_days:4 };
  }
  App.config.devices.push(dev);
  selectElement("device", id);
  renderAndSync(); updateStatusBar();
  toast(`「${item.label}」を追加 — 右パネルで詳細設定できます`, "ok");
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
  openDialog("NW機器を追加 — 種別を選択", (body)=>{
    ch("p",{text:"追加するネットワーク機器の種別を選択してください。",style:{margin:"0 0 10px",fontSize:"12px",color:"var(--text-dim)"}},body);
    const grid=ch("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}},body);
    const items = (Array.isArray(DEVICE_TYPES) && DEVICE_TYPES.length ? DEVICE_TYPES : [
      {type:"router",icon:"🔀",label:"ルータ",desc:"L3ルーティング"},
      {type:"l3switch",icon:"⊟",label:"L3スイッチ",desc:"L3 + L2機能"},
      {type:"l2switch",icon:"⊟",label:"L2スイッチ",desc:"レイヤ2スイッチ"},
      {type:"firewall",icon:"🛡",label:"ファイアウォール",desc:"ステートフルFW"},
      {type:"loadbalancer",icon:"⚖",label:"ロードバランサ",desc:"L4/L7 LB"},
      {type:"waf",icon:"🛡",label:"WAF",desc:"アプリ層保護"}
    ]);
    for(const dt of items){
      const btn=ch("button",{style:{display:"flex",alignItems:"center",gap:"10px",padding:"10px",cursor:"pointer",
        background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",color:"var(--text)",textAlign:"left"}},grid);
      ch("span",{text:dt.icon||"⊟",style:{fontSize:"20px"}},btn);
      ch("div",{html:`<div style="font-weight:700">${escapeHtml(dt.label||dt.type)}</div><div style="font-size:10px;opacity:0.7">${escapeHtml(dt.desc||"")}</div>`},btn);
      btn.addEventListener("click",()=>{ closeDialog(); addNewDeviceOfType(dt.type); });
    }
    // 外部サービスカタログへのショートカット
    ch("div",{style:{borderTop:"1px solid var(--border)",margin:"10px 0 6px",paddingTop:"8px",fontSize:"11px",color:"var(--text-dim)"},text:"または外部サービス(AWS/SaaS)から追加:"},body);
    ch("button",{text:"☁ AWS/SaaS サービスカタログを開く...",
      style:{width:"100%",padding:"8px",cursor:"pointer",background:"var(--bg)",border:"1px solid var(--cyan)",color:"var(--cyan)",borderRadius:"5px",fontSize:"11px",fontWeight:"700"},
      on:{click:()=>{ closeDialog(); openExternalServiceCatalog(); }}},body);
    return { buttons:[{text:"キャンセル",action:closeDialog}] };
  });
}

function addNewServer(){
  // Let the user choose what kind of server/host to create
  openDialog("サーバ作成 — 種別を選択", (body)=>{
    ch("p",{text:"作成するサーバの種別を選択してください。",style:{margin:"0 0 10px",fontSize:"12px",color:"var(--text-dim)"}},body);
    const grid=ch("div",{style:{display:"grid",gridTemplateColumns:"1fr",gap:"8px"}},body);
    const opts=[
      { kind:"physical", icon:"🖳", title:"物理サーバ", desc:"通常のベアメタル/単体サーバ。" },
      { kind:"esxi",     icon:"⬡",  title:"ESXiホスト (仮想基盤)", desc:"VMをホストする仮想基盤。作成後VMを追加できます。" },
      { kind:"container",icon:"🐳", title:"コンテナホスト", desc:"Docker等のコンテナを動かすホスト。" }
    ];
    for(const o of opts){
      const btn=ch("button",{style:{display:"flex",alignItems:"center",gap:"10px",padding:"10px",cursor:"pointer",
        background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",color:"var(--text)",textAlign:"left"}},grid);
      ch("span",{text:o.icon,style:{fontSize:"20px"}},btn);
      ch("div",{html:`<div style="font-weight:700">${o.title}</div><div style="font-size:10px;opacity:0.7">${o.desc}</div>`},btn);
      btn.addEventListener("click",()=>{ closeDialog(); createServerOfKind(o.kind); });
    }
    return { buttons:[{text:"キャンセル",action:closeDialog}] };
  });
}
function _autoFreeIp(){
  // Pick an IP in the first network's subnet (or 10.0.0.0/24) that isn't already used.
  let baseCidr = (App.config.networks&&App.config.networks[0]&&App.config.networks[0].cidr) || "10.0.0.0/24";
  const m = String(baseCidr).match(/^(\d+)\.(\d+)\.(\d+)\.\d+(\/\d+)?/);
  const a=m?m[1]:"10", b=m?m[2]:"0", c=m?m[3]:"0", suf=(m&&m[4])||"/24";
  const used = new Set();
  for(const arr of [App.config.servers, App.config.devices]) for(const o of (arr||[])) for(const i of (o.interfaces||[])){ if(i.ip) used.add(ipOnly(i.ip)); }
  for(let h=10; h<255; h++){ const cand=`${a}.${b}.${c}.${h}`; if(!used.has(cand)) return cand+suf; }
  return `10.0.0.${Math.floor(Math.random()*200)+10}/24`;
}
function createServerOfKind(kind){
  pushUndo(); Cfg.ensure();
  const id = uid(kind==="esxi"?"esxi":(kind==="container"?"cnthost":"srv"));
  const base = {
    id, label: kind==="esxi"?"ESXi Host":(kind==="container"?"Container Host":"New Server"),
    type: kind==="esxi"?"hypervisor":(kind==="container"?"container":"server"),
    os: kind==="esxi"?"VMware ESXi":"Linux",
    cpu: kind==="esxi"?32:2, memory: kind==="esxi"?131072:4096, status:"running",
    x: App.view.x + 200, y: App.view.y + 200, width:130, height:65,
    interfaces:[{ id:"eth0", ip:_autoFreeIp(), network:"", mac: genUniqueMac(), speed:1000, port_type:"rj45", status:"up" }]
  };
  if(kind==="esxi"){ base.hypervisor = { type:"esxi", vms:[], vswitches:[{name:"vSwitch0",portgroups:["VM Network"]}], datastores:["datastore1:1TB"] }; }
  if(kind==="container"){ base.containers=[]; base.container_networks=[{name:"bridge0",driver:"bridge",subnet:"172.18.0.0/16"}]; }
  App.config.servers.push(base);
  // If a VPC or K8s cluster is currently selected, attach the new server to it (unified UI flow:
  // standard "サーバ追加" works in the cluster context without forcing the AWS/K8s manager).
  try{
    if(App.selected && App.selected.kind === "aws-vpc"){
      const vpc = (App.config.aws&&App.config.aws.vpcs||[]).find(v=>v.name===App.selected.id);
      if(vpc){
        const sn = (vpc.subnets&&vpc.subnets[0]&&vpc.subnets[0].name) || "";
        base.aws = { vpc:vpc.name, subnet:sn, security_groups:[] };
        toast(`新規サーバをVPC「${vpc.name}」に配置`,"ok");
      }
    } else if(App.selected && App.selected.kind === "k8s-cluster"){
      const cl = (App.config.k8s&&App.config.k8s.clusters||[]).find(c=>c.name===App.selected.id);
      if(cl){ cl.nodes = cl.nodes||[]; cl.nodes.push(base.id); toast(`新規サーバをクラスタ「${cl.name}」のノードとして追加`,"ok"); }
    }
  }catch(e){}
  selectElement("server", id);
  renderAndSync(); updateStatusBar();
  const lbl = kind==="esxi"?"ESXiホスト":(kind==="container"?"コンテナホスト":"物理サーバ");
  toast(lbl+"を追加: "+id, "ok");
  Log.info("サーバ追加("+lbl+"): "+id);
  if(kind==="esxi"){ setTimeout(()=>{ if(typeof showHypervisorManager==="function") showHypervisorManager(id); }, 50); }
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

/* ====== COPY / PASTE (Ctrl+C / Ctrl+V) — duplicate servers & devices ======
 * The clone gets a new unique id, an offset position, freshly generated MACs, and
 * de-duplicated IP addresses. Connections are NOT copied (the clone is standalone).
 */
function copySelectedElement(){
  if(!App.selected) return;
  const col = App.selected.kind === "server" ? "servers" : "devices";
  const obj = Cfg.byId(col, App.selected.id);
  if(!obj) return;
  App.clipboard = { kind: App.selected.kind, data: JSON.parse(JSON.stringify(obj)) };
  toast(`コピー: ${obj.label||obj.id}  (Ctrl+V で複製)`, "ok");
  Log.info(`コピー: ${App.selected.kind} ${obj.id}`);
}

// Collect every IPv4/IPv6 address currently in use across the config
function _allUsedIps(){
  const v4 = new Set(), v6 = new Set();
  const add = (s)=>{ if(!s) return; const ip = ipOnly(s); if(!ip) return; (ip.indexOf(":")>=0?v6:v4).add(ip); };
  for(const arr of [App.config.servers, App.config.devices]){
    for(const o of (arr||[])){
      for(const i of (o.interfaces||[])){ add(i.ip); add(i.ipv6); }
      if(o.bonding){ add(o.bonding.bond_ip); add(o.bonding.bond_ipv6); }
    }
  }
  return { v4, v6 };
}
// Return an unused IPv4 by incrementing the host octet; falls back across the last octet
function _nextFreeV4(cidr, used){
  const m = String(cidr).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)(\/\d+)?$/);
  if(!m) return cidr;
  let [a,b,c,d] = [+m[1],+m[2],+m[3],+m[4]];
  const suffix = m[5]||"";
  for(let tries=0; tries<254; tries++){
    d++; if(d>254){ d=1; c=(c+1)%256; }
    const cand = `${a}.${b}.${c}.${d}`;
    if(!used.v4.has(cand)){ used.v4.add(cand); return cand+suffix; }
  }
  return cidr;
}
function _nextFreeV6(cidr, used){
  const m = String(cidr).match(/^(.*?)([0-9a-fA-F]+)(\/\d+)?$/);
  if(!m) return cidr;
  let host = parseInt(m[2],16); const prefix=m[1], suffix=m[3]||"";
  for(let tries=0; tries<4096; tries++){
    host++;
    const cand = prefix + host.toString(16);
    if(!used.v6.has(cand)){ used.v6.add(cand); return cand+suffix; }
  }
  return cidr;
}
function pasteClipboardElement(){
  if(!App.clipboard) return;
  pushUndo(); Cfg.ensure();
  const { kind, data } = App.clipboard;
  const col = kind === "server" ? "servers" : "devices";
  const clone = JSON.parse(JSON.stringify(data));
  // new unique id + label
  const baseId = (data.id||"node").replace(/-copy\d*$/,"");
  clone.id = uid(baseId + "-copy");
  clone.label = (data.label||data.id) + " (copy)";
  clone.x = (data.x||0) + 40;
  clone.y = (data.y||0) + 40;
  // a pasted VM stays associated to the same host (still a standalone node)
  // regenerate MACs + de-duplicate IPs
  const used = _allUsedIps();
  for(const i of (clone.interfaces||[])){
    if("mac" in i || true) i.mac = genUniqueMac();
    if(i.ip)  i.ip  = _nextFreeV4(i.ip, used);
    if(i.ipv6) i.ipv6 = _nextFreeV6(i.ipv6, used);
  }
  if(clone.bonding){
    if(clone.bonding.bond_ip)   clone.bonding.bond_ip   = _nextFreeV4(clone.bonding.bond_ip, used);
    if(clone.bonding.bond_ipv6) clone.bonding.bond_ipv6 = _nextFreeV6(clone.bonding.bond_ipv6, used);
  }
  App.config[col].push(clone);
  // clone services attached to a server (so the duplicate keeps its services, with new ids)
  if(kind === "server"){
    const svcs = (App.config.services||[]).filter(s=>s.server===data.id);
    for(const s of svcs){
      const sc = JSON.parse(JSON.stringify(s));
      sc.id = uid((s.id||"svc")+"-copy");
      sc.server = clone.id;
      App.config.services.push(sc);
    }
  }
  selectElement(kind, clone.id);
  renderAndSync(); updateStatusBar();
  toast(`複製しました: ${clone.label}  (MAC/IPは自動で重複回避)`, "ok");
  Log.info(`ペースト複製: ${kind} ${clone.id}`);
}

/* ====== OJT 障害トレーニング・ラボ ======
 * 画面右に常時表示されるガイドパネルで、各障害の「症状・発生手順・原因解説・対処」を読みながら、
 * ボタンで実際に障害を発生(inject)・復旧(recover)させ、通信テストで挙動を確認できる。
 */
function _labFirst(kind, pred){
  const arr = kind==="device" ? App.config.devices : App.config.servers;
  for(const o of (arr||[])){ if(!pred || pred(o)) return o; }
  return null;
}
function _labSwitches(){ return (App.config.devices||[]).filter(d=>d.type==="l2switch"||d.type==="l3switch"); }
function _labRealServers(){ return (App.config.servers||[]).filter(s=>!s.vm); }
function _labSave(id, data){ App._labState = App._labState||{}; App._labState[id]=data; }
function _labGet(id){ return (App._labState||{})[id]; }

var FAULT_LABS = [
  { cat:"基礎を学ぶ(概念と手順)", id:"learn-l2switch", icon:"🔀", title:"L2スイッチとは？(基礎)",
    symptom:"スイッチ・VLAN・MACテーブルの役割を理解する。",
    steps:["1. ツールバー『機器追加』→ L2スイッチ を配置する。",
      "2. サーバを2台配置し、接続モードでスイッチの別ポートへそれぞれ接続する。",
      "3. 2台に同じサブネットのIP(例 10.0.0.1/24, 10.0.0.2/24)を設定する。",
      "4. 通信テストで2台が疎通することを確認する。"],
    explain:["L2スイッチ: MACアドレスを学習し、宛先MACのポートだけにフレームを転送するL2機器。",
      "同一サブネット内の端末同士はルータ無しで直接通信できる(同一ブロードキャストドメイン)。",
      "VLANで論理的にネットワークを分割できる(別VLANはL3で接続)。",
      "MACテーブル: どのMACがどのポートにいるかの対応表。右クリック→ARP/MAC確認。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-l3", icon:"🧭", title:"L3スイッチ/ルータとVLAN間ルーティング",
    symptom:"異なるサブネット間の通信にはL3(ルーティング)が必要。",
    steps:["1. L3スイッチ(またはルータ)を配置する。",
      "2. 2つの異なるサブネット(例 10.0.1.0/24 と 10.0.2.0/24)の端末を用意する。",
      "3. L3機器の各IFにそれぞれのサブネットのGW IPを設定する。",
      "4. 各端末のデフォルトGWをそのIPにし、通信テストでサブネット間疎通を確認する。"],
    explain:["L3スイッチ/ルータ: IPアドレスを見てサブネット間を中継(ルーティング)する機器。",
      "デフォルトゲートウェイ: 自分のサブネット外への出口となるルータIP。",
      "ルーティングテーブル: どの宛先ネットワークをどの方向へ送るかの表(右クリックで編集)。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-vpc", icon:"⛓", title:"vPC(仮想ポートチャネル)とは？設定手順",
    symptom:"2台のスイッチを論理的に1台に見せ、ループ無しで冗長化・帯域倍増する技術。",
    steps:["1. L2/L3スイッチを2台配置する(vPCピア)。",
      "2. 各スイッチを右クリック →『vPC設定』を開き、有効化して同じドメインIDを設定する。",
      "3. 2台間をピアリンクで接続する。",
      "4. 下位機器を両スイッチへ接続(vPCメンバーポート)し、ループ無しで冗長化されることを確認。"],
    explain:["vPC(Cisco)/MLAG: 2台のスイッチを1つの論理スイッチとして扱う技術。",
      "利点: STPでブロックされず両リンクを同時利用(帯域倍増)＋片系故障でも継続(冗長)。",
      "ピアリンク: 2台のvPCピア間を結ぶ重要なリンク(状態同期)。",
      "ピアキープアライブ: ピアの生存監視(ハートビート)。本ツールではvPC設定で表現。",
      "注意: 通常の2本接続をSTP無効で繋ぐとループになる。vPCはそれを安全に束ねる仕組み。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-heartbeat", icon:"💓", title:"スイッチ間ハートビート/キープアライブ",
    symptom:"冗長ペア(vPC/HA)はハートビートで相互生存監視する。",
    steps:["1. vPCまたは冗長ペアを構成する(上記vPC手順)。",
      "2. vPC設定内の『ピアキープアライブ』で監視を有効化する。",
      "3. 片系をダウンさせると、もう片方が単独動作に切り替わることを観察する。"],
    explain:["ハートビート: 一定間隔で相互に生存確認パケットを送り合う仕組み。",
      "途切れるとフェイルオーバ(片系へ切替)やスプリットブレイン防止動作が働く。",
      "vPC/HSRP/VRRP/スタック等で利用される。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-aws-svc", icon:"☁", title:"AWSサービス(S3等)の設定方法",
    symptom:"S3/ALB/IGW等のAWSサービスを配置して設定する手順。",
    steps:["1. 左の『☁ 外部サービス』ボタン → カタログから S3 / ALB / NLB / IGW / VPCエンドポイント等を選んで配置。",
      "2. 配置したノードを【クリックで選択】すると、画面右にそのサービス専用の設定パネルが開く。",
      "3. 例(S3): バケット名・リージョン・public/private・許可CIDR(バケットポリシー)・暗号化を設定。",
      "4. 接続モードで他の機器と線で繋ぐ。通信テストで疎通を確認。",
      "5. S3で『private』かつ許可CIDR外からアクセスすると、バケットポリシーで拒否される(エンジン再現)。"],
    explain:["AWSサービスは『☁外部サービス』から配置 → 右パネルで設定、が基本の流れです。",
      "S3: 許可CIDRに送信元が含まれないと拒否(バケットポリシー)。",
      "ALB/NLB: リスナとターゲットグループで振分け先のEC2を指定。",
      "IGW: VPCにアタッチしないとインターネットへ出られません。",
      "Direct Connect: statusをdownにするとオンプレ↔AWSが切断されます。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-migration", icon:"🚚", title:"マイグレーションの操作方法",
    symptom:"Pod/VMを別ノード・別ホストへ移動する操作と挙動。",
    steps:["【VM ライブマイグレーション(vMotion)】",
      "1. ESXi/vCenterホストを選択 → 右パネルの『🖥 仮想基盤を管理』を開く。",
      "2. VM行の『負荷』を 低/中/高 から選ぶ(メモリ書込負荷)。",
      "3. VM行の『🚚 ライブvMotion』を押すと、別ホストへpre-copy方式で移動。",
      "4. 通信ログでpre-copy反復・ダウンタイム・TCP継続・成否を確認。負荷『高』は収束せず失敗する。",
      "【Pod マイグレーション】",
      "5. K8sクラスタを選択 → 右パネルの『詳細管理』 → Pod行の『🔀 移動』で別ノードへ再スケジュール。",
      "【自動フェイルオーバ(HA)】",
      "6. ノード/ホストを右クリック→ステータスを『error』にすると、その上のPod/VMが健全な別ノードへ自動移動。"],
    explain:["ライブマイグレーション: メモリをpre-copyで反復転送し、最後に短時間停止(stop-and-copy)して移動先で再開。",
      "IP/MACを維持するため、既存のTCPセッションは数十msの瞬断を挟んで継続します。",
      "ダーティページ生成が転送帯域を超えるとpre-copyが収束せず失敗(負荷『高』で再現)。",
      "HA構成では、ノード障害時にPod/VMが自動的に健全なノードへフェイルオーバします。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-ha-failover", icon:"🔁", title:"冗長構成と自動フェイルオーバー",
    symptom:"単一障害点をどう減らすか。障害発生時に何が自動で起きるか。",
    steps:["【冗長構成の種類】",
      " ① ネットワーク冗長: スイッチ2台/ルータ2台/LACP/STP/VRRP-HSRP/ECMP",
      " ② サーバ冗長: Active-Standby / Active-Active (LB配下)",
      " ③ コンテナ冗長: K8s ReplicaSet (Pod複数台)、ノード障害でPod再スケジュール",
      " ④ VM冗長: vCenter HA (ホスト障害でVMが別ホストへ自動移動)",
      " ⑤ DB冗長: RDS Multi-AZ (Standby自動昇格), Read Replica",
      " ⑥ AZ冗長: 複数AZにまたがる配置で1AZ障害でも継続",
      "【自動対応の流れ】",
      " a. 監視(ヘルスチェック) → b. 異常検知 → c. 切離/切替 → d. 復旧確認 → e. 再投入",
      "【本シミュレータでの確認方法】",
      " 1. ツールバー右上の 🩺 をクリック → ヘルスダッシュボードを開く",
      " 2. 任意のノード/リンク/機器を右クリック → 障害発生(エラー)",
      " 3. ダッシュボードに『自動対応の履歴』が積まれる(K8s Pod, VM, ALBターゲット, RDS等)",
      " 4. 通信テストで代替経路の動作を確認",
      " 5. 復旧後、ダッシュボードの履歴で時系列に確認"],
    explain:["冗長構成は単一障害点(SPOF)をなくす設計手法。重要度に応じてどこまで冗長化するか決める。",
      "自動フェイルオーバは『検知 → 切替』の自動化。手動切替より速いが、誤検知(スプリットブレイン等)に注意。",
      "本シミュレータは以下を自動実行: Pod再スケジュール, VM HA移動, ALBターゲット切離, RDS Multi-AZ昇格。",
      "冗長スイッチ/リンクは通常のL2/L3配線で実現。一方がdownすると computePath が自動的に代替経路を選択する。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-incident-response", icon:"🚨", title:"障害検知 → 対応のIT運用フロー",
    symptom:"運用現場で障害が発生したとき、何をどの順序で見るか。",
    steps:["【1. 検知】監視システムからアラート (CloudWatch / Prometheus / Zabbix等)",
      "【2. 影響範囲特定】どのサービスが落ちたか、ユーザーへの影響度は",
      "【3. 切り分け】ネットワーク? サーバ? アプリ? DB? 順に切り分ける",
      "  → ping/traceroute/curl で疎通確認",
      "  → サーバのプロセス/CPU/メモリ確認 (top, ps)",
      "  → DBのクエリ滞留・接続数確認",
      "  → ログ(/var/log/, journalctl)を時系列で追う",
      "【4. 暫定対処】サービス再起動・トラフィック切替・スケールアウト",
      "【5. 復旧確認】再度通信テスト・監視メトリクス確認",
      "【6. 恒久対策】根本原因分析(RCA)・再発防止策・ポストモーテム",
      "【本シミュレータでの練習】",
      " - 学習タブから個別の障害ラボ(server-down, link-down, fw-block等)を選ぶ",
      " - 『障害を発生させる』→ 通信テスト失敗 → 『手動での直し方』に従う",
      " - 🩺 ダッシュボードで自動対応が走ったかも併せて確認"],
    explain:["障害対応は『焦らない・記録する・先に影響範囲確認』が原則。",
      "切り分けは『下位レイヤから上位』(物理→L2→L3→アプリ)が基本。",
      "本ツールには12種の障害ラボ + 自動対応エンジンが入っており、対応フローを反復練習できます。"],
    inject:null, recover:null },

  { cat:"基礎を学ぶ(概念と手順)", id:"learn-k8s-wiring", icon:"🔗", title:"コンテナ/Pod → ノード → スイッチ の構成方法",
    symptom:"Pod・コンテナのサービス/ポート/ネットワーク/配線をどこで設定するか。",
    steps:["【考え方】Pod/コンテナは『論理要素』でノード/ホスト上で動作。物理配線は『ノード/ホスト ↔ スイッチ』で行う。",
      "【1. 物理配線(線)】",
      " a. L2スイッチを配置する。",
      " b. ツールバー『接続』モード → WorkerノードのポートとスイッチのポートをクリックでLAN配線。",
      " c. (コンテナホストも同様にホスト↔スイッチを配線)",
      "【2. ネットワーク/IP】",
      " d. Workerノード(サーバ)を選択 → インターフェース表でIP/サブネットを設定。",
      " e. Podのネットワークは『Pod CIDR』、Serviceは『Service CIDR』(K8s管理/右パネルで設定)。",
      "【3. Pod のコンテナ・ポート】",
      " f. ☸K8s管理 → Pod行の『+コンテナ』でimageと公開ポート(例80,443)を設定。",
      "【4. サービス公開】",
      " g. 『+Service追加』でClusterIP/NodePort/LoadBalancerを作成し、ポートとselectorを設定。",
      " h. NodePortならノードの公開ポート、LoadBalancerなら外部IPで到達。",
      "【5. 確認】通信テストで [クライアント → スイッチ → ノード → Service/Pod] の疎通を確認。"],
    explain:["Pod/コンテナ自体には物理ケーブルは引きません(ノード/ホスト上で動くため)。",
      "物理的な線は『ノード/ホスト ↔ スイッチ』。これは接続モードで配線します。",
      "Podの公開はService(ClusterIP/NodePort/LoadBalancer)で行い、ポートはServiceとコンテナの両方で定義。",
      "コンテナホストの場合はコンテナのポートマッピング(ホスト:コンテナ)で公開します。"],
    inject:null, recover:null },

  { cat:"機器・ハードウェア障害", id:"server-down", icon:"🖥", title:"サーバ故障(ダウン)",
    symptom:"特定サーバへの通信が全て不可。経路途中ではなく宛先で停止。",
    steps:["1. 対象サーバを選び、プロパティでステータスを『error/stopped』にする(下のボタンでも可)。",
      "2. 別ホストからそのサーバへ通信テストを実行する。",
      "3. 『@サーバ名 is error』で失敗し、原因と対処が表示される。"],
    explain:["原因: サーバ本体のダウン(電源/OS/ハード故障)。",
      "切り分け: 同セグメントの他サーバは到達可→個別障害。GW/SW正常を確認。",
      "対処: サーバを復旧(起動)する。冗長構成ならLB/フェイルオーバで継続。"],
    fix_steps:["1. ダウンしたサーバを右クリック → ステータスを「running(起動)」に戻す。","2. または右パネルの「ステータス」を running に変更。","3. 通信テストで復旧を確認。"],
    inject:()=>{ const s=_labRealServers()[0]; if(!s){toast("サーバがありません","warn");return;} _labSave("server-down",{id:s.id,st:s.status}); s.status="error"; return s.label||s.id; },
    recover:()=>{ const v=_labGet("server-down"); if(v){ const s=Cfg.byId("servers",v.id); if(s)s.status=v.st||"running"; } } },

  { cat:"機器・ハードウェア障害", id:"switch-down", icon:"🔀", title:"スイッチ本体の故障",
    symptom:"そのスイッチ配下の全機器が通信不可。広範囲に影響。",
    steps:["1. 対象スイッチのステータスを『error』にする。",
      "2. 配下のサーバ同士/外部への通信テストを行う。",
      "3. スイッチ経由の経路が全滅することを確認。"],
    explain:["原因: スイッチの電源/筐体故障。",
      "切り分け: 配下の複数機器が同時に到達不可→集約機器(SW)を疑う。",
      "対処: スイッチ復旧。冗長(スタック/vPC/二重化)なら影響を局限化できる。"],
    fix_steps:["1. ダウンしたスイッチを右クリック → ステータスを「running」に。","2. 配下機器との通信テストで全体復旧を確認。"],
    inject:()=>{ const sw=_labSwitches()[0]; if(!sw){toast("スイッチがありません","warn");return;} _labSave("switch-down",{id:sw.id,st:sw.status}); sw.status="error"; return sw.label||sw.id; },
    recover:()=>{ const v=_labGet("switch-down"); if(v){ const d=Cfg.byId("devices",v.id); if(d)d.status=v.st||"running"; } } },

  { cat:"機器・ハードウェア障害", id:"link-down", icon:"🔌", title:"リンク/ポート障害(ケーブル断)",
    symptom:"特定リンク経由の通信のみ不可。迂回路があれば継続。",
    steps:["1. 対象リンク(接続)を down にする(下のボタン)。",
      "2. そのリンクを通る通信テストを実行。",
      "3. 迂回路の有無で結果が変わることを確認。"],
    explain:["原因: ケーブル断/ポート故障/コネクタ不良。",
      "切り分け: 片リンクのみ。冗長があれば自動迂回(STP/ルーティング再計算)。",
      "対処: ケーブル/ポート交換。リンク状態(up/down)とエラーカウンタを確認。"],
    fix_steps:["1. 切れたリンク(線)をクリックで選択 → 右パネルでステータスを「up」に。","2. または接続を引き直す。迂回路があるか図で確認。"],
    inject:()=>{ const c=(App.config.connections||[])[0]; if(!c){toast("接続がありません","warn");return;} _labSave("link-down",{id:c.id,st:c.status}); c.status="down"; return c.id; },
    recover:()=>{ const v=_labGet("link-down"); if(v){ const c=(App.config.connections||[]).find(x=>x.id===v.id); if(c)c.status=v.st||"up"; } } },

  { cat:"機器・ハードウェア障害", id:"sfp-degraded", icon:"📡", title:"SFP/光モジュールの中途半端な障害",
    symptom:"リンクはUPなのに通信が断続的に失敗。CRCエラー多発。最も切り分けが難しい障害の一つ。",
    steps:["1. 対象インターフェースを『SFP劣化』状態にする(下のボタン)。",
      "2. そのポートを通る通信テストを複数回実行する。",
      "3. 成功と失敗が混在(約45%失敗)し、CRCエラーで破棄されることを確認。"],
    explain:["原因: 光トランシーバ/ファイバの劣化、受光レベル低下、汚れ。リンクはUPのままなので気付きにくい。",
      "切り分け: input errors / CRC カウンタの増加、断続的なパケットロス。show interface で確認。",
      "対処: SFP・光ファイバの交換、清掃。受光レベルを測定する。"],
    fix_steps:["1. 該当スイッチを選択 → 右パネルのインターフェース表で対象ポートを確認。","2. 「SFP劣化」フラグを解除(=交換相当)。本ツールでは『復旧する』で解除。","3. 通信テストを複数回行い、CRC破棄が無くなったことを確認。"],
    inject:()=>{ const sw=_labSwitches().find(d=>(d.interfaces||[]).some(i=>i.status!=="down")); if(!sw){toast("対象がありません","warn");return;} const ifc=(sw.interfaces||[]).find(i=>i.status!=="down"); if(!ifc)return; _labSave("sfp-degraded",{id:sw.id,ifId:ifc.id}); ifc.sfp_degraded=true; return (sw.label||sw.id)+" / "+ifc.id; },
    recover:()=>{ const v=_labGet("sfp-degraded"); if(v){ const d=Cfg.byId("devices",v.id); const ifc=d&&(d.interfaces||[]).find(i=>i.id===v.ifId); if(ifc)delete ifc.sfp_degraded; } } },

  { cat:"L2/STP障害", id:"loop-flap", icon:"🔁", title:"L2ループ→MACフラッピング",
    symptom:"ネットワーク全体が徐々に異常化。CPU高騰、断続ロス、上部に異常バナー。",
    steps:["1. 2台のスイッチ間を2本のリンクで接続する。",
      "2. 両スイッチのSTPを『off』にする(下のボタンで自動構成)。",
      "3. 数秒待つと異常バナーが出現。バナーをクリックで詳細解説。"],
    explain:["原因: STP無効の冗長リンクでブロードキャストが無限ループ。",
      "影響: 同一L2ドメイン全体に波及し、間接接続機器も巻き込む。",
      "対処: STP有効化、片リンク削除、BPDU Guardでループポートをerr-disable。"],
    fix_steps:["1. ループしている2スイッチ間の片方のリンクを選択して削除する。","2. または両スイッチを選択 → 右パネルのSTPを「rstp」など有効に戻す。","3. さらにBPDU Guardを有効化するとループポートを自動遮断。","4. 上部の異常バナーが消え、CPUが下がることを確認。"],
    inject:()=>{ const sw=_labSwitches(); if(sw.length<2){toast("スイッチが2台必要です","warn");return;} const a=sw[0],b=sw[1];
      _labSave("loop-flap",{a:a.id,b:b.id,sa:(a.stp&&a.stp.mode),sb:(b.stp&&b.stp.mode),added:[]});
      a.stp=a.stp||{}; b.stp=b.stp||{}; a.stp.mode="off"; b.stp.mode="off";
      // ensure 2 links between a,b
      const pa1=(a.interfaces[0]||{}).id, pa2=(a.interfaces[1]||{}).id, pb1=(b.interfaces[0]||{}).id, pb2=(b.interfaces[1]||{}).id;
      const links=(App.config.connections||[]).filter(c=>{const x=c.from.device,y=c.to.device;return (x===a.id&&y===b.id)||(x===b.id&&y===a.id);});
      const v=_labGet("loop-flap");
      if(links.length<2 && pa1&&pa2&&pb1&&pb2){ const id1=uid("loopA"),id2=uid("loopB");
        App.config.connections.push({id:id1,from:{device:a.id,interface:pa1},to:{device:b.id,interface:pb1},status:"up"});
        App.config.connections.push({id:id2,from:{device:a.id,interface:pa2},to:{device:b.id,interface:pb2},status:"up"});
        v.added=[id1,id2]; }
      return (a.label||a.id)+" ⇄ "+(b.label||b.id); },
    recover:()=>{ const v=_labGet("loop-flap"); if(!v)return; const a=Cfg.byId("devices",v.a),b=Cfg.byId("devices",v.b);
      if(a){a.stp=a.stp||{};a.stp.mode=v.sa||"rstp";} if(b){b.stp=b.stp||{};b.stp.mode=v.sb||"rstp";}
      if(v.added&&v.added.length) App.config.connections=App.config.connections.filter(c=>!v.added.includes(c.id));
      App.macFlap={}; } },

  { cat:"L2/STP障害", id:"mac-dup", icon:"👯", title:"MACアドレス重複(ループ以外のフラッピング)",
    symptom:"ループが無いのにMACFLAPログ。特定MACが2ポート間で揺れる。",
    steps:["1. 同一スイッチ配下の2サーバに同じMACを設定する(下のボタン)。",
      "2. 数秒待ち、duplicate原因のフラッピングを確認。"],
    explain:["原因: 仮想NICのMACコピー/複製ミスで同一MACが同一VLANに二つ。",
      "対処: 一方のMACを一意な値に変更する。仮想環境ではMAC自動生成を有効に。"],
    fix_steps:["1. 重複MACのサーバ2台のうち片方を選択 → インターフェース表でMACを一意な値に変更。","2. (仮想環境想定なら)MAC自動生成に。","3. フラッピングが収まることを確認。"],
    inject:()=>{ const ss=_labRealServers(); if(ss.length<2){toast("サーバが2台必要","warn");return;}
      const m=(ss[0].interfaces[0]||{}).mac||"00:50:56:aa:bb:cc"; _labSave("mac-dup",{id:ss[1].id,ifId:(ss[1].interfaces[0]||{}).id,old:(ss[1].interfaces[0]||{}).mac});
      if(ss[1].interfaces[0]) ss[1].interfaces[0].mac=m; return (ss[0].label||ss[0].id)+" = "+(ss[1].label||ss[1].id); },
    recover:()=>{ const v=_labGet("mac-dup"); if(v){ const s=Cfg.byId("servers",v.id); const ifc=s&&(s.interfaces||[]).find(i=>i.id===v.ifId); if(ifc)ifc.mac=v.old||genUniqueMac(); } App.macFlap={}; } },

  { cat:"L2/STP障害", id:"stp-misconfig", icon:"👑", title:"STPルートブリッジの誤設定",
    symptom:"意図しないスイッチがルートになり、トラフィックが非最適経路に。",
    steps:["1. エッジ(末端)スイッチに最小プライオリティ(0)を設定する(下のボタン)。",
      "2. STP表示ボタンでルート位置を確認し、設計と異なることを観察。"],
    explain:["原因: bridge priority の設定ミス。最小ID(priority→MAC)がルートになる。",
      "対処: コア/分配スイッチに低いpriority、エッジは高めに。意図したルートを明示設定。"],
    fix_steps:["1. 本来ルートにしたいコア/分配スイッチを選択 → 右パネルのSTPでプライオリティを低く(例4096)。","2. エッジスイッチのプライオリティは高め(初期値32768)に戻す。","3. 「STP表示」ボタンで意図したスイッチが👑ルートか確認。"],
    inject:()=>{ const sw=_labSwitches(); if(!sw.length){toast("スイッチがありません","warn");return;} const edge=sw[sw.length-1]; _labSave("stp-misconfig",{id:edge.id,old:edge.stp_priority}); edge.stp_priority=0; return edge.label||edge.id; },
    recover:()=>{ const v=_labGet("stp-misconfig"); if(v){ const d=Cfg.byId("devices",v.id); if(d){ if(v.old==null)delete d.stp_priority; else d.stp_priority=v.old; } } } },

  { cat:"L3/到達性障害", id:"ip-dup", icon:"⚠️", title:"IPアドレス重複",
    symptom:"重複IB宛て通信がエラー。該当機器に⚠IP重複バッジ。",
    steps:["1. 同一サブネットの2サーバに同じIPを設定する(下のボタン)。",
      "2. その重複IP宛てに通信テスト→競合エラーを確認。"],
    explain:["原因: 同一サブネットに同一IPが二つ。ARPで宛先が一意に定まらない。",
      "対処: 一方を未使用IPに変更。DHCP予約の重複も確認。"],
    fix_steps:["1. ⚠IP重複バッジの付いた機器を選択 → インターフェース表でIPを未使用の値に変更。","2. ステータスバーのIP重複警告が消えることを確認。","3. 通信テストで疎通を確認。"],
    inject:()=>{ const ss=_labRealServers(); if(ss.length<2){toast("サーバが2台必要","warn");return;} const ip=(ss[0].interfaces[0]||{}).ip; if(!ip){toast("基準サーバにIPが必要","warn");return;} _labSave("ip-dup",{id:ss[1].id,ifId:(ss[1].interfaces[0]||{}).id,old:(ss[1].interfaces[0]||{}).ip}); if(ss[1].interfaces[0])ss[1].interfaces[0].ip=ip; return ip; },
    recover:()=>{ const v=_labGet("ip-dup"); if(v){ const s=Cfg.byId("servers",v.id); const ifc=s&&(s.interfaces||[]).find(i=>i.id===v.ifId); if(ifc)ifc.ip=v.old||""; } } },

  { cat:"L3/到達性障害", id:"fw-block", icon:"🛡", title:"ファイアウォール誤遮断",
    symptom:"特定の通信だけ拒否される。経路途中のFW/SWで停止。",
    steps:["1. 経路上のFW/SWに『全拒否』ルールを追加する(下のボタン)。",
      "2. 通信テスト→ポリシー拒否で失敗、原因と対処が表示。"],
    explain:["原因: ACL/FWポリシーの設定ミス、暗黙のdeny。",
      "対処: 必要な許可ルールを追加。ルールは上から評価、最後はdenyに注意。"],
    fix_steps:["1. 経路上のFW/スイッチを選択 → 右パネルの🛡ファイアウォールポリシーを開く。","2. 必要な通信を許可するルール(action=allow)を、暗黙のdenyより上に追加。","3. 通信テストで許可されたことを確認。"],
    inject:()=>{ const d=_labFirst("device",x=>x.type==="firewall")||_labSwitches()[0]; if(!d){toast("対象機器がありません","warn");return;} App.config.policies=App.config.policies||[]; const pol={device:d.id,rules:[{id:uid("r"),action:"deny",src:"any",dst:"any",protocol:"any",status:"active",log:true}],_lab:true}; _labSave("fw-block",{device:d.id}); App.config.policies.push(pol); return d.label||d.id; },
    recover:()=>{ const v=_labGet("fw-block"); if(v) App.config.policies=(App.config.policies||[]).filter(p=>!(p._lab&&p.device===v.device)); } },

  { cat:"AWS/クラウド障害", id:"dx-down", icon:"☁", title:"AWS Direct Connect 障害",
    symptom:"オンプレからAWS(EC2/VPC)へ到達不可。AWS内部は正常。",
    steps:["1. Direct Connectをダウンさせる(下のボタン)。",
      "2. オンプレのサーバからEC2へ通信テスト→専用線障害で失敗。"],
    explain:["原因: Direct Connect専用線/ルータの障害。",
      "対処: 回線復旧、冗長DXやVPNバックアップへ切替。BGP経路の確認。"],
    fix_steps:["1. Direct Connectノードを選択 → 右パネルでstatusを「up」に。","2. オンプレのサーバからEC2への通信テストで復旧を確認。"],
    inject:()=>{ App.config.aws=App.config.aws||{vpcs:[]}; App.config.aws.direct_connect=App.config.aws.direct_connect||{}; _labSave("dx-down",{old:App.config.aws.direct_connect.status}); App.config.aws.direct_connect.status="down"; App.config.aws.direct_connect.enabled=true; return "Direct Connect DOWN"; },
    recover:()=>{ if(App.config.aws&&App.config.aws.direct_connect){ App.config.aws.direct_connect.status="up"; } } },

  { cat:"AWS/クラウド障害", id:"sg-deny", icon:"🔒", title:"セキュリティグループ誤設定",
    symptom:"EC2への特定ポート通信が拒否される。",
    steps:["1. 対象VPCのSGインバウンド許可を削除する(下のボタン)。",
      "2. EC2の該当ポートへ通信テスト→SG拒否で失敗。"],
    explain:["原因: SGは許可リスト方式。許可が無い通信は全て拒否。",
      "対処: 必要なポート/送信元をSGインバウンドに追加。"],
    fix_steps:["1. ☁AWS管理 → 対象VPCのセキュリティグループを開く。","2. 必要なポート/送信元のインバウンド許可ルールを追加。","3. EC2への通信テストで許可されたことを確認。"],
    inject:()=>{ const vpc=(App.config.aws&&App.config.aws.vpcs||[])[0]; if(!vpc||!(vpc.security_groups||[]).length){toast("VPC/SGがありません","warn");return;} _labSave("sg-deny",{vpc:vpc.name,sg:JSON.parse(JSON.stringify(vpc.security_groups))}); for(const g of vpc.security_groups) g.inbound=[]; return vpc.name; },
    recover:()=>{ const v=_labGet("sg-deny"); if(v){ const vpc=(App.config.aws&&App.config.aws.vpcs||[]).find(x=>x.name===v.vpc); if(vpc)vpc.security_groups=v.sg; } } },

  { cat:"冗長性の確認", id:"lacp-member", icon:"🔗", title:"LACPメンバーリンク障害(冗長動作の確認)",
    symptom:"束ねたリンクの1本が断。LACP/ボンディングなら通信は継続(帯域低下)。",
    steps:["1. ボンディング設定済み機器のメンバー1本をdownにする(下のボタン)。",
      "2. 通信テスト→冗長により継続することを確認(degraded表示)。"],
    explain:["原因: 集約リンクの1本が物理障害。",
      "ポイント: LACP/active-backupなら残リンクで継続。全断で初めて不通。",
      "対処: 障害リンクを復旧して帯域・冗長を回復。"],
    fix_steps:["1. ダウンしたメンバーリンクのインターフェースを選択 → statusを「up」に戻す。","2. ボンディングが全帯域・冗長を回復したことを確認(縮退表示が消える)。"],
    inject:()=>{ const o=_labFirst("device",x=>x.bonding&&x.bonding.enabled)||_labFirst("server",x=>x.bonding&&x.bonding.enabled); if(!o){toast("ボンディング設定済みの機器がありません","warn");return;} const mem=(o.bonding.members||[])[0]; const ifc=(o.interfaces||[]).find(i=>i.id===mem); if(!ifc){toast("メンバーがありません","warn");return;} _labSave("lacp-member",{kind:o.interfaces?(o.type?"device":"server"):"server",id:o.id,ifId:ifc.id,old:ifc.status}); ifc.status="down"; return (o.label||o.id)+" / "+ifc.id; },
    recover:()=>{ const v=_labGet("lacp-member"); if(v){ const o=Cfg.byId("devices",v.id)||Cfg.byId("servers",v.id); const ifc=o&&(o.interfaces||[]).find(i=>i.id===v.ifId); if(ifc)ifc.status=v.old||"up"; } } }
];

function showLabPanel(openLabId){
  const panel=$("#lab-panel"); if(!panel) return;
  panel.classList.remove("hidden");
  const body=$("#lab-body");
  if(openLabId){ const lab=FAULT_LABS.find(l=>l.id===openLabId); if(lab){ renderLabDetail(lab); return; } }
  body.innerHTML="";
  ch("div",{style:{fontSize:"11px",color:"var(--text-dim)",lineHeight:"1.6",marginBottom:"6px"},
    text:"障害を選ぶと、症状・発生手順・原因・対処の解説が表示されます。『発生させる』で実際に障害を注入し、通信テストで挙動を観察、『復旧』で戻せます。"},body);
  const cats={};
  for(const lab of FAULT_LABS){ (cats[lab.cat]=cats[lab.cat]||[]).push(lab); }
  for(const cat in cats){
    ch("div",{class:"lab-cat",text:cat},body);
    for(const lab of cats[cat]){
      const item=ch("div",{class:"lab-item"},body);
      ch("span",{class:"li-ico",text:lab.icon},item);
      ch("span",{class:"li-t",text:lab.title},item);
      ch("span",{text:"›",style:{color:"var(--text-mute)"}},item);
      item.addEventListener("click",()=>renderLabDetail(lab));
    }
  }
}
function renderLabDetail(lab){
  const body=$("#lab-body"); if(!body) return;
  body.innerHTML="";
  const back=ch("button",{class:"lab-back",style:{padding:"4px 10px",fontSize:"11px",borderRadius:"4px",cursor:"pointer",marginBottom:"8px"},text:"← ラボ一覧"},body);
  back.addEventListener("click",()=>showLabPanel());
  const d=ch("div",{class:"lab-detail"},body);
  ch("h3",{text:lab.icon+" "+lab.title},d);
  ch("div",{class:"lab-sec",text:"症状"},d);
  ch("div",{class:"lab-line",text:lab.symptom},d);
  ch("div",{class:"lab-sec",text:"発生手順(OJT)"},d);
  for(const s of lab.steps) ch("div",{class:"lab-step",text:s},d);
  ch("div",{class:"lab-sec",text:"原因と対処"},d);
  for(const e of lab.explain) ch("div",{class:"lab-line",text:e},d);
  if(lab.fix_steps && lab.fix_steps.length){
    ch("div",{class:"lab-sec",text:"🔧 手動での直し方(操作手順)"},d);
    for(const s of lab.fix_steps) ch("div",{class:"lab-step",text:s},d);
    ch("div",{style:{fontSize:"10px",color:"var(--text-mute)",margin:"4px 0",lineHeight:"1.5"},
      text:"※『復旧する』ボタンは自動で直しますが、上の手順を自分で操作して直すのが学習になります。"},d);
  }
  const btns=ch("div",{class:"lab-btns"},d);
  if(lab.inject){
    ch("button",{class:"lab-inject",text:"⚠ この障害を発生させる",on:{click:()=>{
      pushUndo(); const tgt=lab.inject&&lab.inject(); renderAndSync(); updateStatusBar();
      if(tgt) toast(`障害を発生: ${lab.title}${tgt?(" — "+tgt):""}`,"warn");
    }}},btns);
    ch("button",{class:"lab-test",text:"🎯 通信テストで確認",title:"通信シミュレーションを開いて疎通確認",on:{click:()=>{ if(typeof openCommSimulator==="function") openCommSimulator(); }}},btns);
    ch("button",{class:"lab-recover",text:"✓ 復旧する",on:{click:()=>{
      pushUndo(); lab.recover&&lab.recover(); renderAndSync(); updateStatusBar(); toast(`復旧: ${lab.title}`,"ok");
    }}},btns);
    ch("div",{style:{fontSize:"10px",color:"var(--text-mute)",marginTop:"6px",lineHeight:"1.5"},
      text:"進め方: ① 障害を発生 → ② 通信テストで失敗を確認 → ③ 手動修正手順を試す → ④ 復旧する"},d);
  } else {
    ch("button",{class:"lab-test",text:"🎯 任意の2点で通信テストを実行",title:"通信シミュレーションを開く",on:{click:()=>{ if(typeof openCommSimulator==="function") openCommSimulator(); }}},btns);
    ch("div",{style:{fontSize:"10px",color:"var(--text-mute)",marginTop:"6px",lineHeight:"1.5"},
      text:"このラボは概念学習です。読了後、上の通信テストで実構成を試せます。"},d);
  }
}
function hideLabPanel(){ const p=$("#lab-panel"); if(p) p.classList.add("hidden"); }

function startConnectMode(){
  // Toggle: pressing the button again exits connect mode
  if(App.connectMode){ cancelConnectMode(); toast("接続モード終了", "ok"); return; }
  App.connectMode = { step:1, from:null };
  $("#svg").classList.add("connecting");
  const btn = $("#btn-add-connection"); if(btn) btn.classList.add("active");
  $("#status-msg").textContent = "接続モード: 始点インターフェースをクリック → 終点をクリック (連続配線可 / ESC または「接続」ボタンで終了)";
  toast("接続モード開始: インターフェース(ポート)を順にクリックで連続配線", "ok");
  Log.info("接続モード開始 (連続配線)");
  if(typeof updateModeIndicator==="function") updateModeIndicator();
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
// Automatic Pod/VM failover when their current node/host goes down — simulates HA behavior.
// ====== LIVE MIGRATION ENGINE ======
// Simulates a realistic vMotion / KVM live-migration: iterative pre-copy of memory pages where
// the working set keeps dirtying pages, a final stop-and-copy with a brief downtime, then
// resume on the target. TCP sessions survive because the VM keeps the same IP/MAC (the engine
// re-homes it to the target host while preserving identity). Models failure when the dirty-page
// rate outpaces the link bandwidth (pre-copy never converges).
var _liveMigrations = {};
function startLiveMigration(opts){
  const kind = opts.kind, id = opts.id, target = opts.target;
  const ram_mb = opts.ram_mb || (kind==="vm" ? ((Cfg.byId("servers",id)||{}).ram_gb||4)*1024 : 512);
  const link_mbps = opts.link_mbps || 10000;
  const page_kb = 4;
  const total_pages = Math.round(ram_mb*1024/page_kb);
  const dirty_pps = opts.dirty_rate_pps != null ? opts.dirty_rate_pps : (function(){
    const vm = kind==="vm" ? Cfg.byId("servers",id) : null;
    const wl = (vm && vm.workload) || "normal";
    const xp = Math.round((link_mbps*1000*1000/8)/(page_kb*1024));
    if(wl==="idle")   return Math.round(total_pages*0.01);
    if(wl==="heavy")  return Math.round(xp*1.2);
    return Math.round(total_pages*0.06);
  })();
  const xfer_pps = Math.round((link_mbps*1000*1000/8) / (page_kb*1024));
  const mig = {
    kind, id, target, orig:(kind==="vm"?(Cfg.byId("servers",id)||{}).host:null),
    ram_mb, link_mbps, total_pages, dirty_pps, xfer_pps,
    phase:"pre-copy", iteration:0, remaining:total_pages, transferred:0,
    downtime_ms:0, converged:false, failed:false, log:[]
  };
  let iterRemaining = total_pages;
  const maxIters = 30;
  for(let it=1; it<=maxIters; it++){
    const roundSeconds = iterRemaining / xfer_pps;
    mig.transferred += iterRemaining;
    const newDirty = Math.round(dirty_pps * roundSeconds);
    mig.iteration = it;
    mig.log.push({ iter:it, sent:iterRemaining, redirtied:newDirty, round_s:+roundSeconds.toFixed(2) });
    iterRemaining = newDirty;
    if(iterRemaining <= xfer_pps*0.5){ mig.converged = true; break; }
    if(dirty_pps >= xfer_pps){ mig.failed = true; break; }
  }
  mig.remaining = iterRemaining;
  if(mig.failed){
    mig.phase = "failed";
    mig.reason = "pre-copyが収束しません(ダーティページ生成率 ≥ 転送帯域)。帯域増強かワークロード低減が必要。";
  } else {
    mig.downtime_ms = Math.max(20, Math.round((iterRemaining / xfer_pps)*1000));
    mig.phase = "completed";
  }
  _liveMigrations[id] = mig;
  return mig;
}
function applyLiveMigration(mig){
  if(mig.failed) return false;
  if(mig.kind === "vm"){
    const vm = Cfg.byId("servers", mig.id); if(!vm) return false;
    const target = Cfg.byId("servers", mig.target); if(!target) return false;
    vm.host = mig.target;
    const w=target.width||130, h=target.height||65;
    vm.x = (target.x||0) + Math.round(w*0.15);
    vm.y = (target.y||0) + h + 10;
  } else if(mig.kind === "pod"){
    for(const cl of ((App.config.k8s&&App.config.k8s.clusters)||[])){
      const pod = (cl.pods||[]).find(p=>p.name===mig.id);
      if(pod){ pod.node = mig.target; break; }
    }
  }
  return true;
}
function runLiveMigration(kind, id, target, tcpSessions){
  const obj = kind==="vm" ? Cfg.byId("servers",id) : null;
  const name = obj ? (obj.label||obj.id) : id;
  const mig = startLiveMigration({ kind, id, target });
  CommLog.info(`🚚 ライブマイグレーション開始: ${name} → ${target} (RAM ${mig.ram_mb}MB, 移行NW ${(mig.link_mbps/1000)}Gbps)`);
  CommLog.info(`   フェーズ1: pre-copy (メモリページを反復コピー)`);
  for(const r of mig.log){
    CommLog.info(`   ・iteration ${r.iter}: ${r.sent.toLocaleString()}ページ送信, この間に${r.redirtied.toLocaleString()}ページ再ダーティ (${r.round_s}s)`);
  }
  if(mig.failed){
    CommLog.blocked(`ライブマイグレーション失敗: ${name}`, mig.reason);
    CommLog.info(`   💡 対処: 移行ネットワークの帯域を上げる / VMのメモリ書き込み負荷を下げる`);
    return mig;
  }
  CommLog.info(`   フェーズ2: stop-and-copy (VM一時停止 → 残り${mig.remaining.toLocaleString()}ページ転送)`);
  CommLog.info(`   ⏸ ダウンタイム: 約${mig.downtime_ms}ms (この間だけVMが瞬断)`);
  const sess = tcpSessions || (obj && obj._tcp_sessions) || 0;
  if(sess>0) CommLog.info(`   🔗 TCPセッション ${sess}本: IP/MAC維持により移行後も継続 (${mig.downtime_ms}msの瞬断のみ)`);
  else CommLog.info(`   🔗 IP/MAC維持 → 既存TCPセッションは${mig.downtime_ms}msの瞬断を挟んで継続`);
  applyLiveMigration(mig);
  CommLog.info(`   ✅ フェーズ3: ${mig.target}でVM再開。完了 (総転送 ${(mig.transferred*4/1024).toFixed(0)}MB相当 / ${mig.iteration}イテレーション)`);
  try{ syncYamlFromConfig(); render(); }catch(e){}
  return mig;
}
// Pods → reschedule to another healthy node in the same K8s cluster.
// VMs → vMotion to another healthy ESXi/hypervisor host (HA cluster behavior).
function checkAutoMigrations(){
  let moved = 0;
  const _logAuto = (type, what, from, to, detail)=>{
    App.autoActions = App.autoActions || [];
    App.autoActions.unshift({ ts: new Date().toLocaleTimeString(), type, what, from, to, detail });
    if(App.autoActions.length > 50) App.autoActions.pop();
  };
  // ---- K8s Pod failover ----
  for(const cl of ((App.config.k8s&&App.config.k8s.clusters)||[])){
    const healthyNodes = (cl.nodes||[]).filter(nid=>{
      const s = Cfg.byId("servers", nid);
      return s && s.status !== "error" && s.status !== "stopped";
    });
    for(const pod of (cl.pods||[])){
      if(!pod.node) continue;
      const cur = Cfg.byId("servers", pod.node);
      const curDown = !cur || cur.status === "error" || cur.status === "stopped";
      if(curDown && healthyNodes.length){
        const target = healthyNodes[moved % healthyNodes.length];
        if(target && target !== pod.node){
          const orig = pod.node; pod.node = target;
          CommLog.info(`🔀 K8s自動フェイルオーバ: Pod ${pod.name} を ${orig}(障害) → ${target} へ再スケジュール`);
          _logAuto("k8s-pod-failover", "Pod "+pod.name, orig, target, "ノード障害検知→別ノードへ再スケジュール");
          moved++;
        }
      }
    }
    if((cl.pods||[]).some(p=>p.node && !healthyNodes.includes(p.node)) && !healthyNodes.length){
      CommLog.info(`⚠ クラスタ ${cl.name}: 健全なノードが無くPodをスケジュールできません`);
    }
  }
  // ---- VM (vCenter HA) failover ----
  const hypervisors = (App.config.servers||[]).filter(s=>s.hypervisor);
  for(const vm of (App.config.servers||[])){
    if(!vm.vm || !vm.host) continue;
    const host = Cfg.byId("servers", vm.host);
    const hostDown = !host || host.status === "error" || host.status === "stopped";
    if(!hostDown) continue;
    const target = hypervisors.find(h => h.id !== vm.host && h.status === "running");
    if(target){
      const orig = vm.host; vm.host = target.id;
      const w=target.width||130, h=target.height||65;
      vm.x = (target.x||0) + Math.round(w*0.15) + (moved%2)*80;
      vm.y = (target.y||0) + h + 10 + Math.floor(moved/2)*46;
      CommLog.info(`🔀 vCenter HA: VM ${vm.label||vm.id} を ${orig}(障害) → ${target.id} へvMotion`);
      _logAuto("vm-ha-failover", "VM "+(vm.label||vm.id), orig, target.id, "ホスト障害検知→別ESXiへ自動移動");
      moved++;
    }
  }
  // ---- ALB/NLB target health management: unhealthy targets auto-removed from rotation ----
  for(const dev of (App.config.devices||[])){
    if(!(dev.aws_kind==="aws-alb"||dev.aws_kind==="aws-nlb")) continue;
    const tg = dev.aws_config && dev.aws_config.target_group;
    if(!tg || !tg.targets) continue;
    tg._activeTargets = tg._activeTargets || tg.targets.slice();
    tg._unhealthyTargets = tg._unhealthyTargets || [];
    // Re-evaluate each target's health
    for(const tid of tg.targets){
      const srv = Cfg.byId("servers", tid);
      const unhealthy = !srv || srv.status === "error" || srv.status === "stopped" ||
        !((srv.listen_ports||[]).some(p=>+p.port===+(tg.port||80)));
      const wasActive = tg._activeTargets.includes(tid);
      if(unhealthy && wasActive){
        tg._activeTargets = tg._activeTargets.filter(x=>x!==tid);
        if(!tg._unhealthyTargets.includes(tid)) tg._unhealthyTargets.push(tid);
        CommLog.info(`🔀 ${dev.label||dev.id}: ターゲット ${tid} を unhealthy として切り離し (ヘルスチェック失敗)`);
        _logAuto("lb-target-down", `ALB ${dev.label||dev.id}`, tid, "切離", "ヘルスチェック失敗→ターゲットグループから除外");
        moved++;
      } else if(!unhealthy && !wasActive){
        tg._activeTargets.push(tid);
        tg._unhealthyTargets = tg._unhealthyTargets.filter(x=>x!==tid);
        CommLog.info(`✓ ${dev.label||dev.id}: ターゲット ${tid} を復帰 (ヘルスチェック成功)`);
        _logAuto("lb-target-up", `ALB ${dev.label||dev.id}`, "切離", tid, "ヘルスチェック復旧→ターゲットグループに再登録");
        moved++;
      }
    }
  }
  // ---- RDS Multi-AZ auto-failover: primary down + multi_az=true → promote standby ----
  for(const dev of (App.config.devices||[])){
    if(dev.aws_kind!=="aws-rds") continue;
    if(!(dev.aws_config && dev.aws_config.multi_az)) continue;
    if(dev.aws_config.read_replica) continue; // Read Replica isn't a standby
    const primaryDown = dev.status === "error" || dev.status === "stopped";
    if(!primaryDown) continue;
    // Find a healthy standby — any RDS device with source_db===dev.id OR a sibling in same VPC with multi_az
    const standby = (App.config.devices||[]).find(d=>d.aws_kind==="aws-rds" && d.id!==dev.id && d.status==="running" && d.aws_vpc===dev.aws_vpc);
    if(standby && !dev._failedOver){
      // swap IPs: standby takes over primary's endpoint
      const primaryIp = (dev.interfaces && dev.interfaces[0] && dev.interfaces[0].ip);
      const standbyIp = (standby.interfaces && standby.interfaces[0] && standby.interfaces[0].ip);
      if(primaryIp && standbyIp){
        const savedPrimary = primaryIp;
        dev.interfaces[0].ip = standbyIp + ".old"; // primary becomes inactive
        standby.interfaces[0].ip = savedPrimary;   // standby promoted (gets primary's IP)
        dev._failedOver = true; standby._promoted = true;
        CommLog.info(`🔀 RDS Multi-AZ自動フェイルオーバ: ${dev.label||dev.id} (primary障害) → ${standby.label||standby.id} を昇格 (IP引継ぎ)`);
        _logAuto("rds-multi-az-failover", `RDS ${dev.label||dev.id}`, "Primary", standby.id, "Multi-AZ Standbyが自動昇格 (約2-3分相当)");
        moved++;
      }
    }
  }
  if(moved > 0){ try{ syncYamlFromConfig(); render(); updateHealthDashboard(); }catch(e){} }
  return moved;
}

// Update the System Health Dashboard panel
function updateHealthDashboard(){
  const el = document.querySelector("#health-dashboard");
  if(!el) return;
  const actions = (App.autoActions||[]).slice(0,5);
  // Count degraded components
  const degServers = (App.config.servers||[]).filter(s=>s.status==="error"||s.status==="stopped").length;
  const degDevices = (App.config.devices||[]).filter(d=>d.status==="error"||d.status==="stopped").length;
  const degLinks = (App.config.connections||[]).filter(c=>c.status==="down").length;
  const totalDeg = degServers + degDevices + degLinks;
  const status = totalDeg === 0 ? "🟢 正常" : (actions.length>0 ? "🔵 自動復旧中" : "🟠 障害発生");
  let html = `<div class="hd-head"><span class="hd-status">${status}</span><span class="hd-deg">${totalDeg>0?"⚠ "+totalDeg+"件の障害":"全機器健全"}</span></div>`;
  if(actions.length){
    html += `<div class="hd-title">🔄 自動対応の履歴 (新しい順)</div>`;
    html += `<div class="hd-actions">`;
    for(const a of actions){
      html += `<div class="hd-action"><span class="hd-ts">${a.ts}</span> <span class="hd-type">${a.type}</span><br/><span class="hd-detail">${a.what}: ${a.from} → ${a.to}<br/>${a.detail||""}</span></div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="hd-empty">自動対応の履歴はありません</div>`;
  }
  el.innerHTML = html;
}
function startMacFlapMonitor(){
  if(_macFlapTimer) clearInterval(_macFlapTimer);
  let prevActive = false;
  _macFlapTimer = setInterval(()=>{
    const report = updateMacFlapState();
    const affected = Object.keys(App.macFlap||{}).filter(id=>(App.macFlap[id].severity||0)>0);
    const active = affected.length > 0;
    if(active){
      logMacFlapSymptoms(report);
      updateNetHealthBanner(report);
      render(); // redraw to update flap badges/animation on origin AND storm-victim switches
    } else if(prevActive){
      CommLog.info("MACフラッピング/ブロードキャストストーム解消: L2ドメインが安定しました");
      updateNetHealthBanner([]);
      render();
    }
    prevActive = active;
    if(typeof updateStatusBar==="function") updateStatusBar();
    // Automatic Pod/VM failover (HA): if a node/host became down, reschedule its workloads
    try{ checkAutoMigrations(); }catch(e){}
  }, 2500);
}
// Show a prominent, escalating banner describing the gradual network degradation
function updateNetHealthBanner(report){
  const el = $("#nethealth-banner"); if(!el) return;
  const affected = Object.keys(App.macFlap||{}).filter(id=>(App.macFlap[id].severity||0)>0);
  if(!affected.length){ el.style.display="none"; return; }
  // worst = highest severity across ALL affected switches (origin + storm victims)
  let worst=0, worstId=null, victims=0;
  for(const id of affected){
    const st=App.macFlap[id];
    if(st.cause==="storm"||st.victim) victims++;
    if((st.severity||0)>worst){ worst=st.severity; worstId=id; }
  }
  const st = (App.macFlap && App.macFlap[worstId]) || {};
  const cause = st.cause || "loop";
  const stage = macFlapStage(worst, cause);
  const causeLbl = cause==="loop" ? "L2ループ" : cause==="duplicate" ? "MAC重複" : cause==="storm" ? "ストーム波及" : "無線ローミング";
  const color = cause==="roaming" ? "#3b82f6" : worst<25 ? "#eab308" : worst<50 ? "#f59e0b" : worst<75 ? "#ef4444" : "#b91c1c";
  const swLabel = (Cfg.byId("devices",worstId)||{}).label || worstId;
  const spread = (affected.length>1) ? ` ／ 影響範囲: ${affected.length}台のスイッチに波及中` : "";
  el.style.display="block";
  el.style.background=color;
  el.innerHTML = `⚠ ネットワーク異常進行中 — MACアドレスフラッピング (${escapeHtml(causeLbl)})${spread?'<span style="font-size:11px">'+escapeHtml(spread)+'</span>':''}<br>`
    + `<span style="font-size:11px;font-weight:600">最悪: ${escapeHtml(swLabel)} ／ 重大度 ${Math.round(worst)}% ／ CPU ${st.cpu||0}% ／ ${escapeHtml(stage)}</span>`
    + `<br><span style="font-size:10px;text-decoration:underline">📖 クリックで原因と対処の説明を開く</span>`;
  // make the banner clickable → open the matching learning topic
  el.style.pointerEvents = "auto";
  el.style.cursor = "pointer";
  const topicId = cause==="duplicate" ? "mac-dup" : "loop-flap";
  el.onclick = ()=>{ if(typeof showLabPanel==="function") showLabPanel(topicId); };
  el.style.opacity = "1";
  el.animate ? el.animate([{opacity:1},{opacity:0.55},{opacity:1}],{duration: Math.max(500,1400-worst*8), iterations:1}) : 0;
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
  bind("#btn-select","click", ()=>{
    App.selectMode = !App.selectMode;
    const b=$("#btn-select"); if(b) b.classList.toggle("active", App.selectMode);
    if(!App.selectMode){ App.multiSelect=[]; render(); }
    if(typeof updateModeIndicator==="function") updateModeIndicator();
    toast(App.selectMode?"複数選択モード: ドラッグで範囲選択 / Shift+クリックで追加":"複数選択モード解除", "ok");
  });
  bind("#btn-learn","click", ()=>showLabPanel());
  bind("#lab-close","click", hideLabPanel);

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
  bind("#btn-aws","click", showAwsManager);
  bind("#btn-aws-svc","click", openExternalServiceCatalog);
  bind("#btn-handson","click", showHandsOnIndex);
  bind("#btn-health-toggle","click", ()=>{ const p=document.querySelector("#health-dashboard"); if(!p) return; p.classList.toggle("hidden"); if(!p.classList.contains("hidden")) updateHealthDashboard(); });
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
  // Suppress the native browser context menu anywhere inside the canvas area so the tool's
  // own right-click menu always takes precedence (no competing browser menu).
  document.addEventListener("contextmenu", (e)=>{
    if(App._wireActive){ e.preventDefault(); e.stopPropagation(); return; }
    const wrap = $("#svg-wrap");
    if(wrap && wrap.contains(e.target)){ e.preventDefault(); }
  }, true);
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
      } else if(e.key === "c" || e.key === "C"){
        if(!isTyping && App.selected && (App.selected.kind==="server" || App.selected.kind==="device")){
          e.preventDefault(); copySelectedElement();
        }
      } else if(e.key === "v" || e.key === "V"){
        if(!isTyping && App.clipboard){
          e.preventDefault(); pasteClipboardElement();
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
      if(App.multiSelect && App.multiSelect.length){
        deleteMultiSelected();
      } else if(App.selected){
        deleteElement(App.selected.kind, App.selected.id);
      }
    } else if(e.key === "Escape"){
      if(!$("#dialog-overlay").classList.contains("hidden")) closeDialog();
      else if(App.connectMode) cancelConnectMode();
      else if(!$("#ctx-menu").classList.contains("hidden")) hideContextMenu();
      else { App.multiSelect=[]; App.selectMode=false; const b=$("#btn-select"); if(b)b.classList.remove("active"); if(typeof updateModeIndicator==="function") updateModeIndicator(); selectElement(null, null); }
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

