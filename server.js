const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 游戏状态管理
const rooms = new Map();
const users = new Map();
const idlePlayers = new Map(); // 空闲玩家列表
const spectators = new Map(); // 观战者列表
const userStats = new Map(); // 用户胜率统计 {username: {blackWins: 0, blackLoses: 0, whiteWins: 0, whiteLoses: 0, score: 0, lastLogin: Date.now()}}
const browserSessions = new Map(); // 浏览器会话记录 {browserId: {username: '', lastSeen: Date.now()}}

// 胜率数据文件路径
const STATS_FILE = path.join(__dirname, 'user_stats.json');

// 加载用户胜率数据
async function loadUserStats() {
    try {
        const data = await fs.readFile(STATS_FILE, 'utf8');
        const stats = JSON.parse(data);
        for (const [username, stat] of Object.entries(stats)) {
            userStats.set(username, stat);
        }
        console.log(`已加载 ${userStats.size} 个用户的胜率数据`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('胜率数据文件不存在，将创建新文件');
        } else {
            console.error('加载胜率数据失败:', error);
        }
    }
}

// 保存用户胜率数据
async function saveUserStats() {
    try {
        const stats = Object.fromEntries(userStats);
        await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
        console.log('胜率数据已保存');
    } catch (error) {
        console.error('保存胜率数据失败:', error);
    }
}

// 获取或创建用户统计数据
function getUserStats(username) {
    if (!userStats.has(username)) {
        userStats.set(username, {
            blackWins: 0,
            blackLoses: 0,
            whiteWins: 0,
            whiteLoses: 0,
            score: 1100, // 初始积分1100
            lastLogin: Date.now()
        });
    }
    return userStats.get(username);
}

// 更新用户胜率
function updateUserStats(username, isBlack, isWin, opponentScore = 1100) {
    const stats = getUserStats(username);
    const playerScore = stats.score;
    
    // 计算积分变化
    const scoreChange = calculateScoreChange(playerScore, opponentScore, isWin);
    
    if (isBlack) {
        if (isWin) {
            stats.blackWins++;
            stats.score += scoreChange.winner;
        } else {
            stats.blackLoses++;
            stats.score = Math.max(0, stats.score + scoreChange.loser);
        }
    } else {
        if (isWin) {
            stats.whiteWins++;
            stats.score += scoreChange.winner;
        } else {
            stats.whiteLoses++;
            stats.score = Math.max(0, stats.score + scoreChange.loser);
        }
    }
    
    // 异步保存数据，不阻塞游戏流程
    saveUserStats().catch(error => {
        console.error('保存胜率数据时出错:', error);
    });
}

// 计算积分变化
function calculateScoreChange(playerScore, opponentScore, isWin) {
    const scoreDiff = Math.abs(playerScore - opponentScore);
    
    if (isWin) {
        // 胜者加分
        if (scoreDiff <= 50) {
            // 实力相当 (分差50以内)
            return { winner: 25, loser: -20 };
        } else if (playerScore < opponentScore) {
            // 挑战高分获胜 (低分打败高分)
            const bonus = Math.floor(scoreDiff / 50) * 3; // 每50分差额外+3分
            return { winner: Math.min(45, 30 + bonus), loser: -15 };
        } else {
            // 高分打败低分
            const penalty = Math.floor(scoreDiff / 100) * 3; // 每100分差减少3分
            return { winner: Math.max(8, 20 - penalty), loser: -25 };
        }
    } else {
        // 败者扣分（返回负值）
        if (scoreDiff <= 50) {
            return { winner: 25, loser: -20 };
        } else if (playerScore > opponentScore) {
            // 高分败给低分（爆冷）
            const penalty = Math.floor(scoreDiff / 50) * 3;
            return { winner: Math.min(45, 30 + penalty), loser: -Math.max(35, 25 + penalty) };
        } else {
            // 低分败给高分（正常）
            const reduction = Math.floor(scoreDiff / 100) * 2;
            return { winner: Math.max(8, 20 - reduction), loser: -Math.max(8, 15 - reduction) };
        }
    }
}

// 获取段位
function getRank(score) {
    if (score >= 1800) return { name: '王者', level: 7, color: '#ff6b35' };
    if (score >= 1600) return { name: '钻石', level: 6, color: '#00d4ff' };
    if (score >= 1400) return { name: '铂金', level: 5, color: '#00ff88' };
    if (score >= 1200) return { name: '黄金', level: 4, color: '#ffd700' };
    if (score >= 1000) return { name: '白银', level: 3, color: '#c0c0c0' };
    if (score >= 800) return { name: '青铜', level: 2, color: '#cd7f32' };
    return { name: '新手', level: 1, color: '#8b4513' };
}

// 获取称号
function getTitle(rank, username, allPlayers) {
    // 根据排名获取称号
    if (rank === 1) return '棋圣';
    if (rank === 2) return '棋王';
    if (rank === 3) return '神秘黑马';
    
    // 根据段位获取称号
    const player = allPlayers.find(p => p.username === username);
    if (player) {
        const rankInfo = getRank(player.score);
        switch (rankInfo.name) {
            case '王者': return '五子王者';
            case '钻石': return '钻石高手';
            case '铂金': return '铂金棋士';
            case '黄金': return '黄金选手';
            default: return '';
        }
    }
    
    return '';
}

// 计算胜率
function calculateWinRate(wins, loses) {
    const total = wins + loses;
    return total === 0 ? 0 : Math.round((wins / total) * 100);
}

// 生成带胜率的空闲玩家列表
function getIdlePlayersWithStats() {
    return Array.from(idlePlayers.values()).map(player => {
        const stats = getUserStats(player.username);
        const blackWinRate = calculateWinRate(stats.blackWins, stats.blackLoses);
        const whiteWinRate = calculateWinRate(stats.whiteWins, stats.whiteLoses);
        
        return {
            ...player,
            stats: {
                blackWinRate,
                whiteWinRate,
                blackTotal: stats.blackWins + stats.blackLoses,
                whiteTotal: stats.whiteWins + stats.whiteLoses,
                score: stats.score
            }
        };
    });
}

