// Signs dist-panel/ into release/ExpressionLab-<version>.zxp with Adobe's ZXPSignCmd.
//
//   npm run build:panel
//   ZXPSIGNCMD=/path/to/ZXPSignCmd ZXP_PASSWORD=choose-one npm run package:zxp
//
// ZXPSignCmd: https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
// The first run makes a self-signed certificate in .cert/ (git-ignored); keep it and the password to
// sign later versions with the same identity. Self-signed is fine for ZXP installers like aescripts'.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const tool = process.env.ZXPSIGNCMD ?? 'ZXPSignCmd';
const password = process.env.ZXP_PASSWORD;
const cert = process.env.ZXP_CERT ?? '.cert/expressionlab.p12';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = `release/ExpressionLab-${version}.zxp`;

function run(args) {
  const r = spawnSync(tool, args, { stdio: 'inherit' });
  if (r.error) {
    console.error(`Couldn't run ${tool}: ${r.error.message}\nSet ZXPSIGNCMD to the ZXPSignCmd executable.`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!password) {
  console.error('Set ZXP_PASSWORD (the certificate password).');
  process.exit(1);
}
if (!existsSync('dist-panel/CSXS/manifest.xml')) {
  console.error('Run `npm run build:panel` first.');
  process.exit(1);
}
if (!existsSync(cert)) {
  mkdirSync('.cert', { recursive: true });
  console.log(`Creating a self-signed certificate at ${cert}`);
  run(['-selfSignedCert', 'GB', 'NA', 'ExpressionLab', 'ExpressionLab', password, cert]);
}
mkdirSync('release', { recursive: true });
rmSync(out, { force: true });
run(['-sign', 'dist-panel', out, cert, password, '-tsa', 'http://timestamp.digicert.com']);
run(['-verify', out]);
console.log(`\n${out} is ready. Install it with your ZXP installer and restart After Effects.`);
