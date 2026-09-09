import { describe, expect, it } from 'vitest';
import {
  addDevice, addLink, addRoute, delRoute, emptyTopology, macFor, removeDevice, removeLink,
  setAddress, setInterfaceUp, setLinkUp, setMtu, setVlan,
} from './build';
import type { Topology } from './types';

function twoHosts(): Topology {
  let t = emptyTopology();
  t = addDevice(t, 'host', 'pc1').topology;
  t = addDevice(t, 'host', 'pc2').topology;
  t = addLink(t, 'pc1:eth0', 'pc2:eth0').topology;
  t = setAddress(t, 'pc1', 'eth0', '10.0.0.1/24').topology;
  t = setAddress(t, 'pc2', 'eth0', '10.0.0.2/24').topology;
  return t;
}

describe('機器を用意する', () => {
  it('同じ名前は二度作れない', () => {
    const once = addDevice(emptyTopology(), 'host', 'pc1');
    expect(once.error).toBeNull();
    expect(addDevice(once.topology, 'host', 'pc1').error).toContain('File exists');
  });

  it('片付けるとケーブルも一緒に外れる', () => {
    const after = removeDevice(twoHosts(), 'pc2');
    expect(after.error).toBeNull();
    expect(after.topology.devices.has('pc2')).toBe(false);
    expect(after.topology.links).toEqual([]);
  });
});

describe('ケーブル', () => {
  it('繋ぐと、まだ無い口が両側にできる', () => {
    let t = addDevice(emptyTopology(), 'host', 'pc1').topology;
    t = addDevice(t, 'switch', 'sw1').topology;
    const after = addLink(t, 'pc1:eth0', 'sw1:p1');
    expect(after.error).toBeNull();
    expect(after.topology.devices.get('pc1')?.interfaces.map((i) => i.name)).toEqual(['eth0']);
    expect(after.topology.devices.get('sw1')?.interfaces.map((i) => i.name)).toEqual(['p1']);
  });

  it('無い機器には繋げない', () => {
    const t = addDevice(emptyTopology(), 'host', 'pc1').topology;
    expect(addLink(t, 'pc1:eth0', 'nope:eth0').error).toContain('Cannot find device "nope"');
  });

  it('同じ組は二度繋げない', () => {
    expect(addLink(twoHosts(), 'pc1:eth0', 'pc2:eth0').error).toContain('既に繋がっています');
    expect(addLink(twoHosts(), 'pc2:eth0', 'pc1:eth0').error).toContain('既に繋がっています');
  });

  it('抜き差しできる', () => {
    const down = setLinkUp(twoHosts(), 'pc1:eth0', 'pc2:eth0', false);
    expect(down.topology.links[0]?.up).toBe(false);
    const up = setLinkUp(down.topology, 'pc2:eth0', 'pc1:eth0', true);
    expect(up.topology.links[0]?.up).toBe(true);
  });

  it('外したケーブルはもう無い', () => {
    const after = removeLink(twoHosts(), 'pc1:eth0', 'pc2:eth0');
    expect(after.topology.links).toEqual([]);
    expect(removeLink(after.topology, 'pc1:eth0', 'pc2:eth0').error).not.toBeNull();
  });
});

describe('MAC', () => {
  it('機器と口の名前から決まるので、作る順番に依らない', () => {
    expect(macFor('pc1', 'eth0')).toBe(macFor('pc1', 'eth0'));
    expect(macFor('pc1', 'eth0')).not.toBe(macFor('pc2', 'eth0'));
    expect(macFor('pc1', 'eth0')).toMatch(/^02(:[0-9a-f]{2}){5}$/);
  });
});

