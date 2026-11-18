import { setGlobalOptions } from 'firebase-functions/v2'
import {
  addPair,
  advanceRound,
  castVote,
  closeDiscussion,
  createRoom,
  joinByPassphrase,
  leaveRoom,
  rematch,
  removePair,
  requestJoin,
  respondJoin,
  sendChat,
  skipVote,
  startGame,
  transferHost,
} from './rooms'
import { removeFriend, respondFriend, saveProfile, sendFriendRequest } from './social'

setGlobalOptions({ region: 'asia-northeast1', maxInstances: 10 })

export {
  addPair,
  advanceRound,
  castVote,
  closeDiscussion,
  createRoom,
  joinByPassphrase,
  leaveRoom,
  rematch,
  removeFriend,
  removePair,
  requestJoin,
  respondFriend,
  respondJoin,
  saveProfile,
  sendChat,
  sendFriendRequest,
  skipVote,
  startGame,
  transferHost,
}
