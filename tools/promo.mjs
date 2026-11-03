#!/usr/bin/env node
// 紹介動画を作る: Vite を立ててから（npm run dev、:5194）
//   node tools/promo.mjs                 → videos/sunadokei-promo.mp4（1080×1080、30fps、H.264/AAC。約 40 秒）
//   URL=http://127.0.0.1:5195/ node tools/promo.mjs   ほかのポートのサーバーで
// 画面なしのブラウザでゲームを自動で遊ばせ（tools/bot.mjs と同じ自動操作）、1 コマずつ撮る。
// 画面は 3 倍（最近傍）で真ん中に置き、上下に字幕（Noto Sans CJK JP、ffmpeg の drawtext）。音は audio/*.ogg を場面に合わせて重ねる（効果音は入らない）
// 画面なしのブラウザは ~/src/etc/CLAUDE.md の「確かめるとき」のもの。ffmpeg が要る
import { chromium } from '../../enso/node_modules/playwright/index.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const URL = process.env.URL || 'http://127.0.0.1:5194/'
const FPS = 30
const OUT = join(ROOT, 'videos', 'sunadokei-promo.mp4')
const TMP = join(tmpdir(), 'zz-sunadokei-promo')
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true }); mkdirSync(dirname(OUT), { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' })
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto(URL + '?test')
await page.waitForFunction(() => window.__G)
// 自動操作（tools/bot.mjs と同じ: 右を押し続け、壁・穴・敵の前で跳ぶ）
await page.evaluate(() => {
  const { G, keys, pressed, update } = __G
  let f = 0, lastJ = -99, holdJ = 0
  window.botStep = () => {
    f++
    if (G.scene === 'play') {
      const p = G.p, T = 16
      const fc = Math.floor((p.x + p.w + 3) / T), fr = Math.floor((p.y + p.h - 1) / T)
      const ahead = Math.floor((p.x + p.w + 4) / T)
      const wall = (c, r) => { const ch = G.map[r]?.[c]; return ch === '#' || ch === '<' || ch === '>' || ch === 'D' || ch === 'c' }
      const groundAhead = [0, 1, 2, 3, 4, 5, 6].some((d) => { const ch = G.map[fr + 1 + d]?.[ahead]; return ch && ch !== '.' && ch !== 'e' })
      const enemy = G.enemies.some((e) => e.x > p.x && e.x - (p.x + p.w) < 20 && Math.abs(e.y - p.y) < 16)
      keys.right = true
      if (p.ground && (wall(fc, fr) || !groundAhead || enemy) && f - lastJ > 8) { pressed.add('jump'); holdJ = 30; lastJ = f }
      keys.jump = holdJ > 0; if (holdJ > 0) holdJ--
    } else { keys.right = false; keys.jump = false }
    update()
  }
  // n 回動かしてから 1 コマ撮る、を k コマ
  window.shoot = (k, n, until) => {
    const out = []
    const cv = document.getElementById('c')
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < n; j++) botStep()
      __G.render()
      out.push(cv.toDataURL('image/png').slice(22))
      if (until && until()) break
    }
    return out
  }
})

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-r', String(FPS), '-i', '-', '-c:v', 'png', join(TMP, 'game.mkv')], { stdio: ['pipe', 'inherit', 'inherit'] })
let frames = 0
const marks = {}
const mark = (name) => { marks[name] = frames / FPS }
async function shoot(k, n = 2, until = null) {
  while (k > 0) {
    const batch = Math.min(60, k)
    const imgs = await page.evaluate(([b, n, u]) => window.shoot(b, n, u ? new Function('return ' + u)() : null), [batch, n, until])
    for (const d of imgs) { if (!ff.stdin.write(Buffer.from(d, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r)) }
    frames += imgs.length
    k -= imgs.length
    if (imgs.length < batch) break
  }
}
const G = (fn, arg) => page.evaluate(fn, arg)

// 1. タイトル
mark('title')
await G(() => { for (const k in __G.best) delete __G.best[k]; __G.G.scene = 'title'; __G.G.t = 0 })
await shoot(FPS * 3)
// 2. 野原を赤ちゃんから。青年になるまでは本当の速さ
mark('stage')
await G(() => { __G.startStage(0); __G.G.scene = 'play'; __G.G.sceneT = 0 })
await shoot(FPS * 20, 2, "() => __G.G.age >= 13")
mark('youth')
await shoot(FPS * 20, 2, "() => __G.G.age >= 30")
// 3. 年をとってからは 3 倍速で、ゴールまで
mark('fast')
await shoot(FPS * 30, 6, "() => __G.G.scene !== 'play'")
// 4. ひっくり返す
mark('flip')
await shoot(100, 2)
// 5. 寿命が尽きる → また赤ちゃんから
mark('old')
await G(() => { __G.startStage(4, 73); __G.G.scene = 'play'; __G.G.sceneT = 0; __G.G.camX = Math.max(0, __G.G.p.x - 120) })
await shoot(FPS * 10, 2, "() => __G.G.scene === 'death'")
mark('death')
await shoot(75, 2)
mark('reborn')
await G(() => { __G.startStage(4) })
await shoot(35, 2)
// 6. エンディング（3 倍速）
mark('ending')
await G(() => { const g = __G.G; g.runAges = [38, 44, 51, 55, 63]; g.parts = []; g.scene = 'ending'; g.sceneT = 0; g.endPhase = undefined })
await shoot(250, 3)
// 7. 終わり
mark('card')
await G(() => { for (const k in __G.best) delete __G.best[k]; __G.G.scene = 'title'; __G.G.t = 300 })
await shoot(FPS * 4)
mark('end')
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
await browser.close()
if (errs.length) { console.error(errs.join('\n')); process.exit(1) }
console.log('場面（秒）', Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, +v.toFixed(2)])))

