/**
 * HomeSwitch v3 | Home Control
 * Surge macOS / iOS; requires an installed module named homeLan.
 * Only a manual refresh from HomeSwitchPanel changes the Home policy.
 * On failed verification, attempt to restore both prior policy and module state.
 * Rollback is best effort (script timeout / engine restart may interrupt it).
 */

const groupName = 'Home';
const moduleName = 'homeLan';
const panelName = 'HomeSwitchPanel';
const storeKey = 'homeSwitchLast';
const ink = { green: '#16A34A', blue: '#3B82F6', amber: '#D97706', red: '#DC2626' };
let finished = false;

function render(title, lines, color, icon) {
  if (finished) return;
  finished = true;
  $done({
    title,
    content: lines.join('\n'),
    icon: icon || 'house.fill',
    'icon-color': color || ink.blue,
  });
}

function getPolicy(next) {
  $httpAPI('GET', '/v1/policy_groups/select', { group_name: groupName }, (response) => {
    const policy = response && response.policy;
    next(policy === 'Tailscale' || policy === 'Subscribe' ? policy : null);
  });
}

function getModule(next) {
  $httpAPI('GET', '/v1/modules', {}, (response) => {
    if (!response || !Array.isArray(response.enabled) || !Array.isArray(response.available)) {
      next(null);
      return;
    }
    const installed =
      response.available.includes(moduleName) || response.enabled.includes(moduleName);
    next(installed ? response.enabled.includes(moduleName) : null);
  });
}

function readBoth(next) {
  getPolicy((policy) => getModule((moduleEnabled) => next(policy, moduleEnabled)));
}

function writePolicy(policy, next) {
  $httpAPI('POST', '/v1/policy_groups/select', { group_name: groupName, policy }, next);
}

function writeModule(enabled, next) {
  $httpAPI('POST', '/v1/modules', { [moduleName]: enabled }, next);
}

function record(from, to, success, status, message) {
  $persistentStore.write(
    JSON.stringify({
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      from,
      to,
      success,
      status,
      message,
    }),
    storeKey
  );
}

function labelPolicy(value) {
  return value === 'Tailscale' ? 'Tailscale · 家庭内网' : 'Subscribe · Cloudflare';
}

function snapshotValid(policy, enabled) {
  return (policy === 'Tailscale' || policy === 'Subscribe') && typeof enabled === 'boolean';
}

