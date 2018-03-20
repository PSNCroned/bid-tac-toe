const express = require("express");
const app = express();
const http = require("http");
const https = require("https");
const io = require("socket.io")(http);
const fs = require("fs");
const asy = require("async");
const ip = require("ip");

const options = {
    cert: fs.readFileSync("./sslcert/fullchain.pem"),
    key: fs.readFileSync("./sslcert/privkey.pem")
};
const PORT = 80;
const SSL_PORT = 443;
const IP = ip.address() == "104.238.144.86" ? "104.238.144.86" : "localhost";
const games = [];

const powerTemplate = {
    3: 3, //bomb
    4: 3, //magnet
    5: 2  //wildcard
};

app.use(express.static("static"));
app.set("view engine", "ejs");

http.Server(app).listen(PORT, IP, function () {
    console.log("Listening at " + IP + " on port " + PORT);
});
https.createServer(options, app).listen(SSL_PORT, IP, function () {
    console.log("Listening at " + IP + " on port " + PORT);
});

app.get("/", function (req, res) {
    res.render("index", {ip: IP, port: PORT});
});

var matchQ = asy.queue(function (data, cb) {
	let game;
	for (let g in games) {
		if (!games[g].players[2].sid && games[g].type == data.type && !games[g].private) {
			game = games[g];
			break;
		}
	}

	if (game) { //if open game found
		game.players[2] = {sid: data.id, ip: data.ip};
		game.state = "playing";
		cb(false, {
			piece: 2,
			game: game
		});
	}
	else { //if open game not found
		game = genGame(data.id, data.ip, data.type, false);
		cb(false, {
			piece: 1,
			game: game
		});
	}
}, Infinity);

var genId = function () {
    return Math.random().toString(36).split("0.")[1];
};

var genGame = function (pid, ip, type, priv) {
	let obj = {
		id: genId(),
        type: type,
        private: priv || false,
		players: {
			1: {sid: pid, ip: ip},
			2: {}
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

    if (type == "extreme") {
        let wildInners = [0, 1, 2, 3, 4, 5, 6, 7, 8];

        for (let power in powerTemplate) {
            for (let i = 0; i < powerTemplate[power]; i++) {
                if (power < 5) //not wildcard
                    obj.board.inners[random(0, 8)][random(0, 8)] = power;
                else if (power == 5) { //wildcard
                    let index = random(0, wildInners.length - 1);
                    obj.board.inners[wildInners[index]][random(0, 8)] = power;
                    wildInners.splice(index, 1);
                }
            }
        }

        obj.board.inners[4][4] = 3; //set middle to bomb
    }

    games.push(obj);
    return obj;
};

var inGame = function (id) {
	return games.some(function (game) {
		return game.players[1].sid == id || game.players[2].sid == id;
	});
};

var getGame = function (id) {
	for (let g in games) {
		if (games[g].players[1].sid == id || games[g].players[2].sid == id || games[g].id == id) {
			return games[g];
		}
	}
	return null;
};

var getPiece = function (game, pid) {
    return game.players[1].sid == pid ? 1 : 2;
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

        if (piece == 5) {
            piece = board[winCombos[c][1]];

            if (piece == 5) {
                piece = board[winCombos[c][2]];
                return piece;
            }
        }

        if (piece != 0) {
    		if (
                (board[winCombos[c][1]] == piece || board[winCombos[c][1]] == 5) &&
                (board[winCombos[c][2]] == piece || board[winCombos[c][2]] == 5)
            )
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

var random = function (min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min);
}

io.on("connection", (socket) => {
	var sid = socket.id;
    var ip = socket.request.connection.remoteAddress;
    var game;

	socket.emit("connected");

	socket.on("disconnect", () => {
		//var game = getGame(sid);
		if (game != null) {
			if (!game.players[1].sid || !game.players[2].sid || !game.private) { //only one player or not private
                io.to(game.id).emit("over", 3);
				games.splice(games.indexOf(game), 1);
			}
			else { //two players and private
                if (game.players[1].sid == sid)
                    game.players[1].sid = null;
                else if (game.players[2].sid == sid)
                    game.players[2].sid = null;

				io.to(game.id).emit("player_left");
			}

            //console.log("Games: " + games.length);
		}
	});

	socket.on("join_game", (type, priv, gId) => {
        if (!gId && !priv) {
    		matchQ.push({id: sid, ip: ip, type: type || "normal"}, (err, data) => {
    			if (err)
    				socket.emit("err", "Error joining game");
    			else {
                    game = data.game;
                    socket.join(data.game.id);
    				socket.emit("joined", data.piece);
    				if (data.game.state == "playing") {
    					io.to(data.game.id).emit("start", data.game.board.inners);
                        io.to(data.game.id).emit("turn", 1, -1);
                    }
    			}
    		});
        }
        else {
            gId = gId || "none";
            game = getGame(gId);

            if (game) {
                if (game.state == "waiting") {
            		game.players[2] = {sid: sid, ip: ip};
            		game.state = "playing";

                    socket.join(game.id);
                    socket.emit("joined", 2);
					io.to(game.id).emit("start", game.board.inners);
                    io.to(game.id).emit("turn", 1, -1);
                }
                else if (game.players[1].ip == ip || game.players[2].ip == ip) {
                    let pNum;

                    if (game.players[1].ip == ip && !game.players[1].sid)
                        pNum = 1;
                    else
                        pNum = 2;

                    game.players[pNum].sid = sid;
                    socket.join(game.id);
                    socket.emit("joined", pNum);
					socket.emit("start", game.board.inners);
                    socket.emit("turn", game.turn, game.inner);
                    io.to(game.id).emit("rejoin", pNum);
                }
            }
            else {
                game = genGame(sid, ip, type || "normal", priv);
                socket.join(game.id);
				socket.emit("joined", 1);
                socket.emit("private", game.id);
            }

        }
	});

	socket.on("place_piece", (inner, cell) => {
		//var game = getGame(sid);
        var piece = getPiece(game, sid);

		if (game.turn == piece) { //alowed to place piece
			if (
                (game.board.inners[inner][cell] == 0 || game.board.inners[inner][cell] > 2) &&
                (inner == game.inner || game.inner == -1)
            ) { //can place piece in that spot
                let power = game.board.inners[inner][cell];
                game.board.inners[inner][cell] = piece;
                io.to(game.id).emit("place", inner, cell, piece);

				let innerWon = checkWin(game.board.inners[inner]);
                let innerFilled = boardFilled(game.board.inners[inner]);

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
                        io.sockets.connected[game.players[1].sid].disconnect();
                        io.sockets.connected[game.players[2].sid].disconnect();
                    }
                }

                game.turn = game.turn == 1 ? 2 : 1;

                if (power == 3) {
                    game.inner = -1;
                }
                else if (power == 4) {
                    game.inner = game.board.outer[inner] == 0 ? inner : -1;
                }
                else {
                    game.inner = game.board.outer[cell] == 0 ? cell : -1;
                }

                io.to(game.id).emit("turn", game.turn, game.inner);
			}
		}
	});
});

process.on('uncaughtException', function (err) {
	console.log(err);
});

/*
    Power spaces:
        3: bomb
        4: glue
        5: wildcard
*/
