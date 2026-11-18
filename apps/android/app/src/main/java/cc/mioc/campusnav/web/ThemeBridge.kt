package cc.mioc.campusnav.web

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** 壳 -> 页面：注入主题变量用的数据，颜色以 #RRGGBB 传给 CSS。 */
data class ThemeTokens(val darkTheme: Boolean, val primary: Color, val surface: Color)

/** 把主题数据编码成一次性 evaluateJavascript 脚本，字符串全部转义。 */
object ThemeBridge {
    fun applyScript(tokens: ThemeTokens): String = buildString {
        append("(function(){var r=document.documentElement;")
        append("r.dataset.shellTheme=").append(jsString(if (tokens.darkTheme) "dark" else "light")).append(';')
        append("r.style.setProperty('--primary',").append(jsString(hex(tokens.primary))).append(");")
        append("r.style.setProperty('--surface',").append(jsString(hex(tokens.surface))).append(");")
        append("})()")
    }

    private fun hex(color: Color): String = buildString {
        append('#')
        append(channel(color.red))
        append(channel(color.green))
        append(channel(color.blue))
    }

    private fun channel(value: Float): String =
        (value * 255f).toInt().coerceIn(0, 255).toString(16).padStart(2, '0')

    private fun jsString(value: String): String {
        val escaped = buildString {
            for (ch in value) when (ch) {
                '\\' -> append("\\\\")
                '\'' -> append("\\'")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                else -> append(ch)
            }
        }
        return "'$escaped'"
    }
}

@Composable
fun rememberShellThemeTokens(darkTheme: Boolean): ThemeTokens {
    val colors = MaterialTheme.colorScheme
    return ThemeTokens(
        darkTheme = darkTheme,
        primary = colors.primary,
        surface = colors.surface,
    )
}
