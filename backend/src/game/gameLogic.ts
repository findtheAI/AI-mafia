import { CHAT_TIME, VOTE_TIME, ClientToServerEvents, GAME_PHASES, ServerToClientEvents } from "@ai-mafia/shared";
import { Server } from "socket.io";
import { getRoom } from "../rooms/roomStore";
import { announceStatus } from "../rooms/socket";

const allTimers = new Map<string, ReturnType<typeof setTimeout>>();

function deleteRoomTimer(
    roomCode: string
){
    const timer = allTimers.get(roomCode);
    if (timer === undefined) {
        return false;
    }

    clearTimeout(timer);
    return allTimers.delete(roomCode);
}

function startVoteTimer(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    roomCode: string,
){
    const room = getRoom(roomCode);
    const timer = setTimeout(() => {
        if(room.status != 'ended'){//이미 끝났으면 송출 안함
            room.status = 'ended';
            announceStatus(io, room);
        }
        deleteRoomTimer(roomCode);
    }, VOTE_TIME * 1000);
    allTimers.set(roomCode, timer)
}

export function submitVote(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    roomCode: string,
    voterNickname: string,
    targetNickname: string,
){
    const room = getRoom(roomCode);
    if (!room) {
        io.to(roomCode).emit('vote:ack', {
            success: false,
            error: 'Room does not exist'
        });
        return;
    }
    // 투표 단계인지 확인
    if (room.gameState.phase !== 'vote') {
        io.to(roomCode).emit('vote:ack', {
            success: false,
            error: 'Voting is not available'
        });
        return;
    }
    // 투표 시간 지났는지 확인
    if (room.gameState.phase != 'vote') {
        //finishVoting(io, data.roomCode);
        io.to(roomCode).emit('vote:ack', {
            success: false,
            error: 'Voting time has ended.'
        });
        return;
    }
    // 자기 자신에게 투표했는지 확인
    if (voterNickname === targetNickname) {
        io.to(roomCode).emit('vote:ack', {
            success: false,
            error: 'Cannot vote yourself.'
        });
        return;
    }
    // 이미 투표했는지 확인
    if (room.gameState.votes[voterNickname] !== undefined) {
        io.to(roomCode).emit('vote:ack', {
            success: false,
            error: 'You already voted.'
        });
        return;
    }
    // 누가 누구에게 투표했는지 저장
    room.gameState.votes[voterNickname] = targetNickname;
    io.to(roomCode).emit('vote:ack',{
        success: true
    });
    console.log(`Player ${voterNickname} voted for ${targetNickname}`);
    // 모든 플레이어가 투표했는지 확인
    const totalVotes = Object.keys(room.gameState.votes).length;
    
    if(totalVotes === room.players.length) {
        if(room.status != 'ended'){//이미 끝났으면 송출 안함
            room.status = 'ended';
            announceStatus(io, room);
        }
    }
}

export function startGameLogic(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    roomCode: string,
) {
    io.to(roomCode).emit('game:phaseChanged', { phase: 'chat' });
    const timer = setTimeout(() => {
        io.to(roomCode).emit('game:phaseChanged', { phase: 'vote' });
        startVoteTimer(io, roomCode);
    }, CHAT_TIME * 1000);
    allTimers.set(roomCode, timer);
}