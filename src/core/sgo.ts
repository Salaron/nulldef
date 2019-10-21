import "../config"
import { Log, LEVEL } from "./log"
import { timeStamp } from "./utils"
import request from "request-promise-native"
import crypto from "crypto"
import querystring from "querystring"
import WebSocket from "ws"
import moment from "moment"
import { StudentTotalReport, JournalAccessReport } from "../models/reports"

interface ISGOCreateOptions {
  logger?: Log
  logLevel?: LEVEL
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

  public log: Log
  public headers = {
    "Connection": "keep-alive",
    "Accept": "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.39 Safari/537.36",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language":
      "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,ja-JP;q=0.6,ja;q=0.5",
    "Referer": "https://sgo.edu-74.ru/",
    "at": undefined
  }

  protected cookie = request.jar()
  protected username: string
  protected password: string

  constructor(options: ISGOCreateOptions) {
    if (options.logger instanceof Log) this.log = options.logger
    else this.log = new Log("SGO")

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

    // load login form
    await this.sendRequest(`webapi/logindata`, {
      json: true,
      method: "GET"
    })

    const authData = await this.sendRequest(`webapi/auth/getdata`, {
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
      )
      .digest("hex")

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
    const response = await this.sendRequest(`webapi/login`, {
      json: true,
      data: requestData,
      method: "POST"
    })
    if (response.entryPoint != `/angular/school/studentdiary/` && response.requestData.atlist.length > 0)
      this.log.warn(
        `You have ${
        response.requestData.atlist.split("\u0001").length
        } active sessions`,
        `Login`
      )

    this.session.AT = this.headers.at = response.at
    this.log.debug(`Got 'AT Token': ${response.at}`, "Login")

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
    this.log.info(`Successfully logged in as ${diary.students[0].nickName}`)
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
      const response = await this.sendRequest(`asp/logout.asp`, {
        data: requestData,
        method: "POST"
      })
      if (!response) return false
      return true
    } catch (err) {
      this.log.error(err)
      return false
    }
  }

  public async getStudentTotalReport(
    studentId: number,
    pclid: number,
    startDate: string,
    endDate: string
  ): Promise<StudentTotalReport> {
    const startTS = timeStamp()
    const ws = await this.connectToQueueHub()

    const queueReqData = {
      selectedData: [
        {
          filterId: "SID",
          filterValue: studentId.toString(),
          filterText: ""
        },
        {
          filterId: "PCLID",
          filterValue: pclid.toString(),
          filterText: ""
        },
        {
          filterId: "period",
          filterValue: `${moment(startDate, "DD.MM.YYYY")
            .add(5, "h")
            .toISOString()} - ${moment(endDate, "DD.MM.YYYY")
              .add(5, "h")
              .toISOString()}`,
          filterText: `${moment(startDate, "DD.MM.YYYY").format(
            "DD.MM.YYYY"
          )} - ${moment(endDate, "DD.MM.YYYY").format("DD.MM.YYYY")}`
        }
      ],
      params: [
        {
          name: "SCHOOLYEARID",
          value: "623126"
        },
        {
          name: "SERVERTIMEZONE",
          value: 5
        },
        {
          name: "FULLSCHOOLNAME",
          value: ""
        },
        {
          name: "DATEFORMAT",
          value: "d\u0001mm\u0001yy\u0001."
        }
      ]
    }
    const reportId = await this.sendRequest(`webapi/reports/StudentTotal/queue`, {
      json: true,
      data: queueReqData,
      method: "POST"
    })
    if (typeof reportId != "number")
      throw new Error(`ReportId is not a number; ${reportId}`)

    return new Promise((res, rej) => {
      ws.on("message", data => {
        try {
          const msg = data.toString("utf-8")
          this.log.debug(msg)
          if (msg === "{}") {
            ws.send(`{"H":"queuehub","M":"StartTask","A":[${reportId}],"I":0}`)
            return
          }
          ws.send(`{"ping": "pong"}`)
          if (timeStamp() - startTS > 30) {
            throw new Error("Connection timeout")
          }
          const parsed = JSON.parse(msg)
          if (
            parsed["M"] &&
            parsed["M"].length > 0 &&
            parsed["M"][0]["M"] === "complete"
          ) {
            const fileName = parsed["M"][0]["A"][0]["Data"]
            ws.close()
            return res(new StudentTotalReport(fileName, this))
          }
        } catch (err) {
          ws.close()
          rej(err)
        }
      })
    })
  }

