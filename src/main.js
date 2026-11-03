// 命の砂時計: 赤ちゃんから始まり、年をとり、寿命で死ぬ。寿命が尽きる前にゴールの砂時計をひっくり返す
// 年齢で変わるのは、歩く速さとジャンプの高さだけ（青年がいちばん速く高い）。時間の表示は出さない
import { ART } from './art.js'
import { PAL_HEX, P } from './palette.js'
import { GLYPHS } from './font.js'
import { BGM } from './bgm.js'
import { STAGES, ROWS } from './stages.js'

const W = 320, H = 240, T = 16
const params = new URLSearchParams(location.search)

// ---- 調整の値 ----
export const TUNE = {
  lifeSec: 50,        // 一生（0〜80 歳）の長さ（秒）
  maxAge: 80,
  gravity: 0.25,
  speedMin: 0.7,      // 赤ちゃん・80 歳の歩く速さ（点/フレーム）
  speedMax: 2.0,      // 青年
  jumpMin: 28,        // ジャンプの高さ（点）。80 歳でも 1 段に上がれて、1 マスの穴を少し余裕をもって越えられる
  jumpMax: 70,        // 青年で 4 マスの足場に届く
  springH: 86,        // ばねで跳ねる高さ（だれでも同じ）
  belt: 0.45,         // コンベアの速さ
  crumble: 26,        // 崩れる床が乗ってから落ちるまで（フレーム）
  hitYears: 3,        // 敵に当たったら年をとる
  fallYears: 2,       // 穴に落ちたら
}
if (params.has('life')) TUNE.lifeSec = +params.get('life')
const YEARS_PER_FRAME = () => TUNE.maxAge / (TUNE.lifeSec * 60)

// 体の勢い: 0 歳 0 → 20 歳で 1 → 35 歳まで 1 → 80 歳で 0（なめらかに）
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }
export function vigor(age) {
  if (age < 20) return smooth(age / 20)
  if (age < 35) return 1
  return 1 - smooth((age - 35) / 45)
}
const speedOf = (age) => TUNE.speedMin + (TUNE.speedMax - TUNE.speedMin) * vigor(age)
const jumpOf = (age) => TUNE.jumpMin + (TUNE.jumpMax - TUNE.jumpMin) * vigor(age)
const PHASES = [[6, 'baby'], [16, 'boy'], [36, 'youth'], [56, 'adult'], [Infinity, 'elder']]
const phaseOf = (age) => PHASES.findIndex(([a]) => age < a)
const phaseName = (age) => PHASES[phaseOf(age)][1]

// ---- 画面 ----
const cv = document.getElementById('c')
const ctx = cv.getContext('2d')
ctx.imageSmoothingEnabled = false
const touchMode = matchMedia('(pointer: coarse)').matches
if (touchMode) document.body.classList.add('touch')
function fit() {
  const fitS = touchMode ? Math.min(innerWidth / W, innerHeight / H) : Math.min((innerWidth - 16) / W, (innerHeight - 48) / H)
  const s = fitS >= 2 ? Math.floor(fitS) : Math.max(touchMode ? 0.5 : 1, fitS)
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'
  if (touchMode) layoutPad(s)
}
// スマホ: 画面の外の余白に、スティックとジャンプのボタンを置く（gunzo の layoutPad と同じ考え）。
// 縦持ちは画面を上に寄せて下の余白、横持ちは左右の帯。余白が狭ければ画面の上に薄く重ねる。
// 触る所はどこでもよく、左半分がスティック（触った所が中心）、右半分がジャンプ。絵は目印
function layoutPad(s) {
  const iw = innerWidth, ih = innerHeight
  const below = ih - H * s, side = (iw - W * s) / 2
  const ui = document.getElementById('touchui'), st = document.getElementById('stick'), jb = document.getElementById('jumpbtn')
  let sx, jx, y
  if (below >= 140 && below >= side * 2) {
    document.body.style.alignItems = 'flex-start'
    y = H * s + Math.min(below * 0.5, 130); sx = Math.max(70, iw * 0.22); jx = iw - Math.max(70, iw * 0.22)
    ui.classList.remove('overlay')
  } else {
    document.body.style.alignItems = 'center'
    y = ih * 0.68
    if (side >= 90) { sx = side / 2; jx = iw - side / 2; ui.classList.remove('overlay') }
    else { sx = 70; jx = iw - 70; ui.classList.add('overlay') }
  }
  // ↺・✕: 縦持ちは下の余白の上、ほかは右上
  const top = below >= 140 && below >= side * 2 ? H * s + 8 : 8
  for (const id of ['retry', 'back']) document.getElementById(id).style.top = top + 'px'
  Object.assign(st.style, { left: sx + 'px', top: y + 'px' })
  Object.assign(jb.style, { left: jx + 'px', top: y + 'px' })
}
addEventListener('resize', fit); fit()
const hex = (i) => '#' + PAL_HEX[i]
const RGB = PAL_HEX.map((h) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)))
const rect = (x, y, w, h, c) => { ctx.fillStyle = hex(c); ctx.fillRect(Math.round(x), Math.round(y), w, h) }

// ---- 絵（art/*.pic → src/art.js） ----
const picCache = new Map()
function pic(ref, name, flip = false, tint = null) {
  const key = `${ref}|${name}|${flip}|${tint}`
  if (picCache.has(key)) return picCache.get(key)
  const a = ART[ref]
  const rows = a?.pics[name]
  let c = null
  if (rows) {
    const h = rows.length, w = rows[0].length
    c = document.createElement('canvas'); c.width = w; c.height = h
    const g = c.getContext('2d')
    const img = g.createImageData(w, h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x]
      if (ch === '.') continue
      const [r, gg, b] = RGB[tint ?? a.colors[ch]]
      const o = (y * w + (flip ? w - 1 - x : x)) * 4
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255
    }
    g.putImageData(img, 0, 0)
  }
  picCache.set(key, c)
  return c
}
function anim(ref, name, ms) {
  const a = ART[ref]?.anims[name]
  if (!a) return null
  const total = a.ms.reduce((s, v) => s + v, 0)
  let t = ms % total
  for (let i = 0; i < a.frames.length; i++) { if (t < a.ms[i]) return a.frames[i]; t -= a.ms[i] }
  return a.frames[0]
}
function draw(ref, name, x, y, flip = false, tint = null) {
  const c = pic(ref, name, flip, tint)
  if (c) ctx.drawImage(c, Math.round(x), Math.round(y))
  return c
}

