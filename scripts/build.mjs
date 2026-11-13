import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const rootDir = process.cwd();

async function bundleGame({ srcDir, outPath, transforms = [] }) {
  const templatePath = path.join(rootDir, srcDir, 'template.html');
  const cssPath = path.join(rootDir, srcDir, 'styles.css');
  const entryPath = path.join(rootDir, srcDir, 'main.js');

  const template = fs.readFileSync(templatePath, 'utf8');
  const cssResult = await esbuild.transform(fs.readFileSync(cssPath, 'utf8'), {
    loader: 'css',
    minify: true,
  });

  const jsResult = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    target: ['es2022'],
  });

  const jsCode = jsResult.outputFiles[0].text;

  let html = template
    .replace('/*__INLINE_CSS__*/', () => cssResult.code.trim())
    .replace('/*__INLINE_JS__*/', () => jsCode.trim());

  for (const [token, val] of transforms) {
    html = html.replaceAll(token, () => val);
  }

  fs.writeFileSync(outPath, html, 'utf8');
  const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`Built ${path.basename(outPath)} (${sizeKB} KB)`);
  return html;
}

const TEMPLATE_GAMES = [
  {
    srcDir: 'src-crosstown',
    standaloneOut: 'crosstown.html',
    artifactOut: 'crosstown_nyc.html',
    prefix: 'ct',
    nextHref: './water-keeps.html',
    nextLabel: '⇄ 水之所存',
  },
  {
    srcDir: 'src-water',
    standaloneOut: 'water-keeps.html',
    artifactOut: 'what_the_water_keeps.html',
    prefix: 'wk',
    nextHref: './hyper-tennis.html',
    nextLabel: '⇄ 失控乒乓',
  },
  {
    srcDir: 'src-tennis',
    standaloneOut: 'hyper-tennis.html',
    artifactOut: 'hyper_tennis.html',
    prefix: 'ht',
    nextHref: './mirror-earth.html',
    nextLabel: '⇄ 镜像地球',
  },
  {
    srcDir: 'src-earth',
    standaloneOut: 'mirror-earth.html',
    artifactOut: 'mirror_earth.html',
    prefix: 'me',
    nextHref: './endless-portals.html',
    nextLabel: '⇄ 无尽传送门',
  },
  {
    srcDir: 'src-portals',
    standaloneOut: 'endless-portals.html',
    artifactOut: 'endless_portals.html',
    prefix: 'ep',
    nextHref: './worm-rider.html',
    nextLabel: '⇄ 沙丘巨虫',
  },
  {
    srcDir: 'src-wormrider',
    standaloneOut: 'worm-rider.html',
    artifactOut: null,
    prefix: 'wr',
    nextHref: './starry-nightrider.html',
    nextLabel: '⇄ 星月夜骑士',
  },
  {
    srcDir: 'src-nightrider',
    standaloneOut: 'starry-nightrider.html',
    artifactOut: null,
    prefix: 'nr',
    nextHref: './saltline.html',
    nextLabel: '⇄ 断潮行动',
  },
];

async function buildAll() {
  // 1. Build all 7 WebGL2 Dual-Mode Games (Standalone Root HTML)
  for (const g of TEMPLATE_GAMES) {
    await bundleGame({
      srcDir: g.srcDir,
      outPath: path.join(rootDir, g.standaloneOut),
      transforms: [
        ['__BODY_CLASS__', 'standalone-body'],
        ['__APP_CLASS__', 'standalone'],
        [
          '<!--__HUD_MODE_BTNS__-->',
          `<a href="${g.nextHref}" class="${g.prefix}-mini-btn">${g.nextLabel}</a><a href="./index.html" class="${g.prefix}-mini-btn">⌂ 八作大厅</a>`,
        ],
        [
          '<!--__MENU_MODE_BTNS__-->',
          `<a href="${g.nextHref}" class="${g.prefix}-btn-secondary">${g.nextLabel}</a><a href="./index.html" class="${g.prefix}-btn-secondary">⌂ 八作典藏大厅</a>`,
        ],
      ],
    });
  }

  // 2. Build Standalone Saltline: Black Tide -> saltline.html
  await bundleGame({
    srcDir: 'src',
    outPath: path.join(rootDir, 'saltline.html'),
  });

  // 3. Copy 8-Game Anthology Hub -> index.html
  const hubSrc = path.join(rootDir, 'src-hub', 'index.html');
  const hubOut = path.join(rootDir, 'index.html');
  fs.copyFileSync(hubSrc, hubOut);
  const hubKB = (fs.statSync(hubOut).size / 1024).toFixed(1);
  console.log(`Built index.html 8-Game Anthology Hub (${hubKB} KB)`);

  // 4. Optional inline chat embed bundles for Top 5 games when BUILD_ARTIFACTS_DIR env is set
  if (process.env.BUILD_ARTIFACTS_DIR) {
    for (const g of TEMPLATE_GAMES) {
      if (!g.artifactOut) continue;
      await bundleGame({
        srcDir: g.srcDir,
        outPath: path.join(process.env.BUILD_ARTIFACTS_DIR, g.artifactOut),
        transforms: [
          ['__BODY_CLASS__', ''],
          ['__APP_CLASS__', ''],
          [
            '<!--__HUD_MODE_BTNS__-->',
            `<button id="btn-tall" class="${g.prefix}-mini-btn" type="button">大屏</button>`,
          ],
          [
            '<!--__MENU_MODE_BTNS__-->',
            `<button id="menu-btn-tall" class="${g.prefix}-btn-secondary" type="button">展开大屏视野</button>`,
          ],
        ],
      });
    }
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
