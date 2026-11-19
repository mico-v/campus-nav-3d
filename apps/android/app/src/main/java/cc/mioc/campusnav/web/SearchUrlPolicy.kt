package cc.mioc.campusnav.web

import java.net.URI
import java.net.URLEncoder

/** 壳内搜索：把关键字编码进地图页深链，纯 JVM 逻辑便于单测。 */
object SearchUrlPolicy {
    const val SEARCH_PARAM = "q"

    /** 搜索落在地图页（demo.html），和壳入口同一个页面，避免跳回介绍页。 */
    private const val MAP_URL = "https://map.mioc.cc/demo.html"
    private const val SHELL_FLAG = "shell=1"

    fun buildSearchUrl(keyword: String): String? {
        val trimmed = keyword.trim()
        if (trimmed.isEmpty()) return null
        val encoded = URLEncoder.encode(trimmed, Charsets.UTF_8.name())
        return "$MAP_URL?$SHELL_FLAG&$SEARCH_PARAM=$encoded"
    }

    fun isSearchUrl(url: String): Boolean {
        if (!UrlPolicy.isInternal(url)) return false
        val query = runCatching { URI(url).rawQuery }.getOrNull() ?: return false
        return query.split('&').any { it.substringBefore('=') == SEARCH_PARAM }
    }
}
