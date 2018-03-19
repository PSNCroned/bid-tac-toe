var canvas = document.getElementsByTagName("canvas")[0];
    canvas.width = 600;
    canvas.height = 600;
var ctx = canvas.getContext("2d");
var Images = {
    3: new Image, //bomb
    4: new Image //magnet
};
var info = {
    type: "normal",
    private: false,
    id: (new URL(window.location.href)).searchParams.get("game"),
    ip: null
};

class Board {

    constructor (game, x, y, width, height, color) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.pad = 10;
        this.cells = [0,0,0, 0,0,0, 0,0,0];
        this.glows = [null,null,null, null,null,null, null,null,null];
        this.borders = [null,null,null, null,null,null, null,null,null];
        this.shapes = true;
    }

    render () {
        let x = this.x;
        let y = this.y;
        let width = this.width;
        let height = this.height;
        let pad = this.pad;

        ctx.strokeStyle = this.color;

        ctx.beginPath();
        ctx.moveTo(x + width / 3, y + pad);
        ctx.lineTo(x + width / 3, y + height - pad);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + (width / 3) * 2, y + pad);
        ctx.lineTo(x + (width / 3) * 2, y + height - pad);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + pad, y + height / 3);
        ctx.lineTo(x + width - pad, y + height / 3);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + pad, y + (height / 3) * 2);
        ctx.lineTo(x + width - pad, y + (height / 3) * 2);
        ctx.stroke();

        if (this.shapes) {
            for (let c in this.cells) {
                let cell = this.cells[c];

                if (cell) {
                    let coords = Board.indexToCoord(c);
                    let x = coords.col * (this.width / 3) + this.x;
                    let y = coords.row * (this.height / 3) + this.y;
                        let bold = (c == this.game.lastPlace.cell && this.game.board.inners.indexOf(this) == this.game.lastPlace.inner);

                    cell == 1 ? this.drawX(x, y, bold) : cell == 2 ? this.drawO(x, y, bold) : this.drawPower(x, y, cell);
                }
            }
        }

        for (let i in this.glows) {
            let glow = this.glows[i];
            let border = this.borders[i];
            let coords = Board.indexToCoord(i);

            if (glow) {
                let x = coords.col * (this.width / 3) + this.x;
                let y = coords.row * (this.height / 3) + this.y;

                this.drawGlow(x, y, glow.color, glow.opacity);
            }

            if (border) {
                let x = coords.col * (this.width / 3) + this.x;
                let y = coords.row * (this.height / 3) + this.y;

                this.drawBorder(x, y, border.color, border.opacity);
            }
        }
    }


    drawX (x, y, bold) {
        let cellWidth = this.width / 3;
        let cellHeight = this.height / 3;
        let pad = this.pad;

        ctx.strokeStyle = "#a3dbff";
        ctx.lineWidth = bold ? 3 : 1;
        ctx.beginPath();

        ctx.moveTo(x + pad, y + pad);
        ctx.lineTo(x + cellWidth - pad, y + cellHeight - pad);

        ctx.moveTo(x + cellWidth - pad, y + pad);
        ctx.lineTo(x + pad, y + cellHeight - pad);

        ctx.stroke();
        ctx.lineWidth = 1;
    }

    drawO (x, y, bold) {
        let cellWidth = this.width / 3;
        let cellHeight = this.height / 3;

        ctx.strokeStyle = "#ff9f8c";
        ctx.lineWidth = bold ? 3 : 1;
        ctx.beginPath();

        ctx.arc(x + cellWidth / 2, y + cellHeight / 2, cellWidth / 2 - this.pad, 0, 2 * Math.PI);

        ctx.stroke();
        ctx.lineWidth = 1;
    }

    drawPower (x, y, type) {
        let cellWidth = this.width / 3;
        let cellHeight = this.height / 3;
        let pad = this.pad;

        if (type == 3 || type == 4) //bomb or magnet
            ctx.drawImage(Images[type], x + pad, y + pad, cellWidth - pad * 2, cellHeight - pad * 2);
        else { //wildcard
            this.drawX(x, y);
            this.drawO(x, y);
        }
    }

    drawGlow (x, y, color, opacity) {
        ctx.globalAlpha = opacity;

        let cellWidth = this.width / 3;
        let cellHeight = this.height / 3;
        let pad = this.pad;

        ctx.fillStyle = color;
        ctx.fillRect(x + pad - 2, y + pad - 2, cellWidth - pad * 2 + 4, cellHeight - pad * 2 + 4);

        ctx.globalAlpha = 1.0;
    }

    drawBorder (x, y, color, opacity) {
        ctx.globalAlpha = opacity;
        ctx.beginPath();

        let cellWidth = this.width / 3;
        let cellHeight = this.height / 3;
        let pad = this.pad;

        ctx.lineWidth = pad - 2;
        ctx.strokeStyle = color;
        ctx.rect(x + pad / 2, y + pad / 2, cellWidth - pad, cellHeight - pad);
        ctx.stroke();

        ctx.lineWidth = 1;
        ctx.globalAlpha = 1.0;
    }

    getCell (x, y) {
        let row, col;

        if (y - this.y < (this.height) / 3) { //top row
            row = 0;
        }
        else if (y - this.y < (this.height / 3) * 2) { //mid row
            row = 1;
        }
        else if (y - this.y < this.height) { //bot row
            row = 2;
        }

        if (x - this.x < this.width / 3) { //left col
            col = 0;
        }
        else if (x - this.x < (this.width / 3) * 2) { //mid col
            col = 1;
        }
        else if (x - this.x < this.width) { //right col
            col = 2;
        }

        return Board.coordToIndex(row, col);
    }

    placePiece (cell, piece) {
        this.cells[cell] = piece;
    }

    setGlow (cell, color, opacity) {
        this.glows[cell] = {color: color, opacity: opacity};
    }

    setBorder (cell, color, opacity) {
        this.borders[cell] = {color: color, opacity: opacity};
    }

    clearGlow (cell) {
        if (cell)
            this.glows[cell] = null;
        else {
            for (let g in this.glows)
                this.glows[g] = null
        }
    }

    clearBorders (cell) {
        if (cell)
            this.borders[cell] = null;
        else {
            for (let b in this.borders)
                this.borders[b] = null
        }
    }

    static indexToCoord (i) {
        i = parseInt(i);

        let row = Math.floor(i / 3);
        let col = i % 3;

        return {row: row, col: col};
    }

    static coordToIndex (row, col) {
        row = parseInt(row);
        col = parseInt(col);
        return row * 3 + col;
    }

}

