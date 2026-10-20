/**
 * Home DNS
 * Tailscale → NAS 内网 IP
 * Subscribe → Cloudflare 公网 DNS
 */

const selectedPolicy = $surge.selectGroupDetails().decisions.Home;
const homeAddress = ($argument || '').trim();

if (selectedPolicy === 'Tailscale' && homeAddress) {
  $done({
    address: homeAddress,
  });
} else {
  $done({});
}
