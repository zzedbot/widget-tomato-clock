# Widget Tomato Clock

Windows 番茄工作法桌面挂件设计原型，采用温暖、克制的番茄角色方向。

## 设计稿

- [主挂件](design/main-widget.html)
- [计时状态总览](design/timer-states.html)
- [设置面板](design/settings.html)
- [设计系统](design/design-system.md)

## 产品文档

- [需求说明](docs/requirements.md)
- [边缘停靠行为设计](docs/edge-docking.md)
- [番茄钟 × 待办设计](docs/todo-pomodoro-design.md)

HTML 文件可以直接在浏览器中打开。页面使用 Tailwind CDN 与 Iconify 图标，因此在线查看时效果最完整。

## 在线画布

- [Superdesign 项目画布](https://superdesign.dev/teams/765e7a67-bcda-425b-bbf0-35a39b324c4d/projects/808648dc-39c9-44d8-abca-ed1c3a80a332)
- [主挂件预览](https://p.superdesign.dev/draft/891c5d2b-bec8-4b06-9af5-85617bbd3627)
- [计时状态预览](https://p.superdesign.dev/draft/31200dd1-4a43-4331-9ac1-564bcbbb31fd)
- [设置面板预览](https://p.superdesign.dev/draft/12a26275-cdb8-4f78-af9b-a29d23d8db21)
- [番茄钟 × 待办预览](https://p.superdesign.dev/draft/b1ea5c11-35a8-4f7e-8428-29dcbbc41692)

## 当前范围

- 主计时器与迷你收起模式
- 待开始、专注、暂停、短休息、长休息和完成状态
- 专注/休息时长、自动化、声音、置顶与开机启动设置
- 独立常驻待办窗口、长期/短期待办、专注时间归属与 Punch 完成记录

仓库已进入 Windows MVP 实现阶段，设计稿继续作为界面与验收参考。

## Windows 原型

原型采用 Electron、React、TypeScript 和 Vite 实现，当前包括：

- 基于目标结束时间的番茄钟状态机；
- 开始、暂停、继续、重置与跳过；
- 专注、短休息、长休息及完成状态；
- 当前任务与今日完成数量；
- 长期与短期待办管理，开始专注前至少选择一项；
- 运行中追加任务、更换长期目标、切换当前执行项；
- 与主挂件实时同步的独立待办窗口，支持跟随、分离、收起、隐藏和屏幕空间自适应；
- 待办/已办双页签、搜索与类型筛选；
- 基于时间片的单一归属账本，以及 Punch 耗时、5 秒撤销、历史记录和恢复待办；
- 主挂件、专注迷你模式和设置面板；
- 无边框窗口、拖拽、始终置顶和隐藏到托盘；
- 靠近屏幕边缘自动吸附为番茄，鼠标移入展开、移出收起；
- 主挂件迷你或边缘收起时自动隐藏待办窗口，恢复主挂件时同步显示；
- 系统托盘快捷操作、Windows 通知与开机启动设置；
- 本地状态保存、跨日期归零及休眠后的时间恢复。

### 本地开发

```bash
npm install
npm run dev
```

### 验证与构建

```bash
npm test
npm run test:e2e
npm run build
npm run pack
```

`npm run pack` 会生成可直接运行的 `release/win-unpacked/番茄伴侣.exe`。`npm run dist` 用于生成单文件便携包，并可能在首次执行时下载额外的 Electron Builder 资源。
