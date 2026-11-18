package cc.mioc.campusnav.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlPolicyTest {
    @Test
    fun `站内 https 链接留在 WebView`() {
        assertTrue(UrlPolicy.isInternal("https://map.mioc.cc/go?from=n1&to=n2"))
        assertTrue(UrlPolicy.isInternal("https://map.mioc.cc/"))
    }

    @Test
    fun `外站与伪装域名交给系统`() {
        assertFalse(UrlPolicy.isInternal("https://example.com/"))
        assertFalse(UrlPolicy.isInternal("https://map.mioc.cc.evil.test/"))
    }

    @Test
    fun `缺失 scheme 或非 http 协议不算站内`() {
        assertFalse(UrlPolicy.isInternal("map.mioc.cc/demo.html"))
        assertFalse(UrlPolicy.isInternal("intent://scan/#Intent;scheme=zxing;end"))
    }

    @Test
    fun `返回键先走 WebView 历史再退出`() {
        assertEquals(BackPolicy.Action.WEB_VIEW_BACK, BackPolicy.onBack(canGoBack = true))
        assertEquals(BackPolicy.Action.FINISH_ACTIVITY, BackPolicy.onBack(canGoBack = false))
    }

    @Test
    fun `只有主框架失败才算离线`() {
        assertTrue(OfflinePolicy.isOffline(requestIsForMainFrame = true, httpStatus = 503))
        assertTrue(OfflinePolicy.isOffline(requestIsForMainFrame = true, httpStatus = 0))
        assertFalse(OfflinePolicy.isOffline(requestIsForMainFrame = false, httpStatus = 503))
        assertFalse(OfflinePolicy.isOffline(requestIsForMainFrame = true, httpStatus = 404))
    }
}