// ---- 文字（k8x12） ----
function textWidth(s, scale = 1) { let w = 0; for (const ch of s) w += parseInt((GLYPHS[ch] || GLYPHS['?'])[0], 16) * scale; return w }
function text(s, x, y, color = P.white, { scale = 1, align = 'left', shadow = P.ink } = {}) {
  if (align === 'center') x = Math.round(x - textWidth(s, scale) / 2)
  if (shadow != null) text(s, x + scale, y + scale, shadow, { scale, shadow: null })
  ctx.fillStyle = hex(color)
  for (const ch of s) {
    const g = GLYPHS[ch] || GLYPHS['?']
    const dw = parseInt(g[0], 16)
    for (let r = 0; r < 12; r++) {
      const bits = parseInt(g.slice(1 + r * 2, 3 + r * 2), 16)
      for (let b = 0; b < 8; b++) if (bits & (0x80 >> b)) ctx.fillRect(x + b * scale, y + r * scale, scale, scale)
    }
    x += dw * scale
  }
}

// ---- 音 ----
let ac = null
function audio() { if (!ac) { try { ac = new AudioContext() } catch { } } if (ac?.state === 'suspended') ac.resume(); return ac }
function beep(freq, dur, { type = 'square', vol = 0.06, to = null, delay = 0 } = {}) {
  const a = ac; if (!a) return
  const t0 = a.currentTime + delay
  const o = a.createOscillator(), g = a.createGain()
  o.type = type; o.frequency.setValueAtTime(freq, t0)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02)
}
function noise(dur, { vol = 0.08, freq = 1200, delay = 0 } = {}) {
  const a = ac; if (!a) return
  const t0 = a.currentTime + delay
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = a.createBufferSource(); s.buffer = buf
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq
  const g = a.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  s.connect(f).connect(g).connect(a.destination); s.start(t0)
}
const SE = {
  jump: (v) => beep(220 + 260 * v, 0.12, { to: 520 + 500 * v, vol: 0.04 }),
  spring: () => beep(180, 0.3, { to: 900, vol: 0.05 }),
  hit: () => { noise(0.18, { vol: 0.12, freq: 2400 }); beep(160, 0.2, { to: 70, vol: 0.05 }) },
  crumble: () => noise(0.25, { vol: 0.07, freq: 500 }),
  switch: () => { beep(660, 0.06, { vol: 0.05 }); beep(990, 0.08, { vol: 0.05, delay: 0.06 }) },
  tick: () => beep(1400, 0.03, { vol: 0.03 }),
  door: () => noise(0.2, { vol: 0.06, freq: 300 }),
  grow: () => [523, 659, 784].forEach((f, i) => beep(f, 0.18, { type: 'triangle', vol: 0.06, delay: i * 0.05 })),
  fall: () => beep(500, 0.4, { to: 80, vol: 0.05 }),
  flip: () => [392, 523, 659, 784, 1047].forEach((f, i) => beep(f, 0.4, { type: 'triangle', vol: 0.07, delay: i * 0.06 })),
  hold: () => beep(110, 0.2, { type: 'triangle', vol: 0.08 }),
  die: () => [440, 392, 330, 262].forEach((f, i) => beep(f, 0.5, { type: 'triangle', vol: 0.06, delay: i * 0.25 })),
}

// 曲（PX-13h Music → tools/audio.mjs → src/bgm.js）。道中の曲は年齢で速さを変える（音の高さはそのまま）
const tracks = {}
let music = null, musicName = null
function playMusic(name) {
  if (musicName === name) return
  stopMusic()
  musicName = name
  const b = BGM[name]
  if (!b) return
  const el = tracks[name] || (tracks[name] = Object.assign(new Audio('data:audio/ogg;base64,' + b.data), { loop: b.loop, preservesPitch: true }))
  el.currentTime = 0; el.playbackRate = 1; el.volume = 0.7
  el.play().catch(() => { })
  music = el
}
function stopMusic() { if (music) music.pause(); music = null; musicName = null }

// ---- 入力 ----
const keys = {}
const pressed = new Set()
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyZ: 'jump', KeyX: 'jump', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', Enter: 'ok', KeyR: 'retry', Escape: 'back' }
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code]; if (!k) return
  e.preventDefault(); unlockAudio()
  if (!keys[k]) pressed.add(k)
  keys[k] = true
})
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false })

// スマホ: 画面の左半分をなぞって歩く（触った所から左右へずらす）、右半分を押してジャンプ（長押しで高く）。上の隅のボタンでやり直し・タイトル
const touches = new Map()
let unlocked = false
function unlockAudio() {
  audio()
  if (unlocked) return
  unlocked = true
  // iPhone は、触った瞬間に一度鳴らしておかないと、あとから曲が鳴らない
  for (const [name, b] of Object.entries(BGM)) {
    const el = tracks[name] || (tracks[name] = Object.assign(new Audio('data:audio/ogg;base64,' + b.data), { loop: b.loop, preservesPitch: true }))
    if (el === music) continue
    el.muted = true
    el.play().then(() => { if (el !== music) el.pause(); el.muted = false }).catch(() => { el.muted = false })
  }
}
function stickUpdate() {
  let l = false, r = false, j = false
  for (const t of touches.values()) {
    if (t.kind === 'stick') { if (t.dx < -8) l = true; if (t.dx > 8) r = true }
    else j = true
  }
  keys.left = l; keys.right = r; keys.jump = j
  const st = [...touches.values()].find((t) => t.kind === 'stick')
  document.getElementById('knob').style.transform = `translateX(${st ? Math.max(-26, Math.min(26, st.dx)) : 0}px)`
  document.getElementById('jumpbtn').classList.toggle('on', j)
}
addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return
  if (e.target.closest?.('button')) return
  e.preventDefault(); unlockAudio()
  const kind = e.clientX < innerWidth / 2 ? 'stick' : 'jump'
  touches.set(e.pointerId, { kind, ox: e.clientX, dx: 0 })
  if (kind === 'jump') pressed.add('jump')
  else pressed.add('ok')
  stickUpdate()
}, { passive: false })
addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId)
  if (!t || t.kind !== 'stick') return
  t.dx = e.clientX - t.ox
  // 指を戻したらすぐ逆へ向けるように、触った所をついてこさせる
  if (Math.abs(t.dx) > 36) { t.ox = e.clientX - Math.sign(t.dx) * 36; t.dx = Math.sign(t.dx) * 36 }
  stickUpdate()
})
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { if (touches.delete(e.pointerId)) stickUpdate() })
document.getElementById('retry')?.addEventListener('click', () => { unlockAudio(); pressed.add('retry') })
document.getElementById('back')?.addEventListener('click', () => { unlockAudio(); pressed.add('back') })
let padPrev = {}
function pollPad() {
  const p = navigator.getGamepads?.()[0]
  if (!p) return
  const now = { left: p.axes[0] < -0.4 || p.buttons[14]?.pressed, right: p.axes[0] > 0.4 || p.buttons[15]?.pressed, jump: p.buttons[0]?.pressed || p.buttons[1]?.pressed, ok: p.buttons[9]?.pressed, back: p.buttons[8]?.pressed }
  for (const [k, v] of Object.entries(now)) {
    if (v && !padPrev[k]) { pressed.add(k); audio() }
    if (v !== padPrev[k]) keys[k] = v
  }
  padPrev = now
}
const hit = (k) => pressed.has(k)
const anyOk = () => hit('jump') || hit('ok')
const KEY = () => (touchMode ? 'タップ' : 'Z')

