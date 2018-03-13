const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const fs = require("fs");
const asy = require("async");
const ip = require("ip");

const PORT = 80;
const games = [];

app.use(express.static("static"));

http.listen(PORT, /*ip.address()*/"localhost", function () {
    console.log("Listening at " + ip.address() + " on port " + PORT);
});

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/uttt.html");
});

var matchQ = asy.queue(function (data, cb) {
	if (!inGame(data.id)) { //if not already in game
		let game;
		for (let g in games) {
			if (!games[g].players[2]) { //game needs a second player
				game = games[g];
				break;
			}
		}

		if (game) { //if open game found
			game.players[2] = data.id;
			game.state = "playing";
			cb(false, {
				piece: 2,
				game: game
			});
		}
		else { //if open game not found
			game = genGame(data.id);
			games.push(game);
			cb(false, {
				piece: 1,
				game: game
			});
		}
	}
	else {
		cb("You are already in a game!");
	}
}, Infinity);

var genId = function () {
    return Math.random().toString(36).split("0.")[1];
};

var genGame = function (pid) {
	return {
		id: genId(),
		players: {
			1: pid,
			2: null
		},
        turn: 1,
		state: "waiting", // or playing or finished
        board: {
            outer: [0,0,0, 0,0,0, 0,0,0],
            inners:
                [
                    [0,0,0, 0,0,0, 0,0,0], [0,0,0, 0,0,0, 0,0,0], [0,0,0, 0,0,0, 0,0,0],
                    [0,0,0, 0,0,0, 0,0,0], [0,0,0, 0,0,0, 0,0,0], [0,0,0, 0,0,0, 0,0,0],
                    [0,0,0, 0,0,0, 0,0,0], [0,0,0, 0,0,0, 0,0,0], [0,0,0, 0,0,0, 0,0,0]
                ]
        },
        inner: -1
	};
};

var inGame = function (id) {
	return games.some(function (game) {
		return game.players[1] == id || game.players[2] == id;
	});
};

var getGame = function (id) {
	for (let g in games) {
		if (games[g].players[1] == id || games[g].players[2] == id) {
			return games[g];
		}
	}
	return null;
};

var getPiece = function (game, pid) {
    return game.players[1] == pid ? 1 : 2;
};

var checkWin = function (board) {
	var winCombos = [
		[0, 1, 2],
		[0, 3, 6],
		[0, 4, 8],
		[1, 4, 7],
		[2, 5, 8],
		[2, 4, 6],
		[3, 4, 5],
		[6, 7, 8]
	];

	for (let c in winCombos) {
		let piece = board[winCombos[c][0]];

        if (piece != 0) {
    		if (board[winCombos[c][1]] == piece && board[winCombos[c][2]] == piece)
    			return piece;
        }
	}

	return false;
};

var boardFilled = function (board) {
    var played = 0;
    for (let cell in board) {
        if (board[cell] == 1 || board[cell] == 2 || board[cell] == -1)
            played++;
    }

    if (played == 9)
        return true;
    return false;
};

io.on("connection", (socket) => {
	var sid = socket.id;

	socket.emit("connected");

	socket.on("disconnect", () => {
		var game = getGame(sid);
		if (game != null) {
			if (game.state == "waiting") {
				games.splice(games.indexOf(game), 1);
			}
			else if (game.state == "playing") {
				io.to(game.id).emit("player_left");
			}
		}
	});

	socket.on("join_game", () => {
		matchQ.push({id: sid}, (err, data) => {
			if (err)
				socket.emit("err", "Error joining game");
			else {
                socket.join(data.game.id);
				socket.emit("joined", data.piece);
				if (data.game.state == "playing") {
					io.to(data.game.id).emit("start");
                    io.to(data.game.id).emit("turn", 1, -1);
                }
			}
		});
	});

	socket.on("place_piece", (inner, cell) => {
		var game = getGame(sid);
        var piece = getPiece(game, sid);

		if (game.turn == piece) { //alowed to place piece
			if (game.board.inners[inner][cell] == 0 && (inner == game.inner || game.inner == -1)) { //can place piece in that spot
                game.board.inners[inner][cell] = piece;
                io.to(game.id).emit("place", inner, cell, piece);

				var innerWon = checkWin(game.board.inners[inner]);
                var innerFilled = boardFilled(game.board.inners[inner]);

                if (innerWon || innerFilled) {
                    let state = innerWon > 0 ? innerWon : -1; //set to winner or -1 for tie

                    game.board.outer[inner] = state;
                    io.to(game.id).emit("innerWon", inner, state);

                    let outerWon = checkWin(game.board.outer);
                    let outerFilled = boardFilled(game.board.outer);

                    if (outerWon || outerFilled) {
                        state = outerWon > 0 ? outerWon : -1;
                        game.state = "finished";
                        io.to(game.id).emit("over", state);
                        io.sockets.connected[game.players[1]].disconnect();
                        io.sockets.connected[game.players[2]].disconnect();
                    }
                }
                
                game.turn = game.turn == 1 ? 2 : 1;
                game.inner = game.board.outer[cell] == 0 ? cell : -1;
                io.to(game.id).emit("turn", game.turn, game.inner);
			}
		}
	});
});

process.on('uncaughtException', function (err) {
	console.log(err);
});
