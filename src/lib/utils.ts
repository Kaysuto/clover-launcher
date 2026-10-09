export { cn } from "cn"

/** Minuscules sans accents, pour comparer des textes : « Mémoire » et « memoire » se valent. */
export const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