// ---- 記録 ----
const SAVE = 'sunadokei-best'
let best = {}
try { best = JSON.parse(localStorage.getItem(SAVE)) || {} } catch { }
const saveBest = () => { try { localStorage.setItem(SAVE, JSON.stringify(best)) } catch { } }

// ---- 砂時計（goal/hourglass の stand の、ガラスの内側の透明な所に、ゲームが砂を描く） ----
const HG = (() => {
  const rows = ART['goal/hourglass']?.pics.stand
  if (!rows) return null
  const h = rows.length, w = rows[0].length
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] === '.'
  // 真ん中にいちばん近い透明な点（ガラスの首）から塗り広げた所が内側
  let seed = null
  for (let r = 0; r < 12 && !seed; r++) for (let dy = -r; dy <= r && !seed; dy++) for (let dx = -r; dx <= r && !seed; dx++) if (open((w >> 1) + dx, (h >> 1) + dy)) seed = [(w >> 1) + dx, (h >> 1) + dy]
  if (!seed) return null
  const inside = new Set([seed[1] * w + seed[0]])
  const stack = [seed]
  while (stack.length) {
    const [x, y] = stack.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * w + nx
      if (open(nx, ny) && !inside.has(k)) { inside.add(k); stack.push([nx, ny]) }
    }
  }
  const pts = [...inside].map((k) => [k % w, Math.floor(k / w)])
  // 首: 内側の幅がいちばん狭い行（上下の真ん中あたり）
  const ys = pts.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys)
  let neck = Math.round((y0 + y1) / 2), nw = Infinity
  for (let y = Math.round(y0 + (y1 - y0) * 0.3); y <= y0 + (y1 - y0) * 0.7; y++) {
    const n = pts.filter((p) => p[1] === y).length
    if (n > 0 && n < nw) { nw = n; neck = y }
  }
  const cx = pts.filter((p) => p[1] === neck).reduce((s, p) => s + p[0], 0) / nw
  const top = pts.filter((p) => p[1] <= neck).sort((a, b) => b[1] - a[1] || Math.abs(a[0] - cx) - Math.abs(b[0] - cx))
  const bot = pts.filter((p) => p[1] > neck).sort((a, b) => (y1 - a[1] + Math.abs(a[0] - cx) * 0.45) - (y1 - b[1] + Math.abs(b[0] - cx) * 0.45))
  return { w, h, top, bot, neck, cx: Math.round(cx - 0.5), y1 }
})()
const hgCanvas = document.createElement('canvas')
const hgRot = document.createElement('canvas')
// r: 上に残っている砂（1 で満タン）、flow: 落ちる筋を描くか
function hourglassImage(r, flow, t, tint = null) {
  const w = HG?.w ?? 64, h = HG?.h ?? 64
  hgCanvas.width = w; hgCanvas.height = h
  const g = hgCanvas.getContext('2d')
  g.clearRect(0, 0, w, h)
  const c = pic('goal/hourglass', 'stand', false, tint)
  if (c) g.drawImage(c, 0, 0)
  if (!HG || tint != null) return hgCanvas
  const sand = new Set()
  const nt = Math.round(HG.top.length * r), nb = Math.round(HG.bot.length * (1 - r))
  const mark = (list, n) => { for (let i = 0; i < n; i++) sand.add(list[i][1] * w + list[i][0]) }
  mark(HG.top, nt); mark(HG.bot, nb)
  const img = g.getImageData(0, 0, w, h)
  const put = (x, y, ci) => { const o = (y * w + x) * 4; const [rr, gg, bb] = RGB[ci]; img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255 }
  for (const k of sand) {
    const x = k % w, y = Math.floor(k / w)
    put(x, y, !sand.has(k - w) ? P.sa3 : (x * 3 + y * 5) % 11 === 0 ? P.sa1 : P.sa2)
  }
  // 落ちる筋
  if (flow && r > 0 && r < 1) {
    let yb = HG.y1
    while (yb > HG.neck && sand.has(yb * w + HG.cx)) yb--
    for (let y = HG.neck; y <= yb; y++) if ((y + Math.floor(t / 3)) % 3 !== 0) put(HG.cx, y, P.sa3)
  }
  g.putImageData(img, 0, 0)
  return hgCanvas
}
// 足もと (x, y) に立てて描く。angle は回す角度（ひっくり返すとき）
function drawHourglass(x, y, r, flow, t, angle = 0, tint = null) {
  const src = hourglassImage(r, flow, t, tint)
  const w = src.width, h = src.height
  if (!angle) { ctx.drawImage(src, Math.round(x - w / 2), Math.round(y - h)); return }
  // 小さな画面の上で回す（点のまま）
  const s = Math.ceil(Math.hypot(w, h))
  hgRot.width = s; hgRot.height = s
  const g = hgRot.getContext('2d')
  g.imageSmoothingEnabled = false
  g.translate(s / 2, s / 2); g.rotate(angle); g.drawImage(src, -w / 2, -h / 2)
  ctx.drawImage(hgRot, Math.round(x - s / 2), Math.round(y - h / 2 - s / 2))
}

