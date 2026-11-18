# campus-cli

`campus-validate` 对 campus-pack/2 数据包做几何、拓扑、命名自检。

```bash
node --experimental-strip-types packages/campus-cli/src/main.ts validate packs/usts-tianping --json
```

零错误退出码 0，有错误退出码 1。默认只跑三类自检；加 `--with-schema` 可把
`packages/campus-schema` 的结构性错误一起计入报告。
