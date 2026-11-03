#!/usr/bin/env node
// 最初の下書きの絵を art/ に書き出す（まだ無いファイルだけ。Pixel で描き直したものは上書きしない）
//   node tools/draft.mjs
// 大きさ・絵の名前・文字の役目は art/GROUP.md の決まりに合わせてある。絵としては仮
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ART = join(ROOT, 'art')
const PAL = {}
let i = 0
for (const line of readFileSync(join(ART, 'sunadokei.gpl'), 'utf8').split('\n')) {
  const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/.exec(line)
  if (m) PAL[m[4]] = i++
}

function grid(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'))
  const api = {
    w, h, g,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c },
    get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? g[y][x] : '.' },
    rect(x, y, rw, rh, c) { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) api.set(xx, yy, c) },
    // 塗った所のまわり（上下左右）を o で縁取る
    outline(c = 'o') {
      const add = []
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (g[y][x] !== '.') continue
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const v = api.get(x + dx, y + dy); return v !== '.' && v !== c })
        if (n) add.push([x, y])
      }
      for (const [x, y] of add) g[y][x] = c
      return api
    },
    rows() { return g.map((r) => r.join('')) },
  }
  return api
}

function picFile(title, colors, pics, anims = []) {
  let s = `# ${title}（tools/draft.mjs の下書き。描き直してよい）\ntitle ${title.split(' ')[0]}\npalette sunadokei\n`
  for (const a of anims) s += `anim ${a}\n`
  for (const [ch, name] of Object.entries(colors)) s += `color ${ch} ${PAL[name]}\n`
  for (const [name, g] of Object.entries(pics)) s += `\npic ${name} ${g.w} ${g.h}\n` + g.rows().map((r) => '  ' + r).join('\n') + '\n'
  return s
}

const written = []
function out(ref, text) {
  const file = join(ART, ref + '.pic')
  if (existsSync(file)) return
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  written.push(ref)
}

// ---- 人（右向き、16 × 16、足もとは 15 行目の縁取り） ----
const HUMAN_COLORS = { o: 'ink', s: 'sk3', S: 'sk2', h: 'br2', H: 'br1', e: 'ink', b: 'bl3', B: 'bl2', l: 'br3', k: 'br1', w: 'gy6', c: 'br3' }

// 立つ人。top は頭のてっぺんの行、head は頭の大きさ、body は胴の行数、leg は脚の行数
function person({ top, head, body, leg, belly = 0, hair = 'h', bent = 0, cane = false }, pose) {
  const g = grid(16, 16)
  const cx = 7
  const feet = 14
  const legTop = feet - leg + 1
  const bodyTop = legTop - body
  const lift = pose === 'jump' ? 1 : 0
  // 脚
  const legs = {
    stand: [[cx - 1, 0], [cx + 1, 0]],
    run1: [[cx - 2, 0], [cx + 2, 0]],
    run2: [[cx, 0], [cx + 1, 0]],
    jump: [[cx - 2, -1], [cx + 2, -1]],
  }[pose]
  for (const [lx, dy] of legs) {
    g.rect(lx, legTop - lift, 1, leg + dy, 'l')
    g.set(lx + 1, feet - lift + dy, 'k'); g.set(lx, feet - lift + dy, 'k')
  }
  // 胴（bent で前かがみ: 上ほど右へずれる）
  for (let r = 0; r < body; r++) {
    const y = bodyTop + r - lift
    const shift = Math.round(bent * (body - r) / body)
    const half = 2 + (belly && r >= 1 && r < body - 1 ? belly : 0)
    g.rect(cx - half + shift, y, half * 2, 1, 'b')
    g.set(cx - half + shift, y, 'B')
  }
  // 腕（振り）
  const arm = pose === 'run1' ? 1 : pose === 'run2' ? -1 : 0
  g.rect(cx + arm + bent, bodyTop + 1 - lift, 1, Math.max(2, body - 1), 'B')
  g.set(cx + arm + bent, bodyTop + body - lift, 's')
  // 頭
  const hx = cx - Math.floor(head / 2) + bent + 1
  const hy = top - lift
  g.rect(hx, hy, head, head, 's')
  g.rect(hx, hy, head, 2, hair)
  g.rect(hx, hy, 1, Math.max(2, head - 2), hair)
  g.set(hx + head - 2, hy + Math.floor(head / 2) + 0, 'e')
  g.set(hx + head - 1, hy + head - 2, 'S')
  if (cane) { g.rect(cx + bent + 3, bodyTop + 1 - lift, 1, feet - bodyTop, 'c'); g.set(cx + bent + 2, bodyTop + 1 - lift, 'c') }
  return g.outline()
}

