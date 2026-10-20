/**
 * homeSync - 在 Mac 上自动同步 Home 策略和 homeLan 模块
 * Home -> Tailscale: 启用静态内网 Host 映射
 * Home -> Subscribe: 关闭静态映射，使用 Cloudflare 公网域名
 *
 * 仅在模块实际状态与选项不一致时才写入，避免反复重载配置。
 */
const groupName = 'Home';
const moduleName = 'homeLan';
const selectedPolicy = $surge.selectGroupDetails().decisions[groupName];

if (selectedPolicy !== 'Tailscale' && selectedPolicy !== 'Subscribe') {
  console.log(`Skip: unexpected ${groupName} selection: ${selectedPolicy}`);
  $done();
} else {
  const shouldEnable = selectedPolicy === 'Tailscale';

  $httpAPI('GET', '/v1/modules', {}, (result) => {
    const enabledModules = result && result.enabled;
    const availableModules = result && result.available;

    if (!Array.isArray(enabledModules) || !Array.isArray(availableModules)) {
      console.log('Could not obtain Surge module list: ' + JSON.stringify(result));
      $done();
      return;
    }

    if (!availableModules.includes(moduleName) && !enabledModules.includes(moduleName)) {
      console.log(`Missing module '${moduleName}'. Install it first in Surge.`);
      $done();
      return;
    }

    const isEnabled = enabledModules.includes(moduleName);
    if (isEnabled === shouldEnable) {
      $done();
      return;
    }

    $httpAPI('POST', '/v1/modules', { [moduleName]: shouldEnable }, (response) => {
      console.log(
        `${groupName}=${selectedPolicy}; requested ${moduleName}=${shouldEnable}; response=${JSON.stringify(response)}`
      );
      $done();
    });
  });
}
