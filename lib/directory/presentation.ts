import type { DirectoryPerson } from "./types";

/** Put available portraits first without changing either group's relative order. */
export function arrangeDirectoryPeople<T extends Pick<DirectoryPerson, "photo_url">>(people: readonly T[]): T[] {
  return [
    ...people.filter((person) => Boolean(person.photo_url)),
    ...people.filter((person) => !person.photo_url),
  ];
}
