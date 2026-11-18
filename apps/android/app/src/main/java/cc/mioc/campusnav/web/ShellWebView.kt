package cc.mioc.campusnav.web

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import cc.mioc.campusnav.ui.ThemeTokens

/**
 * 壳里的 WebView：站内链接自己扛，外链交给系统；主框架失败才报离线。
 * 主题变化用 evaluateJavascript 推给页面 CSS 变量，桥对象只暴露白名单。
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ShellWebView(
    reloadToken: Int,
    modifier: Modifier = Modifier,
    url: String = UrlPolicy.ENTRY_URL,
    themeTokens: ThemeTokens? = null,
    onWebViewReady: (WebView) -> Unit = {},
    onTitleChanged: (String) -> Unit = {},
    onBackStateChanged: (Boolean) -> Unit = {},
    onOfflineChange: (Boolean) -> Unit = {},
) {
    val context = LocalContext.current
    var webView by remember { mutableStateOf<WebView?>(null) }
    var handledToken by remember { mutableIntStateOf(reloadToken) }
    var appliedTheme by remember { mutableStateOf<ThemeTokens?>(null) }
    var titleHandler by remember { mutableStateOf(onTitleChanged) }
    var backHandler by remember { mutableStateOf(onBackStateChanged) }
    var offlineHandler by remember { mutableStateOf(onOfflineChange) }
    titleHandler = onTitleChanged
    backHandler = onBackStateChanged
    offlineHandler = onOfflineChange

    AndroidView(
        modifier = modifier,
        factory = {
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                addJavascriptInterface(
                    ShellBridge(
                        onTitle = { titleHandler(it) },
                        onBackStateChanged = { backHandler(it) },
                    ),
                    ShellBridge.INTERFACE_NAME,
                )
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView,
                        request: WebResourceRequest,
                    ): Boolean {
                        val target = request.url.toString()
                        if (UrlPolicy.isInternal(target)) return false
                        return try {
                            view.context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)))
                            true
                        } catch (error: Exception) {
                            true
                        }
                    }

                    override fun onPageFinished(view: WebView, url: String) {
                        appliedTheme?.let { view.evaluateJavascript(ThemeBridge.applyScript(it), null) }
                        offlineHandler(false)
                    }

                    override fun onReceivedError(
                        view: WebView,
                        request: WebResourceRequest,
                        error: WebResourceError,
                    ) {
                        if (request.isForMainFrame) offlineHandler(true)
                    }

                    override fun onReceivedHttpError(
                        view: WebView,
                        request: WebResourceRequest,
                        errorResponse: WebResourceResponse,
                    ) {
                        offlineHandler(
                            OfflinePolicy.isOffline(
                                requestIsForMainFrame = request.isForMainFrame,
                                httpStatus = errorResponse.statusCode,
                            ),
                        )
                    }
                }
                loadUrl(url)
                webView = this
                onWebViewReady(this)
            }
        },
    )

    LaunchedEffect(reloadToken) {
        if (reloadToken != handledToken) {
            handledToken = reloadToken
            webView?.reload()
        }
    }

    LaunchedEffect(themeTokens) {
        if (themeTokens != null && themeTokens != appliedTheme) {
            appliedTheme = themeTokens
            webView?.evaluateJavascript(ThemeBridge.applyScript(themeTokens), null)
        }
    }
}
