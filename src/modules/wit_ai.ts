import { NlModule } from "../core/module"
import { MessageContext, MessageForward } from "vk-io"
import request from "request-promise-native"
import Config from "../config"

export default class extends NlModule {
  public regExp = [/stt/i, /autostt/i]
  public loadByDefault = true
  public restrictUnload = false

  public async execute(msgCtx: MessageContext, triggeredRegExp: number) {
    switch (triggeredRegExp) {
      case 0: {
        await this.stt(msgCtx)
        return
      }
      case 1: {
        await this.autostt(msgCtx)
        return
      }
    }
  }

  public async stt(msgCtx: MessageContext) {
    let counter = 0
    let urlList: string[] = []
    let result = `Аудио -> Текст:\n`

    if (msgCtx.replyMessage) {
      for (let audio of msgCtx.replyMessage.getAttachments("audio_message")) {
        if (audio.duration && audio.duration < 20 && audio.mp3Url) urlList.push(audio.mp3Url)
      }
    }
    function checkForwards(messages: MessageForward[]) {
      for (let fwd of messages) {
        for (let audio of fwd.getAttachments("audio_message")) {
          if (audio.duration && audio.duration < 20 && audio.mp3Url) urlList.push(audio.mp3Url)
        }
        if (fwd.forwards) checkForwards(fwd.forwards)
      }
    }
    checkForwards(msgCtx.forwards)

    for (let url of urlList) {
      counter += 1
      if (urlList.length != 1) result += `--------{#${counter}}--------\n`
      result += await this.voiceRecognition(url) + "\n"
    }
    
    await msgCtx.send(result)
  }
  private async autostt(msgCtx: MessageContext) {
    await msgCtx.send("WIP")
  }

  private async voiceRecognition(url: string) {
    let audioMsg = await request.get(url, {
      encoding: null
    })
    if (Config.witAiToken.length === 0) throw new Error(`Wit.AI token not exists`)
    // TODO: voice recognition more than 20 sec
    let response = await request.post("https://api.wit.ai/speech", {
      gzip: true,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${Config.witAiToken}`,
        "Content-Type": "audio/mpeg3",
        "Transfer-Encoding": "chunked"
      },
      body: audioMsg,
      encoding: null
    })
    return JSON.parse(response)._text
  }
}
