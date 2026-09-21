/** Export the raw print stream, including the newline after each print. */
export function downloadOutput(output: string): void {
  const url = URL.createObjectURL(
    new Blob([output], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "output.txt";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
