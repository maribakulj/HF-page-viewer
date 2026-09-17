import { useId, useState } from "react";

export type FileDropProps = {
  title: string;
  description: string;
  accept: string;
  file: File | null;
  onFile: (file: File) => void;
};

export function FileDrop({ title, description, accept, file, onFile }: FileDropProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`file-drop ${dragging ? "is-dragging" : ""}`}
      htmlFor={inputId}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const dropped = event.dataTransfer.files.item(0);
        if (dropped) onFile(dropped);
      }}
    >
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept={accept}
        onChange={(event) => {
          const selected = event.currentTarget.files?.item(0);
          if (selected) onFile(selected);
          event.currentTarget.value = "";
        }}
      />
      <span className="file-drop-title">{title}</span>
      <span className="file-drop-description">{file ? file.name : description}</span>
      <span className="file-drop-action">{file ? "Replace" : "Choose or drop"}</span>
    </label>
  );
}
