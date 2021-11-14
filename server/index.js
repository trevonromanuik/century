const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Game } = require('./game');

(async () => {

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    const game = new Game()
    await game.initialize();

    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/index.html');
    });

    io.on('connection', (socket) => {

        console.log('a user connected');

        socket.on('disconnect', () => {
            console.log('a user disconnected');
        });

        socket.emit('cards_by_id', JSON.stringify(game.cards_by_id));
        socket.emit('state', JSON.stringify(game.state));

        socket.on('action', ({ player_id, type, data }) => {

            console.log('action', player_id, type, data);

            try {
                game.performAction(player_id, type, data);
            } catch(e) {
                console.log(e);
                socket.emit('error', e);
                return;
            }

            socket.emit('state', JSON.stringify(game.state));

        });

    });

    server.listen(3000, () => {
        console.log('listening on *:3000');
    });

})();