// ---- 空（年齢で朝から夜へ。色は表の色を段で切り替える） ----
const SKY = [
  [0, ['pu1', 'pu2', 'pk2', 'pk3', 'ye3'], ['pu2', 'pu1']],
  [8, ['bl2', 'bl3', 'bl4', 'bl5', 'ye3'], ['bl3', 'gr2']],
  [22, ['bl2', 'bl3', 'bl4', 'bl4', 'bl5'], ['bl3', 'gr2']],
  [44, ['bl2', 'bl3', 'bl3', 'bl4', 'ye3'], ['bl3', 'gr2']],
  [54, ['bl1', 'bl2', 'bl3', 'ye2', 'ye1'], ['bl2', 'gr1']],
  [62, ['pu1', 'pu2', 'pk2', 'or2', 'ye1'], ['pu2', 'gr1']],
  [70, ['pu0', 'pu1', 'pk1', 'rd3', 'or2'], ['pu1', 'gr0']],
  [76, ['bl0', 'pu0', 'pu1', 'pk1', 'rd2'], ['pu0', 'gr0']],
].map(([a, b, hl]) => [a, b.map((n) => P[n]), hl.map((n) => P[n])])
const STARS = Array.from({ length: 40 }, (_, i) => [(i * 97 + 13) % W, (i * 53 + 7) % 120])
function drawSky(age, camX, t) {
  let k = SKY[0]
  for (const s of SKY) if (age >= s[0]) k = s
  const bands = k[1]
  const bh = [40, 34, 28, 24, 114]
  let y = 0
  for (let i = 0; i < bands.length; i++) { rect(0, y, W, bh[i], bands[i]); y += bh[i] }
  // 段の境目を 1 行ずつ混ぜる（市松）
  y = 0
  for (let i = 0; i < bands.length - 1; i++) {
    y += bh[i]
    ctx.fillStyle = hex(bands[i])
    for (let x = (i & 1); x < W; x += 2) ctx.fillRect(x, y, 1, 1)
    ctx.fillStyle = hex(bands[i + 1])
    for (let x = 1 - (i & 1); x < W; x += 2) ctx.fillRect(x, y - 1, 1, 1)
  }
  if (age > 62) for (const [sx, sy] of STARS) if ((sx + sy + Math.floor(t / 20)) % 7 !== 0 && (age > 70 || sx % 3 === 0)) rect(sx, sy, 1, 1, P.gy6)
  // 日: 生まれたときに昇り、80 歳で沈む
  const p = Math.min(1, age / TUNE.maxAge)
  const sx = 24 + p * (W - 48), sy = 170 - Math.sin(p * Math.PI) * 130
  const sc = age < 50 ? P.ye2 : age < 66 ? P.ye1 : age < 74 ? P.or2 : P.rd3
  ctx.fillStyle = hex(sc)
  for (let dy = -7; dy <= 7; dy++) { const dx = Math.floor(Math.sqrt(49 - dy * dy)); ctx.fillRect(Math.round(sx - dx), Math.round(sy + dy), dx * 2 + 1, 1) }
  // 遠い丘と近い丘
  const hills = k[2]
  for (const [layer, par, base, amp] of [[0, 0.15, 150, 24], [1, 0.35, 172, 18]]) {
    ctx.fillStyle = hex(hills[layer])
    for (let x = 0; x < W; x++) {
      const wx = x + camX * par
      const yy = base - amp * (0.6 * Math.sin(wx / (53 + layer * 20)) + 0.4 * Math.sin(wx / (21 + layer * 7) + layer))
      ctx.fillRect(x, Math.round(yy), 1, H - Math.round(yy))
    }
  }
}

// ---- 遊びの状態 ----
const G = {
  scene: 'title', t: 0,
  stage: 0, map: null, cols: 0,
  age: 0, phase: 0,
  p: null, enemies: [], crumbles: new Map(), doors: [], springs: new Map(),
  parts: [], pops: [], camX: 0,
  hitstop: 0, sceneT: 0, flipR: 1,
  runAges: [],
  freeze: params.has('freeze'),
}

function tileAt(c, r) {
  if (c < 0 || c >= G.cols) return '#'
  if (r < 0) return tileAt(c, 0) === '#' ? '#' : '.'
  if (r >= ROWS) return '.'
  return G.map[r][c]
}
function solid(c, r) {
  const ch = tileAt(c, r)
  if (ch === '#' || ch === '<' || ch === '>') return true
  if (ch === 'c') return (G.crumbles.get(c * ROWS + r)?.st ?? 0) !== 2
  if (ch === 'D') return !G.doors[G.doorOf.get(c)]?.open
  return false
}
const oneway = (c, r) => tileAt(c, r) === '-'

function startStage(i, age = 0) {
  const s = STAGES[i]
  G.stage = i
  G.map = s.rows.map((r) => r.split(''))
  G.cols = G.map[0].length
  G.enemies = []; G.crumbles = new Map(); G.springs = new Map(); G.parts = []; G.pops = []
  G.doors = s.doors.map((d) => ({ ...d, open: 0 }))
  G.doorOf = new Map(G.doors.map((d, k) => [d.door, k]))
  let start = { x: 32, y: 0 }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < G.cols; c++) {
    const ch = G.map[r][c]
    if (ch === 'P') { start = { x: c * T + 3, y: (r + 1) * T - 12 }; G.map[r][c] = '.' }
    if (ch === 'e') { G.enemies.push({ x: c * T + 2, y: (r + 1) * T - 8, w: 12, h: 8, vy: 0, dir: -1, t: c * 7 }); G.map[r][c] = '.' }
    if (ch === 'G') { G.goal = { x: c * T + 8, y: (r + 1) * T }; G.map[r][c] = '.' }
  }
  G.p = { x: start.x, y: start.y, w: 10, h: 12, vx: 0, vy: 0, ground: false, face: 1, coyote: 0, buf: 0, inv: 0, flash: 0, fallT: 0, spring: false, safe: { ...start }, run: 0 }
  G.age = age; G.phase = phaseOf(age)
  G.camX = Math.max(0, start.x - 120)
  G.hitstop = 0
  setScene('birth')
}
function setScene(s) { G.scene = s; G.sceneT = 0 }

