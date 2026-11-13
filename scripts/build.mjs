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
    html = html.replace(token, () => val);
  }

  fs.writeFileSync(outPath, html, 'utf8');
  const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`Built ${path.basename(outPath)} (${sizeKB} KB)`);
  return html;
}

async function buildAll() {
  // 1. Build Standalone Saltline: Black Tide -> saltline.html
  await bundleGame({
    srcDir: 'src',
    outPath: path.join(rootDir, 'saltline.html'),
  });

  // 2. Build Standalone Starry Nightrider -> starry-nightrider.html
  await bundleGame({
    srcDir: 'src-nightrider',
    outPath: path.join(rootDir, 'starry-nightrider.html'),
    transforms: [
      ['__BODY_CLASS__', 'standalone-body'],
      ['__APP_CLASS__', 'standalone'],
      [
        '<!--__HUD_MODE_BTNS__-->',
        '<a href="./saltline.html" class="nr-mini-btn">⇄ 断潮行动</a><a href="./index.html" class="nr-mini-btn">⌂ 大厅</a>',
      ],
      [
        '<!--__MENU_MODE_BTNS__-->',
        '<a href="./saltline.html" class="nr-btn-secondary">⇄ 切换《断潮行动》</a><a href="./index.html" class="nr-btn-secondary">⌂ 双作大厅</a>',
      ],
    ],
  });

  // 3. Copy Dual-Game Anthology Switcher Hub -> index.html
  const hubSrc = path.join(rootDir, 'src-hub', 'index.html');
  const hubOut = path.join(rootDir, 'index.html');
  fs.copyFileSync(hubSrc, hubOut);
  const hubKB = (fs.statSync(hubOut).size / 1024).toFixed(1);
  console.log(`Built index.html Dual-Game Hub (${hubKB} KB)`);

  // 4. Optional scratch embed target when ARTIFACT_SCRATCH_OUT env is passed
  if (process.env.ARTIFACT_SCRATCH_OUT) {
    await bundleGame({
      srcDir: 'src-nightrider',
      outPath: process.env.ARTIFACT_SCRATCH_OUT,
      transforms: [
        ['__BODY_CLASS__', ''],
        ['__APP_CLASS__', ''],
        ['<!--__HUD_MODE_BTNS__-->', '<button id="btn-tall" class="nr-mini-btn" type="button">大屏</button>'],
        ['<!--__MENU_MODE_BTNS__-->', '<button id="menu-btn-tall" class="nr-btn-secondary" type="button">展开大屏视野</button>'],
      ],
    });
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
