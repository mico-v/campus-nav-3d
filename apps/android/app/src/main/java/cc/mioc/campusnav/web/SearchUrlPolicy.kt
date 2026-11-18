package cc.mioc.campusnav.web

import java.net.URI
import java.net.URLEncoder

/** 壳内搜索：把关键字编码进站点深链，纯 JVM 逻辑便于单测。 */
object SearchUrlPolicy {
    const val SEARCH_PARAM = "q"

    fun buildSearchUrl(keyword: String): String? {
        val trimmed = keyword.trim()
        if (trimmed.isEmpty()) return null
        val encoded = URLEncoder.encode(trimmed, Charsets.UTF_8.name())
        return "${UrlPolicy.ENTRY_URL}?$SEARCH_PARAM=$encoded"
    }

    fun isSearchUrl(url: String): Boolean {
        if (!UrlPolicy.isInternal(url)) return false
        val query = runCatching { URI(url).rawQuery }.getOrNull() ?: return false
        return query.split('&').any { it.substringBefore('=') == SEARCH_PARAM }
    }
}
