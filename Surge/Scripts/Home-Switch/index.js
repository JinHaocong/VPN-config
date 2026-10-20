/**
 * homeSwitch | Surge Home Control
 * 手动点击切换面板的刷新按钮，原子性尽可能地同步 Home 与 homeLan。
 * 无 cron；没有自动切换；Mac / iOS 共用。
 * 必须先安装名为 homeLan 的远程模块。
 */

const groupName = 'Home';
const moduleName = 'homeLan';
const storeKey = 'homeSwitchLast';

function currentPolicy() {
  const details = $surge.selectGroupDetails();
  return details && details.decisions ? details.decisions[groupName] : undefined;
}

function show(title, lines, color) {
  $done({
    title,
    content: lines.join('\n'),
    icon: 'house.fill',
    'icon-color': color || '#3B82F6',
  });
}

function isAvailable(result) {
  return (
    result &&
    Array.isArray(result.available) &&
    Array.isArray(result.enabled) &&
    (result.available.includes(moduleName) || result.enabled.includes(moduleName))
  );
}

const fromPolicy = currentPolicy();

if (!['Tailscale', 'Subscribe'].includes(fromPolicy)) {
  show(
    'Home · 配置异常',
    ['找不到 Home 当前策略，或选项不是 Tailscale / Subscribe。', '请检查 [Proxy Group]。'],
    '#EF4444'
  );
} else {
  $httpAPI('GET', '/v1/modules', {}, (modules) => {
    if (!isAvailable(modules)) {
      show(
        'Home · 模块未就绪',
        [
          `当前线路：${fromPolicy}`,
          '未找到 homeLan 模块，已停止切换。',
          '请确认模块已安装且名称为 homeLan。',
        ],
        '#EF4444'
      );
      return;
    }

    const isEnabled = modules.enabled.includes(moduleName);
    const expectedEnabled = fromPolicy === 'Tailscale';

    // 任何自动加载或脚本编辑器测试，只显示状态，不改变选项。
    if ($trigger !== 'button' || !$input || $input.panelName !== 'HomeSwitchPanel') {
      show(
        'Home · 线路控制',
        [
          `当前：${fromPolicy === 'Tailscale' ? 'Tailscale · 家庭内网' : 'Subscribe · Cloudflare'}`,
          `homeLan：${isEnabled ? '已开启' : '已关闭'}`,
          `配置检查：${isEnabled === expectedEnabled ? '正常' : '⚠️ 不一致'}`,
          '点击此面板的刷新按钮切换线路。',
        ],
        isEnabled === expectedEnabled ? '#2563EB' : '#F59E0B'
      );
      return;
    }

    const toPolicy = fromPolicy === 'Tailscale' ? 'Subscribe' : 'Tailscale';
    const shouldEnable = toPolicy === 'Tailscale';

    // 先修改策略，模块启停为最后一步：某些版本的模块应用会重载配置。
    const switched = $surge.setSelectGroupPolicy(groupName, toPolicy);
    if (!switched) {
      show(
        'Home · 切换失败',
        [`无法将 Home 切换到 ${toPolicy}。`, '没有请求修改模块，请检查脚本日志。'],
        '#EF4444'
      );
      return;
    }

    $httpAPI('POST', '/v1/modules', { [moduleName]: shouldEnable }, (response) => {
      $httpAPI('GET', '/v1/modules', {}, (checked) => {
        const actualPolicy = currentPolicy();
        const actualEnabled =
          checked && Array.isArray(checked.enabled) ? checked.enabled.includes(moduleName) : null;
        const success = actualPolicy === toPolicy && actualEnabled === shouldEnable;
        const at = new Date().toLocaleString('zh-CN', { hour12: false });

        if (success) {
          $persistentStore.write(
            JSON.stringify({
              time: at,
              from: fromPolicy,
              to: toPolicy,
              success: true,
            }),
            storeKey
          );
          show(
            'Home · 切换成功',
            [
              `${fromPolicy} → ${toPolicy}`,
              `homeLan：${shouldEnable ? '已开启' : '已关闭'}`,
              `${toPolicy === 'Tailscale' ? '目标：192.168.31.209（内网）' : '目标：Cloudflare Tunnel（公网）'}`,
              '已有连接可能需要重新打开。',
            ],
            toPolicy === 'Tailscale' ? '#16A34A' : '#2563EB'
          );
        } else {
          $persistentStore.write(
            JSON.stringify({
              time: at,
              from: fromPolicy,
              to: toPolicy,
              success: false,
            }),
            storeKey
          );
          console.log('homeSwitch module response: ' + JSON.stringify(response));
          show(
            'Home · 需要检查',
            [
              `当前策略：${actualPolicy || '未知'}`,
              `模块状态：${actualEnabled === null ? '读取失败' : actualEnabled ? '开启' : '关闭'}`,
              '策略与模块可能不同步，请到 homeStatus 查看。',
            ],
            '#EF4444'
          );
        }
      });
    });
  });
}
