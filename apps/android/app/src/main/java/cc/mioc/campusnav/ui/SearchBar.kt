package cc.mioc.campusnav.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SearchBar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

/** Material 3 搜索栏：收起时是普通顶栏，展开后提交关键字。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampusSearchBar(
    onSearch: (String) -> Unit,
    onOpenMap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var active by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }

    SearchBar(
        modifier = modifier,
        query = query,
        onQueryChange = { query = it },
        onSearch = {
            onSearch(it)
            active = false
        },
        active = active,
        onActiveChange = { active = it },
        placeholder = { Text(text = "搜索校园地点") },
        leadingIcon = {
            IconButton(onClick = onOpenMap) {
                Icon(imageVector = Icons.Filled.Menu, contentDescription = "地图")
            }
        },
        trailingIcon = {
            IconButton(onClick = { onSearch(query); active = false }) {
                Icon(imageVector = Icons.Filled.Search, contentDescription = "搜索")
            }
        },
    ) {
        Text(text = "输入地点名称，回车或点搜索图标跳转地图。")
    }
}
