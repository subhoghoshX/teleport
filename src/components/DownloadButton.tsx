import { File } from "@/pages/channel/[channel]";

interface Props {
  fileInfo: File;
}

export default function DownloadButton({ fileInfo }: Props) {
  const { receivedFileSize, totalFileSize, fileName, href } = fileInfo;

  const percentage = (100 * receivedFileSize) / totalFileSize;

  return (
    <a
      href={href}
      download={fileName}
      className="relative overflow-hidden rounded-md border border-cyan-500 px-4 py-2"
    >
      <span className="relative z-20">
        {receivedFileSize === totalFileSize ? "Download" : "Receiving."}
      </span>
      <span
        className="absolute inset-0 bg-cyan-500/20"
        style={{
          width: percentage + "%",
        }}
      ></span>
    </a>
  );
}