  public async getJournalAccessReport(): Promise<JournalAccessReport> {
    const startTS = timeStamp()
    const ws = await this.connectToQueueHub()

    const reqData = {
      selectedData: [
        {
          filterId: "PCLID_IUP",
          filterValue: "11_1",
          filterText: "11 *"
        }
      ],
      params: [
        {
          name: "SCHOOLYEARID",
          value: "623126"
        },
        {
          name: "SERVERTIMEZONE",
          value: 5
        },
        {
          name: "FULLSCHOOLNAME",
          value: "Муниципальное бюджетное общеобразовательное учреждение «Средняя общеобразовательная школа № 9 (имени В.И. Новикова) г. Куса»"
        },
        {
          name: "DATEFORMAT",
          value: "d\u0001mm\u0001yy\u0001."
        }
      ]
    }

    const reportId = await this.sendRequest(`webapi/reports/JournalAccess/queue`, {
      json: true,
      data: reqData,
      method: "POST"
    })
    if (typeof reportId != "number")
      throw new Error(`ReportId is not a number; ${reportId}`)

    return new Promise((res, rej) => {
      ws.on("message", data => {
        try {
          const msg = data.toString("utf-8")
          this.log.debug(msg)
          if (msg === "{}") {
            ws.send(`{"H":"queuehub","M":"StartTask","A":[${reportId}],"I":0}`)
            return
          }
          ws.send(`{"ping": "pong"}`)
          if (timeStamp() - startTS > 30) {
            throw new Error("Connection timeout")
          }
          const parsed = JSON.parse(msg)
          if (
            parsed["M"] &&
            parsed["M"].length > 0 &&
            parsed["M"][0]["M"] === "complete"
          ) {
            const fileName = parsed["M"][0]["A"][0]["Data"]
            ws.close()
            return res(new JournalAccessReport(fileName, this))
          }
        } catch (err) {
          ws.close()
          rej(err)
        }
      })
    })
  }

  public async sendRequest(
    url: string,
    options: ISendRequestOptions
  ): Promise<any> {
    this.log.debug(`Sending request to endpoint: ${url}`, "Send Request")
    if (options && options.data) this.log.verbose(options.data, "Send Request")

    // after 1 hour session will be expired
    if (timeStamp() - this.session.lastRequestDate > 3600 || timeStamp() - this.session.sessionStarted > 86399) {
      this.log.warn(
        "Current session is expired\nAttempt to login again...",
        "Send Request"
      )
      await this.startNewSession()
    }
    this.session.lastRequestDate = timeStamp()
    this.session.requestCount += 1

    try {
      const response = await request({
        timeout: 300000,
        url: this.HOST + url,
        headers: this.headers,
        jar: this.cookie,
        gzip: true,
        form: options.data,
        json: options.json,
        method: options.method
      })
      return response
    } catch (err) {
      if (err.statusCode === 401) {
        await this.startNewSession()
        await this.sendRequest(url, options)
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
          Cookie: this.cookie.getCookieString(this.HOST)
        },
        handshakeTimeout: 300000
      }
    )
    ws.on("open", () => this.log.debug(`Websocket opened`))
    ws.on("close", async () => {
      try {
        this.log.debug(`Websocket closed`)
        await this.sendRequest(
          `WebApi/signalr/abort?${querystring.stringify(requestData)}`,
          {
            json: true,
            method: "GET"
          }
        )
      } catch (err) {
        this.log.error(err)
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
    if (signalrRes.Response != "started") throw new Error(signalrRes)

    return ws
  }
}
