package cc.mioc.campusnav.web

import java.net.URI

/**
 * 壳只负责承载站点，导航判断全部收在这里，方便纯 JVM 单测。
 */
object UrlPolicy {
    const val ENTRY_URL = "https://map.mioc.cc/"

    private val INTERNAL_HOSTS = setOf("map.mioc.cc", "www.map.mioc.cc")
    private val ALLOWED_SCHEMES = setOf("https", "http")

    fun hostOf(url: String): String? = runCatching { URI(url).host }.getOrNull()

    fun schemeOf(url: String): String? = runCatching { URI(url).scheme?.lowercase() }.getOrNull()

    /** 站内链接留在 WebView 里，其余交给系统（浏览器、地图、邮件）。 */
    fun isInternal(url: String): Boolean {
        val host = hostOf(url) ?: return false
        if (schemeOf(url) !in ALLOWED_SCHEMES) return false
        return host.lowercase() in INTERNAL_HOSTS
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
