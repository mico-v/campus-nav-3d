package cc.mioc.campusnav.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/**
 * Material 3 双主题：Android 12 及以上跟随系统动态取色，低版本回落种子色。
 * 种子色与 web 侧落地页同一支靛蓝，壳与站点的观感才对得上。
 */
private val SeedPrimary = Color(0xFF2F4F8F)
private val SeedSecondary = Color(0xFF0F6B60)
private val SeedTertiary = Color(0xFF5B3F8F)

private val FallbackLight = lightColorScheme(
    primary = SeedPrimary,
    secondary = SeedSecondary,
    tertiary = SeedTertiary,
)

private val FallbackDark = darkColorScheme(
    primary = Color(0xFFAFC6FF),
    secondary = Color(0xFF7FD7C6),
    tertiary = Color(0xFFC9BDFF),
)

@Composable
fun CampusNavTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        darkTheme -> FallbackDark
        else -> FallbackLight
    }

    MaterialTheme(colorScheme = colorScheme, content = content)
}
