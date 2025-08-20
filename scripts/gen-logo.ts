import fs from 'node:fs/promises';
import sharp from 'sharp';

async function main() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800'>
    <rect width='100%' height='100%' fill='none'/>
    <circle cx='400' cy='400' r='300' fill='black'/>
    <rect x='300' y='300' width='200' height='200' fill='white'/>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.mkdir('test-images', { recursive: true });
  await fs.writeFile('test-images/logo-synthetic.png', png);
  console.log('Wrote test-images/logo-synthetic.png');
}

main().catch((err) => { console.error(err); process.exit(1); });