// はいはいする赤ちゃん（右向き）
function baby(pose) {
  const g = grid(16, 16)
  const lift = pose === 'jump' ? 2 : 0
  const y0 = 10 - lift
  g.rect(3, y0, 7, 3, 'w')       // 体（白い産着）
  g.rect(3, y0 + 2, 7, 1, 'W')
  g.rect(9, y0 - 3, 5, 5, 's')   // 頭
  g.rect(10, y0 - 3, 3, 1, 'h')
  g.set(12, y0 - 1, 'e')
  const k = { stand: [4, 8], run1: [3, 9], run2: [5, 7], jump: [3, 9] }[pose]
  g.rect(k[0], y0 + 3, 1, 2 - (pose === 'jump' ? 1 : 0), 's')
  g.rect(k[1], y0 + 3, 1, 2 - (pose === 'jump' ? 1 : 0), 's')
  return g.outline()
}

const AGES = {
  baby: { make: baby, colors: { ...HUMAN_COLORS, w: 'gy6', W: 'gy5' } },
  boy: { make: (p) => person({ top: 4, head: 5, body: 3, leg: 3 }, p), colors: { ...HUMAN_COLORS, b: 'rd3', B: 'rd2', l: 'bl2' } },
  youth: { make: (p) => person({ top: 1, head: 5, body: 5, leg: 4 }, p), colors: HUMAN_COLORS },
  adult: { make: (p) => person({ top: 1, head: 5, body: 5, leg: 4, belly: 1 }, p), colors: { ...HUMAN_COLORS, b: 'gr3', B: 'gr2', h: 'br1', l: 'gy3', k: 'ink' } },
  elder: { make: (p) => person({ top: 4, head: 5, body: 4, leg: 3, bent: 2, hair: 'w', cane: true }, p), colors: { ...HUMAN_COLORS, b: 'pu2', B: 'pu1', l: 'gy3' } },
}
const NAMES = { baby: '赤ちゃん', boy: '少年', youth: '青年', adult: '中年', elder: '老人' }
for (const [age, d] of Object.entries(AGES)) {
  const pics = {}
  for (const p of ['stand', 'run1', 'run2', 'jump']) pics[p] = d.make(p)
  out(`player/${age}`, picFile(`${age} ${NAMES[age]}`, d.colors, pics, ['run run1:120 run2:120']))
}

// ---- 地面のタイル ----
{
  const colors = { d: 'br2', D: 'br1', p: 'br3', g: 'gr3', G: 'gr2', L: 'gr4', o: 'ink' }
  const pics = {}
  for (let n = 1; n <= 4; n++) {
    const g = grid(16, 16)
    g.rect(0, 0, 16, 16, 'd')
    let seed = n * 97
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let k = 0; k < 7; k++) { const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 15); g.set(x, y, 'D'); if (rnd() < 0.5) g.set(x + 1, y, 'p') }
    pics['center' + n] = g
  }
  const top = grid(16, 16); top.rect(0, 0, 16, 1, 'o'); top.rect(0, 1, 16, 3, 'g'); top.rect(0, 1, 16, 1, 'L'); for (let x = 0; x < 16; x += 3) top.set(x + 1, 4, 'G'); top.rect(0, 4, 16, 1, 'G'); for (let x = 1; x < 16; x += 4) top.set(x, 5, 'G')
  const bottom = grid(16, 16); bottom.rect(0, 15, 16, 1, 'o'); bottom.rect(0, 14, 16, 1, 'D')
  const left = grid(16, 16); left.rect(0, 0, 1, 16, 'o'); left.rect(1, 0, 1, 16, 'D')
  const right = grid(16, 16); right.rect(15, 0, 1, 16, 'o'); right.rect(14, 0, 1, 16, 'D')
  Object.assign(pics, { top, bottom, left, right })
  out('tiles/ground', picFile('ground 地面', colors, pics))
}

