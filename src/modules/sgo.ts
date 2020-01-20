import { NlModule } from "../core/module"
import { timeStamp, sendMessageToAdmins } from "../core/utils"
import { Log } from "../core/log"
import sgo from "../core/sgo"
import moment from "moment"
import Config from "../config"
import { INullMessageContext } from "../handlers/message"
import { ErrorNotice } from "../models/errors"
import config from "../config"
import { vk } from "../nulldef"

const log = new Log("SGO")

export default class extends NlModule {
  public regExp = [/^online$/i, /^marks$/i, /^lastLogin$/i]
  public loadByDefault = Config.sgo.userName.length > 0 && Config.sgo.password.length > 0
  public restrictUnload = false
  private client = new sgo({
    username: Config.sgo.userName,
    password: Config.sgo.password,
    logger: log
  })
  private jourlalUpdateDate = 0

  public async init() {
    if (Config.sgo.userName.length === 0 || Config.sgo.password.length === 0) throw new Error(`credentials is missing`)

    await this.client.startNewSession()
    if (this.client.session.name.length === 0) throw new Error("Could not log in")

    setInterval(async () => {
      if (!moment().isBetween(moment(config.sgo.activityStartTime, "HH:mm"), moment(config.sgo.activityEndTime, "HH:mm"))) return
      try {
        await this.updateOnline()
      } catch (err) {
        log.error(err)
      }
    }, 60000) // 60 sec

    setInterval(async () => {
      if (!moment().isBetween(moment(config.sgo.activityStartTime, "HH:mm"), moment(config.sgo.activityEndTime, "HH:mm"))) return
      try {
        const report = await this.client.getJournalAccessReport()
        const updateDate = (await report.parseReport()).updateDate
        console.log(updateDate)
        if (!moment(this.jourlalUpdateDate).isBefore(moment(updateDate, "DD.MM.YYYY HH:mm"))) return
        console.log("Yes")
        this.jourlalUpdateDate = timeStamp() * 1000
        await this.updateMarks()
        console.log("Done ", this.jourlalUpdateDate)
      } catch (err) {
        log.error(err)
      }
    }, 3600000) // 60 min

    // logout from sgo on any fatal error
    if (process.platform === "win32") {
      const rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
      })

      rl.on("SIGINT", () => {
        process.emit(<any>"SIGINT")
      })
    }

    process.on("SIGINT", async () => {
      log.info(`Logout...`)
      if (timeStamp() - this.client.session.lastRequestDate < 3600) await this.client.logout()
      process.exit()
    })
  }

  public async execute(context: INullMessageContext, triggeredRegExp: number) {
    switch (triggeredRegExp) {
      case 0: {
        await context.send(await this.updateOnline())
        return
      }
      case 1: {
        await this.updateMarks(context)
        return
      }
      case 2: {
        if (context.text.substr(10).length === 0) throw new ErrorNotice("Имя отсутствует!")
        await context.send(await this.getLastLogin(context.text.substr(10)))
        return
      }
    }
  }

  private async updateOnline() {
    const online = await this.client.getOnlineUsers()
    let result = `Сейчас в сети ${online.students + online.parents + online.teachers} человеков:\n`
    await Promise.all(online.users.map(async user => {
      user.class = ""
      result += `-- ${user.nickName}\n`
      await MySQLconnectionPool.query(`INSERT INTO sgo_users VALUES (:userId, :class, :schoolId, :eMs, :nickName, :roles, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE last_login = CURRENT_TIMESTAMP`, user)
    }))
    result += `\nУчеников: ${online.students}\nРодителей: ${online.parents}\nУчителей: ${online.teachers}`
    return result
  }

  private async updateMarks(ctx?: INullMessageContext) {
    let result = await this.getMarksChanges()
    if (ctx && result.length === 0) return await ctx.send(`Пока ничего нового :с`)

    const sendTo = config.sgo.sendMarksInfoToPeerIds.slice()
    if (ctx && !sendTo.includes(ctx.peerId)) {
      sendTo.push(ctx.peerId)
    }
    let counter = 1
    const total = Math.round(result.length / 3500)
    if (result.length === 0) return
    while (result.length != 0) {
      let lastIndex = 0
      let done = false
      while (!done) {
        const newIndex = result.indexOf(")\n\n\n", lastIndex + 1)
        if (lastIndex === newIndex || lastIndex > 3500 || newIndex === -1) done = true
        else lastIndex = newIndex
      }
      lastIndex += 4
      const short = `[ ${moment().format("HH:mm")} | сообщение ${counter} из ${total} ]\n${result.slice(0, lastIndex)}`
      result = result.replace(result.slice(0, lastIndex), "")
      for (const peerId of sendTo) {
        await vk.api.messages.send({
          message: short,
          peer_id: peerId
        })
      }
      counter += 1
    }
  }

  private async getLastLogin(name: string) {
    const data = await MySQLconnectionPool.first(`SELECT last_login FROM sgo_users WHERE name LIKE "%${name}%"`)
    if (!data) throw new ErrorNotice(`Пользователь отсутствует в базе данных!`)
    return data.last_login
  }

  private async getMarksChanges() {
    let result: any[] = []
    const classes = {
      1045714: ["1564535", "1564536", "1564591", "1564592", "1558608", "1564537", "1564538", "1564540", "1564541", "1564543", "1564547", "1564594", "1564596", "1564548", "1564549", "1564600", "1564553", "1564554", "1564605", "1564555", "1564556", "1564557", "1564559", "1564560", "1564610", "1564563"],
      1045715: ["1564588", "1564564", "1564565", "1564566", "1564567", "1564568", "1564570", "1564571", "3713550", "1564572", "1564573", "1564575", "1568141", "1564578", "1564580", "1564581", "1564584", "1564585", "1564586", "1564587"]
    }
    for (const cl of Object.keys(classes)) {
      result = [].concat(await Promise.all(classes[cl].map(async (user: string) => {
        try {
          const report = await this.client.getStudentTotalReport(parseInt(user), parseInt(cl), `01.01.2020`, moment().add(1, "week").format("DD.MM.YYYY"))
          return await report.parseReport(new Date().getFullYear(), parseInt(user))
        } catch (err) {
          await sendMessageToAdmins(`Во время обработки одного из отчётов произошла ошибка: ${err.message}`)
        }
      })), result)
    }

    let out = ""
    result.map(userMarks => {
      if (!userMarks || userMarks.haveChanges === false) return
      out += `${userMarks.user}:\n`
      userMarks.result.map(subject => {
        if (subject.haveChanges === false) return
        if (subject.avgMark === "") subject.avgMark = "N/A"
        out += `-- ${subject.name} { `
        let init = false
        subject.marks.map(day => {
          if (init === true && (day.marksRemoved.length > 0 || day.marksAdded.length > 0)) out += `, `
          if (day.marksRemoved.length > 0) {
            init = true
            out += `${day.marksRemoved.join(` (rm) [${day.date}], `)}`
            out += ` (rm) [${day.date}] ` // last date
          }
          if (day.marksAdded.length > 0) {
            init = true
            out += `${day.marksAdded.join(` [${day.date}], `)}`
            out += ` [${day.date}]` // last date
          }
        })
        out += ` } (avg: ${subject.avgMark})\n`
      })
      out += `\n\n`
    })

    return out
  }
}
