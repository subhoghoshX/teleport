import { File } from "@/pages/channel/[channel]";

interface Props {
  fileInfo: File;
}

export default function DownloadButton({ fileInfo }: Props) {
  return (
    <a
      href={fileInfo.href}
      download={fileInfo.fileName}
      className="rounded-md border border-cyan-500 px-4 py-2"
    >
      <span>Download</span>
      <span></span>
    </a>
  );
}
