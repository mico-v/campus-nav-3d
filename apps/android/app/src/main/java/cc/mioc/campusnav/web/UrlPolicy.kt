package cc.mioc.campusnav.web

import java.net.URI

/**
 * 壳只负责承载地图页，导航判断全部收在这里，方便纯 JVM 单测。
 */
object UrlPolicy {
    /** 壳的入口：地图页本身，带 shell=1 让 web 侧隐藏站点导航（首页 / 计划书 / 编辑器）。 */
    const val ENTRY_URL = "https://map.mioc.cc/demo.html?shell=1"

    /** 介绍页、计划书、编辑器只部署在 Pages，不进原生壳。 */
    private val NON_APP_PATHS = setOf("/", "/index.html", "/plan.html", "/editor.html")

    private val INTERNAL_HOSTS = setOf("map.mioc.cc", "www.map.mioc.cc")
    private val ALLOWED_SCHEMES = setOf("https", "http")

    fun hostOf(url: String): String? = runCatching { URI(url).host }.getOrNull()

    fun schemeOf(url: String): String? = runCatching { URI(url).scheme?.lowercase() }.getOrNull()

    fun pathOf(url: String): String? =
        runCatching { URI(url).path }.getOrNull()?.ifBlank { "/" }

    /** 站内链接留在 WebView 里，其余交给系统（浏览器、地图、邮件）。 */
    fun isInternal(url: String): Boolean {
        val host = hostOf(url) ?: return false
        if (schemeOf(url) !in ALLOWED_SCHEMES) return false
        return host.lowercase() in INTERNAL_HOSTS
    }

    /** 站内但属于站点介绍 / 计划书 / 编辑器：壳内不加载，留在浏览器看。 */
    fun isNonAppPage(url: String): Boolean {
        if (!isInternal(url)) return false
        val path = pathOf(url) ?: return false
        return path in NON_APP_PATHS
    }
}

/** 返回键先给 WebView 历史，再交给系统退出。 */
object BackPolicy {
    enum class Action {
        WEB_VIEW_BACK,
        FINISH_ACTIVITY,
    }

    fun onBack(canGoBack: Boolean): Action =
        if (canGoBack) Action.WEB_VIEW_BACK else Action.FINISH_ACTIVITY
}

/** 只有主框架加载失败才算离线；子资源失败（统计脚本、字体）不打断使用。 */
object OfflinePolicy {
    fun isOffline(requestIsForMainFrame: Boolean, httpStatus: Int): Boolean =
        requestIsForMainFrame && (httpStatus <= 0 || httpStatus >= 500)

    fun isRecovered(httpStatus: Int): Boolean = httpStatus in 200..399
}
