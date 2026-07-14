# flow-batch 文档总览

## 给接入方先看什么

1. [接入指南](./接入指南.md)
2. [API 目录总览](./api/README.md)
3. 三个接口说明 + [完整示例](./api/example-编程小屋.md)

## 文档分工

- [接入指南](./接入指南.md)：教程视角，按接入顺序讲清楚怎么从 0 建出一个作品
- [api/README.md](./api/README.md)：紧凑总览，集中看 base URL、header、响应壳、错误码
- [api/character.md](./api/character.md)：建角色接口字段与常见错误
- [api/image.md](./api/image.md)：生图接口字段与常见错误
- [api/flow.md](./api/flow.md)：建作品接口字段与常见错误
- [api/example-编程小屋.md](./api/example-编程小屋.md)：一组完整请求参数样例

## 推荐阅读顺序

先准备头像图和形象图，再建角色；封面图可以提前准备，也可以在建角色后准备，只要调用建作品接口前拿到 `cover_url` 即可。
