package cc.mioc.campusnav

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import cc.mioc.campusnav.ui.CampusNavTheme
import cc.mioc.campusnav.ui.CampusSearchBar
import cc.mioc.campusnav.ui.ShellBottomBar
import cc.mioc.campusnav.web.BackPolicy
import cc.mioc.campusnav.web.SearchUrlPolicy
import cc.mioc.campusnav.web.ShellWebView
import cc.mioc.campusnav.web.UrlPolicy
import cc.mioc.campusnav.web.rememberShellThemeTokens

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CampusNavTheme {
                CampusNavApp(onFinish = { finish() })
            }
        }
    }
}

@Composable
fun CampusNavApp(onFinish: () -> Unit) {
    var reloadToken by remember { mutableIntStateOf(0) }
    var searchUrl by remember { mutableStateOf(UrlPolicy.ENTRY_URL) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var selectedTab by remember { mutableIntStateOf(0) }
    var pageCanGoBack by remember { mutableStateOf(false) }
    val darkTheme = isSystemInDarkTheme()
    val themeTokens = rememberShellThemeTokens(darkTheme)

    val canGoBack = webView?.canGoBack() == true || pageCanGoBack
    BackHandler(enabled = canGoBack || selectedTab != 0) {
        when (BackPolicy.onBack(canGoBack)) {
            BackPolicy.Action.WEB_VIEW_BACK -> webView?.goBack()
            BackPolicy.Action.FINISH_ACTIVITY -> {
                if (selectedTab != 0) selectedTab = 0 else onFinish()
            }
        }
    }

    Scaffold(
        topBar = {
            CampusSearchBar(
                onSearch = { keyword ->
                    SearchUrlPolicy.buildSearchUrl(keyword)?.let {
                        searchUrl = it
                        reloadToken += 1
                    }
                },
                onOpenMap = { selectedTab = 0 },
            )
        },
        bottomBar = {
            ShellBottomBar(selected = selectedTab, onSelect = { selectedTab = it })
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            ShellWebView(
                reloadToken = reloadToken,
                modifier = Modifier.fillMaxSize(),
                url = searchUrl,
                themeTokens = themeTokens,
                onWebViewReady = { webView = it },
                onBackStateChanged = { pageCanGoBack = it },
            )
        }
    }
}
