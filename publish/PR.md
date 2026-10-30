## 标题

```
Add dsh-qwen-coupon-balance (usage)
```

## 正文

```markdown
Adds `data/plugins/KAIXIN2006__dsh-qwen-coupon-balance.yml`.

**dsh-qwen-coupon-balance** — shows your Alibaba Cloud cash-coupon balance in the DSH sidebar.

Qwen / Bailian (DashScope) API traffic is settled against the Alibaba Cloud account, and the
remaining coupon credit is account-level finance data: an API key cannot read it, only the
BSS OpenAPI can. So the plugin puts the balance next to Settings — total, per-coupon balance,
nominal value and expiry — and takes a read-only AccessKey through an in-panel form.

- Installs with `dsh plugin add`: `package.json` declares `dsh.bundle` (`cordis.patch.yml`)
  and a `dsh.client` web bundle. No build step, no dependencies.
- The AccessKey is validated against Alibaba Cloud before it is saved, stored only in the
  local credentials store (`~/.dsh/.credentials.yaml`), never sent to a third party, and never
  echoed back to the page (the panel shows a masked id).
- Category: `usage` — it reports billing/credit state rather than changing anything.
- Host half is covered by `node test/host-smoke.mjs` (signed requests, parsing, cache,
  write guards, network failure); browser half by `node test/client-smoke.mjs`
  (module contract, slot registration, degradation).

Repo: https://github.com/KAIXIN2006/dsh-qwen-coupon-balance
Tutorial (zh): https://github.com/KAIXIN2006/dsh-qwen-coupon-balance/blob/main/docs/tutorial.zh.md

Happy to adjust the category or the wording if you prefer.
```