const Jimp = require('jimp');

async function main() {
  const image = await Jimp.read('./public/logo.png');
  image.circle();
  image.resize(256, 256);
  await image.writeAsync('./public/favicon.png');
  console.log('Successfully created circular favicon.png');
}

main().catch(console.error);
