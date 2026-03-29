'use strict';

var OpCode;
(function (OpCode) {
    OpCode[OpCode["MOVE"] = 1] = "MOVE";
    OpCode[OpCode["STATE_UPDATE"] = 2] = "STATE_UPDATE";
    OpCode[OpCode["GAME_OVER"] = 3] = "GAME_OVER";
    OpCode[OpCode["MATCH_READY"] = 4] = "MATCH_READY";
    OpCode[OpCode["OPPONENT_LEFT"] = 5] = "OPPONENT_LEFT";
})(OpCode || (OpCode = {}));
