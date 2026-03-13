const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

const sources = [
  'mobile/assets/icon.png',
  'mobile/assets/splash-icon.png',
  'mobile/assets/favicon.png',
];

async function removeWhiteBackground(filePath) {
  const abs = path.join(ROOT, filePath);
  const { data, info } = await sharp(abs)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const threshold = 240; // near-white
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0; // set alpha to transparent
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(abs);

  console.log(`Fixed: ${filePath} (${info.width}x${info.height})`);
}

async function main() {
  for (const src of sources) {
    await removeWhiteBackground(src);
  }

  // Copy fixed favicon to web/public/favicon.ico
  const faviconSrc = path.join(ROOT, 'mobile/assets/favicon.png');
  const faviconDst = path.join(ROOT, 'web/public/favicon.ico');
  fs.copyFileSync(faviconSrc, faviconDst);
  console.log('Copied favicon to web/public/favicon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
