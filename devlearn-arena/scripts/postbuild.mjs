// ビルド後処理。
//
// 注意: GitHub Pages が配信する 404.html は「サイトルートの1枚だけ」で、
// サブフォルダ（/<repo>/<project>/404.html）は使われない。
// Swallow 構成での実際のフォールバックは deploy.yml が生成するルートの 404.html が担う。
// ここで作る dist/404.html は、ローカル preview と、このアプリを単独リポジトリで
// 公開した場合のためのもの。
import { copyFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
await access(join(dist, 'index.html'));
await copyFile(join(dist, 'index.html'), join(dist, '404.html'));
await writeFile(join(dist, '.nojekyll'), '');
console.log('[postbuild] wrote dist/404.html and dist/.nojekyll');