// ---- 動かす ----
// 端は少数のまま数える（1 点引くと、0.25 点ずつ沈んでも気づかず、地面で上下に揺れる）
const EPS = 0.001
function overlapTiles(e, fn) {
  const c0 = Math.floor(e.x / T), c1 = Math.floor((e.x + e.w - EPS) / T)
  const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - EPS) / T)
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (fn(c, r)) return true
  return false
}
function moveX(e, dx) {
  e.x += dx
  const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - EPS) / T)
  if (dx > 0) {
    const c = Math.floor((e.x + e.w - EPS) / T)
    for (let r = r0; r <= r1; r++) if (solid(c, r)) { e.x = c * T - e.w; return true }
  } else if (dx < 0) {
    const c = Math.floor(e.x / T)
    for (let r = r0; r <= r1; r++) if (solid(c, r)) { e.x = (c + 1) * T; return true }
  }
  return false
}
function moveY(e, dy) {
  const prevBottom = e.y + e.h
  e.y += dy
  e.ground = false
  const c0 = Math.floor(e.x / T), c1 = Math.floor((e.x + e.w - EPS) / T)
  if (dy > 0) {
    const r = Math.floor((e.y + e.h - EPS) / T)
    for (let c = c0; c <= c1; c++) {
      if (solid(c, r) || (oneway(c, r) && prevBottom <= r * T + 0.01)) { e.y = r * T - e.h; e.vy = 0; e.ground = true; return true }
    }
  } else if (dy < 0) {
    const r = Math.floor(e.y / T)
    for (let c = c0; c <= c1; c++) if (solid(c, r)) { e.y = (r + 1) * T; e.vy = 0; return true }
  }
  return false
}
// 足の下のマス
function under(e) {
  const r = Math.floor((e.y + e.h) / T)
  const out = []
  for (let c = Math.floor(e.x / T); c <= Math.floor((e.x + e.w - EPS) / T); c++) out.push([c, r, tileAt(c, r)])
  return out
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function burst(x, y, n, colors, { speed = 1.5, up = 0, life = 30, grav = 0.05 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6)
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life: life * (0.6 + Math.random() * 0.4), max: life, c: colors[i % colors.length], grav })
  }
}
function pop(x, y, s, c = P.white) { G.pops.push({ x, y, s, c, t: 0 }) }
function addYears(n, x, y) {
  G.age += n
  pop(x, y, `+${n}さい`, P.rd4)
}

function hurt(from) {
  const p = G.p
  if (p.inv > 0 || p.fallT > 0) return
  G.hitstop = 8
  p.flash = 8
  p.inv = 90
  p.vx = (p.x + p.w / 2 < from.x + from.w / 2 ? -1 : 1) * 2.2
  p.vy = -2.6
  p.spring = true
  SE.hit()
  burst(p.x + 5, p.y + 6, 10, [P.white, P.rd3, P.ye2], { speed: 2.2, life: 18 })
  addYears(TUNE.hitYears, p.x + 5, p.y - 6)
}

function updatePlayer() {
  const p = G.p
  if (p.fallT > 0) {
    if (--p.fallT === 0) {
      p.x = p.safe.x; p.y = p.safe.y; p.vx = 0; p.vy = 0; p.inv = 60
      addYears(TUNE.fallYears, p.x + 5, p.y - 6)
      burst(p.x + 5, p.y + 6, 12, [P.white, P.ye3], { speed: 1.2, life: 24 })
    }
    return
  }
  const sp = speedOf(G.age), jh = jumpOf(G.age)
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  if (dir) p.face = dir
  const acc = p.ground ? 0.35 : 0.22
  p.vx += Math.max(-acc, Math.min(acc, dir * sp - p.vx))
  // ジャンプ（少し早押し・踏み外しても受け付ける）
  p.buf = hit('jump') ? 6 : Math.max(0, p.buf - 1)
  p.coyote = p.ground ? 6 : Math.max(0, p.coyote - 1)
  if (p.buf && p.coyote) {
    p.vy = -Math.sqrt(2 * TUNE.gravity * jh); p.buf = 0; p.coyote = 0; p.spring = false
    SE.jump(vigor(G.age))
  }
  if (!keys.jump && !p.spring && p.vy < -1.6) p.vy = -1.6
  p.vy = Math.min(5, p.vy + TUNE.gravity)
  if (p.vy > 0) p.spring = false
  // コンベア
  let belt = 0
  if (p.ground) for (const [, , ch] of under(p)) { if (ch === '>') belt = TUNE.belt; if (ch === '<') belt = -TUNE.belt }
  moveX(p, p.vx + belt)
  const wasGround = p.ground
  const vyBefore = p.vy
  moveY(p, p.vy)
  if (p.ground && !wasGround && vyBefore > 2.5) burst(p.x + 5, p.y + 12, 4, [P.gy6, P.br5], { speed: 0.8, up: 0.3, life: 14, grav: 0.02 })
  // 足の下
  if (p.ground) {
    const u = under(p)
    for (const [c, r, ch] of u) {
      if (ch === 'c') {
        const k = c * ROWS + r
        const s = G.crumbles.get(k)
        if (!s || s.st === 0) G.crumbles.set(k, { st: 1, t: TUNE.crumble })
      }
    }
    if (u.every(([, , ch]) => ch === '#')) p.safe = { x: p.x, y: p.y }
  }
  // ばね（真ん中が乗ったら）・スイッチ
  const cc = Math.floor((p.x + p.w / 2) / T), fr = Math.floor((p.y + p.h - EPS) / T)
  const here = tileAt(cc, fr)
  if (here === 's' && p.vy >= 0) {
    p.vy = -Math.sqrt(2 * TUNE.gravity * TUNE.springH); p.spring = true
    G.springs.set(cc, 12); SE.spring()
    burst(cc * T + 8, fr * T + 8, 6, [P.white, P.ye2], { speed: 1.4, life: 14 })
  }
  if (here === 'S' && p.ground) for (const d of G.doors) if (d.sw === cc) {
    if (d.open < d.time - 20) { SE.switch(); if (!d.open) SE.door() }
    d.open = d.time
  }
  // 穴に落ちた
  if (p.y > ROWS * T + 24) { p.fallT = 40; SE.fall() }
  if (p.inv > 0) p.inv--
  if (p.flash > 0) p.flash--
  if (Math.abs(p.vx) > 0.1 && p.ground) p.run += Math.abs(p.vx); else if (p.ground) p.run = 0
}

function updateWorld() {
  // 崩れる床
  for (const [k, s] of G.crumbles) {
    if (s.st === 1 && --s.t <= 0) {
      s.st = 2; s.t = 240
      const c = Math.floor(k / ROWS), r = k % ROWS
      SE.crumble()
      burst(c * T + 8, r * T + 8, 10, [P.st2, P.st1, P.gy5], { speed: 1, life: 40, grav: 0.15 })
    } else if (s.st === 2 && --s.t <= 0) {
      const c = Math.floor(k / ROWS), r = k % ROWS
      if (!overlap(G.p, { x: c * T, y: r * T, w: T, h: T })) G.crumbles.delete(k); else s.t = 10
    }
  }
  // 扉
  for (const d of G.doors) {
    if (d.open > 0) {
      if (d.open <= 90 && d.open % 30 === 0) SE.tick()
      const dc = { x: d.door * T, y: 0, w: T, h: ROWS * T }
      if (d.open === 1 && overlap(G.p, dc)) continue
      if (--d.open === 0) SE.door()
    }
  }
  for (const [c, n] of G.springs) { if (n <= 1) G.springs.delete(c); else G.springs.set(c, n - 1) }
  // 敵
  for (const e of G.enemies) {
    e.t++
    e.vy = Math.min(5, e.vy + TUNE.gravity)
    if (moveX(e, e.dir * 0.45)) e.dir *= -1
    moveY(e, e.vy)
    if (e.ground) {
      const fc = Math.floor((e.dir > 0 ? e.x + e.w : e.x - 1) / T), fr = Math.floor((e.y + e.h) / T)
      if (!solid(fc, fr) && !oneway(fc, fr)) e.dir *= -1
    }
    if (overlap(G.p, e)) hurt(e)
  }
  G.enemies = G.enemies.filter((e) => e.y < ROWS * T + 32)
}

