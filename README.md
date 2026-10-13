# Envveil

**Envveil — Web Environment Marker** 是一个 Microsoft Edge 扩展，为指定网站添加固定文字水印，帮助辨别开发、测试等 Web 环境。

## 本地构建

需要 Node.js 20 或更高版本。

```powershell
npm install
npm run build
```

构建完成后，在 Edge 打开 `edge://extensions`，启用“开发人员模式”，选择“加载解压缩的扩展”，并选择仓库下的 `dist` 目录。

## 使用

点击扩展图标，在弹窗中添加域名并授予站点权限。根域名规则会同时应用于该域名及其子域名。创建规则后可以在同一弹窗中编辑水印文字、显示位置、颜色、透明度和布局参数。

站点权限由 Edge 管理。扩展只在本地存储规则，不会上传水印文字或页面数据。
