// 방 생성 및 참가에 관련된 이벤트를 핸들링한다
import { Router } from 'express';
import type { GameState } from '@ai-mafia/shared';
import fs from 'node:fs';

const router = Router();
export const activeRooms = new Map();

// 닉네임 및 주제를 담고있는 텍스트 파일을 불러온다
function loadList(filename: string) {
    const filePath = new URL(`./resources/${filename}`, import.meta.url);

    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean); // removes empty lines
}
const themes = loadList('themes.txt');

// POST /api/room/create
router.post('/create', (req, res) => {
    // 1. 리퀘스트가 잘못됬으면 실패, 지금은 실패 조건 없음
    if (false) {
        return res.status(400).json({
            success: false,
            error: "Nickname is required."
        });
    }

    // 2. 방 코드 및 닉네임 생성
    const nickname = nicknames[Math.floor(Math.random() * nicknames.length)];
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
         // 게임 초기 상태 설정
    const gameState: GameState = {
        phase: 'lobby',
        phaseEndsAt: null,
        votes: {},
        voteCounts: {}
    };
    const newRoom = {
        roomCode,
        players: [{ id: 1, nickname, isHost: true }],
        theme : null,
        gameState
    };

    activeRooms.set(roomCode, newRoom);
    console.log(activeRooms)

    // 3. 성공 반환
    return res.status(201).json({
        success: true,
        roomCode: newRoom.roomCode,
        players: newRoom.players,
        nickname: nickname
    });
});

// POST /api/room/join
router.post('/join', (req, res) => {
    const { roomCode } = req.body;

    // 1. 리퀘스트에 방 코드가 없으면 실패
    if (!roomCode) {
        return res.status(400).json({
            success: false,
            error: "Room code required."
        });
    }

    const room = activeRooms.get(roomCode);

    // 1.1 방 코드가 현재 활성화된 방 리스트에 없으면 실패 
    if (!room) {
        return res.status(404).json({
            success: false,
            error: "Invalid room code or room does not exist."
        });
    }

    // 2. 닉네임 중복 체크 후 부여 후 방 맵에 추가
    const usedNicknames = room.players.map((player: { nickname: string; }) => player.nickname);
    const takenSet = new Set(usedNicknames);
    const availableNicknames = nicknames.filter((name: string) => !takenSet.has(name));
    const nickname = availableNicknames[Math.floor(Math.random() * nicknames.length)];
    const newPlayer = {
        id: room.players.length + 1,
        nickname,
        isHost: false
    };
    room.players.push(newPlayer);

    // 3. 성공 반환
    return res.json({
        success: true,
        players: room.players,
        nickname: nickname
    });
});

router.post('/theme', (req, res) => {
    const roomCode = req.body.roomCode;

    // 1. 리퀘스트에 방 코드가 없으면 실패
    if (!roomCode) {
        return res.status(400).json({
            success: false,
            error: "Room code required."
        });
    }

    const room = activeRooms.get(roomCode);

    // 1.1 방 코드가 현재 활성화된 방 리스트에 없으면 실패 
    if (!room) {
        return res.status(404).json({
            success: false,
            error: "Invalid room code or room does not exist."
        });
    }

    // 2. 랜덤하게 주제 선정 및 저장
    const theme = themes[Math.floor(Math.random() * themes.length)];
    room["theme"] = theme;

    // 3. 성공 반환
    return res.json({
        success: true,
        theme: theme,
        roomCode: roomCode
    });
});

// GET /api/room/:roomCode/state
router.get('/:roomCode/state', (req, res) => {
    const roomCode = req.params.roomCode;
    // 1. 방 존재하는지 확인
    const room = activeRooms.get(roomCode);
    if (!room) {
        return res.status(404).json({
            success: false,
            error: 'Room does not exist.'
        });
    }
    // 2. 현재 방 상태 반환
    return res.json({
        success: true,
        roomCode: room.roomCode,
        players: room.players,
        theme: room.theme,
        phase: room.gameState.phase,
        phaseEndsAt: room.gameState.phaseEndsAt
    });
});

export default router;