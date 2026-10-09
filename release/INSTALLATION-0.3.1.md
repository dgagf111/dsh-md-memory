# 0.3.1 宿主布局修复

2026-10-09。修复 0.3.0 在 DSH 主面板约 1000 CSSpx 宽度下的布局错误。

## 根因

旧 @container(max-width:1050px) 仍设置导航 grid-row:1/3、编辑器 grid-column:2、列表 max-height:270px。新版五列网格覆盖了列定义，却未移除这些定位；编辑器被放入 10px 分界列，自动产生第二行，列表只剩上半区域。旧 680px 规则也与新版断点重叠。

## 修复

删除旧 1050px、680px 响应式块和旧网格尺寸定义；桌面网格明确使用单行 minmax(0,1fr)，只保留新版 850px、600px 布局。未更改记忆数据或后台逻辑。

## 验证

- 真实 DSH 宿主复现旧布局：1000px 主面板，记忆栏高度 357px、编辑器宽度 50px，导航高度 717px。
- 在同一宿主页面载入修正样式，1280/1440/1100/920px 窗口的布局检查通过；读真实项目记忆及配置页截图。测试没有保存、删除或修改真实记忆。
- 浏览器回归新增 1050/1000/900/851px 面板检查，确认三栏同高同起点、编辑器至少 320px、无水平溢出。既有 CRUD、冲突、配置、滚动和拖动测试通过。
- 43 项单元测试、类型检查、构建通过；最终 tarball 的 RC.2 与 Alpha.1 宿主契约测试通过。
- 官方 CLI 已安装到 desktop profile，核对磁盘版本为 0.3.1。尚未重启用户桌面进程。

真实宿主布局验收：node tests/desktop-layout.mjs。
候选样式验收：node tests/desktop-layout.mjs --candidate-css；该方式在独立测试浏览器中替换样式，仍使用真实宿主 DOM/API。
截图和几何数据：release/ui/desktop-layout-*.png、desktop-layout-result.json。

SHA-256：6fc2a07d6072cb47d91d52bac0b35d68954dace06fd7352753d1f56c9a632e66。