function updateFx() {
  for (const q of G.parts) { q.x += q.vx; q.y += q.vy; q.vy += q.grav; q.vx *= 0.97; q.life-- }
  G.parts = G.parts.filter((q) => q.life > 0)
  for (const q of G.pops) q.t++
  G.pops = G.pops.filter((q) => q.t < 60)
}

function updateCamera(snap = false) {
  const p = G.p
  const target = Math.max(0, Math.min(G.cols * T - W, p.x + 5 - 130 + p.face * 24))
  G.camX = snap ? target : G.camX + (target - G.camX) * 0.08
}

function updatePlay() {
  if (hit('retry')) { startStage(G.stage); return }
  if (G.hitstop > 0) { G.hitstop--; return }
  if (!G.freeze) G.age += YEARS_PER_FRAME()
  const ph = phaseOf(Math.min(G.age, TUNE.maxAge - 0.001))
  if (ph !== G.phase) {
    G.phase = ph
    G.p.flash = 6
    SE.grow()
    burst(G.p.x + 5, G.p.y + 4, 14, [P.white, P.ye3, P.ye2], { speed: 1.6, life: 26, grav: 0 })
  }
  updatePlayer()
  updateWorld()
  updateFx()
  updateCamera()
  // ゴール: 砂時計にさわる
  const g = G.goal
  if (g && G.p.fallT === 0 && overlap(G.p, { x: g.x - 18, y: g.y - 56, w: 36, h: 56 })) {
    G.flipR = 1 - Math.min(1, G.age / TUNE.maxAge)
    G.clearAge = Math.floor(G.age)
    G.runAges[G.stage] = G.clearAge
    G.newBest = !(best[G.stage] <= G.clearAge)
    if (G.newBest) { best[G.stage] = G.clearAge; saveBest() }
    stopMusic(); SE.hold()
    setScene('flip')
    return
  }
  if (G.age >= TUNE.maxAge) {
    G.age = TUNE.maxAge
    stopMusic(); SE.die()
    playMusic('death')
    setScene('death')
  }
}

// ---- 場面 ----
function update() {
  pollPad()
  G.t++; G.sceneT++
  switch (G.scene) {
    case 'title':
      if (anyOk()) { G.runAges = []; startStage(+(params.get('stage') || 1) - 1, +(params.get('age') || 0)) }
      break
    case 'birth':
      updateFx(); updateCamera()
      if (G.sceneT === 1) { burst(G.p.x + 5, G.p.y + 6, 16, [P.white, P.ye3, P.pk3], { speed: 1.4, life: 40, grav: -0.01 }) }
      if (G.sceneT >= 50 || (G.sceneT > 10 && (keys.left || keys.right || hit('jump')))) { setScene('play'); playMusic('stage') }
      break
    case 'play':
      if (hit('back')) { stopMusic(); setScene('title'); break }
      updatePlay()
      break
    case 'flip': {
      updateFx()
      const f = G.sceneT
      if (f === 27) { SE.flip(); playMusic('clear'); burst(G.goal.x, G.goal.y - 32, 30, [P.white, P.sa3, P.ye2, P.sa2], { speed: 2.6, life: 50, grav: 0.03 }) }
      if (f > 120 && anyOk() || f > 420) {
        if (G.stage + 1 >= STAGES.length) { stopMusic(); setScene('ending'); playMusic('ending') }
        else startStage(G.stage + 1)
      }
      break
    }
    case 'death':
      updateFx()
      if (G.sceneT > 30 && G.sceneT < 100 && G.sceneT % 3 === 0) G.parts.push({ x: G.p.x + 2 + Math.random() * 6, y: G.p.y + 10 - Math.random() * 10, vx: 0, vy: -0.4 - Math.random() * 0.4, life: 60, max: 60, c: [P.white, P.ye3, P.sa3][G.sceneT % 3], grav: 0 })
      if (G.sceneT > 150 && anyOk() || G.sceneT > 480) startStage(G.stage)
      if (hit('back')) { stopMusic(); setScene('title') }
      break
    case 'ending': {
      updateFx()
      const k = Math.max(0, Math.min(1, (G.sceneT - ENDING.fade) / (ENDING.sand - ENDING.fade)))
      const ph = phaseOf(Math.min(k * TUNE.maxAge, 79.9))
      if (G.sceneT === 1) G.endPhase = ph
      if (G.endPhase !== ph) { G.endPhase = ph; G.endFlash = 6; SE.grow(); burst(136, 184, 12, [P.white, P.ye3], { speed: 1.4, life: 24, grav: 0 }) }
      if (G.endFlash > 0) G.endFlash--
      if (G.sceneT >= ENDING.sand && G.sceneT < ENDING.gone && G.sceneT % 3 === 0) G.parts.push({ x: 132 + Math.random() * 8, y: 186 - Math.random() * 10, vx: 0, vy: -0.4 - Math.random() * 0.4, life: 70, max: 70, c: [P.white, P.ye3, P.sa3][G.sceneT % 3], grav: 0 })
      if (G.sceneT > ENDING.done && anyOk()) { stopMusic(); setScene('title') }
      break
    }
  }
  pressed.clear()
}

