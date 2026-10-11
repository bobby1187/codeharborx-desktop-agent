const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

async function main() {
  const root = path.join(__dirname, "..");
  const svg = path.join(root, "build", "icon.svg");
  const png = path.join(root, "build", "icon.png");
  await fs.promises.mkdir(path.dirname(png), { recursive: true });
  await sharp(svg).resize(512, 512).png().toFile(png);
  console.log("Generated local CodeHarborX icon:", png);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
