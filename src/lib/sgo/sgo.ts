import crypto from "crypto"
import querystring from "querystring"
import WebSocket from "ws"
import { timeStamp } from "../../core/utils"
import request from "superagent"
import debug from "debug"

interface ISGOCreateOptions {
  host?: string
  username: string
  password: string
}
interface ISGOSession {
  AT: string
  userId: number
  name: string
  VER: number
  LT: number
  requestCount: number
  lastRequestDate: number
  sessionStarted: number
}
interface ISendRequestOptions {
  data?: any
  method: "POST" | "GET"
  json?: boolean
}

interface IUserInfo {
  schoolId: number
  userId: number
  nickName: string
  roles: string
  eMs: string
  class: null | string
}

export default class SGO {
  public HOST = "https://sgo.edu-74.ru/"
  public session: ISGOSession

  public headers = {
    "Connection": "keep-alive",
    "Accept": "*/*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.39 Safari/537.36",
    "Referer": this.HOST,
    "at": undefined
  }

  protected username: string
  protected password: string
  protected agent = request.agent()

  constructor(options: ISGOCreateOptions) {
    this.username = options.username
    this.password = options.password
  }

  public async startNewSession(username = this.username, pass = this.password) {
    this.session = {
      AT: "",
      name: "",
      userId: 0,
      VER: 0,
      LT: 0,
      requestCount: 0,
      lastRequestDate: timeStamp(),
      sessionStarted: timeStamp()
    }

    const authData = await this.sendRequest("webapi/auth/getdata", {
      json: true,
      method: "POST"
    })
    this.session.LT = authData.lt
    this.session.VER = authData.ver

    const pw2 = crypto
      .createHash("MD5")
      .update(
        authData.salt +
        crypto
          .createHash("MD5")
          .update(pass)
          .digest("hex")
      ).digest("hex")

    // I'm toooo lazy, sorry
    const requestData = {
      LoginType: 1,
      cid: 2,
      sid: 1,
      pid: 31,
      cn: 91,
      sft: 2,
      scid: 1086,
      UN: username,
      PW: pw2.slice(0, pass.length),
      lt: authData.lt,
      pw2,
      ver: authData.ver
    }
    const response = await this.sendRequest("webapi/login", {
      json: true,
      data: requestData,
      method: "POST"
    })
    if (response.entryPoint !== "/angular/school/studentdiary/" && response.requestData.atlist.length > 0) {
      debug(`You have ${response.requestData.atlist.split("\u0001").length} active sessions`)
    }
    this.session.AT = this.headers.at = response.at

    await this.sendRequest("angular/school/studentdiary/", {
      data: { at: this.session.AT },
      method: "POST"
    })
    const diary = await this.sendRequest("webapi/student/diary/init", {
      method: "GET",
      json: true
    })
    this.session.userId = diary.students[0].studentId
    this.session.name = diary.students[0].nickName
    debug(`Successfully logged in as ${diary.students[0].nickName}`)
    return response
  }

  public async getOnlineUsers() {
    const users: IUserInfo[] = await this.sendRequest("webapi/context/activeSessions", {
      json: true,
      method: "GET"
    })
    const result = {
      users,
      students: 0,
      teachers: 0,
      parents: 0
    }

    for (const user of users) {
      const roles: string[] = user.roles.split(" ")
      if (roles.includes("У")) result.teachers += 1
      if (roles.includes("Ученик")) result.students += 1
      if (roles.includes("Родитель")) result.parents += 1
    }
    return result
  }

  public async logout(): Promise<boolean> {
    try {
      const requestData = {
        at: this.session.AT.toString(),
        ver: this.session.VER
      }
      const response = await this.sendRequest("asp/logout.asp", {
        data: requestData,
        method: "POST"
      })
      if (!response) return false
      return true
    } catch (err) {
      debug(err)
      return false
    }
  }

  public async sendRequest(
    endpoint: string,
    options: ISendRequestOptions
  ): Promise<any> {
    debug(`Sending request to endpoint: ${endpoint}`)
    if (options && options.data) debug(options.data)

    if (
      timeStamp() - this.session.lastRequestDate > 3600 || // after 1 hour session will be expired
      timeStamp() - this.session.sessionStarted > 86399    // or after 1 day since we're logged in
    ) {
      debug("Current session is expired\nAttempt to login again...")
      await this.startNewSession()
    }
    this.session.lastRequestDate = timeStamp()
    this.session.requestCount += 1

    try {
      let response: request.Response
      if (options.data) {
        response = await this.agent(options.method, this.HOST + endpoint).set(this.headers).send(options.data)
      } else {
        response = await this.agent(options.method, this.HOST + endpoint).set(this.headers)
      }
      return response
    } catch (err) {
      if (err.status === 401) {
        await this.startNewSession()
        await this.sendRequest(endpoint, options)
      } else {
        throw err
      }
    }
  }

  protected async connectToQueueHub() {
    const requestData: any = {
      clientProtocol: 1.5,
      at: this.session.AT,
      connectionData: "[{\"name\":\"queuehub\"}]"
    }
    const negotiateRes = await this.sendRequest(
      `WebApi/signalr/negotiate?${querystring.stringify(requestData)}`,
      {
        json: true,
        method: "GET"
      }
    )

    // connect to signalr using webSocket
    requestData.transport = "webSockets"
    requestData.connectionToken = negotiateRes.ConnectionToken
    requestData.tid = Math.floor(Math.random() * 11)
    const ws = new WebSocket(
      `wss://sgo.edu-74.ru/WebApi/signalr/connect?${querystring.stringify(
        requestData
      )}`,
      {
        headers: {
          // @ts-ignore
          Cookie: this.agent.jar.getCookies({ path: "/" }).map(cookie => cookie.toValueString()).join(";")
        }
      }
    )
    ws.on("open", () => debug("Websocket opened"))
    ws.on("close", async () => {
      try {
        await this.sendRequest(
          `WebApi/signalr/abort?${querystring.stringify(requestData)}`,
          {
            json: true,
            method: "GET"
          }
        )
      } catch (err) {
        debug(err)
      }
    })

    requestData.tid = undefined // remove tid
    const signalrRes = await this.sendRequest(
      `WebApi/signalr/start?${querystring.stringify(requestData)}`,
      {
        json: true,
        method: "GET"
      }
    )
    if (signalrRes.Response !== "started") throw new Error(signalrRes)
    return ws
  }
}
