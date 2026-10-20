/**
 * HomeStatus v3 | Home Control
 * Read-only diagnostic panel for macOS and iOS Surge.
 * Runs native Tailscale peer probe; the selected peer may not be UCG-Fiber.
 * Optional argument: healthUrl=https://your-service.example/health
 * HTTP status is reported separately from native Tailscale RTT.
 */

const groupName = 'Home';
const moduleName = 'homeLan';
const tailscalePolicy = 'Tailscale';
const storeKey = 'homeSwitchLast';
const ink = {
  green: '#16A34A',
  blue: '#3B82F6',
  amber: '#D97706',
  red: '#DC2626',
  gray: '#64748B',
};
let finished = false;

function render(title, lines, color, icon) {
  if (finished) return;
  finished = true;
  $done({ title, content: lines.join('\n'), icon, 'icon-color': color });
}

function shortPeer(value) {
  if (typeof value !== 'string' || !value.trim()) return '未知';
  return value.trim().replace(/\.$/, '').split('.')[0] || '未知';
}

function parseProbe(value) {
  const item = value && value[tailscalePolicy];
  if (!item || typeof item !== 'object') {
    return { ok: false, path: '', latency: null, peer: '未知', error: '接口没有返回有效测试结果' };
  }
  const path = typeof item.path === 'string' ? item.path.toLowerCase() : '';
  const latency =
    typeof item.receive === 'number' && Number.isFinite(item.receive) && item.receive >= 0
      ? Math.round(item.receive)
      : null;
  const message = item.error || item.message;
  return {
    ok: path !== '' || latency !== null,
    path,
    latency,
    peer: shortPeer(item.peer),
    error: message ? String(message).slice(0, 90) : '',
  };
}

function lastSwitch() {
  const data = $persistentStore.read(storeKey);
  if (!data) return '暂无记录';
  try {
    const last = JSON.parse(data);
    const status =
      last.status === 'rolled_back'
        ? '已回滚'
        : last.status === 'rollback_failed'
          ? '恢复失败'
          : last.success
            ? '成功'
            : '需检查';
    return `${last.time || '--'} · ${status}`;
  } catch (_) {
    return '记录不可读取';
  }
}

function getHealthUrl() {
  const argument = typeof $argument === 'string' ? $argument : '';
  const found = argument.match(/(?:^|&)healthUrl=([^&]+)/);
  if (!found) return null;
  let url;
  try {
    url = decodeURIComponent(found[1]);
  } catch (_) {
    return null;
  }
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}

function checkHealth(url, callback) {
  if (!url) {
    callback(null);
    return;
  }
  const started = Date.now();
  $httpClient.get(
    { url, policy: groupName, timeout: 5, 'auto-redirect': false },
    (error, response) => {
      const ms = Date.now() - started;
      const code = response && response.status;
      const reached = !error && typeof code === 'number' && code >= 200 && code < 500;
      callback({ reached, code, ms, error: error ? String(error).slice(0, 80) : '' });
    }
  );
}

function draw(policy, enabled, probe, health) {
  const valid = policy === 'Tailscale' || policy === 'Subscribe';
  const synced = valid && enabled !== null && enabled === (policy === 'Tailscale');
  const isTs = policy === 'Tailscale';
  const mode = isTs
    ? 'Tailscale · 家庭内网'
    : policy === 'Subscribe'
      ? 'Subscribe · Cloudflare'
      : '未知';
  const path =
    probe.path === 'direct'
      ? '直连 Direct'
      : probe.path === 'relay'
        ? '中继 Relay'
        : probe.path === 'derp'
          ? '中继 DERP'
          : probe.path
            ? `其他 ${probe.path}`
            : '未知';
  const lines = [
    `${synced ? '●' : '▲'} ${mode}`,
    '━━━━━━━━━━━━━━',
    `模块      ${enabled === null ? '未知 / 未安装' : enabled ? 'homeLan 已开启' : 'homeLan 已关闭'}`,
    `配置      ${synced ? '✓ 策略与模块一致' : '⚠ 策略与模块不一致'}`,
    '━━━━━━━━━━━━━━',
    '▸ TAILSCALE · 原生探测',
  ];
  if (probe.ok) {
    lines.push(`连接      ${path}`);
    lines.push(`延迟      ${probe.latency === null ? '未返回' : `${probe.latency} ms`}`);
    lines.push(`Peer      ${probe.peer}`);
    if (probe.error) lines.push(`备注      ${probe.error}`);
  } else {
    lines.push(`状态      暂不可用`);
    lines.push(`原因      ${probe.error}`);
  }
  if (!isTs) lines.push('提示      当前未使用 Tailscale 出站');
  lines.push('注：测试 Peer 由 Surge 选择，非指定网关');
  if (health !== null) {
    lines.push('━━━━━━━━━━━━━━');
    lines.push('▸ HOME · 服务检测');
    lines.push(
      `HTTP      ${health.reached ? '✓ 可连接' : '✕ 连接失败'}${health.code ? ` (${health.code})` : ''}`
    );
    lines.push(`响应      ${health.ms} ms · 非 Peer RTT`);
  }
  lines.push('━━━━━━━━━━━━━━');
  lines.push(`上次切换  ${lastSwitch()}`);

  const color = !synced
    ? ink.red
    : health && !health.reached
      ? ink.amber
      : !probe.ok
        ? ink.gray
        : isTs && probe.path === 'direct'
          ? ink.green
          : isTs && (probe.path === 'relay' || probe.path === 'derp')
            ? ink.amber
            : ink.blue;
  const icon = !synced
    ? 'exclamationmark.triangle.fill'
    : isTs && probe.path === 'direct'
      ? 'checkmark.shield.fill'
      : isTs
        ? 'network'
        : 'cloud.fill';
  render('Home · 网络状态', lines, color, icon);
}

$httpAPI('GET', '/v1/policy_groups/select', { group_name: groupName }, (result) => {
  const policy = result && result.policy;
  $httpAPI('GET', '/v1/modules', {}, (modules) => {
    const known = modules && Array.isArray(modules.enabled) && Array.isArray(modules.available);
    const installed =
      known && (modules.available.includes(moduleName) || modules.enabled.includes(moduleName));
    const enabled = installed ? modules.enabled.includes(moduleName) : null;
    $httpAPI('POST', '/v1/policies/test', { policy_names: [tailscalePolicy] }, (resultTest) => {
      const probe = parseProbe(resultTest);
      checkHealth(getHealthUrl(), (health) => draw(policy, enabled, probe, health));
    });
  });
});