// ---- 字幕 ----
const FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
const CAPS = [
  ['stage', 'youth', '赤ちゃんで生まれ、遊ぶうちに年をとる'],
  ['youth', 'fast', '青年がいちばん速く、高く跳べる'],
  ['fast', 'flip', '年をとるほど、遅く、低く'],
  ['flip', 'old', '寿命が尽きる前に、命の砂時計をひっくり返せ'],
  ['old', 'reborn', '寿命が尽きたら……'],
  ['reborn', 'ending', 'また赤ちゃんから'],
  ['ending', 'card', '全 5 ステージ。一生を駆け抜けろ'],
]
const SUBS = [
  ['card', 'end', 'naga3.github.io/sunadokei', 'PC・スマホのブラウザで遊べる'],
]
const filters = ['[0:v]scale=960:720:flags=neighbor,pad=1080:1080:60:180:color=0x0d0b14']
const fade = (a, b) => `alpha='if(lt(t,${a}+0.25),(t-${a})/0.25,if(gt(t,${b}-0.25),(${b}-t)/0.25,1))'`
let n = 0
const tf = (s) => { const f = join(TMP, `cap${n++}.txt`); writeFileSync(f, s); return f }
for (const [a, b, s] of CAPS) {
  const t0 = marks[a], t1 = marks[b]
  filters.push(`drawtext=fontfile=${FONT}:textfile=${tf(s)}:fontsize=46:fontcolor=white:borderw=4:bordercolor=0x0d0b14:x=(w-text_w)/2:y=940:enable='between(t,${t0},${t1})':${fade(t0, t1)}`)
}
filters.push(`drawtext=fontfile=${FONT}:textfile=${tf('命の砂時計')}:fontsize=64:fontcolor=0xffe066:borderw=5:bordercolor=0x0d0b14:x=(w-text_w)/2:y=60`)
for (const [a, b, s1, s2] of SUBS) {
  const t0 = marks[a], t1 = marks[b]
  filters.push(`drawtext=fontfile=${FONT}:textfile=${tf(s1)}:fontsize=50:fontcolor=white:borderw=4:bordercolor=0x0d0b14:x=(w-text_w)/2:y=930:enable='between(t,${t0},${t1})'`)
  filters.push(`drawtext=fontfile=${FONT}:textfile=${tf(s2)}:fontsize=34:fontcolor=0xc8c6d6:borderw=3:bordercolor=0x0d0b14:x=(w-text_w)/2:y=1000:enable='between(t,${t0},${t1})'`)
}
const vf = filters.join(',') + `,fade=t=out:st=${(marks.end - 0.6).toFixed(2)}:d=0.6[v]`

// ---- 音: 場面ごとに曲を切り出して置く ----
const A = (name) => join(ROOT, 'audio', `${name}.ogg`)
const parts = [
  ['title', 'title', 'stage', 0.6],
  ['stage', 'stage', 'flip', 1.0],
  ['clear', 'flip', 'old', 1.0],
  ['stage', 'old', 'death', 0.8],
  ['death', 'death', 'ending', 1.0],
  ['ending', 'ending', 'end', 1.0],
]
const inputs = ['-i', join(TMP, 'game.mkv')]
const af = []
parts.forEach(([song, a, b, vol], i) => {
  inputs.push('-i', A(song))
  const t0 = marks[a], d = marks[b] - marks[a]
  af.push(`[${i + 1}:a]atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol},afade=t=out:st=${Math.max(0, d - 0.4).toFixed(3)}:d=0.4,adelay=${Math.round(t0 * 1000)}:all=1[a${i}]`)
})
af.push(`${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=longest,atrim=0:${marks.end.toFixed(3)}[a]`)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', [vf, ...af].join(';'), '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', OUT], { stdio: 'inherit' })
rmSync(TMP, { recursive: true, force: true })
console.log(`${OUT}  ${marks.end.toFixed(1)} 秒`)
