# dsh-qwen-coupon-balance

在 DSH（DeepSeek Harness）侧边栏显示**阿里云代金券余额** —— 千问 / 百炼 / DashScope 扣费时
抵扣的那笔钱，一眼看到还剩多少、什么时候过期。

<p align="center">
  <img src="icon.svg" width="72" alt="plugin icon">
</p>

> 📖 **[中文图文教程 →](docs/tutorial.zh.md)** ｜ 从申请 AccessKey 到看到余额，一步一步。

## 它做什么

在左侧边栏底部（齿轮按钮上方）放一个票券按钮，显示可用代金券的合计金额，点开是一个面板：

- 每张券的**余额 / 面额 / 到期时间 / 适用范围**，按到期时间排序；
- 所有可用券的合计，以及最近一张的到期提醒；
- 现金余额（账号有 `QueryAccountBalance` 权限时显示）；
- 手动刷新按钮；默认 5 分钟自动刷新一次。

数据来自阿里云 BSS OpenAPI（`QueryCashCoupons` + `QueryAccountBalance`），**不经过任何第三方服务器**：
请求由本机直接发往 `business.aliyuncs.com`。

## 为什么需要 AccessKey

代金券是**阿里云账号级**的账务数据。千问 / 百炼的 API Key 只能调用模型，查不到账务，
所以插件需要一对阿里云 AccessKey（只读即可，用 `bss:DescribeCoupons` 权限）。

AccessKey **只保存在本机**的 `~/.dsh/.credentials.yaml`：

- 不写进任何配置文件，不上传，不进浏览器；
- 面板里只回显打码后的 ID（`LTAI****cUAA`），Secret 从不回传；
- 保存前会先用它真实调用一次阿里云接口，验证失败就不写入，输错不会覆盖已能用的密钥；
- 也可以用环境变量提供：`QWEN_COUPON_ACCESS_KEY_ID` / `QWEN_COUPON_ACCESS_KEY_SECRET`。

## 安装

```sh
dsh plugin --profile web add dsh-qwen-coupon-balance
```

桌面版请在应用内 **插件** 页搜索安装（桌面端的 profile 由应用自己管理）。

装完重启，点侧边栏底部的票券图标 → 填入 AccessKey ID 与 Secret → 保存并验证。
详细步骤见 **[教程](docs/tutorial.zh.md)**。

## 配置

| 项 | 说明 |
| --- | --- |
| `refreshSeconds` | 服务端缓存与自动刷新间隔，30–3600，默认 `300` |

在 profile 的 `cordis.patch.yml` 里覆盖：

```yaml
- id: qwen-coupon-balance
  config:
    refreshSeconds: 600
```

## 常见报错

| 错误码 | 含义 |
| --- | --- |
| `NotAuthorized` / `NoPermission` | 该 AccessKey 没有 `bss:DescribeCoupons` 权限 |
| `InvalidAccessKeyId.NotFound` | AccessKeyId 不存在或已禁用 |
| `SignatureDoesNotMatch` | Secret 不对，或本机时间偏差超过 15 分钟 |
| `NETWORK_ERROR` | 连不上 `business.aliyuncs.com` |
| `NotApplicable` | 账号类型不支持（如非自付账号） |

## 实现

- `lib/index.js` —— Host 半：BSS OpenAPI 签名调用、结果缓存、同源路由
  `/api/qwen-coupon-balance/{state,refresh,credentials}`。写接口要求同源且 `application/json`。
- `lib/client.js` —— 浏览器半：向槽位 `sidebar.footer.action` 注册一个按钮，面板用
  `--dsw-alias-*` 主题变量，跟随明暗主题；中英文案跟随界面语言。
- 无构建步骤，无需 `pnpm run build`。

## 开发

```sh
node test/host-smoke.mjs     # 模拟阿里云响应，跑通 Host 路由、解析、缓存与写入保护
node test/client-smoke.mjs   # 按页面的模块契约加载浏览器半，验证注册与降级
```

两个脚本都只依赖 Node 内置模块。

## License

MIT