class OuterBoard extends Board {

    constructor (game) {
        super(game, 0, 0, canvas.width, canvas.height, "black");

        this.inners = [];
        this.shapes = false;

        for (let i in [0, 1, 2]) {
            this.addInner(new InnerBoard(game, this, 0, i));
            this.addInner(new InnerBoard(game, this, 1, i));
            this.addInner(new InnerBoard(game, this, 2, i));
        }
    }

    addInner (inner) {
        this.inners.push(inner);
    }

    render () {
        for (let i in this.inners)
            this.inners[i].render();
        super.render();
    }

    click (x, y) {
        if (this.game.turn == this.game.piece) {
            let cell = this.getCell(x, y);
            this.inners[cell].click(x, y, cell);
        }
    }

    innerWon (cell, piece) {
        this.placePiece(cell, piece);
        this.setGlow(cell, piece == 1 ? "#a3dbff" : piece == 2 ? "#ff9f8c": "grey", 0.5);
    }

    setBorders (inner) {
        this.clearBorders();
        for (let i in this.inners) {
            if (inner == i || (inner == -1 && this.cells[i] == 0)) {
                this.setBorder(i, this.game.turn == 1 ? "#a3dbff" : "#ff9f8c", 0.5);
            }
        }
    }

}

class InnerBoard extends Board {

