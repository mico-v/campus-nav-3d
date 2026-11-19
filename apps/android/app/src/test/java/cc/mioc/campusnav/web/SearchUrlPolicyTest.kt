package cc.mioc.campusnav.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchUrlPolicyTest {
    @Test
    fun `空关键字或纯空白不跳转`() {
        assertNull(SearchUrlPolicy.buildSearchUrl(""))
        assertNull(SearchUrlPolicy.buildSearchUrl("   \n\t"))
    }

    @Test
    fun `关键字编码进站点深链`() {
        assertEquals(
            "https://map.mioc.cc/demo.html?shell=1&q=%E5%9B%BE%E4%B9%A6%E9%A6%86",
            SearchUrlPolicy.buildSearchUrl("图书馆"),
        )
        assertEquals("https://map.mioc.cc/demo.html?shell=1&q=a+b", SearchUrlPolicy.buildSearchUrl("a b"))
    }

    @Test
    fun `识别站点搜索深链`() {
        assertTrue(SearchUrlPolicy.isSearchUrl("https://map.mioc.cc/?q=library"))
        assertTrue(SearchUrlPolicy.isSearchUrl("https://map.mioc.cc/demo.html?from=nav&q=library"))
        assertFalse(SearchUrlPolicy.isSearchUrl("https://map.mioc.cc/"))
        assertFalse(SearchUrlPolicy.isSearchUrl("https://example.com/?q=library"))
        assertFalse(SearchUrlPolicy.isSearchUrl("not a url"))
    }
}
