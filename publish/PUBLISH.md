# 发布步骤

目标：让这个插件出现在 **DSH 插件市场（dsh-market）** 和 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 列表里。

市场读的是那份 awesome 列表。所以只有两件事要做：

1. **把代码放到 GitHub 上**（一个公开仓库）
2. **去 awesome 列表提一个 PR，只加一个文件**

npm 不是必须的：没有 npm 包也能上架，只是卡片上不显示下载量。想让别人一句
`dsh plugin add dsh-qwen-coupon-balance` 就能装，再额外做第 3 步。

> 本文里的用户名已经全部填成 `KAIXIN2006`（`package.json`、`publish/awesome-dsh-plugin.yml`、
> `publish/PR.md` 三处），不用再改。如果以后换了 GitHub 账号，把这三处的 `KAIXIN2006` 一起替换掉。

---

## 第 1 步：建仓库并上传代码

1. 打开 <https://github.com/new>（没有 GitHub 账号先注册，免费）。
2. **Repository name** 填：`dsh-qwen-coupon-balance`
3. 选 **Public**（必须公开，市场才能读）。
4. 下面的 "Add a README file / Add .gitignore / Choose a license" **全部不勾**。
5. 点 **Create repository**。

新仓库页面中间有一行小字：「**uploading an existing file**」，点它。

然后把本文件夹 `qwen-coupon-balance` **里面的所有东西**（`lib`、`locale`、`docs`、`test`、`assets`、
`publish` 这几个文件夹，加上 `README.md`、`package.json`、`cordis.patch.yml`、`icon.svg`）
一起拖进浏览器窗口的虚线框里。

等文件列表刷完，下面 **Commit changes** 点一下。仓库就有了。

> 拖拽小技巧：在文件资源管理器里进到 `qwen-coupon-balance` 文件夹内部，`Ctrl+A` 全选，
> 再一起拖过去。**不要**把 `.git` 拖进去（如果有的话）。

### 用命令行的话（可选，更快）

```sh
cd qwen-coupon-balance
git init -b main
git add .
git commit -m "feat: sidebar Alibaba Cloud coupon balance for DSH"
git remote add origin https://github.com/KAIXIN2006/dsh-qwen-coupon-balance.git
git push -u origin main
```

---

## 第 2 步：提交到市场列表（一个文件）

1. 打开 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
2. 点右上角 **Fork**（把仓库复制一份到你名下）。
3. 在你 fork 出来的仓库里，进到 `data/plugins/` 文件夹 → 右上角 **Add file → Create new file**。
4. 文件名填：

   ```
   KAIXIN2006__dsh-qwen-coupon-balance.yml
   ```

   （注意是两个下划线 `__`，这是 `<owner>__<repo>.yml` 的约定。）

5. 内容粘贴 `publish/awesome-dsh-plugin.yml` 里的全部内容（已经填好，原样粘贴即可）。
6. 页面下方 **Commit changes**，然后点 **Contribute → Open pull request**，标题写：

   ```
   Add dsh-qwen-coupon-balance (usage)
   ```

7. 提交。维护者合并后，列表和市场一般**一天内**自动收录。

---

## 第 3 步（可选）：发到 npm

有 Node 环境的话，一句命令就够：

```sh
# 第一次需要登录（会发验证码到邮箱）
npm login
npm publish
```

不用加 `--access public`：这个名字没有 scope，默认就是公开的。
发布成功后再 `npm publish` 一次新版本，市场里的更新提醒才会出现。

装了 npm 包之后，安装命令变成最简单的一行：

```sh
dsh plugin add dsh-qwen-coupon-balance
```

---

## 上架之后

- 市场卡片会显示 `assets/icon-180.png` 作为图标、README 里的说明作为简介。
- 以后改代码：`git push` 即可；如果发过 npm，记得同步 `npm version patch && npm publish`。
- 相关文件都在 `publish/`：条目 YAML（`awesome-dsh-plugin.yml`）、PR 文案（`PR.md`）。

## 检查清单（提 PR 前扫一眼）

- [ ] 仓库是 **Public**
- [ ] `package.json` 里有 `dsh.bundle`（已有，这是能被 `dsh plugin add` 安装的前提）
- [ ] 文件名是 `<owner>__<repo>.yml`，放在 `data/plugins/`
- [x] 用户名已全部填成 `KAIXIN2006`（仓库 URL、name、icon）
- [ ] `description.en` 以英文句号结尾（这是唯一的必填字段）