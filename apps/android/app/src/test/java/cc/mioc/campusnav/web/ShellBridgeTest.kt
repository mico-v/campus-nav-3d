package cc.mioc.campusnav.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShellBridgeTest {
    @Test
    fun `标题走白名单字段`() {
        val received = mutableListOf<String>()
        val bridge = ShellBridge(onTitle = { received += it })
        bridge.onTitle("""{"title":"图书馆","canGoBack":true}""")
        bridge.onTitle("""{"title":""}""")
        bridge.onTitle("""{"other":"x"}""")
        assertEquals(listOf("图书馆"), received)
    }

    @Test
    fun `返回状态只接受布尔值`() {
        val received = mutableListOf<Boolean>()
        val bridge = ShellBridge(onBackStateChanged = { received += it })
        bridge.onBackStateChanged("""{"canGoBack":true}""")
        bridge.onBackStateChanged("""{"canGoBack":false}""")
        bridge.onBackStateChanged("""{"canGoBack":1}""")
        assertEquals(listOf(true, false), received)
    }

    @Test
    fun `畸形入参不抛异常也不回调`() {
        var calls = 0
        val bridge = ShellBridge(
            onTitle = { calls++ },
            onBackStateChanged = { calls++ },
        )
        listOf(
            null,
            "",
            "{",
            "[]",
            "null",
            """{"title":{"nested":1}}""",
            """{"canGoBack":"true"}""",
        ).forEach { payload ->
            bridge.onTitle(payload)
            bridge.onBackStateChanged(payload)
        }
        assertEquals(0, calls)
    }

    @Test
    fun `接口名固定且包含桥注解`() {
        assertEquals("CampusNavShell", ShellBridge.INTERFACE_NAME)
        val methods = ShellBridge::class.java.methods.filter {
            it.isAnnotationPresent(android.webkit.JavascriptInterface::class.java)
        }.map { it.name }.toSet()
        assertEquals(setOf("onTitle", "onBackStateChanged"), methods)
    }
}
