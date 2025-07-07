# 五子棋对战游戏

这是一个基于Node.js和Socket.IO的在线五子棋对战游戏。

## 功能特点

- ✅ 用户输入用户名进入游戏
- ✅ 房间系统，支持多人对战
- ✅ 倒计时选择先手后手机制
- ✅ 实时WebSocket通信
- ✅ 现代化响应式UI设计
- ✅ 完整的五子棋游戏逻辑
- ✅ 游戏大厅，显示空闲玩家和房间列表
- ✅ 观战功能，支持观看正在进行的游戏
- ✅ 胜负结果展示，支持再来一局
- ✅ **落子手数统计**
- ✅ **60秒落子倒计时**
- ✅ **实时落子提示通知**
- ✅ **超时自动败北机制**
- ✅ **活四、冲四威胁检测**
- ✅ **智能封堵位置提示**

## 游戏流程

1. **登录界面**：输入用户名和房间号（可选）
2. **等待界面**：等待其他玩家加入房间
3. **选择界面**：30秒倒计时选择先手或后手
4. **游戏界面**：进行五子棋对战

## 技术栈

- **后端**：Node.js + Express + Socket.IO
- **前端**：HTML5 + CSS3 + JavaScript
- **通信**：WebSocket实时通信
- **游戏逻辑**：自实现五子棋规则引擎

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

### 3. 访问游戏

打开浏览器访问：`http://localhost:3000`

## 开发模式

使用nodemon进行开发：

```bash
npm run dev
```

## 项目结构

```
├── server.js          # 服务器主文件
├── package.json       # 项目配置
├── README.md          # 项目说明
└── public/            # 静态文件目录
    ├── index.html     # 主页面
    ├── style.css      # 样式文件
    └── game.js        # 前端游戏逻辑
```

## 游戏规则

- 15x15的标准五子棋棋盘
- 黑子先手，白子后手
- 每步限时60秒，超时自动败北
- 率先在横、竖、斜任意方向连成5子者获胜
- 实时显示落子手数和倒计时
- 自动检测活四、冲四威胁并提示封堵位置
- 支持观战和重新开始功能

## Socket.IO事件

### 客户端发送

- `join-room`: 加入房间
- `choose-first`: 选择先手
- `make-move`: 下棋

### 服务器发送

- `joined-room`: 成功加入房间
- `player-joined`: 有玩家加入
- `choice-countdown`: 选择倒计时
- `game-start`: 游戏开始
- `move-made`: 棋子移动
- `move-timer-start`: 落子倒计时开始
- `move-timer-tick`: 落子倒计时更新
- `game-end`: 游戏结束
- `player-left`: 玩家离开
- `rooms-list`: 房间列表
- `idle-players-updated`: 空闲玩家更新

## 许可证

MIT License
