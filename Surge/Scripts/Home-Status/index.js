/**
 * HomeStatus | Surge Home Control
 * 只读状态面板，使用适用于 iOS / Mac 的 HTTP API 读取隐藏的 Home 策略。
 * Peer 直连状态与 Peer RTT 暂未通过已确认的公开脚本 API 获得。
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

$httpAPI('GET', '/v1/policy_groups/select', { group_name: groupName }, (result) => {
  const selected = result && result.policy;
  const policy = ['Tailscale', 'Subscribe'].includes(selected) ? selected : null;

  $httpAPI('GET', '/v1/modules', {}, (modules) => {
    const known = modules && Array.isArray(modules.enabled) && Array.isArray(modules.available);
    const installed = Boolean(
      known && (modules.available.includes(moduleName) || modules.enabled.includes(moduleName))
    );
    const enabled = installed ? modules.enabled.includes(moduleName) : null;
    const synced = Boolean(policy && installed && enabled === (policy === 'Tailscale'));

    const last = $persistentStore.read(storeKey);
    let lastMessage = '暂无记录';
    if (last) {
      try {
        const record = JSON.parse(last);
        lastMessage = `${record.time || '?'} · ${record.to || '?'}${record.success ? '' : '（需检查）'}`;
      } catch (error) {
        lastMessage = '记录格式异常';
      }
    }

    render(
      'Home · 网络状态',
      [
        `当前线路：${policy === 'Tailscale' ? 'Tailscale · 家庭内网' : policy === 'Subscribe' ? 'Subscribe · Cloudflare' : '读取失败'}`,
        `homeLan：${enabled === null ? '未安装或未知' : enabled ? '已开启' : '已关闭'}`,
        `配置一致性：${synced ? '✓ 正常' : '⚠️ 请检查'}`,
        '━━━━━━━━━━━━━━',
        'Tailscale 直连/中继：需在节点详情查看',
        'Tailscale Peer RTT：需在节点详情查看',
        '不使用普通测速冒充 Peer RTT',
        '━━━━━━━━━━━━━━',
        `上次切换：${lastMessage}`,
      ],
      synced ? '#16A34A' : '#F59E0B'
    );
  });
});
