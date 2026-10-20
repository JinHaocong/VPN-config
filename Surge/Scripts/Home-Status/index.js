/**
 * homeStatus | Surge Home Control
 * 只读状态面板：不更改代理、模块和 DNS。
 * 注意：Surge 公开脚本 API 尚无已确认的 Peer direct/relay 和 Peer RTT 字段。
 */

const groupName = 'Home';
const moduleName = 'homeLan';
const storeKey = 'homeSwitchLast';

function render(title, rows, color) {
  $done({
    title,
    content: rows.join('\n'),
    icon: 'network',
    'icon-color': color,
  });
}

const details = $surge.selectGroupDetails();
const policy = details && details.decisions ? details.decisions[groupName] : undefined;

$httpAPI('GET', '/v1/modules', {}, (modules) => {
  const known = modules && Array.isArray(modules.enabled) &&
    Array.isArray(modules.available);
  const installed = known &&
    (modules.available.includes(moduleName) || modules.enabled.includes(moduleName));
  const enabled = known ? modules.enabled.includes(moduleName) : null;
  const expected = policy === 'Tailscale';
  const synced = ['Tailscale', 'Subscribe'].includes(policy) &&
    installed && enabled === expected;
  const last = $persistentStore.read(storeKey);
  let lastMessage = '暂无记录';

  if (last) {
    try {
      const record = JSON.parse(last);
      lastMessage = `${record.time || '?'} · ${record.to || '?'}${record.success ? '' : '（需检查）'}`;
    } catch (e) {
      lastMessage = '记录格式异常';
    }
  }

  render('Home · 网络状态', [
    `当前线路：${policy === 'Tailscale' ? 'Tailscale · 家庭内网' : policy === 'Subscribe' ? 'Subscribe · Cloudflare' : '未知'}`,
    `homeLan：${enabled === null ? '未知' : (enabled ? '已开启' : '已关闭')}`,
    `配置一致性：${synced ? '✓ 正常' : '⚠️ 请检查'}`,
    '━━━━━━━━━━━━━━',
    'Tailscale 直连/中继：未取得（在节点详情查看）',
    'Tailscale Peer RTT：未取得（在节点详情查看）',
    '说明：不使用普通测速冒充 Peer RTT',
    '━━━━━━━━━━━━━━',
    `上次切换：${lastMessage}`,
  ], synced ? '#16A34A' : '#F59E0B');
});