// ---- しかけ ----
{
  const colors = { o: 'ink', w: 'br4', W: 'br5', d: 'br2', s: 'st2', S: 'st1', t: 'gy5', r: 'rd3', R: 'rd2', y: 'ye1', Y: 'or2', m: 'gy4', M: 'gy3', b: 'gy2', a: 'ye2' }
  const pics = {}
  // 一方通行の足場（上の 5 行だけ）
  const plat = grid(16, 16); plat.rect(0, 1, 16, 3, 'w'); plat.rect(0, 1, 16, 1, 'W'); plat.rect(0, 3, 16, 1, 'd'); plat.set(3, 4, 'd'); plat.set(12, 4, 'd'); plat.rect(0, 0, 16, 1, 'o'); plat.rect(0, 4, 16, 1, 'o'); plat.set(3, 4, 'd'); plat.set(12, 4, 'd'); plat.set(3, 5, 'o'); plat.set(12, 5, 'o')
  pics.platform = plat
  // 崩れる床（石）
  for (const [name, cracks] of [['crumble', 2], ['crumble2', 5]]) {
    const g = grid(16, 16); g.rect(1, 1, 14, 14, 's'); g.rect(1, 1, 14, 1, 't'); g.rect(1, 13, 14, 2, 'S')
    let seed = cracks * 31
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let k = 0; k < cracks; k++) { let x = 3 + Math.floor(rnd() * 10), y = 2; for (let j = 0; j < 6 + k; j++) { g.set(x, y, 'o'); y++; x += rnd() < 0.5 ? -1 : 1 } }
    g.outline(); g.rect(0, 0, 16, 1, 'o'); g.rect(0, 15, 16, 1, 'o'); g.rect(0, 0, 1, 16, 'o'); g.rect(15, 0, 1, 16, 'o')
    pics[name] = g
  }
  // ばね（下の端を地面にそろえる）
  for (const [name, up] of [['spring', 1], ['spring2', 0]]) {
    const g = grid(16, 16)
    const plateY = up ? 7 : 11
    g.rect(2, 13, 12, 2, 'm'); g.rect(2, 13, 12, 1, 'M')
    for (let y = plateY + 2; y < 13; y++) g.rect((y % 2 ? 4 : 5), y, 7, 1, (y % 2 ? 'r' : 'R'))
    g.rect(1, plateY, 14, 2, 'r'); g.rect(1, plateY, 14, 1, 'a')
    pics[name] = g.outline()
  }
  // スイッチ（地面に置く踏み板）
  for (const [name, h] of [['switch', 3], ['switch2', 1]]) {
    const g = grid(16, 16); g.rect(3, 15 - h, 10, h, 'y'); g.rect(3, 15 - h, 10, 1, 'a'); g.rect(1, 15, 14, 1, 'Y')
    pics[name] = g.outline()
  }
  // 時限の扉（閉じた格子）
  const door = grid(16, 16); door.rect(0, 0, 16, 16, 'b'); for (let x = 1; x < 16; x += 4) door.rect(x, 0, 2, 16, 'm'); for (let x = 1; x < 16; x += 4) door.rect(x, 0, 1, 16, 't'); door.rect(0, 7, 16, 2, 'M')
  pics.door = door
  // ベルトコンベア（右へ流れる向きで描く。左向きはゲームが反転）
  for (const [name, off] of [['conv1', 0], ['conv2', 2]]) {
    const g = grid(16, 16); g.rect(0, 0, 16, 16, 'S'); g.rect(0, 0, 16, 4, 'b'); g.rect(0, 0, 16, 1, 'o'); g.rect(0, 4, 16, 1, 'o')
    for (let x = off; x < 16; x += 4) { g.set(x, 1, 'y'); g.set(x + 1, 2, 'y'); g.set(x, 3, 'y') }
    for (let x = 3; x < 16; x += 6) { g.rect(x, 7, 3, 3, 'm'); g.set(x + 1, 8, 'o') }
    pics[name] = g
  }
  out('tiles/parts', picFile('parts しかけ', colors, pics, ['belt conv1:100 conv2:100', 'shake crumble:60 crumble2:60']))
}

