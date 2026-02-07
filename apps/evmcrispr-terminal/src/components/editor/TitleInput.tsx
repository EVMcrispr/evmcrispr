import type { ChangeEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";

export default function TitleInput() {
  // Set the default value, without enforcing its state.
  const handleRef = useRef<HTMLInputElement | null>(null);
  const { title } = useTerminalStore();
  useEffect(() => {
    if (handleRef.current) {
      handleRef.current.value = title;
    }
  }, [title]);

  const [documentTitle, setDocumentTitle] = useState(title);

  useEffect(() => {
    setDocumentTitle(title);
  }, [title]);

  useEffect(() => {
    document.title = documentTitle
      ? `${documentTitle} - EVMcrispr Terminal`
      : "EVMcrispr Terminal";
  }, [documentTitle]);

  // Debounce saving the title to the store until user activity stops
  const debouncedTitle = useDebounce(documentTitle, 200);

  useEffect(() => {
    terminalStoreActions("title", debouncedTitle);
  }, [debouncedTitle]);

  const handleTitleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    setDocumentTitle(event.target.value);
  };

  return (
    <input
      ref={handleRef}
      type="text"
      placeholder="Untitled script"
      onChange={handleTitleChange}
      spellCheck="false"
      className="bg-transparent border-none outline-none text-4xl text-evm-gray-300 placeholder:text-evm-gray-300 placeholder:opacity-100 font-head w-full"
    />
  );
}
