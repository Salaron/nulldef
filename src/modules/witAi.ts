import request from "request-promise"
import Config from "../config"

export async function voiceRecognition(audioMsgUrl: string) {
  let audioMsg = await request.get(audioMsgUrl, {
    encoding: null
  })
  if (Config.bot.witAiToken.length === 0) throw new Error(`Wit.AI token is not exists`)
  // TODO: voice recognition more than 20 sec
  let response = await request.post('https://api.wit.ai/speech', {
    gzip: true,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${Config.bot.witAiToken}`,
      'Content-Type': 'audio/mpeg3',
      'Transfer-Encoding': 'chunked'
    },
    body: audioMsg,
    encoding: null
  })
  return JSON.parse(response)._text
}
