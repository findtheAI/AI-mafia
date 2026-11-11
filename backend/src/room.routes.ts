// 방 생성 및 참가에 관련된 이벤트를 핸들링한다
import { Router } from 'express';

const router = Router();
export const activeRooms = new Map();
const nicknames = ['A', 'B', 'C', 'D']; // 임의의 닉네임 리스트, 나중엔 다른 파일에 저장하는 게 좋을 것 같아요
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
    const newRoom = {
        roomCode,
        players: [{ id: 1, nickname, isHost: true }]
    };

    activeRooms.set(roomCode, newRoom);
    console.log(activeRooms)

    // 3. 성공 리스폰스 및 데이터 반환
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

    // 2. 닉네임 중복 체크 후 부여, 방 맵에 추가, 성공 반환
    const usedNicknames = room.players.map((player: { nickname: string; }) => player.nickname);
    const takenSet = new Set(usedNicknames);
    const availableNicknames = nicknames.filter(name => !takenSet.has(name));
    const nickname = availableNicknames[Math.floor(Math.random() * nicknames.length)];
    const newPlayer = {
        id: room.players.length + 1,
        nickname,
        isHost: false
    };
    room.players.push(newPlayer);

    return res.json({
        success: true,
        players: room.players,
        nickname: nickname
    });
});

export default router;