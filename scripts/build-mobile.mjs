import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'nodejs'), { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css', 'mobile-theme.css', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest', 'sw.js']) {
  await cp(path.join(root, file), path.join(dist, file));
}
for (const file of ['package.json', 'package-lock.json', 'bootstrap.cjs']) await cp(path.join(root, 'node-runtime', file), path.join(dist, 'nodejs', file));
await cp(path.join(root, 'server.js'), path.join(dist, 'nodejs', 'server.js'));
try { await cp(path.join(root, 'build-info.json'), path.join(dist, 'nodejs', 'build-info.json')); } catch {  }
run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], path.join(dist, 'nodejs'));

const manifest = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
try {
  let xml = await readFile(manifest, 'utf8');
  xml = xml.replace(/<application\b([^>]*)>/, (_all, attrs) => `<application${attrs.replace(/\sandroid:usesCleartextTraffic="[^"]*"/g, '').replace(/\sandroid:networkSecurityConfig="[^"]*"/g, '')} android:networkSecurityConfig="@xml/network_security_config">`);
  await writeFile(manifest, xml);
  const xmlDir = path.join(root, 'android', 'app', 'src', 'main', 'res', 'xml');
  await mkdir(xmlDir, { recursive: true });
  await writeFile(path.join(xmlDir, 'network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false" />\n  <domain-config cleartextTrafficPermitted="true">\n    <domain includeSubdomains="false">localhost</domain>\n    <domain includeSubdomains="false">127.0.0.1</domain>\n  </domain-config>\n</network-security-config>\n`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
