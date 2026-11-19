# apps/android — 原生壳

Android 原生壳：Kotlin + Jetpack Compose + Material 3，单 Activity 内用 WebView 承载
`https://map.mioc.cc/demo.html?shell=1` 地图页。站点首页、计划报告（`plan.html`）与
编辑器只部署在 GitHub Pages，不进壳 —— 壳内点到的站内介绍页会被 `UrlPolicy.isNonAppPage`
拦下。地图渲染仍由 web 侧负责，壳只补系统集成（状态栏、返回键、外链、离线兜底）。

## 为什么不是 Capacitor

2026-11-18 定：原生壳自己写。需要的是返回键、深链、离线兜底这三件系统级行为，
Capacitor 会多带一层运行时与桥，收益对不上成本。

## Material 3 约定

- 颜色只走 `MaterialTheme.colorScheme`；`tools/assert-theme-tokens.sh` 在 CI 里挡住主题外的硬编码色值。
- Android 12 及以上用动态取色，低版本回落与 web 落地页同一支靛蓝种子色（`ui/CampusNavTheme.kt`）。
- 组件只用 Compose Material 3：`Scaffold` + `TopAppBar` + `Button` + `Surface`。

## 目录

```text
app/src/main/java/cc/mioc/campusnav/
  MainActivity.kt        # Scaffold、TopAppBar、离线面板、返回键
  ui/CampusNavTheme.kt   # Material 3 双主题 + 动态取色
  web/ShellWebView.kt    # WebView 实例与外链分派
  web/UrlPolicy.kt       # 站内判定、返回键策略、离线判定（纯 JVM，可单测）
app/src/test/java/...    # UrlPolicyTest（JVM 单测，不需要模拟器）
```

## 本地与 CI

本机没有 Android SDK，构建统一在 GitHub Actions（`.github/workflows/android.yml`，
`ubuntu-latest` 自带 SDK）：

```bash
gradle :app:assembleDebug :app:testDebugUnitTest
```

当前没有提交 Gradle wrapper，CI 用 `gradle/actions/setup-gradle` 指定版本（8.14.3）。
wrapper 待 M4-N2 之前补上，届时 CI 改成 `./gradlew`。
