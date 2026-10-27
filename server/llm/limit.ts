export const readLimitedBody = async (body: AsyncIterable<Uint8Array>, message = 'LLM: ответ слишком большой') => {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of body) {
    size += chunk.byteLength
    if (size > 1024 * 1024) throw new Error(message)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