readBoth((originalPolicy, originalEnabled) => {
  if (!snapshotValid(originalPolicy, originalEnabled)) {
    render(
      'Home · 无法读取配置',
      [
        '✕ 无法确定当前策略或 homeLan 状态',
        '────────────────',
        `Home  ${originalPolicy || '未知'}`,
        `模块  ${originalEnabled === null ? '未知或未安装' : originalEnabled ? '已开启' : '已关闭'}`,
        '未执行切换，请检查 Surge 配置。',
      ],
      ink.red,
      'exclamationmark.triangle.fill'
    );
    return;
  }

  const synced = originalEnabled === (originalPolicy === 'Tailscale');
  const manuallyTriggered =
    typeof $trigger !== 'undefined' &&
    $trigger === 'button' &&
    typeof $input !== 'undefined' &&
    $input &&
    $input.panelName === panelName;

  if (!manuallyTriggered) {
    render(
      'Home · 线路控制',
      [
        `${synced ? '●' : '▲'} ${labelPolicy(originalPolicy)}`,
        '────────────────',
        `homeLan  ${originalEnabled ? '已开启' : '已关闭'}`,
        `同步状态  ${synced ? '✓ 正常' : '⚠ 需要检查'}`,
        '────────────────',
        `⇄ 点击刷新 → ${originalPolicy === 'Tailscale' ? 'Subscribe' : 'Tailscale'}`,
        '将同时切换策略与模块',
      ],
      synced ? (originalPolicy === 'Tailscale' ? ink.green : ink.blue) : ink.amber,
      synced ? 'arrow.left.arrow.right.circle.fill' : 'exclamationmark.triangle.fill'
    );
    return;
  }

  // Refuse to toggle from a mismatched configuration: no reliable known-good state.
  if (!synced) {
    render(
      'Home · 已阻止切换',
      [
        '⚠ 策略与模块当前不一致',
        '────────────────',
        `Home     ${originalPolicy}`,
        `homeLan  ${originalEnabled ? '已开启' : '已关闭'}`,
        '请先手动校正两者，再刷新切换。',
      ],
      ink.amber,
      'exclamationmark.triangle.fill'
    );
    return;
  }

  const nextPolicy = originalPolicy === 'Tailscale' ? 'Subscribe' : 'Tailscale';
  const nextEnabled = nextPolicy === 'Tailscale';

  function rollback(reason) {
    console.log('HomeSwitch rollback triggered: ' + reason);
    // Query first so the rollback avoids needlessly reapplying a module.
    readBoth((currentPolicy, currentEnabled) => {
      const putBackPolicy = (callback) => {
        if (currentPolicy === originalPolicy) callback();
        else writePolicy(originalPolicy, () => callback());
      };
      const putBackModule = (callback) => {
        if (currentEnabled === originalEnabled) callback();
        else writeModule(originalEnabled, () => callback());
      };

      putBackPolicy(() =>
        putBackModule(() => {
          readBoth((restoredPolicy, restoredEnabled) => {
            const recovered =
              restoredPolicy === originalPolicy && restoredEnabled === originalEnabled;
            record(
              originalPolicy,
              nextPolicy,
              false,
              recovered ? 'rolled_back' : 'rollback_failed',
              reason
            );
            if (recovered) {
              render(
                'Home · 已恢复原状态',
                [
                  '↶ 切换验证失败，回滚成功',
                  '────────────────',
                  `线路    ${labelPolicy(restoredPolicy)}`,
                  `homeLan  ${restoredEnabled ? '已开启' : '已关闭'}`,
                  `原因    ${reason}`,
                  '原配置已恢复；可查看脚本日志。',
                ],
                ink.amber,
                'arrow.uturn.backward.circle.fill'
              );
            } else {
              render(
                'Home · 需要手动检查',
                [
                  '✕ 切换失败，自动恢复未能确认',
                  '────────────────',
                  `Home     ${restoredPolicy || '未知'}`,
                  `homeLan  ${restoredEnabled === null ? '未知' : restoredEnabled ? '已开启' : '已关闭'}`,
                  `原线路   ${originalPolicy}`,
                  '请手动恢复 Home 和 homeLan。',
                ],
                ink.red,
                'exclamationmark.triangle.fill'
              );
            }
          });
        })
      );
    });
  }

  writePolicy(nextPolicy, () => {
    getPolicy((policyAfterWrite) => {
      if (policyAfterWrite !== nextPolicy) {
        rollback('Home 策略更新未确认');
        return;
      }
      // Target module is always different for a valid, synchronized toggle.
      writeModule(nextEnabled, () => {
        readBoth((verifiedPolicy, verifiedEnabled) => {
          if (verifiedPolicy !== nextPolicy || verifiedEnabled !== nextEnabled) {
            rollback('模块或最终状态验证失败');
            return;
          }
          record(originalPolicy, nextPolicy, true, 'switched', '');
          render(
            'Home · 切换成功',
            [
              '✓ 已同步策略与模块',
              '────────────────',
              `${originalPolicy}  →  ${nextPolicy}`,
              `线路    ${labelPolicy(nextPolicy)}`,
              `homeLan  ${nextEnabled ? '已开启' : '已关闭'}`,
              '────────────────',
              '连接可能需要重新建立，刷新状态面板查看诊断。',
            ],
            nextEnabled ? ink.green : ink.blue,
            'checkmark.circle.fill'
          );
        });
      });
    });
  });
});