// 获取在线玩家列表
function getOnlinePlayersWithStats() {
    const onlinePlayers = [];
    
    // 空闲玩家
    for (const player of idlePlayers.values()) {
        const stats = getUserStats(player.username);
        const blackWinRate = calculateWinRate(stats.blackWins, stats.blackLoses);
        const whiteWinRate = calculateWinRate(stats.whiteWins, stats.whiteLoses);
        
        onlinePlayers.push({
            ...player,
            status: 'idle',
            stats: {
                blackWinRate,
                whiteWinRate,
                blackTotal: stats.blackWins + stats.blackLoses,
                whiteTotal: stats.whiteWins + stats.whiteLoses,
                score: stats.score
            }
        });
    }
    
    // 游戏中的玩家
    for (const room of rooms.values()) {
        room.players.forEach(player => {
            if (player.socket.id !== 'ai_player' && !idlePlayers.has(player.socket.id)) {
                const stats = getUserStats(player.username);
                const blackWinRate = calculateWinRate(stats.blackWins, stats.blackLoses);
                const whiteWinRate = calculateWinRate(stats.whiteWins, stats.whiteLoses);
                
                onlinePlayers.push({
                    id: player.socket.id,
                    username: player.username,
                    status: 'playing',
                    stats: {
                        blackWinRate,
                        whiteWinRate,
                        blackTotal: stats.blackWins + stats.blackLoses,
                        whiteTotal: stats.whiteWins + stats.whiteLoses,
                        score: stats.score
                    }
                });
            }
        });
    }
    
    // 观战玩家
    for (const room of rooms.values()) {
        room.spectators.forEach(spectator => {
            if (!onlinePlayers.some(p => p.id === spectator.socket.id)) {
                const stats = getUserStats(spectator.username);
                const blackWinRate = calculateWinRate(stats.blackWins, stats.blackLoses);
                const whiteWinRate = calculateWinRate(stats.whiteWins, stats.whiteLoses);
                
                onlinePlayers.push({
                    id: spectator.socket.id,
                    username: spectator.username,
                    status: 'spectating',
                    stats: {
                        blackWinRate,
                        whiteWinRate,
                        blackTotal: stats.blackWins + stats.blackLoses,
                        whiteTotal: stats.whiteWins + stats.whiteLoses,
                        score: stats.score
                    }
                });
            }
        });
    }
    
    return onlinePlayers;
}

// 获取排名前N的玩家
function getTopPlayers(limit = 10) {
    const allPlayers = [];
    
    // 收集所有玩家数据
    for (const [username, stats] of userStats.entries()) {
        const blackWinRate = calculateWinRate(stats.blackWins, stats.blackLoses);
        const whiteWinRate = calculateWinRate(stats.whiteWins, stats.whiteLoses);
        const totalGames = stats.blackWins + stats.blackLoses + stats.whiteWins + stats.whiteLoses;
        
        // 检查是否在线
        let isOnline = false;
        for (const user of users.values()) {
            if (user.username === username) {
                isOnline = true;
                break;
            }
        }
        
        allPlayers.push({
            username,
            score: stats.score,
            totalGames,
            blackWinRate,
            whiteWinRate,
            isOnline,
            lastLogin: stats.lastLogin
        });
    }
    
    // 按积分排序
    allPlayers.sort((a, b) => b.score - a.score);
    
    return allPlayers.slice(0, limit);
}

// 房间状态枚举
const ROOM_STATUS = {
    WAITING: 'waiting',
    CHOOSING: 'choosing', 
    PLAYING: 'playing',
    FINISHED: 'finished'
};

// 用户状态枚举
const USER_STATUS = {
    IDLE: 'idle',
    IN_ROOM: 'in_room',
    PLAYING: 'playing',
    SPECTATING: 'spectating'
};

// 游戏类
class Game {
    constructor() {
        this.board = Array(15).fill().map(() => Array(15).fill(0));
        this.currentPlayer = 1; // 1为黑子，2为白子
        this.winner = null;
        this.moveHistory = [];
        this.moveCount = 0; // 总手数
        this.currentMoveTimer = null; // 当前落子计时器
        this.currentTimerInterval = null; // 计时器间隔
        this.moveTimeLimit = 60; // 每步60秒限制
        this.currentTimeLeft = 60; // 当前剩余时间
        this.timerStartTime = null; // 计时器开始时间
    }

    makeMove(row, col, player) {
        if (this.board[row][col] !== 0 || this.winner) {
            return false;
        }
        
        // 检查黑子（玩家1）的禁手
        if (player === 1) {
            const forbiddenResult = this.checkForbiddenMoves(row, col, player);
            if (forbiddenResult.isForbidden) {
                return { forbidden: true, reason: forbiddenResult.reason };
            }
        }
        
        this.board[row][col] = player;
        this.moveCount++;
        this.moveHistory.push({ 
            row, 
            col, 
            player, 
            moveNumber: this.moveCount,
            timestamp: new Date()
        });
        
        if (this.checkWin(row, col, player)) {
            this.winner = player;
        }
        
        this.currentPlayer = player === 1 ? 2 : 1;
        return true;
    }

    clearMoveTimer() {
        if (this.currentMoveTimer) {
            clearTimeout(this.currentMoveTimer);
            this.currentMoveTimer = null;
        }
        if (this.currentTimerInterval) {
            clearInterval(this.currentTimerInterval);
            this.currentTimerInterval = null;
        }
        this.currentTimeLeft = this.moveTimeLimit;
        this.timerStartTime = null;
    }

    checkWin(row, col, player) {
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];

