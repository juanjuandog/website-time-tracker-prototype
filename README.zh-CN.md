<div align="center">

# OrbitLog

### 一个本地优先的 macOS 网站与 App 时间日志

把你每天浏览的网站、打开的页面和使用的 App，整理成可以复盘的日报、周报和月报。

![release](https://img.shields.io/badge/release-v0.1.0-f08f72)
![platform](https://img.shields.io/badge/platform-macOS-f0c66e)
![storage](https://img.shields.io/badge/storage-local%20SQLite-79c98c)
![license](https://img.shields.io/badge/license-MIT-78a8d8)
![status](https://img.shields.io/badge/status-beta-b59ae0)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

---

OrbitLog 是一个 macOS 本地时间记录工具。它会读取当前正在使用的浏览器标签页或前台 App，把时间整理成今日、本周、本月统计，并通过网页仪表盘和 Markdown 报告展示出来。

它适合想复盘自己学习、娱乐、社交、工作时间的人，也适合不想把浏览历史交给云服务的 local-first 工具爱好者。

> 当前仍是 beta 版本，适合技术用户试用。权限引导、打包安装和浏览器覆盖还在继续打磨。

## 预览

![OrbitLog 仪表盘](docs/screenshots/dashboard.png)

| 网站 / 分类图表 | 网站 / 页面汇总 |
| --- | --- |
| ![OrbitLog 图表](docs/screenshots/dashboard-charts.png) | ![OrbitLog 汇总](docs/screenshots/dashboard-lists.png) |

> Demo GIF 正在计划中，录制清单见：[截图清单](docs/SCREENSHOTS.md)。

## 功能亮点

- **本地优先**：数据保存在本机 SQLite，不需要账号，也不上传浏览记录。
- **网站和 App 记录**：支持读取常见浏览器的当前 URL，也能记录前台 App。
- **日报 / 周报 / 月报**：仪表盘支持今日、本周、本月视图。
- **Markdown 导出**：可以把时间记录导出成适合复盘和分享的 Markdown。
- **手动分类规则**：遇到陌生网站或 App 时，可以归类为学习、娱乐、社交或其他。
- **桌面分类浮窗**：分类选择不局限在网页里，可以在当前使用场景右上角弹出。
- **温暖简洁的 UI**：用环形图、列表和柔和视觉呈现时间分布。

## 为什么做 OrbitLog？

很多时间追踪工具要么太重，要么过于黑盒，要么默认依赖云端。OrbitLog 更克制：

- 只关注你实际使用的网站、页面和 App。
- 原始数据留在本机。
- 报告可以导出成 Markdown，而不是锁在某个产品里。
- 分类由你手动决定，不用 AI 猜。
- 主界面是普通本地网页，桌面 companion 只负责必要时弹出分类浮窗。

## 适合谁？

如果你有这些需求，OrbitLog 可能适合你：

- 想知道一天里学习、娱乐、社交分别花了多少时间。
- 想把时间记录写进日报、周报或复盘文档。
- 想要比系统屏幕使用时间更细的网页级统计。
- 不想把浏览历史上传到第三方服务。
- 喜欢可 hack、可自托管、可本地运行的小工具。

## 工作方式

OrbitLog 会启动一个本地 Node.js 服务。macOS 上通过 AppleScript 读取当前前台 App；如果前台是支持的浏览器，就读取当前标签页 URL 和标题。数据写入本地 SQLite，再由网页仪表盘和 Markdown 导出功能展示。

```text
macOS 前台 App / 浏览器标签页
        ↓
Node.js 本地服务
        ↓
SQLite 本地数据库
        ↓
网页仪表盘 + Markdown 报告 + 桌面分类浮窗
```

## 快速开始

依赖：

- macOS
- Node.js
- Rust 工具链，仅在运行 Tauri companion 或打包桌面版时需要

## 下载 Beta 版

macOS beta 构建会发布在 GitHub Releases：

[下载 OrbitLog v0.1.0](https://github.com/juanjuandog/orbitlog/releases/tag/v0.1.0)

当前 App 还没有签名，所以 macOS 可能会出现额外安全提示。现阶段对技术用户来说，从源码运行依然是最稳的试用方式。

安装依赖：

```bash
npm install
```

启动本地仪表盘：

```bash
npm start
```

打开终端里显示的地址，通常是：

```text
http://localhost:4174
```

启动桌面分类浮窗 companion：

```bash
npm run companion
```

更详细的步骤见：[安装与权限说明](docs/SETUP.md)。

## 打包桌面版

开发模式：

```bash
npm run desktop
```

生产打包：

```bash
npm run desktop:build
```

常见 macOS 产物：

```text
src-tauri/target/release/bundle/macos/OrbitLog.app
src-tauri/target/release/bundle/dmg/OrbitLog_0.1.0_aarch64.dmg
```

## macOS 权限

OrbitLog 需要读取当前前台 App 和浏览器标签页信息。如果仪表盘显示读取失败，请打开：

```text
系统设置 > 隐私与安全性
```

给运行 OrbitLog 的终端或 App 授权：

- 辅助功能
- 自动化

## 当前支持的浏览器

可以读取具体 URL 的浏览器：

- Safari
- Google Chrome
- Microsoft Edge
- Brave Browser
- Arc
- Chromium

Firefox 目前还不能稳定读取具体 URL，后续可能通过浏览器扩展支持。

## 隐私

OrbitLog 的设计原则是本地优先：

- 不需要账号。
- 不依赖云服务。
- 不上传浏览历史。
- 使用记录保存在本机 SQLite。
- 可以通过忽略规则跳过银行、邮箱、密码管理器等敏感网站。

更多细节见：[隐私说明](docs/PRIVACY.md)。

## 已知限制

- 目前主要支持 macOS。
- URL 读取依赖 macOS 自动化权限。
- 全屏 App、多屏幕环境下，分类浮窗位置可能需要继续优化。
- 睡眠、唤醒、空闲检测已经做了保护，但极端情况下仍可能有少量时间误差。
- Windows 支持需要单独实现前台窗口和浏览器 URL 读取逻辑。

## 路线图

- [x] 本地网页仪表盘
- [x] SQLite 存储
- [x] 今日 / 本周 / 本月视图
- [x] Markdown 导出
- [x] 手动分类规则
- [x] 桌面分类浮窗
- [x] README 展示截图
- [ ] Demo GIF
- [ ] 签名 macOS beta 安装包
- [ ] 更友好的首次权限引导
- [ ] 数据备份 / 重置工具
- [ ] Firefox 扩展支持
- [ ] Windows 支持

## 常见问题

### OrbitLog 会上传我的浏览历史吗？

不会。OrbitLog 把数据保存在本地 SQLite 中，没有账号系统、云同步服务或内置分析上报。

### 为什么 macOS 要求授权？

因为 OrbitLog 需要读取当前前台 App 和浏览器标签页信息。没有辅助功能和自动化权限，就无法稳定知道你当前正在使用哪个网站。

### 支持 Windows 吗？

暂时不支持。当前实现依赖 macOS AppleScript，Windows 需要另一套前台窗口和浏览器 URL 读取方案。

### 支持 Firefox 吗？

暂时不能读取 Firefox 的具体 URL。后续可以通过浏览器扩展或其他集成方式支持。

### 数据在哪里？

使用记录在：

```text
data/activity.sqlite
```

本地设置在：

```text
data/settings.json
```

## 开发

常用命令：

```bash
npm start
npm run companion
npm run desktop
npm run desktop:build
```

主要文件：

- `server.js`：本地追踪服务、SQLite 存储、统计汇总、Markdown 导出。
- `public/`：网页仪表盘和 companion 浮窗 UI。
- `src-tauri/`：Tauri companion 和桌面包装。

## License

MIT