// ---- 描く ----
function drawTiles() {
  const c0 = Math.floor(G.camX / T), c1 = Math.min(G.cols - 1, c0 + W / T + 1)
  const ox = -Math.round(G.camX)
  const ground = (c, r) => { const ch = tileAt(c, r); return ch === '#' || ch === '<' || ch === '>' }
  for (let r = 0; r < ROWS; r++) for (let c = c0; c <= c1; c++) {
    const ch = G.map[r][c]
    const x = c * T + ox, y = r * T
    if (ch === '#') {
      draw('tiles/ground', 'center' + (1 + ((c * 7 + r * 13) % 4)), x, y)
      if (!ground(c, r - 1) && tileAt(c, r - 1) !== 'D') draw('tiles/ground', 'top', x, y)
      if (r < ROWS - 1 && !ground(c, r + 1) && tileAt(c, r + 1) !== 'D') draw('tiles/ground', 'bottom', x, y)
      if (!ground(c - 1, r)) draw('tiles/ground', 'left', x, y)
      if (!ground(c + 1, r)) draw('tiles/ground', 'right', x, y)
    } else if (ch === '<' || ch === '>') {
      draw('tiles/parts', anim('tiles/parts', 'belt', G.t * 16.7) || 'conv1', x, y, ch === '<')
    } else if (ch === '-') {
      draw('tiles/parts', 'platform', x, y)
    } else if (ch === 'c') {
      const s = G.crumbles.get(c * ROWS + r)
      if (!s) draw('tiles/parts', 'crumble', x, y)
      else if (s.st === 1) draw('tiles/parts', (G.t >> 2) & 1 ? 'crumble2' : 'crumble', x + ((G.t >> 1) & 1 ? 1 : -1), y)
    } else if (ch === 's') {
      draw('tiles/parts', G.springs.has(c) && G.springs.get(c) > 6 ? 'spring2' : 'spring', x, y)
    } else if (ch === 'S') {
      const open = G.doors.some((d) => d.sw === c && d.open > 0)
      draw('tiles/parts', open ? 'switch2' : 'switch', x, y)
    } else if (ch === 'D') {
      const d = G.doors[G.doorOf.get(c)]
      if (!d?.open) draw('tiles/parts', 'door', x, y)
      else if (d.open < 90 && (d.open >> 3) & 1) { ctx.globalAlpha = 0.5; draw('tiles/parts', 'door', x, y); ctx.globalAlpha = 1 }
      else { ctx.globalAlpha = 0.18; draw('tiles/parts', 'door', x, y); ctx.globalAlpha = 1 }
    }
  }
}
function drawPlayer(alpha = 1, tint = null) {
  const p = G.p
  if (p.fallT > 0) return
  if (p.inv > 0 && p.flash === 0 && (p.inv >> 2) & 1 && G.scene === 'play') return
  // 始まりの、まだ動けない間は点滅（動けるようになったら止める）
  if (G.scene === 'birth' && (G.sceneT >> 2) & 1) return
  const ref = 'player/' + phaseName(G.age)
  let name = 'stand'
  if (!p.ground) name = 'jump'
  else if (Math.abs(p.vx) > 0.15) {
    // 歩きのコマは絵の anim run の並び（コマを足せばそのまま使う）。進んだ距離で送る
    const fr = ART[ref]?.anims.run?.frames || ['run1', 'run2']
    name = fr[Math.floor(p.run / 6) % fr.length]
  }
  ctx.globalAlpha = alpha
  draw(ref, name, p.x - 3 - Math.round(G.camX), p.y - 4, p.face < 0, p.flash > 0 ? P.white : tint)
  ctx.globalAlpha = 1
}
function drawFx(ox) {
  for (const q of G.parts) { if (q.life < q.max * 0.3 && (q.life | 0) % 2) continue; rect(q.x + ox, q.y, 1, 1, q.c) }
  for (const q of G.pops) text(q.s, q.x + ox, q.y - Math.min(16, q.t / 2), q.c, { align: 'center' })
}
function drawWorld() {
  const ox = -Math.round(G.camX)
  drawSky(G.age, G.camX, G.t)
  drawTiles()
  if (G.goal && G.scene !== 'flip') drawHourglass(G.goal.x + ox, G.goal.y, 1 - Math.min(1, G.age / TUNE.maxAge), true, G.t)
  for (const e of G.enemies) {
    const fr = anim('enemy/walker', 'walk', e.t * 16.7) || 'walk1'
    draw('enemy/walker', fr, e.x - 2 + ox, e.y + e.h - 16, e.dir < 0)
  }
}

const easeOut = (t) => 1 - (1 - t) ** 3
function drawFlip() {
  const ox = -Math.round(G.camX)
  const f = G.sceneT, g = G.goal
  let angle = 0, tint = null, r = G.flipR
  if (f >= 12 && f < 24) angle = -0.26 * easeOut((f - 12) / 12)
  else if (f >= 24 && f < 27) { angle = -0.26; tint = P.white }
  else if (f >= 27 && f < 45) angle = -0.26 + (Math.PI + 0.26) * easeOut((f - 27) / 18)
  if (f >= 45) r = Math.max(0, 1 - G.flipR - (f - 45) / 3000)   // ひっくり返したので、使った砂が上に
  drawHourglass(g.x + ox, g.y, r, f >= 45 || f < 12, G.t, angle >= Math.PI ? 0 : angle, tint)
  drawPlayer(1, f < 5 ? P.white : null)
  drawFx(ox)
  if (f > 60) {
    const y = 40
    text(`${G.clearAge}さいで ひっくりかえした`, W / 2, y, P.white, { align: 'center' })
    if (G.newBest) { if ((f >> 4) & 1) text('じこベスト！', W / 2, y + 16, P.ye2, { align: 'center' }) }
    else text(`ベスト ${best[G.stage]}さい`, W / 2, y + 16, P.gy6, { align: 'center' })
    if (f > 120) text(G.stage + 1 >= STAGES.length ? `${KEY()}で さいごへ` : `${KEY()}で つぎの人生へ`, W / 2, y + 36, P.gy5, { align: 'center' })
  }
}

function drawDeath() {
  const f = G.sceneT
  const alpha = f < 30 ? 1 : Math.max(0, 1 - Math.floor((f - 30) / 12) * 0.25)
  drawPlayer(alpha)
  drawFx(-Math.round(G.camX))
  if (f > 70) {
    text('いのちが つきた', W / 2, 60, P.white, { align: 'center' })
    if (f > 150) text(`${KEY()}で もういちど あかちゃんから`, W / 2, 80, P.gy5, { align: 'center' })
  }
}

function drawBanner() {
  const f = G.sceneT
  if (G.scene !== 'birth' && !(G.scene === 'play' && f < 70)) return
  const s = STAGES[G.stage]
  const a = G.scene === 'birth' ? 1 : 1 - f / 70
  if (a <= 0) return
  if (G.scene === 'play' && (f >> 2) % 2 && f > 40) return
  text(`だい${G.stage + 1}の人生`, W / 2, 56, P.white, { align: 'center' })
  text(s.name, W / 2, 72, P.ye3, { align: 'center', scale: 2 })
}