        for (let [dx, dy] of directions) {
            let count = 1;
            
            // 检查正方向
            for (let i = 1; i < 5; i++) {
                const newRow = row + dx * i;
                const newCol = col + dy * i;
                if (newRow < 0 || newRow >= 15 || newCol < 0 || newCol >= 15 || 
                    this.board[newRow][newCol] !== player) {
                    break;
                }
                count++;
            }
            
            // 检查反方向
            for (let i = 1; i < 5; i++) {
                const newRow = row - dx * i;
                const newCol = col - dy * i;
                if (newRow < 0 || newRow >= 15 || newCol < 0 || newCol >= 15 || 
                    this.board[newRow][newCol] !== player) {
                    break;
                }
                count++;
            }
            
            if (count >= 5) {
                return true;
            }
        }
        return false;
    }

    // 检查禁手
    checkForbiddenMoves(row, col, player) {
        // 临时放置棋子
        this.board[row][col] = player;
        
        let result = { isForbidden: false, reason: '' };
        
        // 检查长连禁手（超过5个连子）
        if (this.checkOverline(row, col, player)) {
            result = { isForbidden: true, reason: '长连禁手' };
        }
        // 检查双三禁手
        else if (this.checkDoubleThree(row, col, player)) {
            result = { isForbidden: true, reason: '三三禁手' };
        }
        // 检查双四禁手
        else if (this.checkDoubleFour(row, col, player)) {
            result = { isForbidden: true, reason: '四四禁手' };
        }
        
        // 移除临时棋子
        this.board[row][col] = 0;
        
        return result;
    }

    // 检查长连禁手（超过5个连子）
    checkOverline(row, col, player) {
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];

        for (let [dx, dy] of directions) {
            let count = 1;
            
            // 检查正方向
            for (let i = 1; i < 15; i++) {
                const newRow = row + dx * i;
                const newCol = col + dy * i;
                if (newRow < 0 || newRow >= 15 || newCol < 0 || newCol >= 15 || 
                    this.board[newRow][newCol] !== player) {
                    break;
                }
                count++;
            }
            
            // 检查反方向
            for (let i = 1; i < 15; i++) {
                const newRow = row - dx * i;
                const newCol = col - dy * i;
                if (newRow < 0 || newRow >= 15 || newCol < 0 || newCol >= 15 || 
                    this.board[newRow][newCol] !== player) {
                    break;
                }
                count++;
            }
            
            // 如果连子数量超过5个，则为长连禁手
            if (count > 5) {
                return true;
            }
        }
        return false;
    }

    // 检查双三禁手
    checkDoubleThree(row, col, player) {
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];
        
        let threeCount = 0;
        
        for (let [dx, dy] of directions) {
            if (this.isLiveThree(row, col, dx, dy, player)) {
                threeCount++;
            }
        }
        
        return threeCount >= 2;
    }

    // 检查双四禁手
    checkDoubleFour(row, col, player) {
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];
        
        let fourCount = 0;
        
        for (let [dx, dy] of directions) {
            if (this.isLiveFour(row, col, dx, dy, player) || this.isBlockedFour(row, col, dx, dy, player)) {
                fourCount++;
            }
        }
        
        return fourCount >= 2;
    }

    // 检查是否为活三
    isLiveThree(row, col, dx, dy, player) {
        // 检查以(row,col)为中心，方向为(dx,dy)的活三
        const patterns = [
            [-1, 0, 1, 2],  // _XXX
            [-2, -1, 0, 1], // _XXX
            [0, 1, 2, 3],   // XXX_
            [-1, 0, 1, 3],  // _XX_X
            [-1, 0, 2, 3],  // _X_XX
        ];
        
        for (let pattern of patterns) {
            let isPattern = true;
            let emptyCount = 0;
            let playerCount = 0;
            
            for (let i = 0; i < pattern.length; i++) {
                const checkRow = row + pattern[i] * dx;
                const checkCol = col + pattern[i] * dy;
                
                if (checkRow < 0 || checkRow >= 15 || checkCol < 0 || checkCol >= 15) {
                    isPattern = false;
                    break;
                }
                
                const cell = this.board[checkRow][checkCol];
                if (cell === player) {
                    playerCount++;
                } else if (cell === 0) {
                    emptyCount++;
                } else {
                    isPattern = false;
                    break;
                }
            }
            
            // 活三的条件：3个己方棋子，1个空位，两端都是空的
            if (isPattern && playerCount === 3 && emptyCount === 1) {
                // 检查两端是否为空
                const leftRow = row + (pattern[0] - 1) * dx;
                const leftCol = col + (pattern[0] - 1) * dy;
                const rightRow = row + (pattern[pattern.length - 1] + 1) * dx;
                const rightCol = col + (pattern[pattern.length - 1] + 1) * dy;
                
                const leftEmpty = (leftRow >= 0 && leftRow < 15 && leftCol >= 0 && leftCol < 15 && 
                                 this.board[leftRow][leftCol] === 0);
                const rightEmpty = (rightRow >= 0 && rightRow < 15 && rightCol >= 0 && rightCol < 15 && 
                                  this.board[rightRow][rightCol] === 0);
                
                if (leftEmpty && rightEmpty) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // 检查是否为活四
    isLiveFour(row, col, dx, dy, player) {
        // 简化的活四检测：4个连续的己方棋子，两端都是空的
        let count = 1;
        let leftPos = 0, rightPos = 0;
        
        // 向左计数
        for (let i = 1; i < 5; i++) {
            const checkRow = row - i * dx;
            const checkCol = col - i * dy;
            if (checkRow >= 0 && checkRow < 15 && checkCol >= 0 && checkCol < 15 && 
                this.board[checkRow][checkCol] === player) {
                count++;
                leftPos = i;
            } else {
                break;
            }
        }
        
        // 向右计数
        for (let i = 1; i < 5; i++) {
            const checkRow = row + i * dx;
            const checkCol = col + i * dy;
            if (checkRow >= 0 && checkRow < 15 && checkCol >= 0 && checkCol < 15 && 
                this.board[checkRow][checkCol] === player) {
                count++;
                rightPos = i;
            } else {
                break;
            }
        }
        
        if (count === 4) {
            // 检查两端是否为空
            const leftRow = row - (leftPos + 1) * dx;
            const leftCol = col - (leftPos + 1) * dy;
            const rightRow = row + (rightPos + 1) * dx;
            const rightCol = col + (rightPos + 1) * dy;
            
            const leftEmpty = (leftRow >= 0 && leftRow < 15 && leftCol >= 0 && leftCol < 15 && 
                             this.board[leftRow][leftCol] === 0);
            const rightEmpty = (rightRow >= 0 && rightRow < 15 && rightCol >= 0 && rightCol < 15 && 
                              this.board[rightRow][rightCol] === 0);
            
            return leftEmpty && rightEmpty;
        }
        
        return false;
    }

    // 检查是否为冲四
    isBlockedFour(row, col, dx, dy, player) {
        // 简化的冲四检测：4个连续的己方棋子，一端是空的，另一端被堵
        let count = 1;
        let leftPos = 0, rightPos = 0;
        
        // 向左计数
        for (let i = 1; i < 5; i++) {
            const checkRow = row - i * dx;
            const checkCol = col - i * dy;
            if (checkRow >= 0 && checkRow < 15 && checkCol >= 0 && checkCol < 15 && 
                this.board[checkRow][checkCol] === player) {
                count++;
                leftPos = i;
            } else {
                break;
            }
        }
        
        // 向右计数
        for (let i = 1; i < 5; i++) {
            const checkRow = row + i * dx;
            const checkCol = col + i * dy;
            if (checkRow >= 0 && checkRow < 15 && checkCol >= 0 && checkCol < 15 && 
                this.board[checkRow][checkCol] === player) {
                count++;
                rightPos = i;
            } else {
                break;
            }
        }
        
        if (count === 4) {
            // 检查两端的情况
            const leftRow = row - (leftPos + 1) * dx;
            const leftCol = col - (leftPos + 1) * dy;
            const rightRow = row + (rightPos + 1) * dx;
            const rightCol = col + (rightPos + 1) * dy;
            
            const leftEmpty = (leftRow >= 0 && leftRow < 15 && leftCol >= 0 && leftCol < 15 && 
                             this.board[leftRow][leftCol] === 0);
            const rightEmpty = (rightRow >= 0 && rightRow < 15 && rightCol >= 0 && rightCol < 15 && 
                              this.board[rightRow][rightCol] === 0);
            
            // 冲四：一端空，另一端不空
            return (leftEmpty && !rightEmpty) || (!leftEmpty && rightEmpty);
        }
        
        return false;
    }
}

// 房间类
class Room {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.spectators = []; // 观战者列表
        this.status = ROOM_STATUS.WAITING;
        this.game = null;
        this.choiceTimer = null;
        this.choiceInterval = null; // 存储选择倒计时间隔
        this.playerRoles = {}; // {socketId: 'black' | 'white'}
        this.winner = null;
        this.gameResult = null; // 游戏结果
        this.hasAI = false; // 是否包含AI玩家
        this.aiPlayer = null; // AI玩家实例
    }

    addPlayer(socket, username) {
        if (this.players.length >= 2) {
            return false;
        }
        
        this.players.push({ socket, username });
        
        // 从空闲列表移除
        idlePlayers.delete(socket.id);
        
        if (this.players.length === 2) {
            console.log(`房间 ${this.id} 两名玩家已齐，准备开始选择阶段`);
            // 给前端一点时间处理 joined-room 事件，然后再开始选择阶段
            setTimeout(() => {
                this.startChoicePhase();
            }, 500); // 延迟500ms
        }
        
        this.broadcastRoomUpdate();
        return true;
    }

    addSpectator(socket, username) {
        this.spectators.push({ socket, username });
        
        // 向观战者发送当前游戏状态
        if (this.game && this.status === ROOM_STATUS.PLAYING) {
            socket.emit('spectate-game', {
                board: this.game.board,
                currentPlayer: this.game.currentPlayer,
                players: this.players.map(p => ({
                    username: p.username,
                    role: this.playerRoles[p.socket.id]
                })),
                moveHistory: this.game.moveHistory,
                moveCount: this.game.moveCount
            });
            
            // 如果有正在进行的倒计时，发送当前剩余时间给观战者
            if (this.game.currentTimerInterval && this.game.currentTimeLeft > 0) {
                socket.emit('move-timer-start', { timeLeft: this.game.currentTimeLeft });
            }
        }
        
        this.broadcastRoomUpdate();
        return true;
    }

    removePlayer(socket) {
        const wasPlayer = this.players.some(p => p.socket.id === socket.id);
        
        this.players = this.players.filter(p => p.socket.id !== socket.id);
        this.spectators = this.spectators.filter(s => s.socket.id !== socket.id);
        
        // 只有当真正的玩家离开时才处理游戏逻辑
        if (wasPlayer) {
            // 清除选择倒计时
            if (this.choiceTimer) {
                clearTimeout(this.choiceTimer);
                this.choiceTimer = null;
            }
            if (this.choiceInterval) {
                clearInterval(this.choiceInterval);
                this.choiceInterval = null;
            }
            
            // 清除游戏倒计时
            if (this.game) {
                this.game.clearMoveTimer();
            }
            
            if (this.players.length === 0) {
                this.status = ROOM_STATUS.WAITING;
                this.playerRoles = {};
            } else if (this.players.length === 1) {
                if (this.status === ROOM_STATUS.PLAYING) {
                    // 如果游戏中有玩家离开，对方获胜
                    const remainingPlayer = this.players[0];
                    this.endGame(remainingPlayer.socket.id, 'opponent_left');
                } else if (this.status === ROOM_STATUS.CHOOSING) {
                    // 如果在选择阶段有玩家离开，重置为等待状态
                    this.status = ROOM_STATUS.WAITING;
                    this.playerRoles = {};
                    
                    // 通知剩余玩家回到等待状态
                    this.players.forEach(player => {
                        player.socket.emit('waiting-for-player');
                    });
                }
            }
        }
        
        this.broadcastRoomUpdate();
    }

    removeSpectator(socket) {
        this.spectators = this.spectators.filter(s => s.socket.id !== socket.id);
        this.broadcastRoomUpdate();
    }

    broadcastRoomUpdate() {
        // 向所有人广播房间更新
        const roomInfo = this.getRoomInfo();
        io.emit('room-updated', roomInfo);
    }

    getRoomInfo() {
        return {
            id: this.id,
            status: this.status,
            playersCount: this.players.length,
            spectatorsCount: this.spectators.length,
            players: this.players.map(p => ({ username: p.username })),
            canJoin: this.players.length < 2,
            canSpectate: this.status === ROOM_STATUS.PLAYING || this.status === ROOM_STATUS.FINISHED
        };
    }

    startChoicePhase() {
        if (this.players.length < 2) {
            console.error('Cannot start choice phase: not enough players');
            this.status = ROOM_STATUS.WAITING;
            return;
        }
        
        console.log(`房间 ${this.id} 开始选择阶段，玩家数量：${this.players.length}`);
        this.status = ROOM_STATUS.CHOOSING;
        
        // 通知所有玩家进入选择阶段
        this.players.forEach(p => {
            if (p.socket.id !== 'ai_player') {
                console.log(`向玩家 ${p.username} 发送 choice-phase-started 事件`);
                p.socket.emit('choice-phase-started');
            }
        });
        
        // 如果有AI玩家，AI随机选择是否先手（50%概率）
        if (this.hasAI) {
            const aiWantsFirst = Math.random() < 0.5;
            setTimeout(() => {
                if (aiWantsFirst) {
                    const aiPlayer = this.players.find(p => p.socket.id === 'ai_player');
                    if (aiPlayer) {
                        this.playerChooseFirst(aiPlayer.socket);
                    }
                }
                // 如果AI不选择先手，等待人类玩家选择或超时随机分配
            }, 2000); // AI思考2秒
        }
        
        // 30秒倒计时选择先手
        let countdown = 30;
        this.choiceInterval = setInterval(() => {
            // 检查是否还有足够的玩家
            if (this.players.length < 2) {
                clearInterval(this.choiceInterval);
                this.choiceInterval = null;
                if (this.choiceTimer) {
                    clearTimeout(this.choiceTimer);
                    this.choiceTimer = null;
                }
                this.status = ROOM_STATUS.WAITING;
                this.broadcastRoomUpdate();
                return;
            }
            
            this.players.forEach(p => {
                p.socket.emit('choice-countdown', countdown);
            });
            countdown--;
            
            if (countdown < 0) {
                clearInterval(this.choiceInterval);
                this.choiceInterval = null;
                this.randomAssignRoles();
            }
        }, 1000);

        this.choiceTimer = setTimeout(() => {
            if (this.choiceInterval) {
                clearInterval(this.choiceInterval);
                this.choiceInterval = null;
            }
            this.randomAssignRoles();
        }, 30000);
    }

    playerChooseFirst(socket) {
        console.log(`玩家 ${socket.id} 选择先手，当前房间状态: ${this.status}`);
        
        if (this.status !== ROOM_STATUS.CHOOSING) {
            console.log(`状态不对，无法选择先手。当前状态: ${this.status}`);
            return;
        }
        
        if (this.choiceTimer) {
            clearTimeout(this.choiceTimer);
            this.choiceTimer = null;
        }
        if (this.choiceInterval) {
            clearInterval(this.choiceInterval);
            this.choiceInterval = null;
        }
        
        this.playerRoles[socket.id] = 'black';
        
        const otherPlayer = this.players.find(p => p.socket.id !== socket.id);
        if (otherPlayer) {
            this.playerRoles[otherPlayer.socket.id] = 'white';
        }
        
        console.log(`角色分配完成: ${JSON.stringify(this.playerRoles)}`);
        this.startGame();
    }

    randomAssignRoles() {
        if (this.players.length < 2) {
            console.error('Not enough players to assign roles, returning to waiting status');
            this.status = ROOM_STATUS.WAITING;
            this.broadcastRoomUpdate();
            return;
        }
        
        const randomIndex = Math.floor(Math.random() * 2);
        this.playerRoles[this.players[randomIndex].socket.id] = 'black';
        this.playerRoles[this.players[1 - randomIndex].socket.id] = 'white';
        
        this.startGame();
    }

    startGame() {
        console.log(`开始游戏，房间ID: ${this.id}`);
        this.status = ROOM_STATUS.PLAYING;
        this.game = new Game();
        
        // 如果有AI玩家，创建AI实例
        if (this.hasAI) {
            const aiRole = this.playerRoles['ai_player']; // 'black' or 'white'
            const aiPlayerNumber = aiRole === 'black' ? 1 : 2;
            this.aiPlayer = new AIPlayer(this.game, aiPlayerNumber);
            console.log(`AI玩家创建完成，角色: ${aiRole} (${aiPlayerNumber})`);
        }
        
        this.players.forEach(player => {
            const role = this.playerRoles[player.socket.id];
            if (player.socket.id !== 'ai_player') {
                console.log(`发送game-start事件给玩家 ${player.username}, 角色: ${role}`);
                player.socket.emit('game-start', {
                    role: role,
                    isYourTurn: role === 'black',
                    players: this.players.map(p => ({
                        username: p.username,
                        role: this.playerRoles[p.socket.id]
                    }))
                });
            }
        });
        
        // 通知观战者游戏开始
        this.spectators.forEach(spectator => {
            spectator.socket.emit('spectate-game', {
                board: this.game.board,
                currentPlayer: this.game.currentPlayer,
                players: this.players.map(p => ({
                    username: p.username,
                    role: this.playerRoles[p.socket.id]
                })),
                moveHistory: [],
                moveCount: 0
            });
        });
        
        // 开始第一步倒计时（黑子先手）
        this.startMoveTimer();
        this.broadcastRoomUpdate();
        
        // 如果AI是黑子（先手），让AI立即落子
        if (this.hasAI && this.playerRoles['ai_player'] === 'black') {
            setTimeout(() => {
                this.makeAIMove();
            }, 1000);
        }
    }

    startMoveTimer() {
        // 清除之前的计时器
        this.game.clearMoveTimer();
        
        // 检查是否轮到AI玩家
        if (this.hasAI) {
            const currentPlayerRole = this.game.currentPlayer === 1 ? 'black' : 'white';
            const isAITurn = this.playerRoles['ai_player'] === currentPlayerRole;
            
            if (isAITurn) {
                // 如果轮到AI，直接触发AI落子
                this.makeAIMove();
                return;
            }
        }
        
        let timeLeft = this.game.moveTimeLimit;
        this.game.currentTimeLeft = timeLeft;
        this.game.timerStartTime = Date.now();
        
        // 广播倒计时开始
        this.broadcastToAll('move-timer-start', { timeLeft });
        
        // 设置每秒更新的间隔
        this.game.currentTimerInterval = setInterval(() => {
            timeLeft--;
            this.game.currentTimeLeft = timeLeft;
            this.broadcastToAll('move-timer-tick', { timeLeft });
            
            if (timeLeft <= 0) {
                this.game.clearMoveTimer();
                this.handleMoveTimeout();
            }
        }, 1000);
        
        // 设置超时处理
        this.game.currentMoveTimer = setTimeout(() => {
            this.game.clearMoveTimer();
            this.handleMoveTimeout();
        }, this.game.moveTimeLimit * 1000);
    }

    handleMoveTimeout() {
        // 超时处理：当前玩家败北
        const currentPlayerRole = this.game.currentPlayer === 1 ? 'black' : 'white';
        const winnerId = Object.keys(this.playerRoles).find(
            id => this.playerRoles[id] !== currentPlayerRole
        );
        
        this.endGame(winnerId, 'timeout');
    }

    broadcastToAll(event, data) {
        // 广播给玩家
        this.players.forEach(player => {
            player.socket.emit(event, data);
        });
        
        // 广播给观战者
        this.spectators.forEach(spectator => {
            spectator.socket.emit(event, data);
        });
    }

    endGame(winnerId, reason = 'normal') {
        this.status = ROOM_STATUS.FINISHED;
        
        // 清除倒计时
        if (this.game) {
            this.game.clearMoveTimer();
        }
        
        const winnerPlayer = this.players.find(p => p.socket.id === winnerId);
        const loserPlayer = this.players.find(p => p.socket.id !== winnerId);
        
        let gameResult = {
            winner: winnerPlayer ? winnerPlayer.username : null,
            loser: loserPlayer ? loserPlayer.username : null,
            reason: reason,
            winnerRole: winnerPlayer ? this.playerRoles[winnerId] : null,
            totalMoves: this.game ? this.game.moveCount : 0
        };
        
        this.gameResult = gameResult;
        
        // 更新胜率统计（排除AI对战）
        if (winnerPlayer && loserPlayer && !this.hasAI) {
            const winnerIsBlack = this.playerRoles[winnerId] === 'black';
            const loserIsBlack = !winnerIsBlack;
            
            // 获取双方当前分数
            const winnerScore = getUserStats(winnerPlayer.username).score;
            const loserScore = getUserStats(loserPlayer.username).score;
            
            // 更新胜者胜率（传递败者分数）
            updateUserStats(winnerPlayer.username, winnerIsBlack, true, loserScore);
            // 更新败者胜率（传递胜者分数）
            updateUserStats(loserPlayer.username, loserIsBlack, false, winnerScore);
            
            console.log(`胜率更新: ${winnerPlayer.username}(${winnerIsBlack ? '黑' : '白'}) 胜, ${loserPlayer.username}(${loserIsBlack ? '黑' : '白'}) 负`);
        }
        
        // 通知所有玩家游戏结果
        this.players.forEach(player => {
            const isWinner = player.socket.id === winnerId;
            player.socket.emit('game-end', {
                result: isWinner ? 'win' : 'lose',
                winner: gameResult.winner,
                loser: gameResult.loser,
                reason: reason,
                winnerRole: gameResult.winnerRole,
                totalMoves: gameResult.totalMoves
            });
        });
        
        // 通知观战者游戏结果
        this.spectators.forEach(spectator => {
            spectator.socket.emit('game-end', {
                result: 'spectate',
                winner: gameResult.winner,
                loser: gameResult.loser,
                reason: reason,
                winnerRole: gameResult.winnerRole,
                totalMoves: gameResult.totalMoves
            });
        });
        
        this.broadcastRoomUpdate();
    }

    makeMove(socket, row, col) {
        if (this.status !== ROOM_STATUS.PLAYING || !this.game) return false;
        
        const playerRole = this.playerRoles[socket.id];
        const playerNumber = playerRole === 'black' ? 1 : 2;
        
        if (this.game.currentPlayer !== playerNumber) {
            return false;
        }
        
        // 清除当前倒计时
        this.game.clearMoveTimer();
        
        const moveResult = this.game.makeMove(row, col, playerNumber);
        
        // 处理禁手情况
        if (moveResult && moveResult.forbidden) {
            // 通知玩家禁手
            socket.emit('forbidden-move', { 
                reason: moveResult.reason,
                row: row,
                col: col
            });
            
            // 重新开始倒计时
            this.startMoveTimer();
            return false;
        }
        
        if (moveResult === true) {
            const lastMove = this.game.moveHistory[this.game.moveHistory.length - 1];
            
            const moveData = {
                row, 
                col, 
                player: playerNumber,
                nextPlayer: this.game.currentPlayer,
                winner: this.game.winner,
                moveCount: this.game.moveCount,
                moveNumber: lastMove.moveNumber
            };
            
            // 广播移动到所有玩家和观战者
            this.broadcastToAll('move-made', moveData);
            
            if (this.game.winner) {
                const winnerRole = this.game.winner === 1 ? 'black' : 'white';
                const winnerId = Object.keys(this.playerRoles).find(
                    id => this.playerRoles[id] === winnerRole
                );
                this.endGame(winnerId, 'normal');
            } else {
                // 开始下一步倒计时（内部会检查是否是AI的回合）
                this.startMoveTimer();
            }
            
            return true;
        }
        
        return false;
    }

    resetForNewGame() {
        // 重置游戏状态但保持房间和玩家
        this.status = ROOM_STATUS.WAITING;
        this.game = null;
        this.playerRoles = {};
        this.winner = null;
        this.gameResult = null;
        
        // 清除所有计时器
        if (this.choiceTimer) {
            clearTimeout(this.choiceTimer);
            this.choiceTimer = null;
        }
        if (this.choiceInterval) {
            clearInterval(this.choiceInterval);
            this.choiceInterval = null;
        }
        
        // 如果有两个玩家，立即开始选择阶段
        if (this.players.length === 2) {
            this.startChoicePhase();
        }
        
        this.broadcastRoomUpdate();
    }

    addAIPlayer() {
        if (this.players.length >= 2) {
            return false;
        }
        
        // 创建一个虚拟的AI玩家对象
        const aiPlayerObj = {
            socket: { id: 'ai_player', emit: () => {}, to: () => ({ emit: () => {} }) },
            username: 'AI玩家'
        };
        
        this.players.push(aiPlayerObj);
        this.hasAI = true;
        
        if (this.players.length === 2) {
            this.startChoicePhase();
        }
        
        this.broadcastRoomUpdate();
        return true;
    }

    // AI玩家逻辑
    playAI() {
        if (!this.hasAI || this.game.currentPlayer !== 2) {
            return;
        }
        
        const aiPlayer = this.players.find(p => p.socket.id === 'ai_player');
        if (!aiPlayer) {
            return;
        }
        
        // 创建AI实例
        const ai = new AIPlayer(this.game, 2);
        
        // 获取最佳落子
        const bestMove = ai.getBestMove();
        if (bestMove) {
            const { row, col } = bestMove;
            this.makeMove(aiPlayer.socket, row, col);
        }
    }

    makeAIMove() {
        if (!this.hasAI || !this.aiPlayer || !this.game) return;
        
        const currentPlayerRole = this.game.currentPlayer === 1 ? 'black' : 'white';
        const isAITurn = this.playerRoles['ai_player'] === currentPlayerRole;
        
        if (!isAITurn) return;
        
        // 清除之前回合的禁手位置记录
        this.aiPlayer.clearForbiddenMoves();
        
        // 延迟1秒让AI思考，增加真实感
        setTimeout(() => {
            let aiMove = this.aiPlayer.getBestMove();
            let attempts = 0;
            const maxAttempts = 50; // 最多尝试50次
            
            // 如果AI是黑子，需要检查禁手
            while (aiMove && attempts < maxAttempts) {
                // 清除当前倒计时
                this.game.clearMoveTimer();
                
                const moveResult = this.game.makeMove(aiMove.row, aiMove.col, this.aiPlayer.player);
                
                // 如果是禁手，AI重新选择
                if (moveResult && moveResult.forbidden) {
                    console.log(`AI遇到禁手: ${moveResult.reason}，重新选择落子位置`);
                    // 将这个位置标记为不可用，重新获取移动
                    this.aiPlayer.addForbiddenMove(aiMove.row, aiMove.col);
                    aiMove = this.aiPlayer.getBestMove();
                    attempts++;
                    continue;
                }
                
                if (moveResult === true) {
                    const lastMove = this.game.moveHistory[this.game.moveHistory.length - 1];
                    
                    const moveData = {
                        row: aiMove.row,
                        col: aiMove.col,
                        player: this.aiPlayer.player,
                        nextPlayer: this.game.currentPlayer,
                        winner: this.game.winner,
                        moveCount: this.game.moveCount,
                        moveNumber: lastMove.moveNumber
                    };
                    
                    // 广播移动到所有玩家和观战者
                    this.broadcastToAll('move-made', moveData);
                    
                    if (this.game.winner) {
                        const winnerRole = this.game.winner === 1 ? 'black' : 'white';
                        const winnerId = this.playerRoles['ai_player'] === winnerRole ? 'ai_player' : 
                            Object.keys(this.playerRoles).find(id => this.playerRoles[id] === winnerRole);
                        this.endGame(winnerId, 'normal');
                    } else {
                        // 开始下一步倒计时
                        this.startMoveTimer();
                    }
                    return; // 成功落子，退出
                }
                
                // 如果移动失败（位置已被占用等），重新选择
                this.aiPlayer.addForbiddenMove(aiMove.row, aiMove.col);
                aiMove = this.aiPlayer.getBestMove();
                attempts++;
            }
            
            // 如果AI无法找到合适的落子位置，超时败北
            if (attempts >= maxAttempts) {
                console.log('AI无法找到合适的落子位置，超时败北');
                this.handleMoveTimeout();
            }
        }, 1000);
    }
}

// AI玩家类
class AIPlayer {
    constructor(game, player) {
        this.game = game;
        this.player = player; // 1 or 2
        this.difficulty = 'medium'; // easy, medium, hard
        this.forbiddenMoves = new Set(); // 存储当前回合禁止的位置
    }

    // 添加禁手位置
    addForbiddenMove(row, col) {
        this.forbiddenMoves.add(`${row},${col}`);
    }

    // 清除禁手位置（新回合开始时调用）
    clearForbiddenMoves() {
        this.forbiddenMoves.clear();
    }

    // 获取最佳落子位置
    getBestMove() {
        const availableMoves = this.getAvailableMoves();
        if (availableMoves.length === 0) return null;

        // 简单AI：随机选择 + 基本策略
        switch (this.difficulty) {
            case 'easy':
                return this.getRandomMove(availableMoves);
            case 'medium':
                return this.getMediumMove(availableMoves);
            case 'hard':
                return this.getHardMove(availableMoves);
            default:
                return this.getRandomMove(availableMoves);
        }
    }

    getAvailableMoves() {
        const moves = [];
        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                if (this.game.board[row][col] === 0 && !this.forbiddenMoves.has(`${row},${col}`)) {
                    moves.push({ row, col });
                }
            }
        }
        return moves;
    }

    getRandomMove(availableMoves) {
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }

    getMediumMove(availableMoves) {
        // 中等难度：优先考虑中心区域和已有棋子周围
        const centerMoves = availableMoves.filter(move => {
            const distanceFromCenter = Math.abs(move.row - 7) + Math.abs(move.col - 7);
            return distanceFromCenter <= 6;
        });

        const nearExistingMoves = availableMoves.filter(move => {
            return this.hasAdjacentPiece(move.row, move.col);
        });

        if (nearExistingMoves.length > 0) {
            return nearExistingMoves[Math.floor(Math.random() * nearExistingMoves.length)];
        }

        if (centerMoves.length > 0) {
            return centerMoves[Math.floor(Math.random() * centerMoves.length)];
        }

        return this.getRandomMove(availableMoves);
    }

    getHardMove(availableMoves) {
        // 困难难度：使用简单的评估函数
        let bestMove = null;
        let bestScore = -Infinity;

        for (let move of availableMoves) {
            const score = this.evaluateMove(move.row, move.col);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove || this.getRandomMove(availableMoves);
    }

    hasAdjacentPiece(row, col) {
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        for (let [dx, dy] of directions) {
            const newRow = row + dx;
            const newCol = col + dy;
            
            if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15) {
                if (this.game.board[newRow][newCol] !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    evaluateMove(row, col) {
        // 简单的评估函数
        let score = 0;
        
        // 中心位置加分
        const distanceFromCenter = Math.abs(row - 7) + Math.abs(col - 7);
        score += (14 - distanceFromCenter) * 2;
        
        // 靠近已有棋子加分
        if (this.hasAdjacentPiece(row, col)) {
            score += 50;
        }
        
        return score;
    }
}

// Socket.IO连接处理
io.on('connection', (socket) => {
    console.log('用户连接:', socket.id);

    // 检查浏览器ID
    socket.on('check-browser-id', (data) => {
        const { browserId } = data;
        if (browserId && browserSessions.has(browserId)) {
            const session = browserSessions.get(browserId);
            // 更新最后见面时间
            session.lastSeen = Date.now();
            // 更新用户登录时间
            const stats = getUserStats(session.username);
            stats.lastLogin = Date.now();
            
            socket.emit('browser-session-found', { username: session.username });
        } else {
            socket.emit('browser-session-not-found');
        }
    });

    // 用户登录
    socket.on('user-login', (data) => {
        const { username, browserId } = data;
        
        // 保存浏览器会话
        if (browserId) {
            browserSessions.set(browserId, {
                username: username,
                lastSeen: Date.now()
            });
        }
        
        // 更新用户登录时间
        const stats = getUserStats(username);
        stats.lastLogin = Date.now();
        
        socket.emit('login-success', { username });
    });

    // 获取用户个人战绩
    socket.on('get-user-stats', (data) => {
        const { username } = data;
        const stats = getUserStats(username);
        const blackWinRate = calculateWinRate(stats.blackWins, stats.blackLoses);
        const whiteWinRate = calculateWinRate(stats.whiteWins, stats.whiteLoses);
        const totalGames = stats.blackWins + stats.blackLoses + stats.whiteWins + stats.whiteLoses;
        
        socket.emit('user-stats', {
            username,
            score: stats.score,
            totalGames,
            blackWins: stats.blackWins,
            blackLoses: stats.blackLoses,
            whiteWins: stats.whiteWins,
            whiteLoses: stats.whiteLoses,
            blackWinRate,
            whiteWinRate
        });
    });

    // 获取排行榜
    socket.on('get-leaderboard', () => {
        const leaderboard = getTopPlayers();
        socket.emit('leaderboard-data', leaderboard);
    });

    // 获取在线玩家列表
    socket.on('get-online-players', () => {
        const onlinePlayers = getOnlinePlayersWithStats();
        socket.emit('online-players-list', onlinePlayers);
    });

    // 获取房间列表
    socket.on('get-rooms', () => {
        const roomsList = Array.from(rooms.values()).map(room => room.getRoomInfo());
        socket.emit('rooms-list', roomsList);
    });

    // 获取空闲玩家列表（兼容旧版本）
    socket.on('get-idle-players', () => {
        const onlinePlayers = getOnlinePlayersWithStats();
        const idlePlayers = onlinePlayers.filter(p => p.status === 'idle');
        socket.emit('idle-players-list', idlePlayers);
    });

    // 设置为空闲状态
    socket.on('set-idle', (username) => {
        const stats = getUserStats(username);
        const blackWinRate = calculateWinRate(stats.blackWins, stats.blackLoses);
        const whiteWinRate = calculateWinRate(stats.whiteWins, stats.whiteLoses);
        
        idlePlayers.set(socket.id, { 
            id: socket.id,
            username: username,
            stats: {
                blackWinRate,
                whiteWinRate,
                blackTotal: stats.blackWins + stats.blackLoses,
                whiteTotal: stats.whiteWins + stats.whiteLoses,
                score: stats.score
            }
        });
        users.set(socket.id, { username, status: USER_STATUS.IDLE });
        
        // 广播在线玩家更新
        io.emit('online-players-updated', getOnlinePlayersWithStats());
    });

    socket.on('join-room', (data) => {
        const { username, roomId } = data;
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Room(roomId));
        }
        
        const room = rooms.get(roomId);
        
        if (room.addPlayer(socket, username)) {
            socket.join(roomId);
            users.set(socket.id, { username, roomId, status: USER_STATUS.IN_ROOM });
            
            socket.emit('joined-room', {
                roomId,
                playersCount: room.players.length,
                status: room.status
            });
            
            // 通知房间其他玩家
            socket.to(roomId).emit('player-joined', {
                username,
                playersCount: room.players.length
            });
            
            console.log(`${username} 加入房间 ${roomId}`);
        } else {
            socket.emit('room-full');
        }
    });

    // 观战房间
    socket.on('spectate-room', (data) => {
        const { username, roomId } = data;
        
        if (!rooms.has(roomId)) {
            socket.emit('room-not-found');
            return;
        }
        
        const room = rooms.get(roomId);
        
        if (room.addSpectator(socket, username)) {
            socket.join(roomId);
            users.set(socket.id, { username, roomId, status: USER_STATUS.SPECTATING });
            
            socket.emit('spectating-room', {
                roomId,
                playersCount: room.players.length,
                spectatorsCount: room.spectators.length,
                status: room.status,
                players: room.players.map(p => ({
                    username: p.username,
                    role: room.playerRoles[p.socket.id]
                }))
            });
            
            // 通知房间有新观战者
            socket.to(roomId).emit('spectator-joined', {
                username,
                spectatorsCount: room.spectators.length
            });
            
            console.log(`${username} 观战房间 ${roomId}`);
        }
    });

    socket.on('choose-first', () => {
        console.log(`收到choose-first事件，socket ID: ${socket.id}`);
        const user = users.get(socket.id);
        if (user) {
            console.log(`用户信息: ${JSON.stringify(user)}`);
            const room = rooms.get(user.roomId);
            if (room) {
                console.log(`找到房间 ${user.roomId}，调用playerChooseFirst`);
                room.playerChooseFirst(socket);
            } else {
                console.log(`未找到房间 ${user.roomId}`);
            }
        } else {
            console.log(`未找到用户信息`);
        }
    });

    socket.on('make-move', (data) => {
        const { row, col } = data;
        const user = users.get(socket.id);
        
        if (user) {
            const room = rooms.get(user.roomId);
            if (room) {
                room.makeMove(socket, row, col);
            }
        }
    });

    // 邀请对战
    socket.on('invite-player', (data) => {
        const { to } = data;
        const inviter = users.get(socket.id);
        
        if (!inviter) {
            socket.emit('invite-failed', { message: '邀请失败：用户信息无效' });
            return;
        }
        
        // 查找被邀请的玩家（只能邀请空闲玩家）
        let targetSocket = null;
        for (let [socketId, user] of users.entries()) {
            if (user.username === to && user.status === USER_STATUS.IDLE) {
                targetSocket = io.sockets.sockets.get(socketId);
                break;
            }
        }
        
        if (!targetSocket) {
            socket.emit('invite-failed', { message: '用户不在线或不可邀请' });
            return;
        }
        
        // 发送邀请
        targetSocket.emit('invite-received', { from: inviter.username });
        socket.emit('invite-sent', { to: to });
    });

    // 接受邀请
    socket.on('accept-invite', (data) => {
        const { from } = data;
        const accepter = users.get(socket.id);
        
        if (!accepter) return;
        
        // 查找邀请者
        let inviterSocket = null;
        for (let [socketId, user] of users.entries()) {
            if (user.username === from && user.status === USER_STATUS.IDLE) {
                inviterSocket = io.sockets.sockets.get(socketId);
                break;
            }
        }
        
        if (!inviterSocket) {
            socket.emit('invite-failed', { message: '邀请者已离线' });
            return;
        }
        
        // 创建新房间
        const roomId = 'invite_' + Date.now();
        const room = new Room(roomId);
        rooms.set(roomId, room);
        
        // 邀请者先加入房间
        if (room.addPlayer(inviterSocket, from)) {
            inviterSocket.join(roomId);
            users.set(inviterSocket.id, { username: from, roomId, status: USER_STATUS.IN_ROOM });
            idlePlayers.delete(inviterSocket.id);
        }
        
        // 被邀请者加入房间
        if (room.addPlayer(socket, accepter.username)) {
            socket.join(roomId);
            users.set(socket.id, { username: accepter.username, roomId, status: USER_STATUS.IN_ROOM });
            idlePlayers.delete(socket.id);
            
            console.log(`邀请对战：${accepter.username} 加入房间 ${roomId}`);
            
            // 通知双方
            inviterSocket.emit('invite-accepted', { username: accepter.username });
            inviterSocket.emit('joined-room', {
                roomId,
                playersCount: 2,
                status: room.status
            });
            
            socket.emit('joined-room', {
                roomId,
                playersCount: 2,
                status: room.status
            });
            
            console.log(`邀请对战：房间 ${roomId} 状态为 ${room.status}，玩家数量：${room.players.length}`);
            
            // 广播在线玩家更新
            io.emit('online-players-updated', getOnlinePlayersWithStats());
        }
    });

    // 拒绝邀请
    socket.on('decline-invite', (data) => {
        const { from } = data;
        const decliner = users.get(socket.id);
        
        if (!decliner) return;
        
        // 查找邀请者
        let inviterSocket = null;
        for (let [socketId, user] of users.entries()) {
            if (user.username === from) {
                inviterSocket = io.sockets.sockets.get(socketId);
                break;
            }
        }
        
        if (inviterSocket) {
            inviterSocket.emit('invite-declined', { username: decliner.username });
        }
    });

    // 重新开始游戏请求
    socket.on('request-restart', () => {
        const user = users.get(socket.id);
        if (!user || !user.roomId) return;
        
        const room = rooms.get(user.roomId);
        if (!room || room.players.length !== 2) return;
        
        // 找到房间中的另一个玩家
        const otherPlayer = room.players.find(p => p.socket.id !== socket.id);
        if (otherPlayer) {
            otherPlayer.socket.emit('restart-request', { from: user.username });
        }
    });

    // 接受重新开始
    socket.on('accept-restart', (data) => {
        const { from } = data;
        const accepter = users.get(socket.id);
        if (!accepter || !accepter.roomId) return;
        
        const room = rooms.get(accepter.roomId);
        if (!room) return;
        
        // 找到发起重新开始的玩家
        const requester = room.players.find(p => {
            const user = users.get(p.socket.id);
            return user && user.username === from;
        });
        if (requester) {
            // 通知发起者被接受
            requester.socket.emit('restart-accepted', { username: accepter.username });
            
            // 重置房间游戏状态
            room.resetForNewGame();
            
            // 通知所有玩家游戏重新开始
            room.players.forEach(player => {
                player.socket.emit('game-restarted');
            });
            
            // 通知观战者
            room.spectators.forEach(spectator => {
                spectator.socket.emit('game-restarted');
            });
        }
    });

    // 拒绝重新开始
    socket.on('decline-restart', (data) => {
        const { from } = data;
        const decliner = users.get(socket.id);
        if (!decliner || !decliner.roomId) return;
        
        const room = rooms.get(decliner.roomId);
        if (!room) return;
        
        // 找到发起重新开始的玩家
        const requester = room.players.find(p => {
            const user = users.get(p.socket.id);
            return user && user.username === from;
        });
        if (requester) {
            requester.socket.emit('restart-declined', { username: decliner.username });
        }
    });

    // 发送聊天消息
    socket.on('send-message', (data) => {
        const { message } = data;
        const user = users.get(socket.id);
        
        if (!user || !user.roomId || !message.trim()) return;
        
        const room = rooms.get(user.roomId);
        if (!room) return;
        
        // 广播消息给房间内的所有人（包括发送者）
        const messageData = {
            username: user.username,
            message: message.trim(),
            timestamp: Date.now()
        };
        
        io.to(user.roomId).emit('chat-message', messageData);
    });

    // 玩家主动离开房间事件
    socket.on('leave-room', () => {
        console.log('玩家主动离开房间:', socket.id);
        
        const user = users.get(socket.id);
        if (user && user.roomId) {
            const room = rooms.get(user.roomId);
            if (room) {
                // 根据用户状态调用不同的移除方法
                if (user.status === USER_STATUS.SPECTATING) {
                    room.removeSpectator(socket);
                    console.log(`观战者 ${user.username} 主动离开房间 ${user.roomId}`);
                } else {
                    room.removePlayer(socket);
                    console.log(`玩家 ${user.username} 主动离开房间 ${user.roomId}`);
                    
                    // 通知房间其他玩家
                    socket.to(user.roomId).emit('player-left', {
                        username: user.username
                    });
                }
                
                // 如果房间空了，删除房间
                if (room.players.length === 0 && room.spectators.length === 0) {
                    rooms.delete(user.roomId);
                }
            }
            
            // 重置用户状态为空闲
            user.roomId = null;
            user.status = USER_STATUS.IDLE;
            
            // 将用户加回空闲列表
            idlePlayers.set(socket.id, {
                id: socket.id,
                username: user.username
            });
            
            // 广播在线玩家更新和房间列表更新
            io.emit('online-players-updated', getOnlinePlayersWithStats());
            io.emit('rooms-updated', Array.from(rooms.values()).map(room => room.getRoomInfo()));
            
            // 确认离开房间
            socket.emit('left-room');
        }
    });

    socket.on('disconnect', () => {
        console.log('用户断开连接:', socket.id);
        
        const user = users.get(socket.id);
        if (user) {
            // 从空闲列表移除
            idlePlayers.delete(socket.id);
            
            // 广播在线玩家更新
            io.emit('online-players-updated', getOnlinePlayersWithStats());
            
            if (user.roomId) {
                const room = rooms.get(user.roomId);
                if (room) {
                    // 根据用户状态调用不同的移除方法
                    if (user.status === USER_STATUS.SPECTATING) {
                        room.removeSpectator(socket);
                        console.log(`观战者 ${user.username} 离开房间 ${user.roomId}`);
                    } else {
                        room.removePlayer(socket);
                        console.log(`玩家 ${user.username} 离开房间 ${user.roomId}`);
                        
                        // 通知房间其他玩家
                        socket.to(user.roomId).emit('player-left', {
                            username: user.username
                        });
                    }
                    
                    // 如果房间空了，删除房间
                    if (room.players.length === 0 && room.spectators.length === 0) {
                        rooms.delete(user.roomId);
                    }
                }
            }
            users.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;

// 启动服务器
async function startServer() {
    try {
        // 加载用户胜率数据
        await loadUserStats();
        
        server.listen(PORT, () => {
            console.log(`五子棋服务器运行在端口 ${PORT}`);
        });
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

// 启动服务器
startServer();
