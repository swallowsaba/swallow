/**
 * ネットワークの任務で使う初期データ。
 * シェル変数として渡すので、JSON 文字列のまま持つ。
 */
export const DNS_WORLD = JSON.stringify({
  now: 0,
  cache: [],
  zones: [
    {
      origin: '.',
      server: 'a.root-servers.net',
      records: [{ name: 'com.', type: 'NS', value: 'a.gtld-servers.net', ttl: 172800 }],
    },
    {
      origin: 'com.',
      server: 'a.gtld-servers.net',
      records: [{ name: 'example.com.', type: 'NS', value: 'ns1.example.com', ttl: 172800 }],
    },
    {
      origin: 'example.com.',
      server: 'ns1.example.com',
      records: [
        { name: 'www.example.com.', type: 'A', value: '203.0.113.10', ttl: 30 },
        { name: 'shop.example.com.', type: 'CNAME', value: 'www.example.com.', ttl: 30 },
      ],
    },
  ],
});
