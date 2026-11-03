// 日本語のフォントを作る: node tools/font.mjs
// art/k8x12L.bdf（k8x12。8x12 ドット、自由に使えるライセンス。art/k8x12-readme.txt）から、
// src/ の .js に出てくる文字だけを取り出して src/font.js に書く。画面の文を足したら、もう一度動かす（npm run dev 中は自動）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const bdf = readFileSync(new URL('../art/k8x12L.bdf', import.meta.url), 'utf8').split('\n')
const ASCENT = 10
const glyphs = new Map()
for (let i = 0; i < bdf.length; i++) {
  if (!bdf[i].startsWith('STARTCHAR')) continue
  let code = 0, dw = 8, bbx = [8, 12, 0, -2]
  let j = i + 1
  for (; !bdf[j].startsWith('BITMAP'); j++) {
    const [k, ...v] = bdf[j].trim().split(/\s+/)
    if (k === 'ENCODING') code = Number(v[0])
    if (k === 'DWIDTH') dw = Number(v[0])
    if (k === 'BBX') bbx = v.map(Number)
  }
  const [w, h, xo, yo] = bbx
  const rows = new Array(12).fill(0)
  for (let r = 0; r < h; r++) {
    const bits = parseInt(bdf[j + 1 + r], 16) >> (Math.ceil(w / 8) * 8 - w)
    const y = ASCENT - (yo + h) + r
    if (y >= 0 && y < 12) rows[y] = (bits << (8 - w - xo)) & 0xff
  }
  glyphs.set(code, { dw, rows })
  i = j
}

const used = new Set()
for (let c = 0x20; c < 0x7f; c++) used.add(c)
const srcDir = new URL('../src/', import.meta.url)
for (const f of readdirSync(srcDir)) {
  if (!f.endsWith('.js') || f === 'font.js' || f === 'art.js' || f === 'bgm.js') continue
  for (const ch of readFileSync(new URL(f, srcDir), 'utf8')) if (ch.codePointAt(0) >= 0x80) used.add(ch.codePointAt(0))
}
const out = []
for (const c of [...used].sort((a, b) => a - b)) {
  const g = glyphs.get(c)
  if (!g) continue
  out.push(`${JSON.stringify(String.fromCodePoint(c))}:'${g.dw.toString(16)}${g.rows.map((r) => r.toString(16).padStart(2, '0')).join('')}'`)
}
const text = '// tools/font.mjs が art/k8x12L.bdf から作る。手で直さない。値は 幅(16進 1 桁) + 12 行(各 2 桁、ビット 7 が左端)\n' +
  `export const GLYPHS = {\n${out.join(',\n')}\n}\n`
const file = new URL('font.js', srcDir)
let before = ''
try { before = readFileSync(file, 'utf8') } catch {}
if (before !== text) writeFileSync(file, text)
console.log('glyphs', out.length)
