package cc.mioc.campusnav.web

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertTrue
import org.junit.Test

class ThemeBridgeTest {
    @Test
    fun `冷启动与切主题生成对应脚本`() {
        val light = ThemeBridge.applyScript(
            ThemeTokens(false, Color(0xFF14666C), Color(0xFFFFFFFF)),
        )
        val dark = ThemeBridge.applyScript(
            ThemeTokens(true, Color(0xFF79D3D8), Color(0xFF0D1417)),
        )
        assertTrue(light.contains("r.dataset.shellTheme='light'"))
        assertTrue(light.contains("'--primary','#14666c'"))
        assertTrue(dark.contains("r.dataset.shellTheme='dark'"))
        assertTrue(dark.contains("'--surface','#0d1417'"))
    }
}
