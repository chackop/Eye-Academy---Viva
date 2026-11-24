// Remembers an attempt was just created in this tab, so the examiner can speak the opening
// straight away (the click on "Start" is the user gesture browsers require for speech).
let justCreated: string | null = null
export const markJustCreated = (id: string) => { justCreated = id }
export const consumeJustCreated = (id: string) => { const r = justCreated === id; if (r) justCreated = null; return r }
