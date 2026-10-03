/**
 * 施設と、車・人と、施設の中の景色の SVG を、模型（src/city/generate/facilityModels.ts・agents.ts・interiors.ts）から作り直す。
 *   npx vite-node tools/build-facility-svgs.mts
 * 作った SVG は src/city/assets/facilities/<施設>/lv<N>.svg と src/screens/lesson/backdrops/<施設>.svg に置く（docs/visual-design.md 6.1）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FACILITY_DEFS } from '../src/city/facilities';
import { CAR_COLORS, carModel, PERSON_COLORS, personModel } from '../src/city/generate/agents';
import { facilityModel, MODELED_FACILITIES } from '../src/city/generate/facilityModels';
import { INTERIOR_FACILITIES, interiorModel } from '../src/city/generate/interiors';
import { meshModel } from '../src/city/generate/mesh';
import { drawingToSvg, singleViewSvg } from '../src/city/generate/svg';

const today = process.env.SVG_CREATED ?? new Date().toISOString().slice(0, 10);

/** 中身が変わらないファイルは、前の作成日のまま書く（変わった物だけ今日の日付） */
function createdFor(file: string, make: (created: string) => string): string {
  if (existsSync(file)) {
    const old = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const date = /作成日 (\d{4}-\d{2}-\d{2})/.exec(old)?.[1];
    if (date && make(date) === old) return old;
  }
  return make(today);
}

// 分野の施設は Lv1〜Lv5、公園の類は 1 枚（docs/visual-design.md 6.1）
for (const type of MODELED_FACILITIES) {
  const levels = FACILITY_DEFS[type].group === 'facility' ? [1, 2, 3, 4, 5] : [1];
  for (const level of levels) {
    const model = facilityModel(type, level);
    if (!model) continue;
    const dir = `src/city/assets/facilities/${type}`;
    const file = `${dir}/lv${String(level)}.svg`;
    const svg = createdFor(file, (created) => drawingToSvg(meshModel(model, 0), meshModel(model, 2), `${FACILITY_DEFS[type].name} Lv${String(level)}`, created));
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, svg);
    console.log(`${file} ${String(Math.round(svg.length / 102.4) / 10)}KB`);
  }
}

// 車 5 色・人 4 種（docs/visual-design.md 6.1）
const agents = 'src/city/assets/agents';
mkdirSync(agents, { recursive: true });
const write = (file: string, make: (created: string) => string): void => {
  const svg = createdFor(`${agents}/${file}`, make);
  writeFileSync(`${agents}/${file}`, svg);
  console.log(`${agents}/${file} ${String(Math.round(svg.length / 102.4) / 10)}KB`);
};
CAR_COLORS.forEach((_, i) => {
  const model = carModel(i);
  write(`car-${String(i + 1)}.svg`, (created) => drawingToSvg(meshModel(model, 0), meshModel(model, 2), `車 ${String(i + 1)}`, created, 'src/city/generate/agents.ts'));
});
PERSON_COLORS.forEach((_, i) => {
  const model = personModel(i);
  write(`person-${String(i + 1)}.svg`, (created) => drawingToSvg(meshModel(model, 0), meshModel(model, 2), `人 ${String(i + 1)}`, created, 'src/city/generate/agents.ts'));
});

// 施設の中の景色（レッスン画面の背景。15 枚。docs/visual-design.md 6.1）
const backdrops = 'src/screens/lesson/backdrops';
mkdirSync(backdrops, { recursive: true });
for (const type of INTERIOR_FACILITIES) {
  const model = interiorModel(type);
  if (!model) continue;
  const svg = createdFor(`${backdrops}/${type}.svg`, (created) => singleViewSvg(meshModel(model, 0), `${FACILITY_DEFS[type].name}の中`, created, 'src/city/generate/interiors.ts'));
  writeFileSync(`${backdrops}/${type}.svg`, svg);
  console.log(`${backdrops}/${type}.svg ${String(Math.round(svg.length / 102.4) / 10)}KB`);
}
