# BGM 放这里

把想用的背景音乐（mp3 / ogg / m4a）直接放进这个目录，然后在
`src/game/bgm.ts` 的 `BGM_TRACKS` 里注册一行即可，菜单会自动出现新选项：

```ts
{ id: 'rally', title: '激战', sub: '自定义 · mp3', kind: 'file', src: '/bgm/rally.mp3', volume: 0.6 }
```

- `src` 写 `public` 目录下的路径，`public/bgm/rally.mp3` → `/bgm/rally.mp3`
- 建议单曲 < 3 MB、128 kbps 左右，手机端加载更快
- 版权音乐记得确认授权
