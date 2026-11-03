// 確かめ: Vite（npm run dev、:5194）を立ててから
//   node tools/bot.mjs [固定する年齢]   右を押し続けて壁・穴・敵の前で跳ぶ自動操作で、5 ステージを走らせる（年齢を決めると、その体のまま。当たっても年をとらない）
//   node tools/bot.mjs shots            各場面の画面を zz-*.png に撮る
//   LIFE=50 node tools/bot.mjs          寿命（秒）を変えて測る
//   NOHIT=1 node tools/bot.mjs          敵に当たらない（上級者の代わり。本道だけで、近道は使わない）
// 画面なしのブラウザは ~/src/etc/CLAUDE.md の「確かめるとき」のもの
import { chromium } from '../../enso/node_modules/playwright/index.mjs'
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' })
const page = await browser.newPage({ viewport: { width: 700, height: 560 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const mode = process.argv[2] || 'bot'
await page.goto((process.env.URL || 'http://127.0.0.1:5194/') + '?test' + (process.env.LIFE ? '&life=' + process.env.LIFE : ''))
await page.waitForFunction(() => window.__G)
if (mode === 'shots') {
  const shot = async (name) => { await page.evaluate(() => __G.render()); await page.locator('canvas').screenshot({ path: `zz-${name}.png` }) }
  await page.evaluate(() => { for (let i = 0; i < 40; i++) __G.update() })
  await shot('title')
  for (const [st, age, x] of [[0, 3, 0], [1, 25, 300], [2, 50, 600], [3, 66, 900], [4, 76, 1500]]) {
    await page.evaluate(([st, age, x]) => { const { G } = __G; __G.startStage(st, age); G.scene = 'play'; G.p.x += x; G.p.y = 0; for (let i = 0; i < 90; i++) __G.update() }, [st, age, x])
    await shot('stage' + (st + 1))
  }
  await page.evaluate(() => { const { G } = __G; G.p.x = G.goal.x - 30; G.p.y = G.goal.y - 40; for (let i = 0; i < 200 && G.scene === 'play'; i++) { __G.keys.right = true; __G.update() } __G.keys.right = false; for (let i = 0; i < 14; i++) __G.update() })
  for (const n of [0, 8, 6, 12, 64]) { await page.evaluate((n) => { for (let i = 0; i < n; i++) __G.update(); __G.G.camX = __G.G.goal.x - 200 }, n); await shot('flip' + n) }
  await page.evaluate(() => { const { G } = __G; G.scene = 'ending'; G.sceneT = 0; G.runAges = [30, 42, 51, 60, 70]; for (let i = 0; i < 700; i++) __G.update() })
  await shot('ending700')
  await page.evaluate(() => { for (let i = 0; i < 850; i++) __G.update() })
  await shot('ending1550')
} else {
  // bot: 右を押し続け、壁・穴・敵の前で跳ぶ。age を決めると年齢を止める
  const fixed = process.argv[2] != null ? +process.argv[2] : null
  const res = await page.evaluate(([fixed, nohit]) => {
    const { G, keys, pressed, update, startStage, STAGES, TUNE } = __G
    if (fixed != null) { TUNE.hitYears = 0; TUNE.fallYears = 0 }
    const out = []
    for (let st = 0; st < STAGES.length; st++) {
      startStage(st, fixed ?? 0); G.freeze = fixed != null
      G.scene = 'play'
      let bestX = 0, still = 0, f = 0, holdJ = 0, lastJ = -99
      const T = 16
      while (G.scene === 'play' && f < 60 * 400) {
        f++
        const p = G.p
        const fc = Math.floor((p.x + p.w + 3) / T), fr = Math.floor((p.y + p.h - 1) / T)
        const ahead = Math.floor((p.x + p.w + 4) / T)
        const wall = (c, r) => { const ch = G.map[r]?.[c]; return ch === '#' || ch === '<' || ch === '>' || ch === 'D' || ch === 'c' }
        const groundAhead = [0, 1, 2, 3, 4, 5, 6].some((d) => { const ch = G.map[fr + 1 + d]?.[ahead]; return ch && ch !== '.' && ch !== 'e' })
        const enemy = G.enemies.some((e) => e.x > p.x && e.x - (p.x + p.w) < 20 && Math.abs(e.y - p.y) < 16)
        const needJump = p.ground && (wall(fc, fr) || !groundAhead || enemy)
        keys.right = true
        if (needJump && f - lastJ > 8) { pressed.add('jump'); holdJ = 30; lastJ = f }
        keys.jump = holdJ > 0; if (holdJ > 0) holdJ--
        if (nohit) G.p.inv = 2
        update()
        if (fixed != null) G.age = fixed
        if (p.x > bestX + 1) { bestX = p.x; still = 0 } else if (++still > 900) break
      }
      out.push({ stage: STAGES[st].name, cols: G.map[0].length, scene: G.scene, age: G.age.toFixed(1), x: Math.round(G.p.x / 16), sec: (f / 60).toFixed(1) })
    }
    return out
  }, [fixed, !!process.env.NOHIT])
  console.table(res)
}
console.log(errs.length ? errs.join('\n') : 'エラーなし')
await browser.close()
