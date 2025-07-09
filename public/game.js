class GomokuGame {
    constructor() {
        this.socket = io();
        this.currentScreen = 'login';
        this.roomId = null;
        this.username = null;
        this.playerRole = null;
        this.isMyTurn = false;
        this.isSpectating = false;
        this.gameBoard = null;
        this.boardSize = 15;
        this.cellSize = 40;
        this.currentPlayerFilter = 'idle'; // 当前显示的玩家状态过滤器
        this.browserId = this.getBrowserId(); // 浏览器唯一标识
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketEvents();
        this.checkBrowserSession();
    }

    // 获取或生成浏览器唯一标识
    getBrowserId() {
        let browserId = localStorage.getItem('gomoku_browser_id');
        if (!browserId) {
            browserId = 'browser_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('gomoku_browser_id', browserId);
        }
        return browserId;
    }

    // 检查浏览器会话
    checkBrowserSession() {
        this.socket.emit('check-browser-id', { browserId: this.browserId });
    }

    initializeElements() {
        // 获取所有界面元素
        this.screens = {
            login: document.getElementById('login-screen'),
            lobby: document.getElementById('lobby-screen'),
            waiting: document.getElementById('waiting-screen'),
            choice: document.getElementById('choice-screen'),
            game: document.getElementById('game-screen')
        };

        // 登录界面元素
        this.usernameInput = document.getElementById('username');
        this.loginBtn = document.getElementById('login-btn');

        // 大厅界面元素
        this.currentUsernameSpan = document.getElementById('current-username');
        this.backToLoginBtn = document.getElementById('back-to-login');
        this.onlinePlayersDiv = document.getElementById('online-players');
        this.idleCountSpan = document.getElementById('idle-count');
        this.playingCountSpan = document.getElementById('playing-count');
        this.spectatingCountSpan = document.getElementById('spectating-count');
        this.roomsListDiv = document.getElementById('rooms-list');
        this.roomsCountSpan = document.getElementById('rooms-count');
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.refreshLobbyBtn = document.getElementById('refresh-lobby-btn');

        // 用户战绩元素
        this.userStatsDiv = document.getElementById('user-stats');
        this.userScoreSpan = document.getElementById('user-score');
        this.userTotalGamesSpan = document.getElementById('user-total-games');
        this.userBlackRateSpan = document.getElementById('user-black-rate');
        this.userWhiteRateSpan = document.getElementById('user-white-rate');

        // 排行榜元素
        this.leaderboardDiv = document.getElementById('leaderboard');

        // 玩家状态标签
        this.playerStatusTabs = document.querySelectorAll('.tab-btn');

        // 等待界面元素
        this.currentRoomIdSpan = document.getElementById('current-room-id');
        this.player1NameSpan = document.getElementById('player1-name');
        this.player2NameSpan = document.getElementById('player2-name');
        this.waitingMessage = document.getElementById('waiting-message');

        // 选择界面元素
        this.countdownSpan = document.getElementById('countdown');
        this.chooseFirstBtn = document.getElementById('choose-first-btn');
        this.waitBtn = document.getElementById('wait-btn');

        // 游戏界面元素
        this.blackPlayerDiv = document.getElementById('black-player');
        this.whitePlayerDiv = document.getElementById('white-player');
        this.blackTurnIndicator = document.getElementById('black-turn');
        this.whiteTurnIndicator = document.getElementById('white-turn');
        this.gameMessage = document.getElementById('game-message');
        this.spectatorInfo = document.getElementById('spectator-info');
        this.moveCountSpan = document.getElementById('move-count');
        this.timerCountSpan = document.getElementById('timer-count');
        this.timerCircle = this.timerCountSpan.parentElement;
        this.threatOverlay = document.getElementById('threat-overlay');
        this.gameBoard = document.getElementById('game-board');
        this.restartBtn = document.getElementById('restart-btn');
        this.leaveBtn = document.getElementById('leave-btn');

        // 聊天功能元素
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendMessageBtn = document.getElementById('send-message-btn');

        // 结果弹窗元素
        this.resultModal = document.getElementById('result-modal');
        this.resultClose = document.getElementById('result-close');
        this.resultIcon = document.getElementById('result-icon');
        this.resultTitle = document.getElementById('result-title');
        this.resultMessage = document.getElementById('result-message');
        this.resultDetails = document.getElementById('result-details');
        this.playAgainBtn = document.getElementById('play-again-btn');
        this.backToLobbyBtn = document.getElementById('back-to-lobby-btn');

        // 邀请弹窗元素
        this.inviteModal = document.getElementById('invite-modal');
        this.inviterNameSpan = document.getElementById('inviter-name');
        this.acceptInviteBtn = document.getElementById('accept-invite-btn');
        this.declineInviteBtn = document.getElementById('decline-invite-btn');

        // 重新开始确认弹窗元素
        this.restartConfirmModal = document.getElementById('restart-confirm-modal');
        this.restartRequesterSpan = document.getElementById('restart-requester');
        this.acceptRestartBtn = document.getElementById('accept-restart-btn');
        this.declineRestartBtn = document.getElementById('decline-restart-btn');

        this.setupGameBoard();
    }

    setupGameBoard() {
        const ctx = this.gameBoard.getContext('2d');
        this.drawBoard(ctx);
    }

    drawBoard(ctx) {
        const boardSize = this.gameBoard.width;
        const cellSize = boardSize / this.boardSize;
        
        // 清空画布
        ctx.clearRect(0, 0, boardSize, boardSize);
        
        // 设置背景色
        ctx.fillStyle = '#deb887';
        ctx.fillRect(0, 0, boardSize, boardSize);
        
        // 绘制网格线
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        for (let i = 0; i <= this.boardSize - 1; i++) {
            const pos = (i + 1) * cellSize;
            
            // 垂直线
            ctx.beginPath();
            ctx.moveTo(pos, cellSize);
            ctx.lineTo(pos, boardSize - cellSize);
            ctx.stroke();
            
            // 水平线
            ctx.beginPath();
            ctx.moveTo(cellSize, pos);
            ctx.lineTo(boardSize - cellSize, pos);
            ctx.stroke();
        }
        
        // 绘制天元和星位
        const starPoints = [
            [3, 3], [3, 11], [11, 3], [11, 11], [7, 7]
        ];
        
        ctx.fillStyle = '#000';
        starPoints.forEach(([row, col]) => {
            const x = (col + 1) * cellSize;
            const y = (row + 1) * cellSize;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    drawPiece(row, col, player) {
        const ctx = this.gameBoard.getContext('2d');
        const cellSize = this.gameBoard.width / this.boardSize;
        const x = (col + 1) * cellSize;
        const y = (row + 1) * cellSize;
        const radius = cellSize * 0.4;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        
        if (player === 1) {
            // 黑子
            ctx.fillStyle = '#000';
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // 白子
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    bindEvents() {
        // 登录按钮事件
        this.loginBtn.addEventListener('click', () => {
            this.login();
        });

        // 玩家状态标签事件
        this.playerStatusTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.playerStatusTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentPlayerFilter = tab.dataset.status;
                this.filterOnlinePlayers();
            });
        });

        // 返回登录按钮
        this.backToLoginBtn.addEventListener('click', () => {
            this.showScreen('login');
            this.resetGame();
        });

        // 大厅相关按钮
        this.createRoomBtn.addEventListener('click', () => {
            this.createRoom();
        });

        this.refreshLobbyBtn.addEventListener('click', () => {
            this.refreshLobby();
        });

        // 回车键登录
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });

        // 选择先手按钮
        this.chooseFirstBtn.addEventListener('click', () => {
            console.log('点击选择先手按钮');
            this.socket.emit('choose-first');
            this.chooseFirstBtn.disabled = true;
            this.chooseFirstBtn.textContent = '已选择先手';
        });

        // 等待按钮
        this.waitBtn.addEventListener('click', () => {
            this.waitBtn.disabled = true;
            this.waitBtn.textContent = '等待中...';
        });

        // 游戏板点击事件
        this.gameBoard.addEventListener('click', (e) => {
            this.handleBoardClick(e);
        });

        // 离开房间按钮
        this.leaveBtn.addEventListener('click', () => {
            this.leaveRoom();
        });

        // 重新开始按钮
        this.restartBtn.addEventListener('click', () => {
            this.restartGame();
        });

        // 聊天功能
        this.sendMessageBtn.addEventListener('click', () => {
            this.sendMessage();
        });

        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // 结果弹窗按钮
        this.playAgainBtn.addEventListener('click', () => {
            this.playAgain();
        });

        this.backToLobbyBtn.addEventListener('click', () => {
            this.hideResultModal();
            this.leaveRoom();
        });

        // 结果弹窗关闭按钮
        this.resultClose.addEventListener('click', () => {
            this.hideResultModal();
            // 关闭弹窗后返回大厅
            this.leaveRoom();
        });

        // 邀请弹窗按钮
        this.acceptInviteBtn.addEventListener('click', () => {
            this.acceptInvite();
        });

        this.declineInviteBtn.addEventListener('click', () => {
            this.declineInvite();
        });

        // 重新开始确认弹窗按钮
        this.acceptRestartBtn.addEventListener('click', () => {
            this.acceptRestart();
        });

        this.declineRestartBtn.addEventListener('click', () => {
            this.declineRestart();
        });
    }

    setupSocketEvents() {
        // 浏览器会话检查结果
        this.socket.on('browser-session-found', (data) => {
            this.username = data.username;
            this.currentUsernameSpan.textContent = this.username;
            this.enterLobby();
        });

        this.socket.on('browser-session-not-found', () => {
            // 没有找到会话，保持在登录界面
            this.showScreen('login');
        });

        // 登录成功
        this.socket.on('login-success', (data) => {
            this.username = data.username;
            this.currentUsernameSpan.textContent = this.username;
            this.enterLobby();
        });

        // 用户战绩数据
        this.socket.on('user-stats', (data) => {
            this.updateUserStats(data);
        });

        // 排行榜数据
        this.socket.on('leaderboard-data', (data) => {
            this.updateLeaderboard(data);
        });

        // 在线玩家列表
        this.socket.on('online-players-list', (data) => {
            this.updateOnlinePlayersList(data);
        });

        this.socket.on('online-players-updated', (data) => {
            this.updateOnlinePlayersList(data);
        });
        this.socket.on('joined-room', (data) => {
            console.log('收到 joined-room 事件:', data);
            this.roomId = data.roomId;
            this.currentRoomIdSpan.textContent = data.roomId;
            this.isSpectating = false;
            this.showScreen('waiting');
            
            // 玩家显示重新开始按钮
            this.showRestartButtonForPlayer();
            
            if (data.playersCount === 1) {
                this.player1NameSpan.textContent = this.username;
                this.waitingMessage.textContent = '等待其他玩家加入...';
            } else if (data.playersCount === 2) {
                console.log('房间已满，等待选择阶段开始');
                this.waitingMessage.textContent = '玩家已齐，准备开始游戏...';
            }
        });

        this.socket.on('spectating-room', (data) => {
            this.roomId = data.roomId;
            this.isSpectating = true;
            this.spectatorInfo.classList.add('active');
            this.showScreen('game');
            
            // 观战者隐藏重新开始按钮
            this.hideRestartButtonForSpectator();
            
            // 设置玩家名称
            if (data.players) {
                data.players.forEach(player => {
                    if (player.role === 'black') {
                        this.blackPlayerDiv.querySelector('.player-name').textContent = player.username;
                    } else if (player.role === 'white') {
                        this.whitePlayerDiv.querySelector('.player-name').textContent = player.username;
                    }
                });
            }
        });

        this.socket.on('spectate-game', (data) => {
            // 恢复棋盘状态
            this.drawBoard(this.gameBoard.getContext('2d'));
            if (data.moveHistory) {
                data.moveHistory.forEach(move => {
                    this.drawPiece(move.row, move.col, move.player);
                });
            }
            
            // 更新手数
            this.moveCountSpan.textContent = data.moveCount || 0;
            
            // 停止计时器，等待服务器发送倒计时事件
            this.stopTimer();
            
            // 更新当前玩家指示
            this.updateSpectatorView(data.currentPlayer);
        });

        this.socket.on('move-timer-start', (data) => {
            this.startMoveTimer(data.timeLeft);
        });

        this.socket.on('move-timer-tick', (data) => {
            this.updateTimer(data.timeLeft);
        });

        this.socket.on('idle-players-updated', (players) => {
            this.updateOnlinePlayersList(players);
        });

        this.socket.on('idle-players-list', (players) => {
            this.updateOnlinePlayersList(players);
        });

        this.socket.on('rooms-list', (rooms) => {
            this.updateRoomsList(rooms);
        });

        this.socket.on('room-updated', (room) => {
            this.refreshLobby();
        });

        this.socket.on('left-room', () => {
            console.log('成功离开房间');
            // 房间离开确认事件，可以在这里做一些清理工作
            this.roomId = null;
        });

        this.socket.on('player-joined', (data) => {
            this.player2NameSpan.textContent = data.username;
            this.waitingMessage.textContent = '玩家已齐，准备开始游戏...';
        });

        this.socket.on('choice-phase-started', () => {
            console.log('收到 choice-phase-started 事件，切换到选择界面');
            this.showScreen('choice');
            // 重置按钮状态
            this.chooseFirstBtn.disabled = false;
            this.chooseFirstBtn.textContent = '我要先手';
            this.waitBtn.disabled = false;
            this.waitBtn.textContent = '等待对方选择';
        });

        this.socket.on('choice-countdown', (countdown) => {
            this.countdownSpan.textContent = countdown;
        });

        this.socket.on('game-start', (data) => {
            console.log('收到game-start事件:', data);
            this.playerRole = data.role;
            this.isMyTurn = data.isYourTurn;
            this.isSpectating = false;
            this.spectatorInfo.classList.remove('active');
            
            // 重置手数和清除威胁标记
            this.moveCountSpan.textContent = '0';
            this.clearThreatMarkers();
            
            // 停止任何现有的计时器，等待服务器发送新的倒计时
            this.stopTimer();
            
            // 设置玩家名称
            data.players.forEach(player => {
                if (player.role === 'black') {
                    this.blackPlayerDiv.querySelector('.player-name').textContent = player.username;
                } else {
                    this.whitePlayerDiv.querySelector('.player-name').textContent = player.username;
                }
            });
            
            this.updateTurnIndicator();
            console.log('切换到游戏界面');
            this.showScreen('game');
            this.drawBoard(this.gameBoard.getContext('2d'));
        });

        this.socket.on('move-made', (data) => {
            // 清除之前的最后一步标记
            this.clearLastMoveMarker();
            
            // 绘制棋子
            this.drawPiece(data.row, data.col, data.player);
            
            // 高亮显示最后一步落子
            this.showLastMoveMarker(data.row, data.col);
            
            // 更新手数
            this.moveCountSpan.textContent = data.moveCount;
            
            // 显示落子提示
            this.showMoveNotification(data);
            
            if (data.winner) {
                // 游戏结束，不更新回合指示器
                this.isMyTurn = false;
                this.stopTimer();
            } else {
                if (!this.isSpectating) {
                    this.isMyTurn = (data.nextPlayer === 1 && this.playerRole === 'black') ||
                                  (data.nextPlayer === 2 && this.playerRole === 'white');
                    this.updateTurnIndicator();
                    
                    // 停止当前计时器，等待服务器发送新的倒计时
                    this.stopTimer();
                } else {
                    this.updateSpectatorView(data.nextPlayer);
                }
            }
        });

        this.socket.on('forbidden-move', (data) => {
            this.showForbiddenMoveModal(data.reason);
        });

        this.socket.on('game-end', (data) => {
            this.stopTimer();
            this.showResultModal(data);
        });

        this.socket.on('player-left', (data) => {
            if (!this.isSpectating) {
                alert(`玩家 ${data.username} 离开了房间`);
                this.leaveRoom();
            }
        });

        this.socket.on('room-full', () => {
            alert('房间已满，请选择其他房间');
        });

        this.socket.on('room-not-found', () => {
            alert('房间不存在');
        });

        // 邀请相关事件
        this.socket.on('invite-received', (data) => {
            this.showInviteModal(data.from);
            this.currentInviter = data.from;
        });

        this.socket.on('invite-accepted', (data) => {
            alert(`${data.username} 接受了您的邀请，正在创建房间...`);
        });

        this.socket.on('invite-declined', (data) => {
            alert(`${data.username} 拒绝了您的邀请`);
        });

        this.socket.on('invite-failed', (data) => {
            alert(data.message);
        });

        // 重新开始相关事件
        this.socket.on('restart-request', (data) => {
            this.showRestartConfirmModal(data.from);
            this.currentRestartRequester = data.from;
        });

        this.socket.on('restart-accepted', (data) => {
            this.hideRestartConfirmModal();
            alert(`${data.username} 同意了重新开始`);
            // 重置游戏状态
            this.resetGameState();
        });

        this.socket.on('restart-declined', (data) => {
            alert(`${data.username} 拒绝了重新开始`);
        });

        this.socket.on('game-restarted', () => {
            this.hideResultModal();
            this.hideRestartConfirmModal();
            this.resetGameState();
            // 不直接显示选择界面，等待服务器的 choice-phase-started 事件
        });

        // 聊天相关事件
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data.username, data.message, data.timestamp, data.username === this.username);
        });

        this.socket.on('system-message', (data) => {
            this.addSystemMessage(data.message);
        });
    }

    enterLobby() {
        this.showScreen('lobby');
        
        // 设置为空闲状态并刷新大厅
        this.socket.emit('set-idle', this.username);
        this.refreshLobby();
        
        // 获取用户战绩
        this.socket.emit('get-user-stats', { username: this.username });
        
        // 获取排行榜
        this.socket.emit('get-leaderboard');
    }

    createRoom() {
        const roomId = this.generateRoomId();
        this.socket.emit('join-room', { username: this.username, roomId });
    }

    refreshLobby() {
        this.socket.emit('get-rooms');
        this.socket.emit('get-online-players');
    }

    updateRoomsList(rooms) {
        this.roomsCountSpan.textContent = rooms.length;
        this.roomsListDiv.innerHTML = '';
        
        rooms.forEach(room => {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            
            let statusClass = room.status;
            let statusText = {
                'waiting': '等待中',
                'choosing': '选择先手',
                'playing': '游戏中',
                'finished': '已结束'
            }[room.status];
            
            roomElement.innerHTML = `
                <div class="room-header">
                    <div class="room-id">房间: ${room.id}</div>
                    <div class="room-status ${statusClass}">${statusText}</div>
                </div>
                <div class="room-info">
                    <div class="room-players">
                        玩家: ${room.playersCount}/2 
                        ${room.spectatorsCount > 0 ? `| 观战: ${room.spectatorsCount}` : ''}
                    </div>
                    <div class="room-actions">
                        ${room.canJoin ? `<button class="btn primary" onclick="game.joinRoom('${room.id}')">加入</button>` : ''}
                        ${room.canSpectate ? `<button class="btn secondary" onclick="game.spectateRoom('${room.id}')">观战</button>` : ''}
                    </div>
                </div>
            `;
            this.roomsListDiv.appendChild(roomElement);
        });
    }

    joinRoom(roomId) {
        this.socket.emit('join-room', { username: this.username, roomId });
    }

    spectateRoom(roomId) {
        this.socket.emit('spectate-room', { username: this.username, roomId });
    }

    invitePlayer(username) {
        this.socket.emit('invite-player', { to: username });
    }

    showInviteModal(inviterName) {
        this.inviterNameSpan.textContent = inviterName;
        this.inviteModal.classList.add('show');
    }

    hideInviteModal() {
        this.inviteModal.classList.remove('show');
    }

    acceptInvite() {
        this.socket.emit('accept-invite', { from: this.currentInviter });
        this.hideInviteModal();
    }

    declineInvite() {
        this.socket.emit('decline-invite', { from: this.currentInviter });
        this.hideInviteModal();
    }

    showRestartConfirmModal(requesterName) {
        this.restartRequesterSpan.textContent = requesterName;
        this.restartConfirmModal.classList.add('show');
    }

    hideRestartConfirmModal() {
        this.restartConfirmModal.classList.remove('show');
    }

    acceptRestart() {
        this.socket.emit('accept-restart', { from: this.currentRestartRequester });
        this.hideRestartConfirmModal();
    }

    declineRestart() {
        this.socket.emit('decline-restart', { from: this.currentRestartRequester });
        this.hideRestartConfirmModal();
    }

    resetGameState() {
        // 重置游戏状态但保持在同一房间
        this.playerRole = null;
        this.isMyTurn = false;
        this.clearLastMoveMarker();
        this.clearThreatMarkers();
        this.moveCountSpan.textContent = '0';
        this.stopTimer();
        
        // 清空棋盘
        const ctx = this.gameBoard.getContext('2d');
        this.drawBoard(ctx);
        
        // 重置玩家名称显示
        this.blackPlayerDiv.querySelector('.player-name').textContent = '黑子';
        this.whitePlayerDiv.querySelector('.player-name').textContent = '白子';
        
        // 重置回合指示器
        this.blackTurnIndicator.classList.remove('active');
        this.whiteTurnIndicator.classList.remove('active');
        
        // 根据是否观战设置按钮状态
        if (this.isSpectating) {
            this.hideRestartButtonForSpectator();
        } else {
            this.showRestartButtonForPlayer();
        }
    }

    // 登录方法
    login() {
        const username = this.usernameInput.value.trim();
        if (!username) {
            alert('请输入用户名');
            return;
        }

        this.socket.emit('user-login', { username: username, browserId: this.browserId });
    }

    // 更新用户战绩显示
    updateUserStats(data) {
        this.userScoreSpan.textContent = data.score;
        this.userTotalGamesSpan.textContent = data.totalGames;
        this.userBlackRateSpan.textContent = data.blackWinRate + '%';
        this.userWhiteRateSpan.textContent = data.whiteWinRate + '%';
    }

    // 更新排行榜
    updateLeaderboard(data) {
        this.leaderboardDiv.innerHTML = '';
        
        data.forEach((player, index) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'leaderboard-item';
            
            const statusClass = player.isOnline ? 'online' : 'offline';
            const statusText = player.isOnline ? '在线' : '离线';
            
            // 获取段位信息
            const rankInfo = this.getRankInfo(player.score);
            const title = this.getPlayerTitle(index + 1, player.score);
            
            playerElement.innerHTML = `
                <div class="rank">${index + 1}</div>
                <div class="player-name">
                    ${player.username} 
                    ${title ? `<span class="title">${title}</span>` : ''}
                    <span class="status ${statusClass}">${statusText}</span>
                </div>
                <div class="score">
                    <span class="rank-badge" style="color: ${rankInfo.color}">${rankInfo.name}</span>
                    ${player.score}分
                </div>
                <div class="games">${player.totalGames}局</div>
            `;
            
            this.leaderboardDiv.appendChild(playerElement);
        });
    }

    // 更新在线玩家列表
    updateOnlinePlayersList(data) {
        this.onlinePlayersData = data;
        this.filterOnlinePlayers();
        
        // 更新各状态的计数
        const idleCount = data.filter(p => p.status === 'idle').length;
        const playingCount = data.filter(p => p.status === 'playing').length;
        const spectatingCount = data.filter(p => p.status === 'spectating').length;
        
        this.idleCountSpan.textContent = idleCount;
        this.playingCountSpan.textContent = playingCount;
        this.spectatingCountSpan.textContent = spectatingCount;
    }

    // 过滤在线玩家显示
    filterOnlinePlayers() {
        if (!this.onlinePlayersData) return;
        
        const filteredPlayers = this.onlinePlayersData.filter(player => 
            player.status === this.currentPlayerFilter
        );
        
        this.onlinePlayersDiv.innerHTML = '';
        
        filteredPlayers.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            
            const canInvite = player.status === 'idle' && player.username !== this.username;
            
            // 获取段位信息
            const rankInfo = this.getRankInfo(player.stats.score);
            
            playerElement.innerHTML = `
                <div class="player-info">
                    <div class="player-name">
                        ${player.username} 
                        <span class="rank-badge" style="color: ${rankInfo.color}">${rankInfo.name}</span>
                    </div>
                    <div class="player-stats">
                        积分: ${player.stats.score} | 
                        黑子: ${player.stats.blackWinRate}% (${player.stats.blackTotal}局) |
                        白子: ${player.stats.whiteWinRate}% (${player.stats.whiteTotal}局)
                    </div>
                </div>
                <div class="player-actions">
                    ${canInvite ? `<button class="btn primary" onclick="game.invitePlayer('${player.username}')">邀请对战</button>` : ''}
                </div>
            `;
            
            this.onlinePlayersDiv.appendChild(playerElement);
        });
    }

    updateSpectatorView(currentPlayer) {
        this.blackTurnIndicator.classList.remove('active');
        this.whiteTurnIndicator.classList.remove('active');
        
        if (currentPlayer === 1) {
            this.blackTurnIndicator.classList.add('active');
            this.gameMessage.textContent = '黑子回合';
        } else {
            this.whiteTurnIndicator.classList.add('active');
            this.gameMessage.textContent = '白子回合';
        }
    }

    hideRestartButtonForSpectator() {
        if (this.isSpectating) {
            document.querySelector('.game-container').classList.add('spectator-mode');
        }
    }

    showRestartButtonForPlayer() {
        if (!this.isSpectating) {
            document.querySelector('.game-container').classList.remove('spectator-mode');
        }
    }

    showResultModal(result) {
        this.resultIcon.className = 'result-icon ' + result.result;
        
        if (result.result === 'win') {
            this.resultTitle.textContent = '恭喜获胜！';
            this.resultMessage.textContent = '你赢了！';
            this.resultMessage.className = 'result-message win';
        } else if (result.result === 'lose') {
            this.resultTitle.textContent = '遗憾失败';
            this.resultMessage.textContent = '你输了！';
            this.resultMessage.className = 'result-message lose';
        } else if (result.result === 'spectate') {
            this.resultTitle.textContent = '游戏结束';
            this.resultMessage.textContent = '观战结束';
            this.resultMessage.className = 'result-message';
        }
        
        let reasonText = '';
        if (result.reason === 'opponent_left') {
            reasonText = '对手离开游戏';
        } else if (result.reason === 'timeout') {
            reasonText = '超时败北';
        } else {
            reasonText = `${result.winner} 获胜！`;
        }
        
        // 添加总手数信息
        const totalMovesText = result.totalMoves ? `\n总共 ${result.totalMoves} 手` : '';
        this.resultDetails.textContent = reasonText + totalMovesText;
        this.resultModal.classList.add('active');
    }

    hideResultModal() {
        this.resultModal.classList.remove('active');
    }

    showForbiddenMoveModal(reason) {
        // 创建临时的禁手提示弹窗
        const forbiddenModal = document.createElement('div');
        forbiddenModal.className = 'forbidden-modal';
        forbiddenModal.innerHTML = `
            <div class="forbidden-content">
                <div class="forbidden-icon">⚠️</div>
                <div class="forbidden-title">落子无效</div>
                <div class="forbidden-message">${reason}</div>
            </div>
        `;
        
        // 添加样式
        forbiddenModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        
        const forbiddenContent = forbiddenModal.querySelector('.forbidden-content');
        forbiddenContent.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            animation: scaleIn 0.3s ease;
        `;
        
        const forbiddenIcon = forbiddenModal.querySelector('.forbidden-icon');
        forbiddenIcon.style.cssText = `
            font-size: 48px;
            margin-bottom: 15px;
        `;
        
        const forbiddenTitle = forbiddenModal.querySelector('.forbidden-title');
        forbiddenTitle.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            color: #e74c3c;
            margin-bottom: 10px;
        `;
        
        const forbiddenMessage = forbiddenModal.querySelector('.forbidden-message');
        forbiddenMessage.style.cssText = `
            font-size: 16px;
            color: #666;
        `;
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { transform: scale(0.7); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(forbiddenModal);
        
        // 1秒后自动隐藏
        setTimeout(() => {
            forbiddenModal.style.animation = 'fadeIn 0.3s ease reverse';
            setTimeout(() => {
                document.body.removeChild(forbiddenModal);
                document.head.removeChild(style);
            }, 300);
        }, 1000);
    }

    playAgain() {
        this.hideResultModal();
        // 发送重新开始请求给对方
        this.socket.emit('request-restart');
    }

    generateRoomId() {
        return 'room_' + Math.random().toString(36).substr(2, 8);
    }

    handleBoardClick(e) {
        if (!this.isMyTurn || this.isSpectating) return;
        
        const rect = this.gameBoard.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const cellSize = this.gameBoard.width / this.boardSize;
        const col = Math.floor((x - cellSize / 2) / cellSize);
        const row = Math.floor((y - cellSize / 2) / cellSize);
        
        if (row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize) {
            this.socket.emit('make-move', { row, col });
        }
    }

    updateTurnIndicator() {
        this.blackTurnIndicator.classList.remove('active');
        this.whiteTurnIndicator.classList.remove('active');
        
        if (this.isMyTurn) {
            if (this.playerRole === 'black') {
                this.blackTurnIndicator.classList.add('active');
                this.gameMessage.textContent = '轮到你下棋（黑子）';
            } else {
                this.whiteTurnIndicator.classList.add('active');
                this.gameMessage.textContent = '轮到你下棋（白子）';
            }
        } else {
            if (this.playerRole === 'black') {
                this.whiteTurnIndicator.classList.add('active');
                this.gameMessage.textContent = '等待对手下棋（白子）';
            } else {
                this.blackTurnIndicator.classList.add('active');
                this.gameMessage.textContent = '等待对手下棋（黑子）';
            }
        }
    }

    startMoveTimer(timeLeft) {
        this.timerCountSpan.textContent = timeLeft;
        this.timerCircle.classList.add('active');
        this.timerCircle.classList.remove('warning', 'danger');
        
        // 根据初始时间设置样式
        if (timeLeft <= 10) {
            this.timerCircle.classList.add('danger');
        } else if (timeLeft <= 20) {
            this.timerCircle.classList.add('warning');
        }
    }

    updateTimer(timeLeft) {
        this.timerCountSpan.textContent = timeLeft;
        
        // 根据剩余时间设置不同的视觉效果
        if (timeLeft <= 10) {
            this.timerCircle.classList.add('danger');
            this.timerCircle.classList.remove('warning');
        } else if (timeLeft <= 20) {
            this.timerCircle.classList.add('warning');
            this.timerCircle.classList.remove('danger');
        } else {
            this.timerCircle.classList.remove('warning', 'danger');
        }
    }

    stopTimer() {
        this.timerCircle.classList.remove('active', 'warning', 'danger');
    }

    resetTimer() {
        this.timerCountSpan.textContent = '60';
        this.timerCircle.classList.remove('active', 'warning', 'danger');
    }

    showMoveNotification(moveData) {
        const playerName = moveData.player === 1 ? '黑子' : '白子';
        const moveNumber = moveData.moveNumber;
        
        // 创建落子通知
        const notification = document.createElement('div');
        notification.className = 'move-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="player-indicator ${moveData.player === 1 ? 'black' : 'white'}"></span>
                ${playerName} 第${moveNumber}手：(${moveData.row + 1}, ${moveData.col + 1})
            </div>
        `;
        
        // 添加到游戏容器
        const gameContainer = document.querySelector('.game-container');
        gameContainer.appendChild(notification);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
        
        // 添加动画
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
    }

    showThreatMarkers(blockingPositions) {
        const cellSize = this.gameBoard.width / this.boardSize;
        
        blockingPositions.forEach(position => {
            const marker = document.createElement('div');
            marker.className = `threat-marker ${position.type.replace('_', '-')}`;
            
            const x = (position.col + 1) * cellSize;
            const y = (position.row + 1) * cellSize;
            
            marker.style.left = x + 'px';
            marker.style.top = y + 'px';
            
            this.threatOverlay.appendChild(marker);
        });
    }

    clearThreatMarkers() {
        this.threatOverlay.innerHTML = '';
    }

    showThreatNotification(blockingPositions) {
        const liveFours = blockingPositions.filter(p => p.type === 'live_four');
        const rushFours = blockingPositions.filter(p => p.type === 'rush_four');
        const connectFours = blockingPositions.filter(p => p.type === 'connect_four');
        
        let message = '';
        let icon = '🚨';
        
        if (liveFours.length > 0) {
            message += `⚠️ 对手有活四威胁！必须封堵！`;
            icon = '🔥';
        } else if (connectFours.length > 0) {
            message += `⚠️ 对手形成连四！必须阻挡下一步！`;
            icon = '⚡';
        } else if (rushFours.length > 0) {
            message += `⚠️ 对手有冲四威胁！建议封堵！`;
            icon = '⚠️';
        }
        
        if (message) {
            const notification = document.createElement('div');
            notification.className = 'threat-notification';
            notification.innerHTML = `
                <div class="threat-content">
                    <div class="threat-icon">${icon}</div>
                    <div class="threat-message">${message}</div>
                    <div class="threat-positions">
                        ${liveFours.length > 0 ? '红色' : connectFours.length > 0 ? '紫色' : '橙色'}标记显示${connectFours.length > 0 ? '阻挡' : '封堵'}位置
                    </div>
                </div>
            `;
            
            const gameContainer = document.querySelector('.game-container');
            gameContainer.appendChild(notification);
            
            // 连四威胁显示更长时间
            const displayTime = connectFours.length > 0 ? 8000 : 5000;
            
            // 自动移除
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, displayTime);
            
            // 添加动画
            setTimeout(() => {
                notification.classList.add('show');
            }, 100);
        }
    }

    // 显示最后一步落子标记
    showLastMoveMarker(row, col) {
        const cellSize = this.gameBoard.width / this.boardSize;
        
        // 移除现有的最后一步标记
        this.clearLastMoveMarker();
        
        const marker = document.createElement('div');
        marker.className = 'last-move-marker';
        marker.id = 'last-move-marker';
        
        const x = (col + 1) * cellSize;
        const y = (row + 1) * cellSize;
        
        marker.style.left = x + 'px';
        marker.style.top = y + 'px';
        
        this.threatOverlay.appendChild(marker);
    }

    clearLastMoveMarker() {
        const existingMarker = document.getElementById('last-move-marker');
        if (existingMarker) {
            existingMarker.remove();
        }
    }

    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
        this.currentScreen = screenName;
    }

    leaveRoom() {
        // 发送离开房间事件，而不是断开连接
        this.socket.emit('leave-room');
        
        // 重置游戏状态
        this.resetGameState();
        this.hideResultModal();
        this.isSpectating = false;
        this.spectatorInfo.classList.remove('active');
        
        // 移除观战者模式样式
        document.querySelector('.game-container').classList.remove('spectator-mode');
        
        // 返回大厅
        this.showScreen('lobby');
        this.refreshLobby();
    }

    restartGame() {
        // 重新开始游戏逻辑
        this.playAgain();
    }

    resetGame() {
        this.roomId = null;
        this.username = null;
        this.playerRole = null;
        this.isMyTurn = false;
        this.isSpectating = false;
        this.usernameInput.value = '';
        this.roomIdInput.value = '';
        this.player1NameSpan.textContent = '等待玩家...';
        this.player2NameSpan.textContent = '等待玩家...';
        this.chooseFirstBtn.disabled = false;
        this.chooseFirstBtn.textContent = '我要先手';
        this.waitBtn.disabled = false;
        this.waitBtn.textContent = '等待对手选择';
        this.spectatorInfo.classList.remove('active');
        this.moveCountSpan.textContent = '0';
        this.resetTimer();
        this.clearThreatMarkers();
        this.hideResultModal();
        
        // 清除所有通知
        const notifications = document.querySelectorAll('.move-notification, .threat-notification');
        notifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    // 聊天功能相关方法
    sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;
        
        this.socket.emit('send-message', { message });
        this.chatInput.value = '';
    }

    addChatMessage(username, message, timestamp, isOwn) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isOwn ? 'own' : 'other'}`;
        
        const time = new Date(timestamp).toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageDiv.innerHTML = `
            ${!isOwn ? `<div class="message-sender">${username}</div>` : ''}
            <div class="message-content">${this.escapeHtml(message)}</div>
            <div class="message-time">${time}</div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    addSystemMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message system';
        messageDiv.innerHTML = `<div class="message-content">${message}</div>`;
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 获取段位信息
    getRankInfo(score) {
        if (score >= 1800) return { name: '王者', level: 7, color: '#ff6b35' };
        if (score >= 1600) return { name: '钻石', level: 6, color: '#00d4ff' };
        if (score >= 1400) return { name: '铂金', level: 5, color: '#00ff88' };
        if (score >= 1200) return { name: '黄金', level: 4, color: '#ffd700' };
        if (score >= 1000) return { name: '白银', level: 3, color: '#c0c0c0' };
        if (score >= 800) return { name: '青铜', level: 2, color: '#cd7f32' };
        return { name: '新手', level: 1, color: '#8b4513' };
    }

    // 获取玩家称号
    getPlayerTitle(rank, score) {
        // 根据排名获取称号
        if (rank === 1) return '棋圣';
        if (rank === 2) return '棋王';
        if (rank === 3) return '神秘黑马';
        
        // 根据段位获取称号
        if (score >= 1800) return '五子王者';
        if (score >= 1600) return '钻石高手';
        if (score >= 1400) return '铂金棋士';
        if (score >= 1200) return '黄金选手';
        
        return '';
    }
}

// 创建全局游戏实例，以便在HTML中调用
let game;

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    game = new GomokuGame();
});
