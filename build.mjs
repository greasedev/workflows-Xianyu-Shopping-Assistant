import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { join, parse } from 'path';

const srcDir = 'src';
const distDir = 'dist';

// Clean dist
if (existsSync(distDir)) {
  for (const f of readdirSync(distDir)) {
    rmSync(join(distDir, f));
  }
}

// Find all workflow files
const files = readdirSync(srcDir).filter(f => f.endsWith('workflow.ts'));

for (const file of files) {
  const srcPath = join(srcDir, file);
  const { name } = parse(file);
  const outPath = join(distDir, `${name}.js`);

  // 1. Extract frontmatter header
  const content = readFileSync(srcPath, 'utf-8');
  const match = content.match(/^(\/\*\*[\s\S]*?\*\/)/);
  const header = match ? match[1] : '';

  // 2. Compile with esbuild
  await esbuild.build({
    entryPoints: [srcPath],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: outPath,
    charset: 'utf8',
  });

  // 3. Prepend header
  if (header) {
    const jsContent = readFileSync(outPath, 'utf-8');
    writeFileSync(outPath, `${header}\n${jsContent}`);
  }

  console.log(`  ${outPath}`);
}

console.log('\n⚡ Build complete');
