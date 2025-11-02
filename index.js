const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};
console.log(`WebSocket server is running on port ${PORT}...`);

// --- Helper Functions ---

/**
 * Ekta specific room-er shob user-ke message pathay.
 */
function broadcast(room, message) {
    if (rooms[room]) {
        const messageString = JSON.stringify(message);
        rooms[room].forEach(client => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageString);
            }
        });
    }
}

/**
 * Ekjon user bad-e room-er shobai-ke message pathay.
 */
function broadcastToOthers(ws, room, message) {
     if (rooms[room]) {
        const messageString = JSON.stringify(message);
        rooms[room].forEach(client => {
            if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageString);
            }
        });
     }
}

/**
 * Ekta room-er shobar updated user list ebong count pathay.
 */
function broadcastUserList(room) {
    if (rooms[room]) {
        const users = rooms[room].map(client => client.username);
        const count = users.length;
        broadcast(room, {
            type: 'userList',
            users: users,
            count: count
        });
    }
}

// --- WebSocket Connection Logic ---

wss.on('connection', (ws) => {
    console.log('[Server] A new client connected.');

    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } 
        catch (e) { console.error('[Server] Failed to parse message:', message); return; }

        const { type, room, username, content } = data;

        // User jokhon join korar request pathay
        if (type === 'join') {
            ws.room = room; // Room track kori
            const isTaken = rooms[room] && rooms[room].find(client => client.username.toLowerCase() === username.toLowerCase());
            
            if (isTaken) {
                ws.send(JSON.stringify({
                    type: 'error',
                    content: 'This username is already taken. Please try another.'
                }));
                return;
            }

            ws.username = username; // Ekhon username set kora jete pare
            if (!rooms[room]) {
                rooms[room] = [];
            }
            rooms[room].push({ ws: ws, username: username });

            console.log(`[${room}] ${username} joined the room.`);
            ws.send(JSON.stringify({ type: 'join-success' })); // Client-ke janai join successful
            broadcast(room, { type: 'info', content: `${username} joined the room.` }); // Shobai-ke janai
            broadcastUserList(room); // User list update kori
        
        // User jokhon message pathay
        } else if (type === 'message') {
            if (ws.room && ws.username) {
                console.log(`[${ws.room}] ${ws.username}: ${content}`); // Console-e log kori
                broadcastToOthers(ws, ws.room, { // Onno shobar kache message pathai
                    type: 'message',
                    username: ws.username,
                    content: content
                });
            }
        
        // --- Typing Indicator Logic ---
        } else if (type === 'typing-start') {
            if (ws.room && ws.username) {
                // console.log(`[${ws.room}] ${ws.username} is typing...`); // Optional: log
                broadcastToOthers(ws, ws.room, {
                    type: 'typing-start',
                    username: ws.username
                });
            }
        } else if (type === 'typing-stop') {
             if (ws.room && ws.username) {
                // console.log(`[${ws.room}] ${ws.username} stopped typing.`); // Optional: log
                broadcastToOthers(ws, ws.room, {
                    type: 'typing-stop',
                    username: ws.username
                });
            }
        }
    });

    ws.on('close', () => {
        console.log('[Server] A client disconnected.');
        
        if (ws.room && ws.username) {
            const roomName = ws.room;
            const username = ws.username;

            rooms[roomName] = rooms[roomName].filter(client => client.ws !== ws);

            if (rooms[roomName].length === 0) {
                console.log(`[${roomName}] Room is now empty and deleted.`);
                delete rooms[roomName];
            } else {
                // --- User chole gele typing-stop o pathate hobe ---
                broadcast(roomName, { type: 'typing-stop', username: username });
                broadcast(roomName, { type: 'info', content: `${username} left the room.` });
                broadcastUserList(roomName);
            }
        }
    });

    ws.onerror = (error) => {
        console.error('[Server] WebSocket Error:', error.message);
    };
});
