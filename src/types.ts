export type Participant = {
  id: number
  name: string
  age: string
}

export type Order = {
  participants: Participant[]
  email: string
}
