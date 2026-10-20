/**
 * Home DNS
 * 根据 Surge Home 策略动态解析 DNS
 *
 * Home = Tailscale  → 内网 IP
 * Home = Subscribe  → 公网 DNS（Cloudflare）
 *
 * 内网 IP 由 Surge argument 传入
 */

const selected = $surge.selectGroupDetails().decisions['Home'];
const address = $argument?.trim();

if (selected === 'Tailscale' && address) {
  $done({
    address,
    ttl: 5,
  });
} else {
  $done({});
}