// ---- 敵（イノシシの子） ----
{
  const colors = { o: 'ink', b: 'br3', B: 'br2', s: 'br5', e: 'ink', t: 'gy6', n: 'sk2' }
  const pics = {}
  for (const [name, step] of [['walk1', 0], ['walk2', 1]]) {
    const g = grid(16, 16)
    g.rect(2, 7, 10, 5, 'b'); g.rect(2, 11, 10, 1, 'B'); g.rect(3, 6, 7, 1, 's')
    g.rect(11, 8, 3, 3, 'b'); g.rect(13, 9, 2, 2, 'n'); g.set(12, 8, 'e'); g.set(13, 11, 't')
    const legs = step ? [3, 6, 8, 10] : [4, 5, 9, 10]
    for (const x of legs) g.rect(x, 12, 1, 2, 'B')
    g.set(1, 7, 'B')
    pics[name] = g.outline()
  }
  out('enemy/walker', picFile('walker 歩く敵', colors, pics, ['walk walk1:160 walk2:160']))
}

// ---- 命の砂時計 64 × 64 ----
{
  const colors = { o: 'ink', w: 'br4', W: 'br5', d: 'br2', D: 'br1', g: 'bl5', G: 'white', y: 'ye1' }
  const g = grid(64, 64)
  const cx = 32, top = 7, neck = 31, bot = 56
  const prof = (d) => d <= 0.8 ? Math.sin((d / 0.8) * Math.PI / 2) : 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - ((d - 0.8) / 0.2) ** 2))
  const inside = (x, y) => {
    if (y < top || y > bot) return false
    const d = y <= neck ? (neck - y) / (neck - top) : (y - neck - 1) / (bot - neck - 1)
    const w = 1 + Math.round(12 * prof(d))
    return x >= cx - w && x <= cx - 1 + w
  }
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (inside(x, y)) continue
    let near = false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) near = true
    if (near) g.set(x, y, 'g')
  }
  // ガラスの光
  for (let y = top + 3; y < neck - 6; y++) { for (let x = 0; x < cx; x++) if (g.get(x, y) === 'g') { g.set(x, y, 'G'); break } }
  // 上下の板と柱
  for (const y0 of [2, bot + 1]) { g.rect(10, y0, 44, 5, 'w'); g.rect(10, y0, 44, 1, 'W'); g.rect(10, y0 + 4, 44, 1, 'd'); g.rect(8, y0 + 1, 48, 3, 'w'); g.rect(8, y0 + 1, 48, 1, 'W') }
  for (const x of [11, 51]) { g.rect(x, 7, 2, bot - 6, 'd'); g.set(x, 7, 'D') }
  g.set(cx - 1, 4, 'y'); g.set(cx, 4, 'y')
  // 縁取り（内側の透明の所には付けない）
  const add = []
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (g.get(x, y) !== '.' || inside(x, y)) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const v = g.get(x + dx, y + dy); return v !== '.' && v !== 'o' })) add.push([x, y])
  }
  for (const [x, y] of add) g.set(x, y, 'o')
  out('goal/hourglass', picFile('hourglass 命の砂時計', colors, { stand: g }))
}

console.log(written.length ? `下書きを書いた: ${written.join(', ')}` : '書くものは無かった（全部ある）')
