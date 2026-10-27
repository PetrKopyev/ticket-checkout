export const parsePort = (value: string | undefined) => {
  if (!value?.trim()) return 3001
  const port = Number(value)
  if (!Number.isFinite(port)) throw new Error('PORT должен быть числом')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть целым числом от 1 до 65535')
  return port
}

export const parseDelay = (value: string | undefined) => {
  if (!value?.trim()) return 400
  const delay = Number(value)
  if (!Number.isFinite(delay) || delay < 0) throw new Error('MAIL_DELAY_MS должен быть неотрицательным числом')
  return delay
}
