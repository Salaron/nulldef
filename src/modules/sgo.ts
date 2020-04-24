import moment from "moment"
import { DocumentAttachment } from "vk-io"
import Config from "../config"
import { Logger } from "../core/logger"
import { Redis } from "../core/redis"
import { vk } from "../nulldef"
import { sha256 } from "../core/utils"
import SGO from "../sgo/client"

const logger = new Logger("Module: SGO")
let mainClient: SGO
const clients: Array<SGO & { description?: string }> = []

const assignmentExpires = 1.901e+6 // 22 days
async function checkDiaryUpdates() {
  if (!moment().isBetween(moment(Config.sgo.activityStartTime, "HH:mm"), moment(Config.sgo.activityEndTime, "HH:mm"))) return
  try {
    for (const client of clients) {
      const diary = await client.API.getDiary(
        client.session.userId,
        moment().subtract(1, "week").format("YYYY-MM-DD"),
        moment().add(1, "week").format("YYYY-MM-DD")
      )
      const assignments = []
      for (const day of diary.weekDays) {
        for (const lesson of day.lessons) {
          if (!lesson.assignments || lesson.assignments.length === 0) continue
          for (const assignment of lesson.assignments) {
            assignment.mark = null // to prevent fake updates
            assignments.push(assignment)
          }
        }
      }
      for (const assignment of assignments) {
        const hash = sha256(JSON.stringify(assignment))
        const check = await Redis.get(`SGO:assignments:${assignment.id}`)
        if (check !== null && check === hash) continue

        let result = ""
        const assignInfo = await client.API.getDiaryAssignment(assignment.id)
        await Redis.del(`SGO:assignments:${assignment.id}`) // remove prev version
        await Redis.set(`SGO:assignments:${assignment.id}`, hash, "ex", assignmentExpires) // save into database
        const attachments = []
        if (assignInfo.attachments && assignInfo.attachments.length > 0) {
          for (const attachment of assignInfo.attachments) {
            const buffer = await client.API.downloadAttachment(attachment.id)
            attachments.push({
              name: attachment.originalFileName,
              buffer
            })
          }
        }
        result += `ДЗ для ${client.description}\n`
        result += `Предмет: ${assignInfo.subjectGroup.name}\n`
        result += `Домашнее задание: ${assignInfo.assignmentName}\n`
        if (assignInfo.description !== "") {
          result += `Подробности от учителя: ${assignInfo.description}\n`
        }
        result += `Выполнить до ${moment(assignInfo.date).locale("ru").format("LL")}`
        let vkAttachments: DocumentAttachment[] = []
        if (attachments.length !== 0) {
          result += `\n\nПриложенные файлы прикреплены к сообщению`
          vkAttachments = await Promise.all(attachments.map(async attachment => {
            return await vk.upload.messageDocument({
              title: attachment.name,
              source: {
                value: attachment.buffer,
                filename: attachment.name
              },
              peer_id: 2000000001
            })
          }))
        }
        await vk.api.messages.send({
          message: result,
          peer_id: 2000000001,
          attachment: vkAttachments.map(attachment => attachment.toString()).join(",")
        })
      }
    }
  } catch (err) {
    logger.fatal(err)
  }
}

setInterval(checkDiaryUpdates, 1.8e+6) // every 30 mins

export async function setup() {
  for (const user of Config.sgo.users) {
    let instance: SGO & { description?: string } = await SGO.startSession(user.username, user.password)
    if (user.main) mainClient = instance
    instance.description = user.description
    clients.push(instance)
  }
  // await checkDiaryUpdates()

  vk.updates.hear("!sgo-дз", checkDiaryUpdates)
  vk.updates.hear("!sgo-онлайн", async (context) => {
    if (!mainClient) return await context.send(`Аккаунт не подключен`)
    const users = await mainClient.API.getCurrentOnline()
    const online = {
      users,
      students: 0,
      teachers: 0,
      parents: 0
    }

    for (const user of users) {
      const roles: string[] = user.roles.split(" ")
      if (roles.includes("У")) online.teachers += 1
      if (roles.includes("Ученик")) online.students += 1
      if (roles.includes("Родитель")) online.parents += 1
      // result += `-- ${user.nickName}\n`
    }
    let result = `Сейчас в сети ${online.students + online.parents + online.teachers} пользователей.\n`
    result += `Учеников: ${online.students}\nРодителей: ${online.parents}\nУчителей: ${online.teachers}`
    await context.send(result)
  })
}