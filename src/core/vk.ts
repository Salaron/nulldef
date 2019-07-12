const vk = require("easyvk")

interface session {
  group_id: number
  group_name: string
  group_screen: string
  [p: string]: any
}

export default class Vk {
  public longPool: any
  public client: any
  public session: session
  constructor(client: any, longPool: any) {
    this.longPool = longPool
    this.client = client
    this.session = client.session
  }
  static async authorize(token: string) {
    let client = await vk({
      access_token: token,
      api_v: '5.100',
      save_session: false,
      utils: {
        bots: true
      }
    })
    let { connection: lp } = await client.bots.longpoll.connect()
    return new Vk(client, lp)
  }

  public async sendMessage(peerId: number, message: string, replyTo?: number): Promise<any[]> {
    // There is limit for 4096 characters in one msg
    // So we need to cut our message to a several parts
    let result = []
    while (message.length != 0) {
      let short = message.slice(0, 4094)
      message = message.replace(short, "")
      let { vkr } = await this.client.post("messages.send", {
        peer_id: peerId,
        message: short,
        random_id: this.getRandomId(),
        reply_to: replyTo
      })
      result.push(vkr)
    }
    return result
  }

  public async setActivity(peerId: number, type: "typing" | "audiomessage") {
    let { vkr } = await this.client.post("messages.setActivity", {
      peer_id: peerId,
      type: type
    })
    return vkr
  }

  public async deleteMessage(messageIds: string, deleteForAll: boolean) {
    let { vkr } = await this.client.post("messages.delete", {
      message_ids: messageIds,
      delete_for_all: deleteForAll
    })
    return vkr
  }

  private getRandomId() {
    return Math.floor(Math.random() * 2147483648) - 2147483648 // random int32 number
  }
}