    constructor (game, outerBoard, x, y) {
        super(game, x * (outerBoard.width / 3), y * (outerBoard.height / 3), outerBoard.width / 3, outerBoard.height / 3, "#aaaaaa");
        this.outer = outerBoard;
    }

    render () {
        super.render();
    }

    click (x, y, inner) {
        let cell = this.getCell(x, y);
        this.game.socket.emit("place_piece", inner, cell);
    }

    placePiece (cell, piece) {
        super.placePiece(cell, piece);

        for (let inner in this.outer.inners) {
            this.outer.inners[inner].clearGlow();
        }

        //this.setGlow(cell, "yellow", 0.2);
    }
}

class Game {

    constructor () {
        this.socket = io(info.ip);
        this.board = new OuterBoard(this);
        this.newGame = true;
        this.over = false;
        this.lastPlace = {
            inner: null,
            cell: null
        };

        let socket = this.socket;

        socket.on("connected", () => {
            if (this.newGame)
                socket.emit("join_game", info.type, info.private, info.id);
            else
                window.location.reload();
        });

        socket.on("joined", (piece) => {
            this.newGame = false;
            this.piece = piece;
        });

        socket.on("private", (code) => {
            info.id = code;
            this.alert("Code for opponent to join: " + code);
        });

        socket.on("start", (board) => {
            for (let inner in board) {
                this.board.inners[inner].cells = board[inner];
            }
            this.render();
        });

        socket.on("err", (msg) => {
            this.alert(msg);
        });

        socket.on("place", (inner, cell, piece) => {
            this.lastPlace = {inner: inner, cell: cell};
            this.board.inners[inner].placePiece(cell, piece);
            this.render();
        });

        socket.on("turn", (turn, inner) => {
            this.turn = turn;

            let piece = turn == 1 ? "X" : "O";
            this.alert(piece + "'s Turn");

            this.board.setBorders(inner);
            this.render();
        });

        socket.on("innerWon", (cell, piece) => {
            this.board.innerWon(cell, piece);
            this.render();
        });

        socket.on("over", (winner) => {
            this.over = true;
            this.board.clearBorders();
            this.render();

            if (winner != -1) {
                if (winner == 1)
                    this.alert("X wins!");
                else if (winner == 2)
                    this.alert("O wins!");
                else
                    this.alert("Other player left, you win!");
            }
            else
                this.alert("Tie! No one wins")
        });

        socket.on("rejoin", (id) => {
            id = id == 1 ? "X" : "O";
            this.alert(id + " rejoined!");
        });

        socket.on("player_left", () => {
            this.alert("Opponent left, they can rejoin at code: " + info.id);
        });

        socket.on("disconnect", () => {
            if (!this.over)
                this.alert("Connection to server lost");
        });

    }

    render () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.board.render();
    }

    click (x, y) {
        this.board.click(x, y);
        this.render();
    }

    alert (msg) {
        $("h1").text(msg);
    }

    static loadImages (cb) {
        Images[3].src = "/images/bomb.svg";
        Images[3].onload = function () {
            Images[4].src = "/images/magnet.svg";
        };
        Images[4].onload = cb;
    }

    static begin () {
        Game.loadImages(function () {
            $("h1").text("Searching for opponent...");
            $("#menu").hide();
            $("#game").show();
            $("#leave").show();
            $("#leave")[0].disabled = false;
            $("h1").css("font-family", "Arial");

            var game = new Game();
            game.render();

            $(canvas).click(function (e) {
                let rect = canvas.getBoundingClientRect();
                let x = e.clientX - rect.left;
                let y = e.clientY - rect.top;

                game.click(x, y);
            });

            $("#leave").click(function() {
                if (!$(this)[0].disabled)
                    window.location.reload();
            });
        });
    }

}
