#!/usr/bin/env node
// i18n 커버리지 점검: 코드에서 쓰는 T("한국어") 중 src/lib/i18n.ts TX에 일본어가 없는 것을 찾는다.
// 병기 라벨(문자열에 이미 일본어(かな/카나/한자)가 포함된 것)은 정상으로 간주해 제외.
// 사용: node scripts/i18n-audit.mjs   (미번역이 있으면 목록 출력 + exit 1)
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const i18n = fs.readFileSync(path.join(root, "src/lib/i18n.ts"), "utf8");
const keys = new Set();
const body = i18n.slice(i18n.indexOf("export const TX"));
const re = /"((?:[^"\\]|\\.)*)"\s*:\s*"/g;
let m;
while ((m = re.exec(body))) keys.add(m[1].replace(/\\"/g, '"'));

function walk(d) {
  let out = [];
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) out = out.concat(walk(p));
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}
// /pr/[token]은 자체 DICT(ko/ja) 사용 → 제외. i18n.ts 자신도 제외.
const files = walk(path.join(root, "src")).filter((f) => !f.includes("pr/[token]") && !f.endsWith("i18n.ts"));
const hasKo = (s) => /[가-힣]/.test(s);
const hasJa = (s) => /[ぁ-んァ-ヶ一-龠]/.test(s);
const callRe = /\bT\(\s*"((?:[^"\\]|\\.)*)"/g;
const missing = new Map();
for (const f of files) {
  const c = fs.readFileSync(f, "utf8");
  let mm;
  while ((mm = callRe.exec(c))) {
    const k = mm[1].replace(/\\"/g, '"');
    if (hasKo(k) && !hasJa(k) && !keys.has(k)) {
      if (!missing.has(k)) missing.set(k, new Set());
      missing.get(k).add(path.relative(root, f));
    }
  }
}
console.log(`TX 키: ${keys.size} · 미번역(순수 한국어): ${missing.size}`);
for (const [k, fset] of missing) console.log(`  ✗ ${JSON.stringify(k)}  [${[...fset].join(", ")}]`);
process.exit(missing.size ? 1 : 0);
