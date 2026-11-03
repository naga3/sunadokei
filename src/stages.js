// ステージ。区間を並べて組み立てる（1 マス 16 点、高さは 15 マス = 画面の高さ）
// 決まり（README の「ステージの作り方」）:
//   本道は、80 歳の体（いちばん遅く、いちばん低い）でも通れるものだけで作る: 1 段の段差、1 マスの穴、ばね、短いコンベア、歩く敵、時限の扉
//   青年でないと通れないもの（高い足場、崩れる床、大きな穴を跳ぶ）は近道にする。落ちても遠回りになるだけ
// マスの文字: # 地面、- 下から抜けられる足場、c 崩れる床、s ばね、S スイッチ、D 時限の扉、< > コンベア（流れる向き）、
//            e 歩く敵、P はじまり、G 命の砂時計
export const ROWS = 15

function builder() {
  const cols = []
  const doors = []          // { sw: スイッチの列, time: 開いている長さ（フレーム） }
  let h = 3                 // 地面の高さ（下から何マス）
  const col = (gh, put) => {
    const c = Array(ROWS).fill('.')
    for (let r = 0; r < gh; r++) c[ROWS - 1 - r] = '#'
    for (const [lv, ch] of Object.entries(put || {})) c[ROWS - 1 - lv] = ch
    cols.push(c)
    return c
  }
  const b = {
    get x() { return cols.length },
    flat(n, put) { for (let i = 0; i < n; i++) col(h, put && put(i)); return b },
    up(k = 1) { h += k; return b },
    down(k = 1) { h -= k; return b },
    pit(n = 1) { for (let i = 0; i < n; i++) col(0); return b },
    // ばね（地面の上に置く）。老人の助け: 5 マスより少し高く跳ねる
    spring() { return b.flat(1, () => ({ [h]: 's' })) },
    // ばねで上がる高い壁
    wall(k) { b.flat(2).spring(); h += k; return b.flat(2) },
    // 飛び石: 1 マスの穴が 2 つ。青年なら一跳び
    stones() { return b.flat(1).pit().flat(1).pit().flat(2) },
    enemy(n) { return b.flat(n, (i) => (i === Math.floor(n / 2) ? { [h]: 'e' } : null)) },
    conv(n, dir) { return b.flat(n, () => ({ [h - 1]: dir > 0 ? '>' : '<' })) },
    // 1 段ずつの階段
    stairs(k, dir = 1, w = 2) { for (let i = 0; i < k; i++) { h += dir; b.flat(w) } return b },
    // 谷: 1 段ずつ下りて、中を通って、1 段ずつ上る。上を崩れる床の橋がつなぐ（青年なら駆け抜けられる）
    valley(depth, inner, bridge = true) {
      const top = h
      const start = cols.length
      for (let i = 0; i < depth; i++) { h--; b.flat(1) }
      inner(b)
      for (let i = 0; i < depth; i++) { h++; b.flat(1) }
      if (bridge) for (let x = start; x < cols.length - 1; x++) cols[x][ROWS - top] = 'c'
      h = top
      return b
    },
    // 高い足場（地面から 4 マス上）。青年なら下から跳び乗れて、下の遅い道を飛ばせる
    deck(n, inner, lift = 4) {
      const start = cols.length
      inner(b)
      const end = cols.length
      const lv = h + lift - 1
      for (let x = start; x < Math.min(end, start + n); x++) cols[x][ROWS - 1 - lv] = '-'
      return b
    },
    // 足場を途中に置く（1 列ずつ、地面からの高さ）
    plat(n, lift) { return b.flat(n, () => ({ [h + lift - 1]: '-' })) },
    // 時限の扉: スイッチを踏むと、dist 列先の扉が開く。開いている長さは、80 歳の速さでぎりぎり間に合うくらい
    door(dist) {
      const time = Math.ceil(((dist + 2) * 16) / 0.7) + 40
      const sw = cols.length
      b.flat(1, () => ({ [h]: 'S' }))
      b.flat(dist)
      const put = {}
      for (let lv = h; lv < ROWS; lv++) put[lv] = lv < h + 3 ? 'D' : '#'
      col(h, put)
      doors.push({ sw, door: cols.length - 1, time })
      return b.flat(2)
    },
    start() { return b.flat(4, (i) => (i === 2 ? { [h]: 'P' } : null)) },
    goal() { b.flat(5, (i) => (i === 3 ? { [h]: 'G' } : null)); b.flat(10); for (let i = 0; i < 2; i++) col(ROWS); return b },
    done(name) {
      const height = (c) => { let n = 0; while (n < ROWS && '#<>'.includes(c[ROWS - 1 - n])) n++; return n }
      const top = Math.max(...cols.slice(0, -2).filter((c) => !c.includes('D')).map(height))
      if (top > 9) throw new Error(`${name}: 地面が高すぎる（${top} マス）`)
      const rows = []
      for (let r = 0; r < ROWS; r++) rows.push(cols.map((c) => c[r]).join(''))
      return { name, rows, doors }
    },
  }
  return b
}

