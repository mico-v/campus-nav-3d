package cc.mioc.campusnav.web

import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * 页面 -> 壳的桥。只暴露两个白名单方法；页面传来的字符串一律按不可信输入解析。
 */
class ShellBridge(
    private val onTitle: (String) -> Unit = {},
    private val onBackStateChanged: (Boolean) -> Unit = {},
) {
    @JavascriptInterface
    fun onTitle(payload: String?) {
        val title = parseString(payload, KEY_TITLE) ?: return
        if (title.isNotEmpty()) onTitle(title)
    }

    @JavascriptInterface
    fun onBackStateChanged(payload: String?) {
        val canGoBack = parseBoolean(payload, KEY_CAN_GO_BACK) ?: return
        onBackStateChanged(canGoBack)
    }

    companion object {
        const val INTERFACE_NAME = "CampusNavShell"

        private const val KEY_TITLE = "title"
        private const val KEY_CAN_GO_BACK = "canGoBack"

        private fun parseString(payload: String?, key: String): String? {
            if (payload == null) return null
            return try {
                JSONObject(payload).opt(key) as? String
            } catch (error: Exception) {
                null
            }
        }

        private fun parseBoolean(payload: String?, key: String): Boolean? {
            if (payload == null) return null
            return try {
                JSONObject(payload).opt(key) as? Boolean
            } catch (error: Exception) {
                null
            }
        }
    }
}
