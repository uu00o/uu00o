# 眼泪地牢（Tear Dungeon）— 以撒的结合风格肉鸽游戏

一个受《以撒的结合》（The Binding of Isaac）启发的最小可玩版肉鸽游戏。
Electron 桌面应用 + HTML5 Canvas，无需联网即可游玩。

![游戏截图](docs/screenshot.png)

## 快速开始

```bash
npm install          # 首次安装（下载 Electron）
npm start            # 启动游戏
npm test             # 运行核心逻辑无头测试（40 项断言）
```

需要 Node.js ≥ 18 与 npm。

## 玩法

- **移动**：`WASD` 或方向键
- **射击**：鼠标瞄准，按住 **左键**（或按住 `空格`）发射眼泪
- **目标**：清空每个房间的敌人解锁大门 → 找到并击败 **Boss 房** → 进入下一层
- **通关**：击败第 3 层 Boss 胜利；按 `Enter` 可继续无尽模式
- **快捷键**：`R` 重新开始（新种子）、`F1` 图集查看器（浏览 Tiny16 素材帧映射）

### 房间类型

| 类型 | 说明 |
| --- | --- |
| 出生房 | 每次进入楼层/新游戏的起点，有红心与金币补给 |
| 普通房 | 有敌人，清空后解锁大门 |
| 道具房 | 基座上有一个随机增益道具，需要 **1 把钥匙** 开门（自动消耗） |
| Boss 房 | 击败 Boss 后掉落宝箱（金币/红心/钥匙/药水） |

### 敌人

- **史莱姆**（绿色，缓速追击，血厚）
- **幽灵**（浅蓝，快速飘移，可穿岩石）
- **飞虫**（白幽灵形象，高速之字形扑击，血薄）
- **射手**（红眼幽灵，保持距离发射眼泪）
- **Boss**（大型红色史莱姆：径向弹幕 + 冲刺 + 半血召唤史莱姆）

### 道具（道具房随机抽取）

锋利眼泪（+攻击）、连发泪腺（+射速）、疾风之靴（+移速）、远射（+射程）、
大泪滴（+体积）、坚韧之心（+最大血量）、贯穿泪滴（穿透）、追踪泪滴（追踪）。

## 项目结构

```
isaac-roguelike/
├── main.js                # Electron 主进程
├── preload.js             # 预加载脚本
├── game/
│   ├── index.html         # 游戏页面
│   ├── css/style.css
│   └── js/
│       ├── shim.js        # 浏览器端 require shim
│       ├── config.js      # 常量配置
│       ├── rng.js         # 种子随机数
│       ├── mapgen.js      # 楼层地图生成（房间网格/特殊房）
│       ├── roomgen.js     # 房间砖块布局（墙/岩石/门）
│       ├── entities.js    # 玩家/敌人/泪滴/拾取物（纯逻辑）
│       ├── items.js       # 道具池
│       ├── game.js        # 游戏主逻辑（房间切换/Boss/楼层/胜负）
│       ├── sprites.js     # 程序化像素精灵 + Tiny16 图集
│       ├── renderer.js    # Canvas 渲染/HUD/小地图/F1 查看器
│       ├── input.js       # 键盘鼠标输入
│       └── main.js        # 启动与主循环
├── assets/
│   ├── sprites/           # Tiny16 免费素材（CC0）
│   └── README.md          # 素材来源与归属
├── scripts/               # 开发工具（素材下载/帧分析/冒烟测试）
├── headless-test.js       # 无头逻辑测试（npm test）
└── docs/screenshot.png
```

## 设计说明

- **逻辑与渲染分离**：`game.js` / `entities.js` / `mapgen.js` 等核心逻辑不依赖 DOM，
  可在 Node 中直接测试（`npm test` 跑 40 项断言：地图连通性、射击、战斗、道具、
  Boss、楼层推进、死亡、种子确定性）。
- **种子系统**：每局随机种子，`R` 重新开始换新种子。
- **素材**：敌人/宝箱/剑/药水使用 Tiny16 免费像素素材（CC0），
  主角（哭泣小孩）与红心/金币/钥匙/砖块为程序化像素绘制。

## 已知限制（后续可迭代）

- 道具房只需 1 把钥匙（无商店/宝箱钥匙消耗系统）
- 无音效（可用 WebAudio 简易合成）
- 无暂停菜单 / 无存档
- Tiny16 素材帧映射在 `sprites.js` 的 `TINY16_ATLAS` 中，可在 F1 查看器核对后调整

## 素材授权

- 像素素材：**Tiny 16: Basic** by Lanea Zimmerman（CC0 1.0），
  来源 <https://opengameart.org/content/tiny-16-basic>
- 详见 [assets/README.md](assets/README.md)
