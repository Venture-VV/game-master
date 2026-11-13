import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const rootDir = process.cwd();
const templatePath = path.join(rootDir, 'src', 'template.html');
const cssPath = path.join(rootDir, 'src', 'styles.css');
const entryPath = path.join(rootDir, 'src', 'main.js');
const outPath = path.join(rootDir, 'index.html');

async function buildSingleFile() {
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

  // Use function replacer so '$' patterns inside minified Three.js aren't interpreted as regex tokens!
  const finalHtml = template
    .replace('/*__INLINE_CSS__*/', () => cssResult.code.trim())
    .replace('/*__INLINE_JS__*/', () => jsCode.trim());

  fs.writeFileSync(outPath, finalHtml, 'utf8');
  const sizeKB = (Buffer.byteLength(finalHtml, 'utf8') / 1024).toFixed(1);
  console.log(`Built self-contained single-file index.html (${sizeKB} KB)`);
}

buildSingleFile().catch((err) => {
  console.error(err);
  process.exit(1);
});