describe('アドレス', () => {
  it('付けると口にアドレスが載る', () => {
    let t = addDevice(emptyTopology(), 'host', 'pc1').topology;
    t = addLink(t, 'pc1:eth0', 'pc1:eth1').topology;
    expect(t.devices.get('pc1')?.interfaces[0]?.ip).toBe('0.0.0.0');
    const after = setAddress(t, 'pc1', 'eth0', '192.168.1.10/24');
    expect(after.error).toBeNull();
    const eth0 = after.topology.devices.get('pc1')?.interfaces[0];
    expect(eth0?.ip).toBe('192.168.1.10');
    expect(eth0?.prefix).toBe(24);
    expect(eth0?.up).toBe(true);
  });

  it('落としていた口はアドレスを付け直すと上がる', () => {
    const down = setInterfaceUp(twoHosts(), 'pc1', 'eth0', false);
    expect(down.topology.devices.get('pc1')?.interfaces[0]?.up).toBe(false);
    const up = setAddress(down.topology, 'pc1', 'eth0', '10.0.0.1/24');
    expect(up.topology.devices.get('pc1')?.interfaces[0]?.up).toBe(true);
  });

  it('CIDR でなければ本物と同じ文句を言う', () => {
    expect(setAddress(twoHosts(), 'pc1', 'eth0', '10.0.0.1').error).toContain('any valid prefix');
  });

  it('無い口には付けられない', () => {
    expect(setAddress(twoHosts(), 'pc1', 'eth9', '10.0.0.1/24').error).toContain('Cannot find device "eth9"');
  });

  it('落とすと通らなくなる', () => {
    const after = setInterfaceUp(twoHosts(), 'pc1', 'eth0', false);
    expect(after.topology.devices.get('pc1')?.interfaces[0]?.up).toBe(false);
  });
});

describe('MTU', () => {
  it('小さいほうがケーブルの MTU になる', () => {
    const after = setMtu(twoHosts(), 'pc1', 'eth0', 1400);
    expect(after.error).toBeNull();
    expect(after.topology.links[0]?.mtu).toBe(1400);
  });

  it('68 未満は断る', () => {
    expect(setMtu(twoHosts(), 'pc1', 'eth0', 40).error).toContain('68');
  });
});

describe('経路', () => {
  it('足せる・消せる', () => {
    const route = { destination: '10.1.0.0/16', via: '10.0.0.2', dev: 'eth0' };
    const added = addRoute(twoHosts(), 'pc1', route);
    expect(added.error).toBeNull();
    expect(added.topology.devices.get('pc1')?.routes).toEqual([route]);
    expect(delRoute(added.topology, 'pc1', route).topology.devices.get('pc1')?.routes).toEqual([]);
  });

  it('同じ宛先は二度足せない', () => {
    const route = { destination: '10.1.0.0/16', via: '10.0.0.2', dev: 'eth0' };
    const once = addRoute(twoHosts(), 'pc1', route).topology;
    expect(addRoute(once, 'pc1', route).error).toContain('File exists');
  });

  it('無い口を出口にはできない', () => {
    expect(
      addRoute(twoHosts(), 'pc1', { destination: '10.1.0.0/16', via: null, dev: 'eth9' }).error,
    ).toContain('Cannot find device "eth9"');
  });

  it('無い経路は消せない', () => {
    expect(
      delRoute(twoHosts(), 'pc1', { destination: '10.9.0.0/16', via: null, dev: 'eth0' }).error,
    ).toContain('No such process');
  });
});

describe('VLAN', () => {
  it('アクセスポートとトランクポートを分けられる', () => {
    let t = addDevice(emptyTopology(), 'switch', 'sw1').topology;
    t = addLink(t, 'sw1:p1', 'sw1:p2').topology;
    const access = setVlan(t, 'sw1', 'p1', 10);
    expect(access.topology.devices.get('sw1')?.interfaces[0]?.vlan).toBe(10);
    const trunk = setVlan(access.topology, 'sw1', 'p2', null, [10, 20]);
    expect(trunk.topology.devices.get('sw1')?.interfaces[1]?.trunkVlans).toEqual([10, 20]);
  });
});
