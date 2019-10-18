import config from "../config"
import { vk } from "../nulldef"

export function timeStamp() {
  return Math.floor(Date.now() / 1000)
}

export async function sendMessageToAdmins(message: string) {
  for (const peerId of config.bot.adminPeerIds) {
    await vk.api.messages.send({
      message,
      peer_id: peerId
    })
  }
}
