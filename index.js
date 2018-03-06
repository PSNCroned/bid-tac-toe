var app = require("http").createServer(handler);
var io = require("socket.io")(app);
var fs = require("fs");
var async = require("async");

function handler (req, res) {
	fs.readFile(__dirname + "/index.html", function (err, data) {
		if (err) {
			res.writeHead(500);
			return res.end("Error loading site");
		}

		res.writeHead(200);
		res.end(data);
	});
};

app.listen(80);

var games = [];
var clients = io.sockets.server.eio.clients;

var matchQ = async.queue(function (data, cb) {
	if (!inGame(data.id)) { //if not already in game
		var game;
		for (var g in games) {
			if (!games[g].players.o) { //game needs a second player
				game = games[g];
				break;
			}
		}

		if (clients[data.id]) { //if client still connected
			if (game) { //if open game found
				game.players.o = data.id;
				game.state = "playing";
				cb(false, {
					piece: "o",
					started: true,
					players: game.players
				});
			}
			else { //if open game not found
				game = genGame(data.id);
				games.push(game);
				cb(false, {
					piece: "x",
					started: false
				});
			}
		}
		else {
			cb("Client disconnected.");
		}
	}
	else {
		cb("You are already in a game!");
	}
}, Infinity);

var genGame = function (pid) {
	return {
		id: randString(),
		players: {
			x: pid,
			o: null
		},
		state: "waiting", // or playing or finished
		mode: "bidding", // or placing or tiebreak or win
		winner: null,
		board: [0,0,0, 0,0,0, 0,0,0],
		spotsFilled: 0,
		points: {
			x: 10,
			o: 10
		},
		bids: {
			x: null,
			o: null
		},
		tieHistory: [],
		bidWin: null
	};
};

var inGame = function (id) {
	return games.some(function (game) {
		return game.players.x == id || game.players.o == id;
	});
};

var getGameIndex = function (id) {
	for (var i in games) {
		if (games[i].players.x == id || games[i].players.o == id) {
			return i;
		}
	}
	return null;
};

var getPiece = function (game, pid) {
	for (var piece in game.players) {
		if (game.players[piece] == pid) {
			return piece;
		}
	}
};

var randString = function () {
	return Math.round(Math.random() * 10e15).toString(32);
};

var sendToPlayers = function (players, msg, data) {
	players.forEach(function (pid) {
		io.to(pid).emit(msg, data);
	});
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

	var piece;
	for (var c in winCombos) {
		piece = board[winCombos[c][0]];

		if (board[winCombos[c][1]] == piece && board[winCombos[c][2]] == piece && piece != 0)
			return piece;
	}

	return false;
};

io.on("connection", function (socket) {
	var sid = socket.id;

	socket.emit("connected");

	socket.on("disconnect", function () {
		var index = getGameIndex(sid);
		var game;
		if (index != null) {
			game = games[index];
			if (game.state == "waiting") {
				games.splice(index, 1);
			}
			else if (game.state == "playing") {
				sendToPlayers([game.players.x, game.players.o], "player_left");
			}
		}
	});

	socket.on("join_game", function () {
		matchQ.push({id: sid}, function (err, data) {
			if (err) {
				socket.emit("err", err);
			}
			else {
				socket.emit("joined", data.piece);
				if (data.started) {
					sendToPlayers([data.players.x, data.players.o], "start");
				}
			}
		});
	});

	socket.on("bid", function (bid) {
		var game = games[getGameIndex(sid)];
		var piece = getPiece(game, sid);
		bid = Math.floor(parseInt(bid));

		if (
			(bid > 0 || (bid == 0 && game.points[piece] == 0)) //bid minimum amount
			&& (game.mode == "bidding") //currently in bid or tie mode
			&& !parseInt(game.bids[piece]) //hasn't bid yet
			&& bid <= game.points[piece] //balance is high enough
			&& (game.tieHistory.indexOf(bid) == -1) //hasn't bid this value yet this turn
		) {
			game.bids[piece] = bid;
			socket.emit("bid_success");

			var bidWinner, bidLoser, winnerFound = false;
			if (parseInt(game.bids.x) >= 0 && parseInt(game.bids.o) >= 0) { //both bids submitted
				if (game.bids.x != game.bids.o) {
					bidWinner = game.bids.x > game.bids.o ? "x" : "o";
					bidLoser = game.bids.x < game.bids.o ? "x" : "o";
					winnerFound = true;
				}
				else {
					game.tieHistory.push(game.bids.x);

					if (
						game.tieHistory.length == game.points.x ||
						game.tieHistory.length == game.points.o
					) { //at least one player out of bids
						if (game.points.x == game.points.o) {
							sendToPlayers([game.players.x, game.players.o], "game_tie", "Game ends in a tie, no other values can be bid!");
							game.mode = "end";
							game.state = "finished";
						}
						else if (game.tieHistory.length == game.points.x) { //x out of bids, o wins
							bidWinner = "o";
							bidLoser = "x";
							winnerFound = true;
						}
						else { //o out of bids, x wins
							bidWinner = "x";
							bidLoser = "o";
							winnerFound = true;
						}
					}
					else { //both players still have bid options left
						sendToPlayers([game.players.x, game.players.o], "tie_break", game.bids);
					}
				}

				if (winnerFound) {
					game.mode = "placing";
					game.bidWin = bidWinner;

					game.points[bidWinner] -= game.bids[bidWinner];
					game.points[bidLoser] += game.bids[bidWinner]

					game.tieHistory = [];

					sendToPlayers([game.players.x, game.players.o], "bid_win", {winner: bidWinner, points: game.points, bids: game.bids});
				}

				game.bids.x = null;
				game.bids.o = null;
			}
		}
		else if (game.tieHistory.indexOf(bid) != -1) {
			socket.emit("alert", "You have already bid " + bid + " on this turn!");
		}
		else if (bid < 1) {
			socket.emit("alert", "Bid must be at least 1!");
		}
		else if (bid > game.points[piece]) {
			socket.emit("alert", "You do not have enough points to bid that!");
		}
	});

	socket.on("place_piece", function (coord) {
		var game = games[getGameIndex(sid)];

		if (game.mode == "placing" && game.players[game.bidWin] == sid) { //alowed to place piece
			if (game.board[coord] == 0) { //can place piece in that spot
				game.board[coord] = game.bidWin;
				game.spotsFilled++;

				var hasWon = checkWin(game.board);

				sendToPlayers([game.players.x, game.players.o], "update_board", game.board);
				if (hasWon) {
					sendToPlayers([game.players.x, game.players.o], "win", hasWon);
					game.mode = "end";
					game.state = "finished";
				}
				else if (game.spotsFilled == 9) {
					sendToPlayers([game.players.x, game.players.o], "game_tie");
					game.mode = "end";
					game.state = "finished";
				}
				else {
					game.bidWin = null;
					game.mode = "bidding";
				}
			}
		}
	});
});

process.on('uncaughtException', function (err) {
	console.log(err);
});
