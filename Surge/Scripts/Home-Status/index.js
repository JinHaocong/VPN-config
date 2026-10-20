/**
 * HomeStatus v2 | Surge Home Control
 * iOS / macOS: 展示 Home、homeLan、最近切换与原生 Tailscale 探测结果。
 * 仅查询与探测，不修改策略组或模块。
 * 测试的是 Surge 自动选中的 Peer，可能不是 UCG-Fiber。
 */

const groupName = 'Home';
const moduleName = 'homeLan';
const policyName = 'Tailscale';
const storeKey = 'homeSwitchLast';

function displayPeer(value) {
  if (typeof value !== 'string' || !value.trim()) return '未返回';
  const normalized = value.trim().replace(/\.$/, '');
  // 保留短主机名，避免在面板里显示很长的 tailnet 域名。
  return normalized.split('.')[0] || normalized;
}

function parseProbe(result) {
  const data = result && result[policyName];
  if (!data || typeof data !== 'object') {
    return { available: false, detail: '无有效测试结果' };
  }

  const rawPath = typeof data.path === 'string' ? data.path.toLowerCase() : '';
  const path =
    rawPath === 'direct'
      ? '直连 Direct'
      : rawPath === 'relay'
        ? '中继 Relay'
        : rawPath === 'derp'
          ? '中继 DERP'
          : rawPath
            ? `其他（${rawPath}）`
            : '路径未知';

  const receive =
    typeof data.receive === 'number' && Number.isFinite(data.receive) && data.receive >= 0
      ? `${Math.round(data.receive)} ms`
      : '未返回';
  const peer = displayPeer(data.peer);
  const err = data.error || data.message;

  return {
    available: true,
    path,
    rawPath,
    receive,
    peer,
    error: err ? String(err).slice(0, 100) : null,
  };
}

function getLastSwitch() {
  const raw = $persistentStore.read(storeKey);
  if (!raw) return '暂无记录';
  try {
    const record = JSON.parse(raw);
    return `${record.time || '?'} · ${record.to || '?'}${record.success ? '' : '（需检查）'}`;
  } catch (_) {
    return '记录格式异常';
  }
}

function finish(policy, installed, enabled, probe) {
  const validPolicy = policy === 'Tailscale' || policy === 'Subscribe';
  const synced = validPolicy && installed && enabled === (policy === 'Tailscale');
  const isTailscale = policy === 'Tailscale';
  const selection = isTailscale
    ? 'Tailscale · 家庭内网'
    : policy === 'Subscribe'
      ? 'Subscribe · Cloudflare'
      : '读取失败';
  const lines = [
    `当前线路：${selection}`,
    `homeLan：${enabled === null ? '未知/未安装' : enabled ? '已开启' : '已关闭'}`,
    `配置一致性：${synced ? '✓ 正常' : '⚠ 请检查'}`,
    '━━━━━━━━━━━━━━',
  ];

  if (probe.available) {
    lines.push(`Tailscale：${probe.path}`);
    lines.push(`探测延迟：${probe.receive}`);
    lines.push(`测试 Peer：${probe.peer}`);
    if (probe.error) lines.push(`探测消息：${probe.error}`);
    if (!isTailscale) lines.push('注：Home 当前未选用 Tailscale');
    lines.push('说明：原生探测 RTT，非 HTTP 测速');
  } else {
    lines.push('Tailscale 探测：未取得');
    lines.push(`原因：${probe.detail || '未知'}`);
  }

  lines.push('━━━━━━━━━━━━━━');
  lines.push(`上次切换：${getLastSwitch()}`);

  const color = !synced
    ? '#F59E0B'
    : !probe.available
      ? '#64748B'
      : probe.rawPath === 'direct'
        ? '#16A34A'
        : probe.rawPath === 'relay' || probe.rawPath === 'derp'
          ? '#F59E0B'
          : '#2563EB';

  $done({
    title: 'Home · 网络状态',
    content: lines.join('\n'),
    icon: 'network',
    'icon-color': color,
  });
}

$httpAPI('GET', '/v1/policy_groups/select', { group_name: groupName }, (groupResult) => {
  const policy = groupResult && groupResult.policy;

  $httpAPI('GET', '/v1/modules', {}, (moduleResult) => {
    const enabledNames = moduleResult && moduleResult.enabled;
    const availableNames = moduleResult && moduleResult.available;
    const known = Array.isArray(enabledNames) && Array.isArray(availableNames);
    const installed = Boolean(
      known && (enabledNames.includes(moduleName) || availableNames.includes(moduleName))
    );
    const enabled = installed ? enabledNames.includes(moduleName) : null;

    // Surge Tailscale 无 exit node、无显式 test-url 时，这将使用原生 Discovery Ping。
    // 探测自动选择 Peer，不保证每次都测量 UCG-Fiber。
    $httpAPI('POST', '/v1/policies/test', { policy_names: [policyName] }, (testResult) => {
      finish(policy, installed, enabled, parseProbe(testResult));
    });
  });
});
