# 文字教程：让 DSH 侧边栏显示千问代金券余额

这份教程从零开始，不需要懂命令行。照着做，大约 5 分钟。

---

## 0. 它会显示什么

装好之后，DSH 左侧边栏底部（齿轮按钮上方）会多一个橙色票券图标，旁边显示你阿里云账号里
**可用代金券的合计金额**。点开可以看到：

- 每张券的余额、面额、到期时间、适用范围；
- 现金余额（有权限时才显示）；
- 手动刷新按钮。

数据直接来自阿里云 BSS OpenAPI，5 分钟自动刷新一次。

> 为什么不用千问的 API Key？
> 代金券是**阿里云账号级**的账务数据，千问 / 百炼的 API Key 只能调用模型，查不到账务。
> 所以要给插件一对**只读的阿里云 AccessKey**。

---

## 1. 安装插件

### 方式 A：应用内安装（推荐）

打开 DSH → **插件**页 → 搜索 `dsh-qwen-coupon-balance` → 安装 → 重启 DSH。

### 方式 B：命令行

```sh
dsh plugin --profile web add dsh-qwen-coupon-balance
```

桌面版用户请用方式 A：桌面端的 profile 由应用自己管理，命令行会装到别的 profile 里去。

装完重启 DSH，侧边栏底部会出现票券图标（未配置时显示 `—`）。

---

## 2. 准备一对阿里云 AccessKey

### 2.1 打开 AccessKey 管理页

浏览器打开 <https://ram.console.aliyun.com/manage/ak>，用你的阿里云账号登录。

### 2.2 点「创建 AccessKey」

页面右上角（表格上方）有蓝色按钮「**创建 AccessKey**」。第一次进来表格是空的，写着
「没有数据」，这是正常的。

### 2.3 跳过安全提醒

会弹出一个标题为「**不建议使用云账号 AccessKey**」的提醒框。这是阿里云的例行提示，
不是错误。想最省事就这样过：

1. 勾选左下角的小方框「我确认知晓云账号 AccessKey 安全风险」；
2. 右下角原本灰色的「**继续使用云账号 AccessKey**」变成可点，点它。

想更安全就走左边蓝色的「使用 RAM 用户 AccessKey」——需要先建一个子用户并授权
`bss:DescribeCoupons`，多几步，效果一样。

### 2.4 过验证，复制两个值

可能会要一次短信或手机阿里云 App 的确认，按提示走完。

然后弹窗里出现两行：

| 名称 | 长什么样 |
| --- | --- |
| `AccessKey ID` | `LTAI` 开头，24 位 |
| `AccessKey Secret` | 30 位字母数字 |

每行右边有「复制」。**Secret 只显示这一次**，关掉窗口就再也看不到了；如果页面提供
「下载 CSV」，顺手存一份。

> ⚠️ 这两个值等于你账号的钥匙，**不要发到聊天里、不要贴到网上**。下一步直接粘进插件即可。

---

## 3. 填进插件

1. 回到 DSH，点侧边栏底部的票券图标；
2. 面板里有两个输入框：第一格粘 `AccessKey ID`，第二格粘 `AccessKey Secret`；
3. 点「**保存并验证**」。

插件会**先用这对密钥真实调用一次阿里云接口**再保存：

- 验证通过 → 立刻显示余额，密钥写入本机 `~/.dsh/.credentials.yaml`；
- 验证失败 → 显示具体错误码，**不会**写入，可以放心重试。

---

## 4. 看懂面板

```
可用代金券
¥289.74                      ← 所有可用券的余额合计
1 张可用 · 到期 2027/10/30

929641260508                 ← 券号
阿里云云工开物学生专属代金券
余额 ¥289.74 / 面额 ¥300.00
通用（不适用商品名单除外）
```

- 「余额」是这张券**还能抵多少**；「面额」是最初的金额。
- 已过期或余额为 0 的券不计入合计。
- 现金余额那一行需要额外权限 `bss:QueryAccountBalance`，没有就自动不显示，不影响券的查询。

---

## 5. 常见报错

| 面板显示 | 原因 | 怎么办 |
| --- | --- | --- |
| `NotAuthorized` / `NoPermission` | 这个 AccessKey 没有查券权限 | 给对应用户加 `bss:DescribeCoupons`（或 BSS 只读策略） |
| `InvalidAccessKeyId.NotFound` | ID 抄错了 / 已被禁用 | 回控制台核对，或新建一个 |
| `SignatureDoesNotMatch` | Secret 抄错了；或电脑时间偏差超过 15 分钟 | 重新复制 Secret；校准系统时间 |
| `NETWORK_ERROR` | 连不上 `business.aliyuncs.com` | 关掉代理 / VPN 再试 |
| `NotApplicable` | 账号类型不支持 | 比如非自付账号、分销子账号，无法查询 |

---

## 6. 安全与隐私

- 密钥**只存在本机**的 `~/.dsh/.credentials.yaml`，不会上传、不会写进配置文件；
- 面板里只回显打码的 ID（如 `LTAI****cUAA`），Secret 从不回传给浏览器；
- 插件只调用两个只读接口：`QueryCashCoupons`、`QueryAccountBalance`；
- 不放心的话，用完后去 AccessKey 管理页把这个 key **禁用/删除**，插件失效但不影响账号；
- 也可以改用环境变量提供：`QWEN_COUPON_ACCESS_KEY_ID`、`QWEN_COUPON_ACCESS_KEY_SECRET`。

---

## 7. 换 key 与卸载

- **换 key**：点开面板，直接重填并保存（同样先验证再覆盖）。
- **换刷新间隔**：在 profile 的 `cordis.patch.yml` 里加一条：

  ```yaml
  - id: qwen-coupon-balance
    config:
      refreshSeconds: 600   # 30–3600 秒，默认 300
  ```

- **卸载**：在插件页移除即可。要连密钥一起清除，删掉 `.credentials.yaml` 里的
  `QWEN_COUPON_ACCESS_KEY_ID` / `QWEN_COUPON_ACCESS_KEY_SECRET` 两行。

---

## 8. 一个可能踩的坑

如果你调用千问走的是第三方中转（例如 `maas.qianwenaiapi.com` 这类地址），那么流量可能
不在你查询的这个阿里云账号上计费 —— 插件显示的券余额是对的，只是不会随调用减少。
用几天对一下就知道了。