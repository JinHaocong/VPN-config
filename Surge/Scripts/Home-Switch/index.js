/**
 * HomeSwitch | Surge Home Control
 * 支持 Surge iOS / Mac；通过 HTTP API 获取和切换隐藏的 Home 策略。
 * 仅点击 HomeSwitchPanel 刷新按钮时才会切换。
 */

const groupName = 'Home';
const moduleName = 'homeLan';
const panelName = 'HomeSwitchPanel';
const storeKey = 'homeSwitchLast';

function render(title, content, color) {
  $done({
    title,
    content: content.join('\n'),
    icon: 'house.fill',
    'icon-color': color || '#3B82F6',
  });
}

function getPolicy(callback) {
  $httpAPI('GET', '/v1/policy_groups/select', { group_name: groupName }, (result) => {
    const policy = result && result.policy;
    callback(policy === 'Tailscale' || policy === 'Subscribe' ? policy : null);
  });
}

function getModule(callback) {
  $httpAPI('GET', '/v1/modules', {}, (result) => {
    if (!result || !Array.isArray(result.enabled) || !Array.isArray(result.available)) {
      callback(null);
      return;
    }
    const installed = result.available.includes(moduleName) || result.enabled.includes(moduleName);
    callback(installed ? result.enabled.includes(moduleName) : null);
  });
}

getPolicy((fromPolicy) => {
  if (!fromPolicy) {
    render(
      'Home · 读取失败',
      ['无法通过 Surge HTTP API 读取 Home 当前策略。', '请确认当前配置中存在 Home 策略组。'],
      '#EF4444'
    );
    return;
  }

  getModule((initialEnabled) => {
    if (initialEnabled === null) {
      render(
        'Home · 模块未就绪',
        [`当前线路：${fromPolicy}`, 'homeLan 不存在或模块状态读取失败。', '本次没有修改 Home。'],
        '#EF4444'
      );
      return;
    }

    const isButton = typeof $trigger !== 'undefined' && $trigger === 'button';
    const fromPanel = typeof $input !== 'undefined' && $input && $input.panelName === panelName;
    if (!isButton || !fromPanel) {
      const synced = initialEnabled === (fromPolicy === 'Tailscale');
      render(
        'Home · 线路控制',
        [
          `当前：${fromPolicy === 'Tailscale' ? 'Tailscale · 家庭内网' : 'Subscribe · Cloudflare'}`,
          `homeLan：${initialEnabled ? '已开启' : '已关闭'}`,
          `配置一致性：${synced ? '✓ 正常' : '⚠️ 不一致'}`,
          '点击 Home Control 面板的刷新按钮切换线路。',
        ],
        synced ? '#2563EB' : '#F59E0B'
      );
      return;
    }

    const toPolicy = fromPolicy === 'Tailscale' ? 'Subscribe' : 'Tailscale';
    const shouldEnable = toPolicy === 'Tailscale';

    // 使用跨平台 HTTP API，避免部分版本的 selectGroupDetails().decisions 不包含隐藏策略组。
    $httpAPI(
      'POST',
      '/v1/policy_groups/select',
      {
        group_name: groupName,
        policy: toPolicy,
      },
      (policyResponse) => {
        // 先确认策略更新，再开关模块，避免第一次写入失败却修改了模块。
        getPolicy((updatedPolicy) => {
          if (updatedPolicy !== toPolicy) {
            console.log('Home switch response: ' + JSON.stringify(policyResponse));
            render(
              'Home · 切换失败',
              [
                `Home 仍为 ${updatedPolicy || '未知'}`,
                'homeLan 未修改。',
                '请查看 HomeSwitch 的脚本日志。',
              ],
              '#EF4444'
            );
            return;
          }

          function verify() {
            getPolicy((actualPolicy) => {
              getModule((actualEnabled) => {
                const success = actualPolicy === toPolicy && actualEnabled === shouldEnable;
                const at = new Date().toLocaleString('zh-CN', { hour12: false });
                $persistentStore.write(
                  JSON.stringify({
                    time: at,
                    from: fromPolicy,
                    to: toPolicy,
                    success,
                  }),
                  storeKey
                );
                if (success) {
                  render(
                    'Home · 切换成功',
                    [
                      `${fromPolicy} → ${toPolicy}`,
                      `homeLan：${shouldEnable ? '已开启' : '已关闭'}`,
                      toPolicy === 'Tailscale'
                        ? '目标：家庭内网 · 192.168.31.209'
                        : '目标：Cloudflare Tunnel · 公网',
                      '已有连接可能需要重新打开。',
                    ],
                    toPolicy === 'Tailscale' ? '#16A34A' : '#2563EB'
                  );
                } else {
                  render(
                    'Home · 状态未同步',
                    [
                      `当前线路：${actualPolicy || '未知'}`,
                      `homeLan：${actualEnabled === null ? '读取失败' : actualEnabled ? '已开启' : '已关闭'}`,
                      '请查看 HomeStatus，必要时手动恢复模块状态。',
                    ],
                    '#EF4444'
                  );
                }
              });
            });
          }

          if (initialEnabled === shouldEnable) {
            verify();
          } else {
            $httpAPI('POST', '/v1/modules', { [moduleName]: shouldEnable }, (moduleResponse) => {
              console.log('homeLan module response: ' + JSON.stringify(moduleResponse));
              verify();
            });
          }
        });
      }
    );
  });
});
