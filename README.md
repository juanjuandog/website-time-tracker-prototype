# Website Time Tracker Prototype

本地网页使用时间监控原型。它会定时读取当前前台应用；如果前台是支持的浏览器，会读取当前标签页的完整 URL 和标题，并按网站和具体网页累计使用时间。

## 启动

```bash
npm start
```

启动后打开终端里显示的地址，例如：

```text
http://localhost:4174
```

如果 `4173` 被占用，服务会自动使用下一个可用端口。

## 桌面 App

开发模式：

```bash
npm run desktop
```

打包：

```bash
npm run desktop:build
```

打包产物：

```text
src-tauri/target/release/bundle/macos/Web Time Tracker.app
src-tauri/target/release/bundle/dmg/Web Time Tracker_0.1.0_aarch64.dmg
```

桌面版带菜单栏图标，菜单里可以显示窗口、暂停/继续记录、切换开机自启、退出。

## macOS 权限

第一次运行时，macOS 可能会要求授权。若页面显示读取失败，请到：

```text
系统设置 > 隐私与安全性
```

给当前运行 Node 的终端或 Codex 授权：

- 辅助功能
- 自动化

## 当前支持

- Safari
- Google Chrome
- Microsoft Edge
- Brave Browser
- Arc
- Chromium

Firefox 需要浏览器扩展或额外方案，当前原型暂未支持读取具体 URL。

## 数据

数据保存在本机 SQLite 数据库：

```text
data/activity.sqlite
```

仪表盘支持：

- 今日 / 本周 / 本月视图
- 网站汇总
- 具体网页汇总
- 网站占比环形图
- 暂停/继续记录
- 导出 Markdown
