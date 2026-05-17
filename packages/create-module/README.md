# @maomiagent/create-module

用于生成一个最小可运行的 MaomiAgent 应用层模块目录。

生成结果默认是零构建静态模块，直接包含：

- `package.json`
- `maomi.module.json`
- `README.md`
- `server/index.mjs`
- `dist/ui/index.html`
- `dist/ui/styles.css`
- `dist/ui/main.js`

生成后的模块页面会直接通过 `/module-host/sdk/web.js` 接入 MaomiAgent 宿主桥接。

## 用法

```bash
npx @maomiagent/create-module my-module
```

更完整的写法：

```bash
npx @maomiagent/create-module my-module ^
  --module-id example.my.module ^
  --package-name @demo/my-module ^
  --title "我的模块" ^
  --description "一个示例模块" ^
  --requires-workspace
```

## 参数

- `target-dir`
  - 目标目录，必填
- `--module-id`
  - 模块唯一 ID，默认从目录名推导
- `--package-name`
  - npm 包名，默认生成 `@maomiagent/<dir>`
- `--title`
  - 菜单标题，默认从目录名推导
- `--description`
  - 模块描述
- `--requires-workspace`
  - 模块页面默认要求存在活动工作区
- `--force`
  - 允许写入已存在但为空的目录，或覆盖现有文件
- `--help`
  - 显示帮助

## 输出特点

- manifest 已声明 `iframe-app`
- 页面默认演示：
  - 获取 bootstrap context
  - 获取活动工作区
  - 获取模型列表
  - 获取会话列表
  - 读写模块私有存储
  - 预留模块 server 入口
  - 从浏览器 UI 调用模块 server
  - 回传 `report-state`
- 生成后可以直接在 MaomiAgent 设置页导入本地目录

## 本地调试

如果你在当前仓库里直接测试，可以运行：

```bash
node packages/create-module/bin/create-maomi-module.mjs demo-module
```
