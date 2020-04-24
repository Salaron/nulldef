import crypto from "crypto"

export function timeStamp() {
  return Math.floor(Date.now() / 1000)
}

export function sha256(input: string) {
  const sum = crypto.createHash("sha256")
  sum.update(input)
  return sum.digest("hex")
}

export function createObjCopy<T>(object: T): T {
  return JSON.parse(JSON.stringify(object))
}