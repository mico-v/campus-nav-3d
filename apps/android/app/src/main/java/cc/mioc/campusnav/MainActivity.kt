package cc.mioc.campusnav

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cc.mioc.campusnav.ui.CampusNavTheme
import cc.mioc.campusnav.web.BackPolicy
import cc.mioc.campusnav.web.ShellWebView

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CampusNavTheme {
                CampusNavApp()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampusNavApp() {
    var reloadToken by remember { mutableIntStateOf(0) }
    var offline by remember { mutableStateOf(false) }
    var webView by remember { mutableStateOf<WebView?>(null) }

    val canGoBack = webView?.canGoBack() == true
    BackHandler(enabled = canGoBack) {
        when (BackPolicy.onBack(canGoBack)) {
            BackPolicy.Action.WEB_VIEW_BACK -> webView?.goBack()
            BackPolicy.Action.FINISH_ACTIVITY -> Unit
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(text = "校园导航") },
                actions = {
                    IconButton(onClick = { reloadToken += 1 }) {
                        Icon(imageVector = Icons.Filled.Refresh, contentDescription = "刷新")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            ShellWebView(
                reloadToken = reloadToken,
                modifier = Modifier.fillMaxSize(),
                onWebViewReady = { webView = it },
                onOfflineChange = { offline = it },
            )
            if (offline) {
                OfflinePanel(onRetry = { reloadToken += 1 })
            }
        }
    }
}

@Composable
private fun OfflinePanel(onRetry: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = "离线或站点不可达", style = MaterialTheme.typography.titleMedium)
            Text(
                text = "校园地图需要联网加载。已缓存的页面在恢复网络后自动可用。",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            Button(onClick = onRetry) {
                Text(text = "重试")
            }
        }
    }
}
