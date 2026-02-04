/**
 * Build script for GitHub Pages: copies static site into dist/
 * All paths in the project are relative, so dist/ can be served from any base URL.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');

const COPY = [
  'index.html',
  'calibrate.html',
  'css',
  'js',
  'data',
  'assets',
  'docs'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(name => {
      copyRecursive(path.join(src, name), path.join(dest, name));
    });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true });
}
fs.mkdirSync(dist, { recursive: true });

COPY.forEach(item => {
  const src = path.join(root, item);
  if (fs.existsSync(src)) {
    copyRecursive(src, path.join(dist, item));
    console.log('Copied:', item);
  }
});

// .nojekyll so GitHub Pages does not use Jekyll
fs.writeFileSync(path.join(dist, '.nojekyll'), '', 'utf8');
console.log('Created: .nojekyll');

console.log('Build complete → dist/');
