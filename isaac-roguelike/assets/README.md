# 素材归属（Assets）

## Tiny 16: Basic — CC0 免费像素素材

- **作者**：Lanea Zimmerman
- **许可**：CC0 1.0（公有领域，可自由使用/修改/商用）
- **来源**：https://opengameart.org/content/tiny-16-basic

### 文件清单（`assets/sprites/`）

| 文件 | 内容 |
| --- | --- |
| `characters_1.png` | 角色/怪物帧（12×8 帧，16×16） |
| `things_0.png` | 物品帧（12×8 帧，16×16） |
| `basictiles_2.png` | 地面/墙体帧（8×15 帧，16×16） |
| `dead_1.png` | 死亡/墓碑帧（3×4 帧，16×16） |
| `Tiny16-Complete-Spritesheet-Repack3.png` | 社区整合完整图集（16×16 帧，256 帧） |

### 游戏内使用的帧映射（`game/js/sprites.js` → `TINY16_ATLAS`）

| 用途 | 图集 | 帧坐标 (x, y) |
| --- | --- | --- |
| 史莱姆敌人 | characters | (0, 4) |
| 幽灵敌人 | characters | (7, 5) |
| 飞虫敌人 | characters | (7, 6) |
| 射手敌人 | characters | (9, 4) |
| 宝箱 | things | (0, 0) |
| 剑（装饰） | things | (3, 0) |
| 绿药水 | things | (0, 7) |

> 帧坐标通过像素颜色分析与逐帧目检确定；游戏中按 `F1` 可打开图集查看器核对，
> 需要调整映射时直接改 `TINY16_ATLAS` 即可。

### 程序化绘制的部分（无外部素材）

主角（哭泣小孩）、红心、金币、钥匙、道具基座、地面/墙体/岩石砖块、泪滴，
均在 `game/js/sprites.js` 中以像素图（字符串数组 + 调色板）定义，不涉及第三方素材。
