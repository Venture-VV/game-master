# Fable 5.2 浏览器 3D 游戏八作典藏集 (Zero-Asset WebGL2 Octet)

**零外部贴图 · 零外部 3D 模型 · 零外部音频文件 · 浏览器即开即玩的八款截然不同的纯代码 3D 网页游戏**

在线即玩地址（GitHub Pages）：**https://venture-vv.github.io/game-master/**

致敬 GitHub 爆火的 **Claude Fable 5.2「纯代码浏览器 3A 视觉范式」**（[`awesome-fable-5.2`](https://github.com/fengyiqicoder/awesome-fable-5.2)），本仓库完整复刻了社区热度榜 **Top 5 作品** 与 **三部曲代表作**，全部基于单文件 HTML + 程序化着色器 + Web Audio 实时物理声学合成，并提供统一的 **八作典藏门户 [`index.html`](./index.html)**（支持数字键 `1`–`8` 一键启动）：

| 编号 | 作品 | 独立单文件入口 | 题材与核心纯代码技术亮点 |
| :---: | :--- | :--- | :--- |
| **[1]** | **《曼哈顿街区狂飙 · CROSSTOWN NYC》** | [`crosstown.html`](./crosstown.html) | **Top 1 (♥ 7.5k)** · 48 栋摩天楼（帝国大厦/时代广场/东河大桥/中央公园）、湿地柏油反射、撞碎消防栓喷泉与 V8 Funk 律动 |
| **[2]** | **《水之所存 · WHAT THE WATER KEEPS》** | [`water-keeps.html`](./water-keeps.html) | **Top 2 (♥ 4.2k)** · 八重梦境水城双桨泛舟、Gerstner 船尾航迹与铜铃涟漪、Kuwahara 水彩纸纹滤镜与德彪西毡音钢琴 |
| **[3]** | **《失控乒乓 · TENNIS: GO WILD》** | [`hyper-tennis.html`](./hyper-tennis.html) | **Top 3 (♥ 3.0k)** · 五纪元跨时代进化：从 1972 俯视 Pong 蜕变为 3D 弹珠引力场、机甲彗星慢镜头扣杀与日冕奇点首领战 |
| **[4]** | **《镜像地球 · MIRROR EARTH》** | [`mirror-earth.html`](./mirror-earth.html) | **Top 4 (♥ 2.4k)** · 瑞利大气与极光台风、夜间黄金城市灯群、实时球面陨石坑/创世造山网格形变与末日小行星轨道拦截 |
| **[5]** | **《无尽传送门 · ENDLESS PORTALS》** | [`endless-portals.html`](./endless-portals.html) | **Top 5 (♥ 1.9k)** · 双 FBO 屏空间实时传送门视窗、999 种子异星世界（海底焦散/双日荒漠/云海圣殿）无缝滑翔穿越 |
| **[6]** | **《沙丘巨虫 · SHAI-RIDER》** | [`worm-rider.html`](./worm-rider.html) | **巨物驾驭** · 双日西沉热浪海市蜃楼滤镜、沙槌召唤 26 节百米沙虫潜沙躲避轨道光矛、破沙鲸跃秒吞香料母车与巨物铜管 *Braaam* |
| **[7]** | **《星月夜骑士 · STARRY NIGHTRIDER》** | [`starry-nightrider.html`](./starry-nightrider.html) | **油画骑乘** · 实时各向异性 Kuwahara 厚涂油画滤镜、1,450 株随马蹄分开的金色麦浪、圣雷米漩涡星穹与古典木吉他/大提琴合成 |
| **[8]** | **《断潮行动 · SALTLINE: BLACK TIDE》** | [`saltline.html`](./saltline.html) | **战术 FPS** · 半浮点 HDR 暴雨港区积水涟漪 PBR、MK-18 全息红点步枪、EMP 破盾手雷决战重装机甲与室内外机库混响枪声 |

---

## 快速运行与重新构建

仓库根目录已内置打包好的 **9 个零依赖独立静态文件**（`index.html` 大厅 + 8 款单文件游戏），克隆后直接启动任意静态服务即可畅玩：

```bash
npx http-server . -p 8080 -c-1
```

修改源码后一键重新内联打包全部八款作品：

```bash
npm install
npm run build
```

## 目录结构

- `src-hub/`：八作典藏门户页源码（输出 `index.html`）
- `src-crosstown/`：《曼哈顿街区狂飙 · CROSSTOWN NYC》源码（输出 `crosstown.html`）
- `src-water/`：《水之所存 · WHAT THE WATER KEEPS》源码（输出 `water-keeps.html`）
- `src-tennis/`：《失控乒乓 · TENNIS: GO WILD》源码（输出 `hyper-tennis.html`）
- `src-earth/`：《镜像地球 · MIRROR EARTH》源码（输出 `mirror-earth.html`）
- `src-portals/`：《无尽传送门 · ENDLESS PORTALS》源码（输出 `endless-portals.html`）
- `src-wormrider/`：《沙丘巨虫 · SHAI-RIDER》源码（输出 `worm-rider.html`）
- `src-nightrider/`：《星月夜骑士 · STARRY NIGHTRIDER》源码（输出 `starry-nightrider.html`）
- `src/`：《断潮行动 · SALTLINE: BLACK TIDE》源码（输出 `saltline.html`）
- `scripts/build.mjs`：基于 `esbuild` 的零外部依赖单文件 HTML 打包器