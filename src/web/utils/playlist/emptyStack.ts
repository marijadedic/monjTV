import type { Draft } from "../../types/Draft.ts";

export function emptyStack(): Pick<
  Draft,
  "name" | "items" | "addMode" | "addSource" | "addFolder" | "addFile" | "addLengthChoice" | "addCustomMin"
> {
  return {
    name: "",
    items: [],
    addMode: "specific-file",
    addSource: "path",
    addFolder: "",
    addFile: "",
    addLengthChoice: 60,
    addCustomMin: "",
  };
}
