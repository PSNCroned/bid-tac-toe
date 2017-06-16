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

var matchQ = async.queue(function (data, cb) {
	if (!inGame(data.id)) {
		var game;
		for (var i in games) {
			if (!games[i].players.o) {
				game = games[i];
				break;
			}
		}
		
		if (clients[data.id]) {
			if (game) {
				game.players.o = data.id;
				game.state = "playing";
				cb(false, {
					chip: "o",
					started: true,
					players: game.players
				});
			}
			else {
				game = genGame(data.id);
				games.push(game);
				cb(false, {
					chip: "x",
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
		mode: "bidding", // or placing or tiebreak
		match: 1,
		match_results: [/* "x" or "o" or "tie" */],
		winner: null,
		board: [0, 0, 0,  0, 0, 0,  0, 0, 0],
		points: {
			x: 10,
			o: 10
		},
		bids: {
			x: null,
			o: null
		},
		tie_break: "x"
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

var clients = io.sockets.server.eio.clients;

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
				socket.emit("joined", data.chip);
				if (data.started) {
					sendToPlayers([data.players.x, data.players.o], "start");
				}
			}
		});
	});
	
	socket.on("bid", function (bid) {
		var game = games[getGameIndex(sid)];
		var piece = getPiece(game, sid);
		bid = parseInt(bid);
		if (
			bid >= 0 
			&& bid < 10 
			&& game.mode == "bidding" 
			&& !parseInt(game.bids[piece])
			&& bid <= game.points[piece]
		) {
			game.bids[piece] = bid;
			socket.emit("bid_success");
			
			if (parseInt(game.bids.x) && parseInt(game.bids.o)) {
				if (game.bids.x != game.bids.o) {
					game.mode = "placing";
					var bidWinner = game.bids.x > game.bids.o ? "x" : "o";
					var bidLoser = game.bids.x < game.bids.o ? "x" : "o";
					
					game.points[bidWinner] -= game.bids[bidWinner];
					game.points[bidLoser] += game.bids[bidWinner]
					
					game.bids.x = null;
					game.bids.o = null;
					
					sendToPlayers([game.players.x, game.players.y], "bid_win", {winner: bidWinner, points: game.points});
				}
				else {
					game.mode = "tiebreak";
					sendToPlayers([game.players.x, game.players.y], "tie_break", game.tie_break);
				}
			}
		}
	});
	
	socket.on("tie_break", function (use) {
		var game = games[getGameIndex(sid)];
		var piece = getPiece(game, sid);
		if (game.tie_break == piece) {
			if (use == piece) {
				game.tie_break = piece == "x" ? "o" : "x";
				sendToPlayers([game.players.x, game.players.y], "tie_holder", game.tie_break);
			}
			
			var bidLoser = use == "x" ? "o" : "x";
			
			game.points[use] -= game.bids[use];
			game.points[bidLoser] += game.bids[use]
			
			game.bids.x = null;
			game.bids.o = null;
			
			sendToPlayers([game.players.x, game.players.y], "bid_win", {winner: use, points: game.points});
		}
	});
	
	socket.on("place_piece", function (data) {
		var game = games[getGameIndex(sid)];
		
		if (game.mode == "placing") {
			
		}
	});
});

process.on('uncaughtException', function (err) {
	console.log(err);
});