import type { editor } from "monaco-editor";
import { type ReactNode, useRef, useState } from "react";
import {
  dragHasFiles,
  extractDroppedFiles,
  uploadFilesAt,
} from "../../utils/file-upload";

/**
 * Wraps the editor so OS files can be dropped onto it: dropped files are
 * pinned to IPFS and an `@ipfs.get("<cid>")` call is inserted at the drop
 * position. Handlers run in the capture phase so Monaco never sees file
 * drops, and only react to drags carrying `Files` — Monaco's internal
 * dragging of selected text is untouched.
 */
function EditorDropZone({
  getEditor,
  children,
}: {
  getEditor: () => editor.IStandaloneCodeEditor | null;
  children: ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave also fire on descendants; the depth counter keeps
  // the overlay stable until the drag actually leaves the wrapper.
  const dragDepth = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragging(false);

    const ed = getEditor();
    if (!ed) return;
    const files = extractDroppedFiles(e.dataTransfer);
    const position =
      ed.getTargetAtClientPoint(e.clientX, e.clientY)?.position ??
      ed.getPosition() ??
      ed.getModel()?.getFullModelRange().getEndPosition();
    if (!position) return;
    void uploadFilesAt(files, position, ed);
  };

  return (
    <div
      className="relative h-full w-full"
      onDragEnterCapture={handleDragEnter}
      onDragLeaveCapture={handleDragLeave}
      onDragOverCapture={handleDragOver}
      onDropCapture={handleDrop}
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-evm-green-300 bg-evm-gray-900/80 animate-fade-in">
          <span className="font-mono text-evm-green-300">
            Drop file to upload to IPFS
          </span>
        </div>
      )}
    </div>
  );
}

export default EditorDropZone;
