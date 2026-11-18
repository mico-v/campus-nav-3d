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
import androidx.compose.ui.viewinterop.AndroidView

/**
 * 壳里的 WebView：站内链接自己扛，外链交给系统；主框架失败才报离线。
 * 刷新用 token 驱动，避免把 WebView 实例透传到 Activity 层。
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ShellWebView(
    reloadToken: Int,
    modifier: Modifier = Modifier,
    url: String = UrlPolicy.ENTRY_URL,
    onWebViewReady: (WebView) -> Unit = {},
    onOfflineChange: (Boolean) -> Unit = {},
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    var handledToken by remember { mutableIntStateOf(reloadToken) }

    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
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
                        onOfflineChange(false)
                    }

                    override fun onReceivedError(
                        view: WebView,
                        request: WebResourceRequest,
                        error: WebResourceError,
                    ) {
                        if (request.isForMainFrame) onOfflineChange(true)
                    }

                    override fun onReceivedHttpError(
                        view: WebView,
                        request: WebResourceRequest,
                        errorResponse: WebResourceResponse,
                    ) {
                        onOfflineChange(
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
}
