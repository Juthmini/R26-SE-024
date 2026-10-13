// Starts Expo with EXPO_PUBLIC_API_URL / EXPO_PUBLIC_AI_URL pointed at this
// laptop's *current* Wi-Fi IP. The phone hotspot hands out a new IP from time to
// time (172.20.10.3 <-> .8), and a stale IP in .env makes every request time out.
// Shell env vars take precedence over .env, so this overrides it for this run.
const os = require('os');
const { spawn } = require('child_process');

const VIRTUAL = /vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback|Bluetooth/i;

function lanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push({ name, ip: a.address });
    }
  }
  // Prefer the Wi-Fi adapter (the phone hotspot), then any private-range address.
  const wifi = candidates.find((c) => /wi-?fi|wlan|wireless/i.test(c.name));
  return (wifi || candidates[0] || {}).ip;
}

const ip = lanIp();
if (!ip) {
  console.error('Could not find a Wi-Fi IPv4 address - is the laptop connected to the hotspot?');
  process.exit(1);
}

const env = {
  ...process.env,
  EXPO_PUBLIC_API_URL: `http://${ip}:5000`,
  EXPO_PUBLIC_AI_URL: `http://${ip}:8000`,
};
console.log(`\n  Using laptop IP ${ip}`);
console.log(`  API: ${env.EXPO_PUBLIC_API_URL}   AI: ${env.EXPO_PUBLIC_AI_URL}\n`);

const child = spawn('npx', ['expo', 'start', '--go', '-c', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  shell: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