// 1. 野原: 段差と小さな穴、歩く敵、ばね
function stage1() {
  return builder().start()
    .flat(6).up().flat(4).up().flat(5).down().flat(3).pit().flat(5).down().flat(4)
    .enemy(8).pit().flat(5).up().flat(3)
    .wall(3).flat(6).down().flat(2).down().flat(2).down().flat(4)
    .enemy(10).stones().flat(4)
    .valley(2, (b) => b.flat(6))
    .flat(4).up().flat(3).pit().flat(3).down().flat(6)
    .enemy(8).flat(3).goal().done('野原')
}

// 2. 丘: 高い足場の近道と、谷の崩れる橋
function stage2() {
  return builder().start()
    .flat(6).up().flat(3).up().flat(4).pit().flat(4).down().flat(2)
    .deck(18, (b) => b.flat(2).enemy(6).up().flat(3).down().enemy(7))
    .flat(3).valley(2, (b) => b.flat(2).enemy(6).flat(2))
    .flat(3).wall(4).flat(4).pit().flat(3)
    .stairs(2, -1).flat(2).stones().flat(3)
    .deck(20, (b) => b.flat(1).pit().flat(3).enemy(6).pit().flat(3).enemy(6))
    .flat(2).up().flat(2).up().flat(3).down().flat(2).down().flat(3)
    .enemy(8).goal().done('丘')
}

// 3. 工場の町: コンベアと時限の扉
function stage3() {
  return builder().start()
    .flat(5).conv(5, 1).flat(3).up().flat(3).conv(6, -1).flat(2).down().flat(4)
    .door(10).flat(3)
    .deck(22, (b) => b.flat(2).conv(6, -1).enemy(6).conv(6, -1).flat(2))
    .flat(3).wall(3).flat(3).pit().flat(3).down().flat(2).down().flat(3)
    .valley(3, (b) => b.flat(1).conv(5, -1).enemy(5).flat(1))
    .flat(3).door(14).enemy(8).up().flat(3).stones().flat(3)
    .conv(8, 1).flat(2).up().flat(2).down().flat(2)
    .enemy(8).goal().done('町')
}

// 4. 山: 上って下りる。ばねの壁と、長い近道
function stage4() {
  return builder().start()
    .flat(4).stairs(2, 1, 3).enemy(6).pit().flat(3)
    .wall(3).flat(3).pit().flat(2).down().flat(3).down().flat(2).down().flat(2)
    .deck(26, (b) => b.flat(2).enemy(5).conv(5, -1).flat(1).enemy(6).conv(5, -1).flat(2))
    .flat(3).stones().up().flat(3).pit().flat(3)
    .valley(3, (b) => b.flat(1).enemy(5).conv(4, -1).enemy(5))
    .flat(2).down().flat(2).wall(3).flat(3).door(12).flat(2)
    .stairs(3, -1, 2).enemy(8).pit().flat(3).up().flat(3).stones()
    .enemy(8).goal().done('山')
}

// 5. 夕暮れの道: ぜんぶ
function stage5() {
  return builder().start()
    .flat(4).enemy(6).up().flat(3).pit().flat(3).conv(6, -1).down().flat(3)
    .deck(24, (b) => b.flat(1).enemy(5).pit().flat(2).enemy(5).conv(6, -1).flat(2).enemy(4))
    .flat(2).up().flat(2).valley(3, (b) => b.flat(1).conv(5, -1).enemy(5).conv(4, -1).flat(1))
    .flat(2).down().flat(2).wall(3).flat(3).pit().flat(3).stones().flat(2)
    .door(12).flat(2).down().flat(2).down().flat(3)
    .deck(26, (b) => b.flat(1).enemy(5).conv(5, -1).pit().flat(2).enemy(5).conv(5, -1).flat(3))
    .flat(2).wall(3).flat(2).pit().flat(2).down().flat(2).pit().flat(2).down().flat(2)
    .valley(2, (b) => b.flat(1).enemy(6).flat(1))
    .enemy(8).pit().flat(3).goal().done('夕暮れの道')
}

export const STAGES = [stage1(), stage2(), stage3(), stage4(), stage5()]