// エンディング: 最後の砂時計の砂が落ちきるまで、一生を見届ける
// 実績が 1 行ずつ並び（120 + 90 × 行）、5 行目が出るころに砂が落ちきる
const ENDING = { fade: 60, sand: 500, gone: 620, done: 720 }
function drawEnding() {
  const f = G.sceneT
  const k = Math.max(0, Math.min(1, (f - ENDING.fade) / (ENDING.sand - ENDING.fade)))
  const age = k * TUNE.maxAge
  drawSky(age, f * 0.3, G.t)
  for (let c = 0; c < W / T; c++) for (let r = 12; r < 15; r++) {
    draw('tiles/ground', 'center' + (1 + ((c * 7 + r * 13) % 4)), c * T, r * T)
    if (r === 12) draw('tiles/ground', 'top', c * T, r * T)
  }
  drawHourglass(176, 192, 1 - k, k > 0 && k < 1, G.t)
  const ph = G.endPhase ?? 0
  const fade = f < ENDING.sand ? 1 : Math.max(0, 1 - Math.floor((f - ENDING.sand) / 15) * 0.25)
  ctx.globalAlpha = fade
  draw('player/' + PHASES[ph][1], 'stand', 128, 176, false, G.endFlash > 0 ? P.white : null)
  ctx.globalAlpha = 1
  drawFx(0)
  // これまでの人生
  const lines = STAGES.map((s, i) => [s.name, G.runAges[i]])
  lines.forEach(([name, a], i) => {
    if (f < 120 + i * 90 || f > ENDING.gone) return
    text(`${name}`, 96, 24 + i * 14, P.white)
    text(a != null ? `${a}さい` : '―', 224, 24 + i * 14, P.ye3, { align: 'center' })
  })
  if (f > ENDING.gone) text('いのちを まっとうした', W / 2, 48, P.white, { align: 'center', scale: 2 })
  if (f > ENDING.done) text(`おしまい　　${KEY()}で タイトルへ`, W / 2, 86, P.gy6, { align: 'center' })
}

// 題字。Pixel で描いた ui/title（logo）があればそれを、無ければ文字から作る
let logoCanvas = null
function drawLogo(cx, y) {
  const drawn = pic('ui/title', 'logo')
  if (drawn) { ctx.drawImage(drawn, Math.round(cx - drawn.width / 2), y); return }
  if (!logoCanvas) logoCanvas = makeLogo('命の砂時計', 3)
  ctx.drawImage(logoCanvas, Math.round(cx - logoCanvas.width / 2), y)
}
// 文字の形を 3 倍にして、太い縁取り・落ちる影・上から下への色の段（砂の色）・上の縁の光を付ける
function makeLogo(s, k) {
  const w = textWidth(s), h = 12
  const mask = []
  let x0 = 0
  for (const ch of s) {
    const g = GLYPHS[ch] || GLYPHS['?']
    for (let r = 0; r < 12; r++) {
      const bits = parseInt(g.slice(1 + r * 2, 3 + r * 2), 16)
      for (let b = 0; b < 8; b++) if (bits & (0x80 >> b)) mask.push([x0 + b, r])
    }
    x0 += parseInt(g[0], 16)
  }
  const on = new Set(mask.map(([x, y]) => y * 1000 + x))
  const pad = 4
  const c = document.createElement('canvas')
  c.width = w * k + pad * 2; c.height = h * k + pad * 2
  const g = c.getContext('2d')
  const box = (x, y, ww, hh, col) => { g.fillStyle = hex(col); g.fillRect(x, y, ww, hh) }
  // 影（右下へ 2 点）と縁取り（まわり 2 点）
  for (const [x, y] of mask) box(pad + x * k, pad + y * k + 3, k + 2, k + 2, P.pu0)
  for (const [x, y] of mask) box(pad + x * k - 2, pad + y * k - 2, k + 4, k + 4, P.ink)
  // 中身: 上は明るい砂、下へ濃く
  const band = (yy) => (yy < 3 ? P.ye3 : yy < 6 ? P.sa3 : yy < 9 ? P.ye1 : P.or2)
  for (const [x, y] of mask) box(pad + x * k, pad + y * k, k, k, band(y))
  // 上が空いている所に 1 点の光
  for (const [x, y] of mask) if (!on.has((y - 1) * 1000 + x)) box(pad + x * k, pad + y * k, k, 1, P.white)
  return c
}

function drawTitle() {
  const t = G.t
  const age = (t / 12) % TUNE.maxAge
  drawSky(age, t * 0.5, t)
  for (let c = 0; c < W / T; c++) for (let r = 12; r < 15; r++) {
    draw('tiles/ground', 'center' + (1 + ((c * 7 + r * 13) % 4)), c * T, r * T)
    if (r === 12) draw('tiles/ground', 'top', c * T, r * T)
  }
  drawHourglass(W / 2, 192, 1 - age / TUNE.maxAge, true, t)
  draw('player/' + phaseName(age), (t >> 3) & 1 ? 'run1' : 'run2', 100, 176)
  drawLogo(W / 2, 22)
  if ((t >> 5) & 1 || t < 30) text(touchMode ? 'タップで はじめる' : 'Z か スペースで はじめる', W / 2, 84, P.ye3, { align: 'center' })
  const rec = STAGES.map((s, i) => best[i]).filter((v) => v != null)
  if (rec.length) text('ベスト ' + STAGES.map((s, i) => best[i] ?? '―').join(' / '), W / 2, 100, P.gy6, { align: 'center' })
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  rect(0, 0, W, H, P.black)
  switch (G.scene) {
    case 'title': drawTitle(); break
    case 'birth': case 'play': drawWorld(); drawPlayer(); drawFx(-Math.round(G.camX)); drawBanner(); break
    case 'flip': drawWorld(); drawFlip(); break
    case 'death': drawWorld(); drawDeath(); break
    case 'ending': drawEnding(); break
  }
}

// ---- 回す（60 回/秒で固定） ----
let acc = 0, last = performance.now()
function frame(now) {
  acc += Math.min(100, now - last); last = now
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60 }
  render()
  requestAnimationFrame(frame)
}
if (params.has('ending')) { G.runAges = STAGES.map(() => 40); setScene('ending'); G.parts = [] }
if (!params.has('test')) requestAnimationFrame(frame)

// 確かめ用（headless のテストから使う）
window.__G = { G, keys, pressed, update, render, startStage, TUNE, vigor, STAGES }
