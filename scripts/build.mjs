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

const TEMPLATE_WORKS = [
  // 4 Mind-Blowing 3D Interactive Tech-Magic Works
  {
    srcDir: 'src-robotics',
    standaloneOut: 'robotics-lab.html',
    artifactOut: 'robotics_lab.html',
    prefix: 'rb',
    nextHref: './password-keep.html',
    nextLabel: '⇄ 密码筑城',
  },
  {
    srcDir: 'src-keep',
    standaloneOut: 'password-keep.html',
    artifactOut: 'password_keep.html',
    prefix: 'kp',
    nextHref: './xray-mirror.html',
    nextLabel: '⇄ X光魔镜',
  },
  {
    srcDir: 'src-xray',
    standaloneOut: 'xray-mirror.html',
    artifactOut: 'xray_mirror.html',
    prefix: 'xr',
    nextHref: './tactile-planner.html',
    nextLabel: '⇄ 立体手帐',
  },
  {
    srcDir: 'src-planner',
    standaloneOut: 'tactile-planner.html',
    artifactOut: 'tactile_planner.html',
    prefix: 'pl',
    nextHref: './crosstown.html',
    nextLabel: '⇄ 曼哈顿狂飙',
  },
  // 7 Pure-WebGL2 Dual-Mode 3D Games
  {
    srcDir: 'src-crosstown',
    standaloneOut: 'crosstown.html',
    artifactOut: null,
    prefix: 'ct',
    nextHref: './water-keeps.html',
    nextLabel: '⇄ 水之所存',
  },
  {
    srcDir: 'src-water',
    standaloneOut: 'water-keeps.html',
    artifactOut: null,
    prefix: 'wk',
    nextHref: './hyper-tennis.html',
    nextLabel: '⇄ 失控乒乓',
  },
  {
    srcDir: 'src-tennis',
    standaloneOut: 'hyper-tennis.html',
    artifactOut: null,
    prefix: 'ht',
    nextHref: './mirror-earth.html',
    nextLabel: '⇄ 镜像地球',
  },
  {
    srcDir: 'src-earth',
    standaloneOut: 'mirror-earth.html',
    artifactOut: null,
    prefix: 'me',
    nextHref: './endless-portals.html',
    nextLabel: '⇄ 无尽传送门',
  },
  {
    srcDir: 'src-portals',
    standaloneOut: 'endless-portals.html',
    artifactOut: null,
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
  // 1. Build all 11 WebGL2 Dual-Mode Works (Standalone Root HTML)
  for (const w of TEMPLATE_WORKS) {
    await bundleGame({
      srcDir: w.srcDir,
      outPath: path.join(rootDir, w.standaloneOut),
      transforms: [
        ['__BODY_CLASS__', 'standalone-body'],
        ['__APP_CLASS__', 'standalone'],
        [
          '<!--__HUD_MODE_BTNS__-->',
          `<a href="${w.nextHref}" class="${w.prefix}-mini-btn">${w.nextLabel}</a><a href="./index.html" class="${w.prefix}-mini-btn">⌂ 十二作大厅</a>`,
        ],
        [
          '<!--__MENU_MODE_BTNS__-->',
          `<a href="${w.nextHref}" class="${w.prefix}-btn-secondary">${w.nextLabel}</a><a href="./index.html" class="${w.prefix}-btn-secondary">⌂ 十二作典藏大厅</a>`,
        ],
      ],
    });
  }

  // 2. Build Standalone Saltline: Black Tide -> saltline.html
  await bundleGame({
    srcDir: 'src',
    outPath: path.join(rootDir, 'saltline.html'),
  });

  // 3. Copy 12-Work Anthology Hub -> index.html
  const hubSrc = path.join(rootDir, 'src-hub', 'index.html');
  const hubOut = path.join(rootDir, 'index.html');
  fs.copyFileSync(hubSrc, hubOut);
  const hubKB = (fs.statSync(hubOut).size / 1024).toFixed(1);
  console.log(`Built index.html 12-Work Anthology Hub (${hubKB} KB)`);

  // 4. Optional inline chat embed bundles for new 3D Tech-Magic works when BUILD_ARTIFACTS_DIR env is set
  if (process.env.BUILD_ARTIFACTS_DIR) {
    for (const w of TEMPLATE_WORKS) {
      if (!w.artifactOut) continue;
      await bundleGame({
        srcDir: w.srcDir,
        outPath: path.join(process.env.BUILD_ARTIFACTS_DIR, w.artifactOut),
        transforms: [
          ['__BODY_CLASS__', ''],
          ['__APP_CLASS__', ''],
          [
            '<!--__HUD_MODE_BTNS__-->',
            `<button id="btn-tall" class="${w.prefix}-mini-btn" type="button">大屏</button>`,
          ],
          [
            '<!--__MENU_MODE_BTNS__-->',
            `<button id="menu-btn-tall" class="${w.prefix}-btn-secondary" type="button">展开大屏视野</button>`,
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
